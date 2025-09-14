/**
 * P18 - Assistant Cohesion Service
 * Ensures single coherent assistant voice across all UI copy
 * Prevents persona names from leaking to user-facing text
 */

// Persona names that should NEVER appear in UI copy
const PERSONA_NAMES = [
  'Friend', 'Coach', 'Scientist', 'Future You',
  'friend', 'coach', 'scientist', 'future you',
  'FRIEND', 'COACH', 'SCIENTIST', 'FUTURE YOU'
];

// UI copy patterns that suggest persona switching
const PERSONA_PATTERNS = [
  /speaking as a/i,
  /your (friend|coach|scientist)/i,
  /from your (friend|coach|scientist)/i,
  /(friend|coach|scientist) here/i,
  /switching to (friend|coach|scientist)/i,
  /as your (friend|coach|scientist)/i
];

interface CohesionViolation {
  type: 'persona_name' | 'persona_pattern' | 'character_switching';
  text: string;
  location: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

class AssistantCohesionService {
  
  /**
   * Scan text for persona leakage
   */
  scanText(text: string, location: string = 'unknown'): CohesionViolation[] {
    const violations: CohesionViolation[] = [];
    
    // Check for persona names
    for (const persona of PERSONA_NAMES) {
      if (text.includes(persona)) {
        violations.push({
          type: 'persona_name',
          text: text,
          location,
          severity: 'error',
          suggestion: `Remove "${persona}" and use neutral assistant voice`
        });
      }
    }
    
    // Check for persona patterns
    for (const pattern of PERSONA_PATTERNS) {
      if (pattern.test(text)) {
        violations.push({
          type: 'persona_pattern',
          text: text,
          location,
          severity: 'warning',
          suggestion: 'Rewrite to use consistent assistant voice'
        });
      }
    }
    
    return violations;
  }
  
  /**
   * Scan component for violations
   */
  scanComponent(componentCode: string, filePath: string): CohesionViolation[] {
    const violations: CohesionViolation[] = [];
    
    // Extract string literals from JSX
    const stringMatches = componentCode.match(/["'`][^"'`]*["'`]/g) || [];
    
    for (const match of stringMatches) {
      const cleanText = match.slice(1, -1); // Remove quotes
      const textViolations = this.scanText(cleanText, filePath);
      violations.push(...textViolations);
    }
    
    // Extract template literals with ${} expressions
    const templateMatches = componentCode.match(/`[^`]*`/g) || [];
    
    for (const match of templateMatches) {
      const cleanText = match.slice(1, -1); // Remove backticks
      const textViolations = this.scanText(cleanText, filePath);
      violations.push(...textViolations);
    }
    
    return violations;
  }
  
  /**
   * Generate consistent assistant voice alternatives
   */
  generateAlternatives(originalText: string): string[] {
    const alternatives = [];
    
    // Remove persona names and replace with neutral voice
    let cleaned = originalText;
    for (const persona of PERSONA_NAMES) {
      cleaned = cleaned.replace(new RegExp(persona, 'gi'), '');
    }
    
    // Clean up grammar after persona removal
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/^[,\s]+/, '')
      .replace(/[,\s]+$/, '')
      .trim();
    
    if (cleaned && cleaned !== originalText) {
      alternatives.push(cleaned);
    }
    
    // Suggest neutral assistant patterns
    if (originalText.toLowerCase().includes('friend')) {
      alternatives.push(originalText.replace(/friend/gi, 'assistant'));
    }
    
    if (originalText.toLowerCase().includes('coach')) {
      alternatives.push(originalText.replace(/coach/gi, 'system'));
    }
    
    return alternatives.filter(alt => alt.length > 0);
  }
  
  /**
   * Validate UI copy before display
   */
  validateUIText(text: string, context: string = 'ui'): {
    isValid: boolean;
    violations: CohesionViolation[];
    sanitized?: string;
  } {
    const violations = this.scanText(text, context);
    
    if (violations.length === 0) {
      return { isValid: true, violations: [] };
    }
    
    // Attempt to sanitize
    let sanitized = text;
    for (const persona of PERSONA_NAMES) {
      sanitized = sanitized.replace(new RegExp(persona, 'gi'), '');
    }
    
    sanitized = sanitized
      .replace(/\s+/g, ' ')
      .replace(/^[,\s]+/, '')
      .replace(/[,\s]+$/, '')
      .trim();
    
    return {
      isValid: false,
      violations,
      sanitized: sanitized || 'System suggestion'
    };
  }
  
  /**
   * Create lint report for CI
   */
  createLintReport(violations: CohesionViolation[]): string {
    if (violations.length === 0) {
      return 'PASS: No assistant cohesion violations found';
    }
    
    const errors = violations.filter(v => v.severity === 'error');
    const warnings = violations.filter(v => v.severity === 'warning');
    
    let report = `FAIL: ${violations.length} assistant cohesion violations found\n\n`;
    
    if (errors.length > 0) {
      report += `ERRORS (${errors.length}):\n`;
      for (const error of errors) {
        report += `- ${error.location}: ${error.type}\n`;
        report += `  Text: "${error.text}"\n`;
        if (error.suggestion) {
          report += `  Fix: ${error.suggestion}\n`;
        }
        report += '\n';
      }
    }
    
    if (warnings.length > 0) {
      report += `WARNINGS (${warnings.length}):\n`;
      for (const warning of warnings) {
        report += `- ${warning.location}: ${warning.type}\n`;
        report += `  Text: "${warning.text}"\n`;
        if (warning.suggestion) {
          report += `  Fix: ${warning.suggestion}\n`;
        }
        report += '\n';
      }
    }
    
    return report;
  }
}

export const assistantCohesionService = new AssistantCohesionService();
export type { CohesionViolation };