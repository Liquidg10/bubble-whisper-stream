import React, { useEffect, useRef } from 'react';
import { useAccessibilitySettings } from '@/hooks/useAccessibilitySettings';
import { toast } from 'sonner';

interface TargetSizeValidatorProps {
  children: React.ReactNode;
  minSize?: number; // Minimum target size in pixels (default: 44)
  enforceValidation?: boolean; // Whether to show warnings for violations
  className?: string;
}

interface TargetSizeViolation {
  element: Element;
  width: number;
  height: number;
  tagName: string;
  className: string;
  id: string;
}

/**
 * Runtime target size validator that ensures WCAG 2.2 AA compliance
 * Wraps interactive elements and validates they meet minimum 44x44px size
 */
export function TargetSizeValidator({ 
  children, 
  minSize = 44,
  enforceValidation = true,
  className 
}: TargetSizeValidatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { settings } = useAccessibilitySettings();
  const validationTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!enforceValidation || !settings.enforceTargetSize) return;

    const validateTargetSizes = () => {
      if (!containerRef.current) return;

      const interactiveElements = containerRef.current.querySelectorAll(
        'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
      );

      const violations: TargetSizeViolation[] = [];

      interactiveElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        
        // Skip elements that are not visible
        if (rect.width === 0 || rect.height === 0) return;
        
        // Skip inline text links (WCAG 2.5.8 exception)
        const isInlineLink = element.tagName.toLowerCase() === 'a' && 
          window.getComputedStyle(element).display.includes('inline');
        
        if (isInlineLink) return;

        // Check if element meets minimum size requirements
        if (rect.width < minSize || rect.height < minSize) {
          violations.push({
            element,
            width: rect.width,
            height: rect.height,
            tagName: element.tagName.toLowerCase(),
            className: element.className || '',
            id: element.id || ''
          });
        }
      });

      // Report violations if found
      if (violations.length > 0 && process.env.NODE_ENV === 'development') {
        console.warn(`🎯 Target size violations found:`, violations.map(v => ({
          element: `${v.tagName}${v.id ? `#${v.id}` : ''}${v.className ? `.${v.className.split(' ')[0]}` : ''}`,
          size: `${Math.round(v.width)}x${Math.round(v.height)}px`,
          required: `${minSize}x${minSize}px`
        })));

        // Show development toast for first violation
        if (violations.length > 0) {
          toast.warning(`Target size violation: ${violations[0].tagName} is ${Math.round(violations[0].width)}x${Math.round(violations[0].height)}px (min: ${minSize}x${minSize}px)`, {
            duration: 5000,
            id: 'target-size-violation'
          });
        }
      }

      return violations;
    };

    // Initial validation
    const initialCheck = () => validateTargetSizes();
    
    // Delayed validation to catch dynamically rendered content
    validationTimeoutRef.current = setTimeout(initialCheck, 100);

    // Validation on resize
    const handleResize = () => {
      clearTimeout(validationTimeoutRef.current);
      validationTimeoutRef.current = setTimeout(validateTargetSizes, 250);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [minSize, enforceValidation, settings.enforceTargetSize]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}

/**
 * HOC to wrap components with target size validation
 */
export function withTargetSizeValidation<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    minSize?: number;
    enforceValidation?: boolean;
  }
) {
  return function TargetSizeValidatedComponent(props: P) {
    return (
      <TargetSizeValidator {...options}>
        <Component {...props} />
      </TargetSizeValidator>
    );
  };
}

/**
 * Hook to manually validate target sizes for a ref
 */
export function useTargetSizeValidation(minSize: number = 44) {
  const validateRef = useRef<(element: HTMLElement) => TargetSizeViolation[]>();
  
  validateRef.current = (element: HTMLElement): TargetSizeViolation[] => {
    const interactiveElements = element.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
    );

    const violations: TargetSizeViolation[] = [];

    interactiveElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      
      if (rect.width === 0 || rect.height === 0) return;
      
      const isInlineLink = el.tagName.toLowerCase() === 'a' && 
        window.getComputedStyle(el).display.includes('inline');
      
      if (isInlineLink) return;

      if (rect.width < minSize || rect.height < minSize) {
        violations.push({
          element: el,
          width: rect.width,
          height: rect.height,
          tagName: el.tagName.toLowerCase(),
          className: el.className || '',
          id: el.id || ''
        });
      }
    });

    return violations;
  };

  return {
    validateTargetSizes: validateRef.current
  };
}