/**
 * Temporal Reasoning Service
 * 
 * Provides enhanced date/time parsing with natural language support,
 * locale awareness, timezone handling, and ambiguity detection.
 */

import { format, parse, isValid, addDays, nextDay, startOfDay, endOfDay, parseISO } from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { logger } from '@/utils/logger';

export interface TemporalParseResult {
  startTime: Date | null;
  endTime: Date | null;
  confidence: number;
  ambiguities: string[];
  timezone: string | null;
  parsedElements: {
    date?: string;
    time?: string;
    duration?: string;
    location?: string;
  };
  warnings: string[];
}

export interface TemporalConflict {
  type: 'overlap' | 'timezone_mismatch' | 'business_hours' | 'duration_anomaly';
  severity: 'low' | 'medium' | 'high';
  description: string;
  existingEvent?: {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
  };
  suggestion?: string;
}

export interface TemporalAnalysisResult {
  parseResult: TemporalParseResult;
  conflicts: TemporalConflict[];
  shouldDegrade: boolean;
  degradeReason?: string;
  confidence: number;
}

// Natural language patterns for temporal expressions
const TEMPORAL_PATTERNS = {
  // Relative days
  tomorrow: () => addDays(new Date(), 1),
  today: () => new Date(),
  yesterday: () => addDays(new Date(), -1),
  
  // Day names
  monday: () => nextDay(new Date(), 1),
  tuesday: () => nextDay(new Date(), 2),
  wednesday: () => nextDay(new Date(), 3),
  thursday: () => nextDay(new Date(), 4),
  friday: () => nextDay(new Date(), 5),
  saturday: () => nextDay(new Date(), 6),
  sunday: () => nextDay(new Date(), 0),
  
  // Time expressions
  noon: '12:00',
  midnight: '00:00',
  morning: '09:00',
  afternoon: '14:00',
  evening: '18:00',
  night: '20:00'
};

const TIME_PATTERNS = [
  // 12-hour format with minutes (must be tried before bare 24-hour so "2:30pm" is 14:30, not 02:30)
  /(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)/i,
  // 24-hour format
  /(\d{1,2}):(\d{2})/,
  // Hour only
  /(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/i,
  // Natural time
  /(noon|midnight|morning|afternoon|evening|night)/i
];

// Explicit "Xpm to Ypm" / "X:XX until Y:YY" ranges. Both sides must look like a real
// clock time (am/pm or a colon) to avoid false positives on dates like 10-11-2024.
const TIME_RANGE_PATTERN =
  /(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\d{1,2}:\d{2})\s*(?:\bto\b|\buntil\b|\btill\b)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\d{1,2}:\d{2})/i;

const DATE_PATTERNS = [
  // MM/DD/YYYY or DD/MM/YYYY
  /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  // MM-DD-YYYY or DD-MM-YYYY
  /(\d{1,2})-(\d{1,2})-(\d{4})/,
  // ISO format
  /(\d{4})-(\d{2})-(\d{2})/,
  // Written dates
  /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s*(\d{4})?/i,
  // Abbreviated months
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2}),?\s*(\d{4})?/i
];

export class TemporalReasoningService {
  private userTimezone: string = 'UTC';
  private userLocale: 'US' | 'EU' | 'ISO' = 'US'; // US: MM/DD, EU: DD/MM, ISO: YYYY-MM-DD
  
  constructor(timezone?: string, locale?: 'US' | 'EU' | 'ISO') {
    this.userTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.userLocale = locale || this.detectLocale();
  }

  /**
   * Update user preferences
   */
  updatePreferences(timezone?: string, locale?: 'US' | 'EU' | 'ISO') {
    if (timezone) this.userTimezone = timezone;
    if (locale) this.userLocale = locale;
  }

  /**
   * Get current user preferences
   */
  getPreferences() {
    return {
      timezone: this.userTimezone,
      locale: this.userLocale
    };
  }

  /**
   * Construct a Date and reject silent JS calendar rollover (e.g. Feb 30 -> Mar 2).
   * Returns an invalid Date so downstream isValid() reports it as a warning.
   */
  private buildValidatedDate(year: number, monthIndex: number, day: number): Date {
    const d = new Date(year, monthIndex, day);
    if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) {
      return new Date(NaN);
    }
    return d;
  }

  private detectLocale(): 'US' | 'EU' | 'ISO' {
    const locale = navigator.language;
    if (locale.startsWith('en-US')) return 'US';
    if (locale.startsWith('en-GB') || locale.includes('EU')) return 'EU';
    return 'ISO';
  }

  /**
   * Parse natural language text for temporal information
   */
  parseTemporalExpression(text: string, context?: { currentDate?: Date; userPreferences?: any }): TemporalParseResult {
    const result: TemporalParseResult = {
      startTime: null,
      endTime: null,
      confidence: 0,
      ambiguities: [],
      timezone: null,
      parsedElements: {},
      warnings: []
    };

    const normalizedText = text.toLowerCase().trim();
    
    try {
      // Parse date
      const dateResult = this.parseDate(normalizedText);
      if (dateResult.date) {
        result.parsedElements.date = dateResult.original;
        result.confidence += dateResult.confidence;
        result.ambiguities.push(...dateResult.ambiguities);
      }

      // Parse explicit time ranges ("2pm to 3pm") before single times
      const rangeResult = this.parseTimeRange(normalizedText);

      // Parse time
      const timeResult = rangeResult
        ? { time: rangeResult.start, confidence: 0.85, ambiguities: [] as string[], original: rangeResult.original }
        : this.parseTime(normalizedText);
      if (timeResult.time) {
        result.parsedElements.time = timeResult.original;
        result.confidence += timeResult.confidence;
        result.ambiguities.push(...timeResult.ambiguities);
      }

      // Parse duration
      const durationResult = this.parseDuration(normalizedText);
      if (durationResult.duration) {
        result.parsedElements.duration = durationResult.original;
        result.confidence += durationResult.confidence;
      }

      // Combine date and time
      if (dateResult.date && timeResult.time) {
        const combinedDateTime = new Date(dateResult.date);
        const timeParts = timeResult.time.split(':');
        combinedDateTime.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
        
        result.startTime = combinedDateTime;
        result.confidence = Math.min(result.confidence / 2, 1); // Average and cap at 1
        
        // Calculate end time if duration is provided
        if (durationResult.duration) {
          result.endTime = new Date(result.startTime.getTime() + durationResult.duration * 60 * 1000);
        }
      } else if (dateResult.date) {
        // Date only, assume business hours start
        const businessStart = new Date(dateResult.date);
        businessStart.setHours(9, 0, 0, 0);
        result.startTime = businessStart;
        result.confidence = dateResult.confidence * 0.7; // Lower confidence without time
        result.warnings.push('No specific time provided, assuming 9:00 AM');
      } else if (timeResult.time) {
        // Time only, assume today
        const todayAt = new Date();
        const timeParts = timeResult.time.split(':');
        todayAt.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), 0, 0);
        result.startTime = todayAt;
        result.confidence = timeResult.confidence * 0.75; // Lower confidence without a date
        result.warnings.push('No date provided, assuming today');
      }

      // Explicit range end time overrides any duration-derived end time
      if (rangeResult && result.startTime) {
        const rangeEnd = new Date(result.startTime);
        const endParts = rangeResult.end.split(':');
        rangeEnd.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0, 0);
        result.endTime = rangeEnd;
      }

      // Flag vague / tentative phrasing as ambiguities
      const vaguenessSignals: Array<[RegExp, string]> = [
        [/\bmaybe\b|\bperhaps\b|\bpossibly\b|\bmight\b/, 'Tentative language detected'],
        [/\bsometime\b|\bsomeday\b|\beventually\b/, 'Non-specific timing mentioned'],
        [/\bor\b/, 'Alternative times mentioned'],
        [/\?/, 'Phrased as a question'],
      ];
      for (const [signal, message] of vaguenessSignals) {
        if (signal.test(normalizedText)) {
          result.ambiguities.push(message);
        }
      }

      // Detect timezone mentions
      result.timezone = this.extractTimezone(text) || this.userTimezone;

      // Apply timezone if different from user's
      if (result.startTime && result.timezone !== this.userTimezone) {
        result.startTime = toZonedTime(result.startTime, result.timezone);
        if (result.endTime) {
          result.endTime = toZonedTime(result.endTime, result.timezone);
        }
      }

      // Validate results
      if (result.startTime && !isValid(result.startTime)) {
        result.startTime = null;
        result.confidence = 0;
        result.warnings.push('Invalid date/time combination');
      }

      if (result.endTime && result.startTime && result.endTime <= result.startTime) {
        result.warnings.push('End time before start time, ignoring end time');
        result.endTime = null;
      }

      logger.debug('Temporal parsing result', { text, result });
      
    } catch (error) {
      logger.error('Temporal parsing error', error);
      result.warnings.push('Error during temporal parsing');
    }

    return result;
  }

  /**
   * Parse date from text
   */
  private parseDate(text: string): { date: Date | null; confidence: number; ambiguities: string[]; original: string } {
    const result = { date: null as Date | null, confidence: 0, ambiguities: [] as string[], original: '' };

    // Check for relative date expressions
    for (const [keyword, dateFunc] of Object.entries(TEMPORAL_PATTERNS)) {
      if (typeof dateFunc === 'function' && text.includes(keyword)) {
        result.date = startOfDay(dateFunc());
        result.confidence = 0.9;
        result.original = keyword;
        return result;
      }
    }

    // Check for explicit date patterns
    for (const pattern of DATE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        result.original = match[0];
        
        if (pattern === DATE_PATTERNS[0] || pattern === DATE_PATTERNS[1]) {
          // Handle MM/DD vs DD/MM ambiguity
          const [, first, second, year] = match;
          const firstNum = parseInt(first);
          const secondNum = parseInt(second);
          
          if (firstNum > 12 && secondNum <= 12) {
            // Must be DD/MM
            result.date = this.buildValidatedDate(parseInt(year), secondNum - 1, firstNum);
            result.confidence = 0.8;
          } else if (secondNum > 12 && firstNum <= 12) {
            // Must be MM/DD
            result.date = this.buildValidatedDate(parseInt(year), firstNum - 1, secondNum);
            result.confidence = 0.8;
          } else {
            // Ambiguous, use user locale
            if (this.userLocale === 'US') {
              result.date = this.buildValidatedDate(parseInt(year), firstNum - 1, secondNum);
            } else {
              result.date = this.buildValidatedDate(parseInt(year), secondNum - 1, firstNum);
            }
            result.confidence = 0.6;
            result.ambiguities.push(`Date format ambiguous (${this.userLocale} format assumed)`);
          }
        } else if (pattern === DATE_PATTERNS[2]) {
          // ISO format
          const [, year, month, day] = match;
          result.date = this.buildValidatedDate(parseInt(year), parseInt(month) - 1, parseInt(day));
          result.confidence = 0.9;
        } else {
          // Written date formats
          const monthNames = [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december'
          ];
          const monthAbbrevs = [
            'jan', 'feb', 'mar', 'apr', 'may', 'jun',
            'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
          ];
          
          const monthStr = match[1].toLowerCase();
          const day = parseInt(match[2]);
          const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
          
          let monthIndex = monthNames.indexOf(monthStr);
          if (monthIndex === -1) {
            monthIndex = monthAbbrevs.indexOf(monthStr);
          }
          
          if (monthIndex !== -1) {
            result.date = this.buildValidatedDate(year, monthIndex, day);
            result.confidence = 0.85;
          }
        }
        break;
      }
    }

    return result;
  }

  /**
   * Parse time from text
   */
  private parseTime(text: string): { time: string | null; confidence: number; ambiguities: string[]; original: string } {
    const result = { time: null as string | null, confidence: 0, ambiguities: [] as string[], original: '' };

    // Check for natural time expressions
    for (const [keyword, timeValue] of Object.entries(TEMPORAL_PATTERNS)) {
      if (typeof timeValue === 'string' && text.includes(keyword)) {
        result.time = timeValue;
        result.confidence = 0.8;
        result.original = keyword;
        return result;
      }
    }

    // Check for explicit time patterns
    for (const pattern of TIME_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        result.original = match[0];
        
        if (pattern === TIME_PATTERNS[0]) {
          // 12-hour format with minutes
          let hour = parseInt(match[1]);
          const minute = parseInt(match[2]);
          const period = match[3].toLowerCase();
          
          if (period.includes('pm') && hour !== 12) hour += 12;
          if (period.includes('am') && hour === 12) hour = 0;
          
          if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            result.time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            result.confidence = 0.85;
          }
        } else if (pattern === TIME_PATTERNS[1]) {
          // 24-hour format
          const hour = parseInt(match[1]);
          const minute = parseInt(match[2]);
          if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            result.time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            result.confidence = 0.9;
          }
        } else if (pattern === TIME_PATTERNS[2]) {
          // 12-hour format without minutes
          let hour = parseInt(match[1]);
          const period = match[2].toLowerCase();
          
          if (period.includes('pm') && hour !== 12) hour += 12;
          if (period.includes('am') && hour === 12) hour = 0;
          
          if (hour >= 0 && hour <= 23) {
            result.time = `${hour.toString().padStart(2, '0')}:00`;
            result.confidence = 0.8;
          }
        }
        break;
      }
    }

    return result;
  }

  /**
   * Parse an explicit "X to Y" time range. Returns null when no range is present.
   */
  private parseTimeRange(text: string): { start: string; end: string; original: string } | null {
    const match = text.match(TIME_RANGE_PATTERN);
    if (!match) return null;

    const start = this.normalizeTimeToken(match[1]);
    const end = this.normalizeTimeToken(match[2]);
    if (!start || !end) return null;

    return { start, end, original: match[0] };
  }

  /**
   * Normalize a clock-time token ("2pm", "2:30pm", "14:30") to "HH:MM", or null.
   */
  private normalizeTimeToken(token: string): string | null {
    const m = token.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
    if (!m) return null;

    let hour = parseInt(m[1]);
    const minute = m[2] ? parseInt(m[2]) : 0;
    const period = m[3]?.toLowerCase();

    if (period?.includes('pm') && hour !== 12) hour += 12;
    if (period?.includes('am') && hour === 12) hour = 0;

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  /**
   * Parse duration from text
   */
  private parseDuration(text: string): { duration: number | null; confidence: number; original: string } {
    const result = { duration: null as number | null, confidence: 0, original: '' };

    const durationPatterns = [
      // Combined "1h 30m" must be tried before the hours-only pattern, which would
      // otherwise consume just the "1h" and drop the minutes.
      /(\d+)\s*h\s*(\d+)\s*m/i,
      /(\d+)\s*(hour|hr|h)s?/i,
      /(\d+)\s*(minute|min|m)s?/i,
      // Bare H:MM is only a duration with an explicit "for " prefix — otherwise it
      // would swallow clock times like "at 2:30pm" as a 150-minute duration.
      /for\s+(\d+):(\d{2})\b/i
    ];

    for (const pattern of durationPatterns) {
      const match = text.match(pattern);
      if (match) {
        result.original = match[0];
        
        if (pattern === durationPatterns[0] || pattern === durationPatterns[3]) {
          // Hours and minutes
          const hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          result.duration = hours * 60 + minutes;
          result.confidence = 0.85;
        } else if (pattern === durationPatterns[1]) {
          // Hours
          result.duration = parseInt(match[1]) * 60;
          result.confidence = 0.8;
        } else if (pattern === durationPatterns[2]) {
          // Minutes
          result.duration = parseInt(match[1]);
          result.confidence = 0.8;
        }
        break;
      }
    }

    return result;
  }

  /**
   * Extract timezone from text
   */
  private extractTimezone(text: string): string | null {
    const timezonePatterns = [
      /\b(UTC|GMT|EST|CST|MST|PST|EDT|CDT|MDT|PDT)\b/i,
      /\b([A-Z]{3}T)\b/,
      /(America\/New_York|America\/Chicago|America\/Denver|America\/Los_Angeles|Europe\/London|Europe\/Paris)/i
    ];

    for (const pattern of timezonePatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }

  /**
   * Analyze temporal expression for conflicts and issues
   */
  analyzeTemporalExpression(
    text: string, 
    existingEvents: Array<{ id: string; title: string; startTime: Date; endTime: Date }> = [],
    context?: { userPreferences?: any }
  ): TemporalAnalysisResult {
    const parseResult = this.parseTemporalExpression(text, context);
    const conflicts: TemporalConflict[] = [];
    let shouldDegrade = false;
    let degradeReason: string | undefined;

    // Check for low confidence
    if (parseResult.confidence < 0.6) {
      shouldDegrade = true;
      degradeReason = `Low temporal confidence (${(parseResult.confidence * 100).toFixed(1)}%)`;
    }

    // Check for significant ambiguities
    if (parseResult.ambiguities.length > 1) {
      shouldDegrade = true;
      degradeReason = degradeReason || `Multiple temporal ambiguities: ${parseResult.ambiguities.join(', ')}`;
    }

    // Check for conflicts with existing events
    if (parseResult.startTime) {
      for (const existingEvent of existingEvents) {
        const conflict = this.detectEventConflict(parseResult, existingEvent);
        if (conflict) {
          conflicts.push(conflict);
          if (conflict.severity === 'high') {
            shouldDegrade = true;
            degradeReason = degradeReason || `High conflict detected: ${conflict.description}`;
          }
        }
      }
    }

    // Check business hours
    if (parseResult.startTime) {
      const businessHoursConflict = this.checkBusinessHours(parseResult.startTime);
      if (businessHoursConflict) {
        conflicts.push(businessHoursConflict);
      }
    }

    // Check for duration anomalies
    if (parseResult.startTime && parseResult.endTime) {
      const durationConflict = this.checkDurationAnomaly(parseResult.startTime, parseResult.endTime);
      if (durationConflict) {
        conflicts.push(durationConflict);
        if (durationConflict.severity === 'high') {
          shouldDegrade = true;
          degradeReason = degradeReason || `Duration anomaly: ${durationConflict.description}`;
        }
      }
    }

    const finalConfidence = shouldDegrade ? Math.min(parseResult.confidence, 0.59) : parseResult.confidence;

    return {
      parseResult,
      conflicts,
      shouldDegrade,
      degradeReason,
      confidence: finalConfidence
    };
  }

  private detectEventConflict(
    parseResult: TemporalParseResult,
    existingEvent: { id: string; title: string; startTime: Date; endTime: Date }
  ): TemporalConflict | null {
    if (!parseResult.startTime) return null;

    const newStart = parseResult.startTime;
    const newEnd = parseResult.endTime || new Date(newStart.getTime() + 60 * 60 * 1000); // Default 1 hour

    const existingStart = existingEvent.startTime;
    const existingEnd = existingEvent.endTime;

    // Check for overlap
    if (newStart < existingEnd && newEnd > existingStart) {
      const overlapMinutes = Math.min(newEnd.getTime(), existingEnd.getTime()) - Math.max(newStart.getTime(), existingStart.getTime());
      const overlapPercent = (overlapMinutes / (newEnd.getTime() - newStart.getTime())) * 100;

      let severity: 'low' | 'medium' | 'high' = 'low';
      if (overlapPercent > 75) severity = 'high';
      else if (overlapPercent > 25) severity = 'medium';

      return {
        type: 'overlap',
        severity,
        description: `Overlaps with "${existingEvent.title}" by ${Math.round(overlapMinutes / (1000 * 60))} minutes`,
        existingEvent,
        suggestion: severity === 'high' ? 'Consider scheduling at a different time' : 'Review for potential conflict'
      };
    }

    return null;
  }

  private checkBusinessHours(startTime: Date): TemporalConflict | null {
    const hour = startTime.getHours();
    const dayOfWeek = startTime.getDay();

    // Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        type: 'business_hours',
        severity: 'medium',
        description: 'Scheduled for weekend',
        suggestion: 'Consider scheduling during business hours'
      };
    }

    // Very early or late hours
    if (hour < 6 || hour > 22) {
      return {
        type: 'business_hours',
        severity: 'high',
        description: 'Scheduled outside reasonable hours',
        suggestion: 'Consider scheduling during business hours (9 AM - 6 PM)'
      };
    }

    // Outside typical business hours
    if (hour < 9 || hour > 18) {
      return {
        type: 'business_hours',
        severity: 'low',
        description: 'Scheduled outside typical business hours',
        suggestion: 'Verify timing is intentional'
      };
    }

    return null;
  }

  private checkDurationAnomaly(startTime: Date, endTime: Date): TemporalConflict | null {
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);

    if (durationMinutes < 5) {
      return {
        type: 'duration_anomaly',
        severity: 'high',
        description: `Very short duration (${durationMinutes} minutes)`,
        suggestion: 'Verify meeting duration is correct'
      };
    }

    if (durationMinutes > 8 * 60) { // More than 8 hours
      return {
        type: 'duration_anomaly',
        severity: 'high',
        description: `Very long duration (${Math.round(durationMinutes / 60)} hours)`,
        suggestion: 'Consider breaking into smaller sessions'
      };
    }

    if (durationMinutes > 4 * 60) { // More than 4 hours
      return {
        type: 'duration_anomaly',
        severity: 'medium',
        description: `Long duration (${Math.round(durationMinutes / 60)} hours)`,
        suggestion: 'Consider adding breaks'
      };
    }

    return null;
  }

  /**
   * Format temporal analysis for display
   */
  formatAnalysisForDisplay(analysis: TemporalAnalysisResult): string {
    const parts: string[] = [];

    if (analysis.parseResult.startTime) {
      parts.push(`Parsed: ${format(analysis.parseResult.startTime, 'PPP p')}`);
    }

    if (analysis.parseResult.timezone && analysis.parseResult.timezone !== this.userTimezone) {
      parts.push(`Timezone: ${analysis.parseResult.timezone}`);
    }

    if (analysis.conflicts.length > 0) {
      const highConflicts = analysis.conflicts.filter(c => c.severity === 'high');
      if (highConflicts.length > 0) {
        parts.push(`⚠️ ${highConflicts.length} high-priority conflict(s)`);
      }
    }

    if (analysis.parseResult.ambiguities.length > 0) {
      parts.push(`Ambiguities: ${analysis.parseResult.ambiguities.join(', ')}`);
    }

    if (analysis.shouldDegrade) {
      parts.push(`🔄 Degrading to draft: ${analysis.degradeReason}`);
    }

    return parts.join(' • ');
  }
}

// Export singleton instance
export const temporalReasoningService = new TemporalReasoningService();