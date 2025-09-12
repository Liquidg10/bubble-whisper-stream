#!/usr/bin/env node

/**
 * P18 Assistant Cohesion Linter - Ensures unified assistant voice in UI
 * Scans for forbidden persona names in user-facing components
 */

const fs = require('fs');
const path = require('path');

// Persona names that should never appear in user-facing UI
const FORBIDDEN_PERSONA_NAMES = [
  'Coach Autonomy',
  'Dr. Seligman', 
  'Dr. Anila',
  'Sous-Chef',
  'Dr. Rhea',
  'Friend', // when used as persona labels, not generic word
  'Coach', // when used as persona labels
  'Scientist',
  'FutureYou',
  'Future You',
  'Glimmer', // service names
  'CBT', // when exposed to users
  'Persona'
];

// File patterns that are allowed to use persona names (internal/dev only)
const ALLOWED_PATTERNS = [
  /src\/services\//,
  /src\/types\//,
  /src\/utils\/assistantCohesionLint\.ts/,
  /src\/components\/dev\//,
  /src\/components\/settings\//,
  /src\/components\/PersonaSettingsPanel\.tsx/,
  /src\/components\/CRDTDevelopmentPanel\.tsx/,
  /scripts\/lint-assistant-cohesion\.js/,
  /\.test\./,
  /\.spec\./
];

function isAllowedFile(filePath) {
  return ALLOWED_PATTERNS.some(pattern => pattern.test(filePath));
}

function scanFile(filePath) {
  const violations = [];
  
  // Skip allowed files
  if (isAllowedFile(filePath)) {
    return violations;
  }
  
  // Only scan UI components
  if (!filePath.includes('components/') || !filePath.endsWith('.tsx')) {
    return violations;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, lineIndex) => {
      FORBIDDEN_PERSONA_NAMES.forEach(personaName => {
        // Look for persona names in user-facing contexts (strings, JSX text)
        const stringRegex = new RegExp(`['"\`]([^'"\`]*${personaName}[^'"\`]*)['"\`]`, 'gi');
        const jsxTextRegex = new RegExp(`>([^<]*${personaName}[^<]*)<`, 'gi');
        
        [stringRegex, jsxTextRegex].forEach(regex => {
          let match;
          while ((match = regex.exec(line)) !== null) {
            // Skip comments
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
              continue;
            }
            
            // Skip console logs and internal logging
            if (line.includes('console.') || line.includes('logger.') || line.includes('trace')) {
              continue;
            }
            
            // Skip variable names and function names
            if (match.index > 0 && /[a-zA-Z_]/.test(line[match.index - 1])) {
              continue;
            }
            
            violations.push({
              file: filePath,
              line: lineIndex + 1,
              column: match.index + 1,
              message: `Persona name "${personaName}" exposed in UI. Use "Assistant" or "I" instead.`,
              severity: 'error'
            });
          }
        });
      });
    });
  } catch (error) {
    console.error(`Error scanning ${filePath}:`, error.message);
  }
  
  return violations;
}

function scanDirectory(dir) {
  const violations = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        violations.push(...scanDirectory(fullPath));
      } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
        violations.push(...scanFile(fullPath));
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
  }
  
  return violations;
}

function main() {
  console.log('🔍 Running Assistant Cohesion Check...\n');
  
  const violations = scanDirectory('src');
  
  if (violations.length === 0) {
    console.log('✅ Assistant cohesion check passed - no persona names found in UI');
    process.exit(0);
  } else {
    console.log(`❌ Assistant cohesion check failed - ${violations.length} violations found:\n`);
    
    violations.forEach(violation => {
      console.log(`${violation.file}:${violation.line}:${violation.column} - ${violation.severity}: ${violation.message}`);
    });
    
    console.log('\n💡 Fix: Replace persona names with "Assistant" or "I" in user-facing text.');
    console.log('   Internal logging and services can still use persona names for debugging.\n');
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = { scanFile, scanDirectory };