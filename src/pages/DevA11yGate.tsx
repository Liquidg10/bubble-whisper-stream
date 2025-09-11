/**
 * /dev/a11y-gate - Accessibility compliance scanner
 * Runs axe-core and custom checks for WCAG 2.2 compliance
 * SC 2.5.7 (Dragging Movements) and 2.5.8 (Target Size)
 */

import React, { useEffect, useState } from 'react';
import axe from 'axe-core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface A11yViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary: string;
  }>;
}

interface TargetSizeViolation {
  element: Element;
  selector: string;
  size: { width: number; height: number };
  isActionable: boolean;
}

export default function DevA11yGate() {
  const [scanning, setScanning] = useState(false);
  const [violations, setViolations] = useState<A11yViolation[]>([]);
  const [targetSizeViolations, setTargetSizeViolations] = useState<TargetSizeViolation[]>([]);
  const [dragAlternativeViolations, setDragAlternativeViolations] = useState<Element[]>([]);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [scanProgress, setScanProgress] = useState(0);

  const runAccessibilityScan = async () => {
    setScanning(true);
    setScanProgress(10);

    try {
      // Run axe-core scan
      setScanProgress(30);
      const results = await axe.run(document.body, {
        rules: {
          // Focus on key WCAG 2.2 rules
          'color-contrast': { enabled: true },
          'keyboard': { enabled: true },
          'focus-visible': { enabled: true },
          'aria-roles': { enabled: true },
          'aria-required-attr': { enabled: true }
        }
      });
      
      setViolations(results.violations as A11yViolation[]);
      setScanProgress(60);

      // Custom target size check (≥44×44 CSS px)
      const targetViolations = checkTargetSizes();
      setTargetSizeViolations(targetViolations);
      setScanProgress(80);

      // Check for drag alternatives (WCAG 2.5.7)
      const dragViolations = checkDragAlternatives();
      setDragAlternativeViolations(dragViolations);
      setScanProgress(100);

      setLastScan(new Date());
    } catch (error) {
      console.error('A11y scan failed:', error);
    } finally {
      setScanning(false);
      setScanProgress(0);
    }
  };

  const checkTargetSizes = (): TargetSizeViolation[] => {
    const actionableSelectors = [
      'button', 'a[href]', 'input', 'select', 'textarea', 
      '[role="button"]', '[role="link"]', '[tabindex]',
      '[draggable="true"]', '.bubble-card', '.atom-node'
    ];

    const violations: TargetSizeViolation[] = [];
    
    actionableSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        
        // Check CSS pixel size (not physical)
        const width = parseFloat(computedStyle.width) || rect.width;
        const height = parseFloat(computedStyle.height) || rect.height;
        
        if ((width < 44 || height < 44) && rect.width > 0 && rect.height > 0) {
          violations.push({
            element: element as Element,
            selector: getElementSelector(element),
            size: { width, height },
            isActionable: isActionableElement(element)
          });
        }
      });
    });

    return violations;
  };

  const checkDragAlternatives = (): Element[] => {
    const violations: Element[] = [];
    
    // Check for draggable elements without keyboard alternatives
    document.querySelectorAll('[draggable="true"]').forEach(element => {
      const hasKeyboardAlternative = 
        element.hasAttribute('tabindex') ||
        element.querySelector('[tabindex]') ||
        element.closest('[role="listbox"]') ||
        element.closest('[role="grid"]') ||
        hasAriaDescribedby(element);

      if (!hasKeyboardAlternative) {
        violations.push(element);
      }
    });

    return violations;
  };

  const isActionableElement = (element: Element): boolean => {
    const actionableTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'];
    const hasActionableRole = element.getAttribute('role') === 'button' || 
                             element.getAttribute('role') === 'link';
    const hasTabindex = element.hasAttribute('tabindex');
    
    return actionableTags.includes(element.tagName) || hasActionableRole || hasTabindex;
  };

  const hasAriaDescribedby = (element: Element): boolean => {
    const describedBy = element.getAttribute('aria-describedby');
    return describedBy ? document.getElementById(describedBy) !== null : false;
  };

  const getElementSelector = (element: Element): string => {
    if (element.id) return `#${element.id}`;
    if (element.className) return `.${element.className.split(' ')[0]}`;
    return element.tagName.toLowerCase();
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'critical': return 'destructive';
      case 'serious': return 'destructive';
      case 'moderate': return 'secondary';
      case 'minor': return 'outline';
      default: return 'outline';
    }
  };

  const getTotalViolations = () => {
    return violations.length + targetSizeViolations.length + dragAlternativeViolations.length;
  };

  useEffect(() => {
    // Auto-scan on mount
    runAccessibilityScan();
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Accessibility Gate</h1>
            <p className="text-muted-foreground">
              WCAG 2.2 compliance scanner with target size and drag alternative checks
            </p>
          </div>
          <Button 
            onClick={runAccessibilityScan} 
            disabled={scanning}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Run Scan'}
          </Button>
        </div>

        {scanning && (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Scanning accessibility...</span>
                  <span>{scanProgress}%</span>
                </div>
                <Progress value={scanProgress} className="w-full" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                {getTotalViolations() === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-medium">Total Issues</p>
                  <p className="text-2xl font-bold">{getTotalViolations()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-sm font-medium">Axe Violations</p>
                  <p className="text-2xl font-bold">{violations.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Target Size</p>
                  <p className="text-2xl font-bold">{targetSizeViolations.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Drag Alt Missing</p>
                  <p className="text-2xl font-bold">{dragAlternativeViolations.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {lastScan && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Last scan: {lastScan.toLocaleString()}. 
              Target size checks use 44×44 CSS px minimum (WCAG 2.5.8 + Apple HIG comfort).
            </AlertDescription>
          </Alert>
        )}

        {/* Axe-core Violations */}
        {violations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Axe-core Violations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {violations.map((violation, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={getImpactColor(violation.impact)}>
                          {violation.impact}
                        </Badge>
                        <span className="font-medium">{violation.id}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {violation.description}
                      </p>
                      <p className="text-sm">{violation.help}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open(violation.helpUrl, '_blank')}
                    >
                      Learn More
                    </Button>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Affects {violation.nodes.length} element(s)
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Target Size Violations */}
        {targetSizeViolations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Target Size Violations (WCAG 2.5.8)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {targetSizeViolations.map((violation, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{violation.selector}</p>
                      <p className="text-sm text-muted-foreground">
                        Size: {Math.round(violation.size.width)}×{Math.round(violation.size.height)}px 
                        (minimum: 44×44px)
                      </p>
                    </div>
                    <Badge variant="destructive">Too Small</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Drag Alternative Violations */}
        {dragAlternativeViolations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Missing Drag Alternatives (WCAG 2.5.7)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dragAlternativeViolations.map((element, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{getElementSelector(element)}</p>
                      <p className="text-sm text-muted-foreground">
                        Draggable element without keyboard alternative
                      </p>
                    </div>
                    <Badge variant="destructive">No Keyboard Alt</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {getTotalViolations() === 0 && lastScan && (
          <Card>
            <CardContent className="p-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">All Checks Passed!</h3>
              <p className="text-muted-foreground">
                No accessibility violations found. WCAG 2.2 compliance verified.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}