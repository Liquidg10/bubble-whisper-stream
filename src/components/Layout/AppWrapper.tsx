import React from 'react';
import { TargetSizeValidator } from '@/components/A11y/TargetSizeValidator';
import { AccessibilityProvider } from '@/components/A11y/AccessibilityProvider';

interface AppWrapperProps {
  children: React.ReactNode;
}

/**
 * App wrapper that provides accessibility validation and enforcement
 */
export function AppWrapper({ children }: AppWrapperProps) {
  return (
    <AccessibilityProvider>
      <TargetSizeValidator 
        enforceValidation={process.env.NODE_ENV === 'development'}
        className="min-h-screen"
      >
        {children}
      </TargetSizeValidator>
    </AccessibilityProvider>
  );
}