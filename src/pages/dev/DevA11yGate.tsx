/**
 * P20 Dev Route: A11y Gate
 * Real-time accessibility validation with target size enforcement
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw,
  Target,
  Keyboard,
  MousePointer
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface A11yViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  element: string;
  help: string;
}

interface TargetSizeViolation {
  element: string;
  width: number;
  height: number;
  minRequired: number;
}

export function DevA11yGate() {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [violations, setViolations] = useState<A11yViolation[]>([]);
  const [targetSizeViolations, setTargetSizeViolations] = useState<TargetSizeViolation[]>([]);
  const [keyboardViolations, setKeyboardViolations] = useState<string[]>([]);
  const [lastScan, setLastScan] = useState<Date | null>(null);

  /**
   * Run comprehensive a11y validation
   */
  const runA11yValidation = async () => {
    setIsRunning(true);
    
    try {
      // Clear previous results
      setViolations([]);
      setTargetSizeViolations([]);
      setKeyboardViolations([]);

      // 1. Run axe-core scan
      await runAxeCoreScan();
      
      // 2. Check target sizes (WCAG 2.5.8)
      await checkTargetSizes();
      
      // 3. Check keyboard alternatives (WCAG 2.5.7)
      await checkKeyboardAlternatives();
      
      // 4. Check reduced motion support
      await checkReducedMotionSupport();

      setLastScan(new Date());
      
      toast({
        title: "A11y Validation Complete",
        description: `Found ${violations.length + targetSizeViolations.length + keyboardViolations.length} issues`,
      });
      
    } catch (error) {
      console.error('A11y validation failed:', error);
      toast({
        title: "Validation Error",
        description: "Failed to run accessibility validation",
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  /**
   * Run axe-core accessibility scan
   */
  const runAxeCoreScan = async (): Promise<void> => {
    return new Promise((resolve) => {
      // Simulate axe-core scan
      setTimeout(() => {
        const mockViolations: A11yViolation[] = [];
        
        // Check for common issues
        const elements = document.querySelectorAll('button, [role="button"], input, select, textarea');
        elements.forEach((el, index) => {
          if (!el.getAttribute('aria-label') && !el.textContent?.trim()) {
            mockViolations.push({
              id: `missing-label-${index}`,
              impact: 'serious',
              description: 'Form element missing accessible label',
              element: el.tagName.toLowerCase(),
              help: 'Add aria-label or label element'
            });
          }
        });

        setViolations(mockViolations);
        resolve();
      }, 1000);
    });
  };

  /**
   * Check target sizes (≥44×44 CSS pixels per WCAG 2.5.8)
   */
  const checkTargetSizes = async (): Promise<void> => {
    const minTargetSize = 44; // CSS pixels
    const violations: TargetSizeViolation[] = [];
    
    // Check all interactive elements
    const interactiveElements = document.querySelectorAll(
      'button, [role="button"], input, select, textarea, a, [tabindex]:not([tabindex="-1"])'
    );
    
    interactiveElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(el);
      
      // Get CSS pixel dimensions (not including transforms)
      const width = parseFloat(computedStyle.width) || rect.width;
      const height = parseFloat(computedStyle.height) || rect.height;
      
      if (width < minTargetSize || height < minTargetSize) {
        violations.push({
          element: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ').join('.') : ''}`,
          width,
          height,
          minRequired: minTargetSize
        });
      }
    });
    
    setTargetSizeViolations(violations);
  };

  /**
   * Check keyboard alternatives for drag operations (WCAG 2.5.7)
   */
  const checkKeyboardAlternatives = async (): Promise<void> => {
    const violations: string[] = [];
    
    // Check for draggable elements without keyboard alternatives
    const draggableElements = document.querySelectorAll('[draggable="true"]');
    draggableElements.forEach((el) => {
      // Check for keyboard event handlers or contextual menus
      const hasKeyboardSupport = 
        el.hasAttribute('onkeydown') ||
        el.hasAttribute('onkeyup') ||
        el.querySelector('[role="menu"]') ||
        el.closest('[data-testid*="move"]') ||
        el.closest('[data-testid*="reorder"]');
        
      if (!hasKeyboardSupport) {
        violations.push(`Draggable element missing keyboard alternative: ${el.tagName.toLowerCase()}`);
      }
    });
    
    setKeyboardViolations(violations);
  };

  /**
   * Check reduced motion support
   */
  const checkReducedMotionSupport = async (): Promise<void> => {
    // Check if prefers-reduced-motion is respected
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (prefersReducedMotion) {
      // Check for animations that should be disabled
      const animatedElements = document.querySelectorAll('[style*="animation"], [style*="transition"]');
      animatedElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.animationDuration !== 'none' || style.transitionDuration !== 'none') {
          console.warn('Animation not disabled for reduced motion:', el);
        }
      });
    }
  };

  // Auto-run validation on mount
  useEffect(() => {
    runA11yValidation();
  }, []);

  const totalViolations = violations.length + targetSizeViolations.length + keyboardViolations.length;
  const criticalViolations = violations.filter(v => v.impact === 'critical').length + targetSizeViolations.length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            A11y Validation Gate
          </h1>
          <p className="text-muted-foreground">WCAG 2.2 compliance checking with target size enforcement</p>
        </div>
        <Button onClick={runA11yValidation} disabled={isRunning}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Scanning...' : 'Run Validation'}
        </Button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Issues</p>
                <p className="text-2xl font-bold">{totalViolations}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold">{criticalViolations}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <MousePointer className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Target Size</p>
                <p className="text-2xl font-bold">{targetSizeViolations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Keyboard className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Keyboard</p>
                <p className="text-2xl font-bold">{keyboardViolations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Validation Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Target Size Violations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Target Size Violations
              <Badge variant={targetSizeViolations.length === 0 ? 'default' : 'destructive'}>
                WCAG 2.5.8
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {targetSizeViolations.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>All targets ≥44×44 CSS pixels</span>
              </div>
            ) : (
              <div className="space-y-2">
                {targetSizeViolations.map((violation, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <code className="text-sm bg-secondary px-2 py-1 rounded">
                        {violation.element}
                      </code>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Size: {violation.width.toFixed(1)}×{violation.height.toFixed(1)}px 
                      (minimum: {violation.minRequired}×{violation.minRequired}px)
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Keyboard Alternatives */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Alternatives
              <Badge variant={keyboardViolations.length === 0 ? 'default' : 'destructive'}>
                WCAG 2.5.7
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {keyboardViolations.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>All drag operations have keyboard alternatives</span>
              </div>
            ) : (
              <div className="space-y-2">
                {keyboardViolations.map((violation, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-sm">{violation}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Axe Core Results */}
      {violations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Axe Core Violations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {violations.map((violation, index) => (
              <div key={violation.id} className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={violation.impact === 'critical' ? 'destructive' : 'secondary'}>
                    {violation.impact}
                  </Badge>
                  <span className="font-medium">{violation.description}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Element: <code>{violation.element}</code>
                </p>
                <p className="text-sm text-blue-600">{violation.help}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Status Footer */}
      {lastScan && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Last scan: {lastScan.toLocaleTimeString()}
              </span>
              <Badge variant={totalViolations === 0 ? 'default' : 'destructive'}>
                {totalViolations === 0 ? 'PASS' : 'FAIL'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}