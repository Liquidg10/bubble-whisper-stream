#!/usr/bin/env node

/**
 * CI Script - Assistant Cohesion Linter
 * Ensures assistant appears as unified voice in UI
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Persona names that should never appear in user-facing UI
const FORBIDDEN_PERSONA_NAMES = [
  'Coach Autonomy',
  'Dr. Seligman', 
  'Dr. Anila',
  'Sous-Chef',
  'Dr. Rhea',
  'Friend', // tone names (when used as persona labels)
  'Coach',
  'Scientist', 
  'FutureYou',
  'Future You',
  'Glimmer', // service names
  'CBT',
  'Persona'
];

// Files that are allowed to use persona names
const ALLOWED_PATTERNS = [
  /src\/services\//,
  /src\/types\//,
  /src\/utils\/assistantCohesionLint/,
  /src\/components\/.*Settings/,
  /src\/components\/.*Panel/,
  /src\/components\/dev\//,
  /\.test\./,
  /\.spec\./
];

function isAllowedFile(filePath) {
  return ALLOWED_PATTERNS.some(pattern => pattern.test(filePath));
}

function scanFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) {
    return [];
  }
  
  if (isAllowedFile(filePath)) {
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];
  
  lines.forEach((line, lineIndex) => {
    FORBIDDEN_PERSONA_NAMES.forEach(personaName => {
      // Look for persona names in UI strings (quotes/backticks and JSX attributes)
      const quotedRegex = new RegExp(`['"\`][^'"\`]*\\b${personaName}\\b[^'"\`]*['"\`]`, 'gi');
      const jsxAttrRegex = new RegExp(`\\b${personaName}\\b(?=\\s*[})]|\\s*$)`, 'gi');
      
      if (quotedRegex.test(line) || jsxAttrRegex.test(line)) {
        // Skip comments and logging
        if (line.trim().startsWith('//') || 
            line.trim().startsWith('*') ||
            line.includes('console.') ||
            line.includes('logger.') ||
            line.includes('trace') ||
            line.includes('test') ||
            line.includes('spec')) {
          return;
        }
        
        // Skip if it's in a variable name, function name, or type definition
        if (line.includes('const ') || 
            line.includes('interface ') ||
            line.includes('type ') ||
            line.includes('function ') ||
            line.includes('export ')) {
          return;
        }
        
        violations.push({
          file: filePath,
          line: lineIndex + 1,
          personaName,
          lineContent: line.trim()
        });
      }
    });
  });
  
  return violations;
}

function scanDirectory(dir) {
  let violations = [];
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      violations = violations.concat(scanDirectory(fullPath));
    } else if (stat.isFile()) {
      violations = violations.concat(scanFile(fullPath));
    }
  }
  
  return violations;
}

function main() {
  console.log('🔍 Scanning for assistant cohesion violations...\n');
  
  const violations = scanDirectory('src');
  
  if (violations.length === 0) {
    console.log('✅ Assistant cohesion check passed - no persona names found in UI');
    process.exit(0);
  }
  
  console.log(`❌ Assistant cohesion check failed - ${violations.length} violations found:\n`);
  
  violations.forEach(violation => {
    console.log(`${violation.file}:${violation.line}`);
    console.log(`  Persona name "${violation.personaName}" exposed in UI`);
    console.log(`  Line: ${violation.lineContent}`);
    console.log(`  Fix: Use "Assistant" or "I" instead\n`);
  });
  
  console.log('Assistant must appear as unified voice to users.');
  console.log('Persona names are allowed in services, types, and settings panels only.\n');
  
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { scanFile, scanDirectory };