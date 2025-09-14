#!/usr/bin/env node
/**
 * P18 - Assistant Cohesion Lint Tool
 * CLI tool to scan codebase for persona leakage in UI copy
 * Usage: node src/lint/cohesion-lint.js [--fix]
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const PERSONA_NAMES = [
  'Friend', 'Coach', 'Scientist', 'Future You',
  'friend', 'coach', 'scientist', 'future you',
  'FRIEND', 'COACH', 'SCIENTIST', 'FUTURE YOU'
];

const PERSONA_PATTERNS = [
  /speaking as a/i,
  /your (friend|coach|scientist)/i,
  /from your (friend|coach|scientist)/i,
  /(friend|coach|scientist) here/i,
  /switching to (friend|coach|scientist)/i,
  /as your (friend|coach|scientist)/i
];

const EXCLUDE_PATTERNS = [
  '/node_modules/',
  '/.git/',
  '/dist/',
  '/build/',
  'cohesion',
  'test',
  'spec'
];

function shouldExcludeFile(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function scanFile(filePath) {
  const violations = [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    
    // Check for persona names
    for (const persona of PERSONA_NAMES) {
      if (line.includes(persona)) {
        // Skip if it's in a comment about the service itself
        if (line.includes('// ') || line.includes('* ') || line.includes('/** ')) {
          continue;
        }
        
        violations.push({
          file: filePath,
          line: lineNumber,
          type: 'persona_name',
          text: line.trim(),
          persona: persona,
          severity: 'error'
        });
      }
    }
    
    // Check for persona patterns
    for (const pattern of PERSONA_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: lineNumber,
          type: 'persona_pattern',
          text: line.trim(),
          pattern: pattern.source,
          severity: 'warning'
        });
      }
    }
  });
  
  return violations;
}

function sanitizeText(text) {
  let sanitized = text;
  
  // Remove persona names
  for (const persona of PERSONA_NAMES) {
    sanitized = sanitized.replace(new RegExp(persona, 'g'), '');
  }
  
  // Clean up extra whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  return sanitized;
}

async function main() {
  const shouldFix = process.argv.includes('--fix');
  const allViolations = [];
  
  console.log('🔍 Scanning for assistant cohesion violations...\n');
  
  // Scan TypeScript and JavaScript files
  const files = await glob('src/**/*.{ts,tsx,js,jsx}', { 
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'] 
  });
  
  for (const file of files) {
    if (shouldExcludeFile(file)) continue;
    
    try {
      const violations = scanFile(file);
      if (violations.length > 0) {
        allViolations.push(...violations);
      }
    } catch (error) {
      console.warn(`⚠️  Could not scan ${file}: ${error.message}`);
    }
  }
  
  // Report results
  if (allViolations.length === 0) {
    console.log('✅ PASS: No assistant cohesion violations found');
    process.exit(0);
  }
  
  const errors = allViolations.filter(v => v.severity === 'error');
  const warnings = allViolations.filter(v => v.severity === 'warning');
  
  console.log(`❌ FAIL: ${allViolations.length} assistant cohesion violations found\n`);
  
  if (errors.length > 0) {
    console.log(`🚨 ERRORS (${errors.length}):`);
    for (const error of errors) {
      console.log(`  ${error.file}:${error.line}`);
      console.log(`    ${error.type}: Found persona "${error.persona}" in UI text`);
      console.log(`    Text: "${error.text}"`);
      
      if (shouldFix) {
        const sanitized = sanitizeText(error.text);
        console.log(`    Suggested: "${sanitized}"`);
      }
      
      console.log('');
    }
  }
  
  if (warnings.length > 0) {
    console.log(`⚠️  WARNINGS (${warnings.length}):`);
    for (const warning of warnings) {
      console.log(`  ${warning.file}:${warning.line}`);
      console.log(`    ${warning.type}: Pattern suggests persona switching`);
      console.log(`    Text: "${warning.text}"`);
      console.log('');
    }
  }
  
  console.log('\n💡 To maintain assistant cohesion:');
  console.log('   - Remove persona names from user-facing text');
  console.log('   - Use consistent assistant voice across all UI');
  console.log('   - Keep persona logic internal only');
  
  if (shouldFix) {
    console.log('\n🔧 Run with --fix to see sanitization suggestions');
  }
  
  process.exit(1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { scanFile, sanitizeText, PERSONA_NAMES, PERSONA_PATTERNS };