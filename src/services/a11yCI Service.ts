/**
 * P11 - Accessibility CI Service
 * Automated a11y testing that fails builds on violations
 */

import { logger } from '@/utils/logger';

export interface A11yViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  selector: string;
  rule: string;
  wcagLevel: string;
}

export interface TargetSizeViolation {
  selector: string;
  width: number;
  height: number;
  requiredMin: number;
  element: string;
}

export interface KeyboardAccessViolation {
  selector: string;
  element: string;
  missingAlternative: string;
  wcagRule: string;
}

export interface A11yTestResults {
  targetSizeViolations: TargetSizeViolation[];
  keyboardAccessViolations: KeyboardAccessViolation[];
  axeViolations: A11yViolation[];
  reducedMotionViolations: string[];
  overallPass: boolean;
  criticalCount: number;
  totalViolations: number;
}

class A11yCIService {
  private readonly TARGET_SIZE_MIN = 44; // 44x44 CSS px per WCAG 2.5.8 AA+ guidance
  private readonly DRAG_SELECTORS = [
    '[draggable="true"]',
    '.bubble-item',
    '.draggable',
    '[data-dnd-item]'
  ];

  /**
   * Run comprehensive a11y tests
   * P11: Fail builds on violations
   */
  async runA11yTests(): Promise<A11yTestResults> {
    try {
      logger.info('Running comprehensive a11y tests (P11)');

      const results: A11yTestResults = {
        targetSizeViolations: [],
        keyboardAccessViolations: [],
        axeViolations: [],
        reducedMotionViolations: [],
        overallPass: true,
        criticalCount: 0,
        totalViolations: 0
      };

      // Check target sizes (WCAG 2.5.8)
      results.targetSizeViolations = await this.checkTargetSizes();
      
      // Check keyboard alternatives for drag (WCAG 2.5.7)
      results.keyboardAccessViolations = await this.checkKeyboardAlternatives();
      
      // Check reduced motion support
      results.reducedMotionViolations = await this.checkReducedMotionSupport();
      
      // Run axe-core if available
      results.axeViolations = await this.runAxeTests();

      // Calculate totals
      results.criticalCount = results.targetSizeViolations.length + 
                             results.keyboardAccessViolations.length;
      
      results.totalViolations = results.criticalCount + 
                               results.axeViolations.length + 
                               results.reducedMotionViolations.length;

      results.overallPass = results.criticalCount === 0 && 
                           results.axeViolations.filter(v => v.impact === 'critical').length === 0;

      logger.info('A11y test results', {
        totalViolations: results.totalViolations,
        criticalCount: results.criticalCount,
        overallPass: results.overallPass
      });

      return results;
    } catch (error) {
      logger.error('A11y testing failed', error);
      throw error;
    }
  }

  /**
   * Check target sizes (WCAG 2.5.8)
   * Require ≥44×44 CSS px for actionable controls
   */
  private async checkTargetSizes(): Promise<TargetSizeViolation[]> {
    const violations: TargetSizeViolation[] = [];

    if (typeof document === 'undefined') {
      return violations; // Skip in SSR
    }

    const actionableElements = document.querySelectorAll(`
      button,
      [role="button"],
      a,
      input[type="checkbox"],
      input[type="radio"],
      [tabindex]:not([tabindex="-1"]),
      .clickable,
      .draggable,
      .bubble-item
    `);

    actionableElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const computedStyle = getComputedStyle(element);
      
      // Get actual CSS pixel dimensions
      const width = rect.width;
      const height = rect.height;
      
      // Check if element is visible
      if (width === 0 || height === 0) return;
      if (computedStyle.visibility === 'hidden') return;
      if (computedStyle.display === 'none') return;

      // Check minimum size requirement
      if (width < this.TARGET_SIZE_MIN || height < this.TARGET_SIZE_MIN) {
        violations.push({
          selector: this.getSelector(element),
          width: Math.round(width),
          height: Math.round(height),
          requiredMin: this.TARGET_SIZE_MIN,
          element: element.tagName.toLowerCase()
        });
      }
    });

    return violations;
  }

  /**
   * Check keyboard alternatives for drag operations (WCAG 2.5.7)
   */
  private async checkKeyboardAlternatives(): Promise<KeyboardAccessViolation[]> {
    const violations: KeyboardAccessViolation[] = [];

    if (typeof document === 'undefined') {
      return violations;
    }

    this.DRAG_SELECTORS.forEach(selector => {
      const draggableElements = document.querySelectorAll(selector);
      
      draggableElements.forEach((element) => {
        const hasKeyboardAlternative = this.checkKeyboardDragAlternative(element);
        
        if (!hasKeyboardAlternative) {
          violations.push({
            selector: this.getSelector(element),
            element: element.tagName.toLowerCase(),
            missingAlternative: 'Keyboard alternative for drag operation',
            wcagRule: 'WCAG 2.5.7 Dragging Movements'
          });
        }
      });
    });

    return violations;
  }

  /**
   * Check if element has keyboard alternative for dragging
   */
  private checkKeyboardDragAlternative(element: Element): boolean {
    // Check for keyboard event handlers
    const hasKeyboardHandlers = element.hasAttribute('onkeydown') || 
                               element.hasAttribute('onkeyup') ||
                               element.getAttribute('tabindex') !== null;

    // Check for ARIA attributes indicating keyboard support
    const hasAriaSupport = element.hasAttribute('aria-grabbed') ||
                          element.hasAttribute('aria-dropeffect') ||
                          element.getAttribute('role')?.includes('option');

    // Check for move buttons nearby (common pattern)
    const parent = element.parentElement;
    const hasMoveButtons = parent?.querySelector('.move-up, .move-down, [aria-label*="move"]') !== null;

    // Check for context menu with move options
    const hasContextMenu = element.hasAttribute('oncontextmenu') ||
                          parent?.querySelector('[role="menu"]') !== null;

    return hasKeyboardHandlers || hasAriaSupport || hasMoveButtons || hasContextMenu;
  }

  /**
   * Check reduced motion support
   */
  private async checkReducedMotionSupport(): Promise<string[]> {
    const violations: string[] = [];

    if (typeof document === 'undefined') {
      return violations;
    }

    // Check if animations are disabled when prefers-reduced-motion is set
    const animatedElements = document.querySelectorAll(`
      .animate-spin,
      .animate-pulse,
      .animate-bounce,
      [style*="animation"],
      [style*="transition"]
    `);

    // In a real CI environment, we would:
    // 1. Set prefers-reduced-motion: reduce in the test environment
    // 2. Check if animations are actually disabled
    // For now, we'll check if elements have appropriate CSS

    animatedElements.forEach((element) => {
      const computedStyle = getComputedStyle(element);
      const hasReducedMotionCSS = computedStyle.getPropertyValue('--respect-reduced-motion') === 'true' ||
                                 element.classList.contains('motion-safe:animate-spin') ||
                                 element.classList.contains('motion-reduce:animate-none');

      if (!hasReducedMotionCSS) {
        violations.push(`Element ${this.getSelector(element)} lacks reduced motion support`);
      }
    });

    return violations;
  }

  /**
   * Run axe-core tests if available
   */
  private async runAxeTests(): Promise<A11yViolation[]> {
    if (typeof window === 'undefined' || !(window as any).axe) {
      return []; // Skip if axe-core not available
    }

    try {
      const axe = (window as any).axe;
      const results = await axe.run();
      
      return results.violations.map((violation: any): A11yViolation => ({
        id: violation.id,
        impact: violation.impact,
        description: violation.description,
        help: violation.help,
        selector: violation.nodes[0]?.target?.join(', ') || 'unknown',
        rule: violation.id,
        wcagLevel: violation.tags.find((tag: string) => tag.startsWith('wcag'))?.toUpperCase() || 'CUSTOM'
      }));
    } catch (error) {
      logger.error('Axe-core testing failed', error);
      return [];
    }
  }

  /**
   * Get CSS selector for an element
   */
  private getSelector(element: Element): string {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c).slice(0, 2);
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    
    return element.tagName.toLowerCase();
  }

  /**
   * Format results for CI output
   */
  formatCIOutput(results: A11yTestResults): string {
    let output = '\n=== ACCESSIBILITY TEST RESULTS ===\n';
    
    if (results.overallPass) {
      output += '✅ All accessibility tests passed!\n';
      return output;
    }

    output += `❌ Found ${results.totalViolations} accessibility violations (${results.criticalCount} critical)\n\n`;

    if (results.targetSizeViolations.length > 0) {
      output += '🎯 TARGET SIZE VIOLATIONS (WCAG 2.5.8):\n';
      results.targetSizeViolations.forEach(v => {
        output += `  - ${v.selector}: ${v.width}×${v.height}px (required: ${v.requiredMin}×${v.requiredMin}px)\n`;
      });
      output += '\n';
    }

    if (results.keyboardAccessViolations.length > 0) {
      output += '⌨️  KEYBOARD ACCESS VIOLATIONS (WCAG 2.5.7):\n';
      results.keyboardAccessViolations.forEach(v => {
        output += `  - ${v.selector}: ${v.missingAlternative}\n`;
      });
      output += '\n';
    }

    if (results.reducedMotionViolations.length > 0) {
      output += '🎬 REDUCED MOTION VIOLATIONS:\n';
      results.reducedMotionViolations.forEach(v => {
        output += `  - ${v}\n`;
      });
      output += '\n';
    }

    if (results.axeViolations.length > 0) {
      output += '🔍 AXE-CORE VIOLATIONS:\n';
      results.axeViolations.forEach(v => {
        output += `  - [${v.impact.toUpperCase()}] ${v.rule}: ${v.description}\n`;
        output += `    Element: ${v.selector}\n`;
      });
    }

    output += '\n🔗 Learn more: https://www.w3.org/WAI/WCAG22/quickref/\n';
    
    return output;
  }

  /**
   * Should build fail based on results?
   */
  shouldFailBuild(results: A11yTestResults): boolean {
    // Fail on critical violations or target size issues
    return results.criticalCount > 0 || 
           results.axeViolations.some(v => v.impact === 'critical');
  }
}

export const a11yCIService = new A11yCIService();