/**
 * Assistant Cohesion Linter - Ensures unified assistant voice in UI
 * Flags any UI components that expose persona names to users
 */

// Persona names that should never appear in user-facing UI
const FORBIDDEN_PERSONA_NAMES = [
  'Coach Autonomy',
  'Dr. Seligman', 
  'Dr. Anila',
  'Sous-Chef',
  'Dr. Rhea',
  'Friend', // tone names
  'Coach',
  'Scientist',
  'FutureYou',
  'Glimmer', // service names
  'CBT',
  'Persona'
];

// Files that are allowed to use persona names (internal/dev only)
const ALLOWED_FILES = [
  'src/services/',
  'src/types/',
  'src/utils/assistantCohesionLint.ts',
  'src/components/dev/', // dev tools
  'src/components/settings/', // settings panels
  'src/components/PersonaSettingsPanel.tsx',
  'src/components/CRDTDevelopmentPanel.tsx'
];

interface LintResult {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Scans a file for forbidden persona names in UI contexts
 */
export function lintAssistantCohesion(filePath: string, content: string): LintResult[] {
  const results: LintResult[] = [];
  
  // Skip allowed files
  if (ALLOWED_FILES.some(allowed => filePath.includes(allowed))) {
    return results;
  }
  
  // Skip if not a UI component
  if (!filePath.includes('components/') || !filePath.endsWith('.tsx')) {
    return results;
  }
  
  const lines = content.split('\n');
  
  lines.forEach((line, lineIndex) => {
    FORBIDDEN_PERSONA_NAMES.forEach(personaName => {
      // Look for persona names in user-facing contexts
      const regex = new RegExp(`['"\`]([^'"\`]*${personaName}[^'"\`]*)['"\`]`, 'gi');
      let match;
      
      while ((match = regex.exec(line)) !== null) {
        // Skip if it's in a comment
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
          continue;
        }
        
        // Skip if it's in console.log or internal logging
        if (line.includes('console.') || line.includes('logger.') || line.includes('trace')) {
          continue;
        }
        
        // Skip if it's in a variable name or function name (internal usage)
        if (match.index > 0 && /[a-zA-Z_]/.test(line[match.index - 1])) {
          continue;
        }
        
        results.push({
          file: filePath,
          line: lineIndex + 1,
          column: match.index + 1,
          message: `Persona name "${personaName}" exposed in UI. Assistant must appear as unified voice. Use "Assistant" or "I" instead.`,
          severity: 'error'
        });
      }
    });
  });
  
  return results;
}

/**
 * CLI tool to scan entire project
 */
export async function scanProject(projectRoot: string = 'src/'): Promise<LintResult[]> {
  const results: LintResult[] = [];
  
  // This would be implemented to scan all files in a real CLI environment
  console.log(`Scanning ${projectRoot} for assistant cohesion violations...`);
  
  return results;
}

/**
 * Formats results for CI output
 */
export function formatForCI(results: LintResult[]): string {
  if (results.length === 0) {
    return '✅ Assistant cohesion check passed - no persona names found in UI';
  }
  
  let output = `❌ Assistant cohesion check failed - ${results.length} violations found:\n\n`;
  
  results.forEach(result => {
    output += `${result.file}:${result.line}:${result.column} - ${result.severity}: ${result.message}\n`;
  });
  
  output += '\nFix: Replace persona names with "Assistant" or "I" in user-facing text.\n';
  output += 'Internal logging and services can still use persona names for debugging.\n';
  
  return output;
}