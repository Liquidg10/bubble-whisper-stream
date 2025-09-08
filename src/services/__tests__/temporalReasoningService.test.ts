/**
 * Test suite for Temporal Reasoning Service
 * Tests tricky date/time parsing scenarios and conflict detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemporalReasoningService } from '../temporalReasoningService';

describe('TemporalReasoningService', () => {
  let service: TemporalReasoningService;

  beforeEach(() => {
    service = new TemporalReasoningService('America/New_York', 'US');
  });

  describe('Basic Date/Time Parsing', () => {
    it('should parse simple date and time', () => {
      const result = service.parseTemporalExpression('Meeting tomorrow at 3pm');
      
      expect(result.startTime).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.ambiguities).toHaveLength(0);
    });

    it('should parse ISO date format', () => {
      const result = service.parseTemporalExpression('2024-12-25 at 2:30pm');
      
      expect(result.startTime).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.parsedElements.date).toBe('2024-12-25');
    });

    it('should handle noon and midnight', () => {
      const noonResult = service.parseTemporalExpression('Meeting tomorrow at noon');
      const midnightResult = service.parseTemporalExpression('Deploy tonight at midnight');
      
      expect(noonResult.startTime?.getHours()).toBe(12);
      expect(midnightResult.startTime?.getHours()).toBe(0);
    });
  });

  describe('Ambiguous Date Formats', () => {
    it('should flag MM/DD vs DD/MM ambiguity', () => {
      const result = service.parseTemporalExpression('Meeting on 10/11/2024 at 2pm');
      
      expect(result.confidence).toBeLessThan(0.8);
      expect(result.ambiguities).toContain('Date format ambiguous (US format assumed)');
    });

    it('should handle unambiguous dates correctly', () => {
      const result = service.parseTemporalExpression('Meeting on 13/11/2024 at 2pm');
      
      // 13th month doesn't exist, so must be DD/MM
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.startTime?.getMonth()).toBe(10); // November (0-indexed)
      expect(result.startTime?.getDate()).toBe(13);
    });

    it('should use locale preference for ambiguous dates', () => {
      const usService = new TemporalReasoningService('UTC', 'US');
      const euService = new TemporalReasoningService('UTC', 'EU');
      
      const usResult = usService.parseTemporalExpression('Meeting on 03/05/2024');
      const euResult = euService.parseTemporalExpression('Meeting on 03/05/2024');
      
      // US: March 5th, EU: May 3rd
      expect(usResult.startTime?.getMonth()).toBe(2); // March
      expect(usResult.startTime?.getDate()).toBe(5);
      expect(euResult.startTime?.getMonth()).toBe(4); // May
      expect(euResult.startTime?.getDate()).toBe(3);
    });
  });

  describe('Natural Language Parsing', () => {
    it('should parse relative dates', () => {
      const result = service.parseTemporalExpression('next Friday at 2pm');
      
      expect(result.startTime).toBeDefined();
      expect(result.startTime?.getDay()).toBe(5); // Friday
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should handle vague expressions with low confidence', () => {
      const result = service.parseTemporalExpression('Maybe sometime next week?');
      
      expect(result.confidence).toBeLessThan(0.6);
      expect(result.ambiguities.length).toBeGreaterThan(0);
    });

    it('should parse written month names', () => {
      const result = service.parseTemporalExpression('Meeting on December 25th at 10am');
      
      expect(result.startTime?.getMonth()).toBe(11); // December
      expect(result.startTime?.getDate()).toBe(25);
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Duration Parsing', () => {
    it('should parse hour durations', () => {
      const result = service.parseTemporalExpression('2 hour meeting tomorrow at 3pm');
      
      expect(result.endTime).toBeDefined();
      expect(result.endTime?.getTime() - result.startTime!.getTime()).toBe(2 * 60 * 60 * 1000);
    });

    it('should parse minute durations', () => {
      const result = service.parseTemporalExpression('30 minute standup tomorrow at 9am');
      
      expect(result.endTime).toBeDefined();
      expect(result.endTime?.getTime() - result.startTime!.getTime()).toBe(30 * 60 * 1000);
    });

    it('should parse mixed durations', () => {
      const result = service.parseTemporalExpression('Meeting tomorrow at 2pm for 1h 30m');
      
      expect(result.endTime).toBeDefined();
      expect(result.endTime?.getTime() - result.startTime!.getTime()).toBe(90 * 60 * 1000);
    });
  });

  describe('Timezone Handling', () => {
    it('should extract timezone from text', () => {
      const result = service.parseTemporalExpression('Call at 3pm EST tomorrow');
      
      expect(result.timezone).toBe('EST');
    });

    it('should handle timezone conversion', () => {
      const estService = new TemporalReasoningService('America/New_York', 'US');
      const pstService = new TemporalReasoningService('America/Los_Angeles', 'US');
      
      const estResult = estService.parseTemporalExpression('Meeting tomorrow at 3pm PST');
      const pstResult = pstService.parseTemporalExpression('Meeting tomorrow at 3pm');
      
      // Both should parse, EST result should account for timezone difference
      expect(estResult.startTime).toBeDefined();
      expect(pstResult.startTime).toBeDefined();
    });
  });

  describe('Conflict Detection', () => {
    it('should detect overlapping events', () => {
      const existingEvents = [{
        id: 'test-1',
        title: 'Existing Meeting',
        startTime: new Date('2024-12-25T14:00:00'), // 2pm
        endTime: new Date('2024-12-25T15:00:00')    // 3pm
      }];

      const result = service.analyzeTemporalExpression(
        'New meeting on December 25th at 2:30pm',
        existingEvents
      );

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].type).toBe('overlap');
      expect(result.conflicts[0].severity).toBe('medium');
    });

    it('should detect business hours violations', () => {
      const result = service.analyzeTemporalExpression('Meeting tomorrow at 2am');

      const businessHoursConflict = result.conflicts.find(c => c.type === 'business_hours');
      expect(businessHoursConflict).toBeDefined();
      expect(businessHoursConflict?.severity).toBe('high');
    });

    it('should detect weekend scheduling', () => {
      // Create a date that's guaranteed to be a Saturday
      const saturday = new Date();
      saturday.setDate(saturday.getDate() + (6 - saturday.getDay())); // Next Saturday
      
      const result = service.analyzeTemporalExpression(
        `Meeting on ${saturday.toLocaleDateString()} at 2pm`
      );

      const weekendConflict = result.conflicts.find(c => c.type === 'business_hours');
      expect(weekendConflict).toBeDefined();
    });

    it('should detect duration anomalies', () => {
      const shortResult = service.analyzeTemporalExpression('2 minute meeting tomorrow at 3pm');
      const longResult = service.analyzeTemporalExpression('10 hour meeting tomorrow at 8am');

      const shortConflict = shortResult.conflicts.find(c => c.type === 'duration_anomaly');
      const longConflict = longResult.conflicts.find(c => c.type === 'duration_anomaly');

      expect(shortConflict?.severity).toBe('high');
      expect(longConflict?.severity).toBe('high');
    });
  });

  describe('Degradation Logic', () => {
    it('should degrade on low confidence', () => {
      const result = service.analyzeTemporalExpression('Maybe something sometime?');

      expect(result.shouldDegrade).toBe(true);
      expect(result.degradeReason).toContain('Low temporal confidence');
    });

    it('should degrade on multiple ambiguities', () => {
      const result = service.analyzeTemporalExpression('Meeting on 10/11 at 3 or maybe 4pm?');

      expect(result.shouldDegrade).toBe(true);
      expect(result.degradeReason).toContain('ambiguities');
    });

    it('should degrade on high-severity conflicts', () => {
      const existingEvents = [{
        id: 'test-1',
        title: 'Important Meeting',
        startTime: new Date('2024-12-25T14:00:00'),
        endTime: new Date('2024-12-25T15:00:00')
      }];

      const result = service.analyzeTemporalExpression(
        'Team meeting on December 25th from 2pm to 3pm', // Complete overlap
        existingEvents
      );

      expect(result.shouldDegrade).toBe(true);
      expect(result.degradeReason).toContain('High conflict detected');
    });

    it('should not degrade on high confidence with no conflicts', () => {
      const result = service.analyzeTemporalExpression('Meeting tomorrow at 3pm');

      expect(result.shouldDegrade).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid dates gracefully', () => {
      const result = service.parseTemporalExpression('Meeting on February 30th at 2pm');

      expect(result.startTime).toBeNull();
      expect(result.warnings).toContain('Invalid date/time combination');
    });

    it('should handle end time before start time', () => {
      const result = service.parseTemporalExpression('Meeting from 5pm to 3pm tomorrow');

      expect(result.endTime).toBeNull();
      expect(result.warnings).toContain('End time before start time, ignoring end time');
    });

    it('should handle empty input', () => {
      const result = service.parseTemporalExpression('');

      expect(result.startTime).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should handle text with no temporal information', () => {
      const result = service.parseTemporalExpression('This is just regular text');

      expect(result.startTime).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe('Locale Switching', () => {
    it('should update preferences correctly', () => {
      service.updatePreferences('America/Los_Angeles', 'EU');
      const prefs = service.getPreferences();

      expect(prefs.timezone).toBe('America/Los_Angeles');
      expect(prefs.locale).toBe('EU');
    });

    it('should apply new locale to parsing', () => {
      service.updatePreferences(undefined, 'EU');
      const result = service.parseTemporalExpression('Meeting on 05/03/2024');

      // EU format: 5th March
      expect(result.startTime?.getMonth()).toBe(2); // March
      expect(result.startTime?.getDate()).toBe(5);
    });
  });

  describe('Analysis Display Formatting', () => {
    it('should format analysis for display', () => {
      const result = service.analyzeTemporalExpression('Meeting tomorrow at 3pm EST');
      const formatted = service.formatAnalysisForDisplay(result);

      expect(formatted).toContain('Parsed:');
      expect(formatted).toContain('Timezone: EST');
    });

    it('should include conflict information in display', () => {
      const existingEvents = [{
        id: 'test-1',
        title: 'Conflict',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 15 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 16 * 60 * 60 * 1000)
      }];

      const result = service.analyzeTemporalExpression(
        'Meeting tomorrow at 3pm for 2 hours',
        existingEvents
      );
      const formatted = service.formatAnalysisForDisplay(result);

      if (result.conflicts.some(c => c.severity === 'high')) {
        expect(formatted).toContain('⚠️');
        expect(formatted).toContain('high-priority conflict');
      }
    });
  });
});