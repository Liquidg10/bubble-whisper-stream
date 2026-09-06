import React, { useEffect, useState } from 'react';
import { MotionConfig, type Variants } from 'framer-motion';
import { calmModeService } from '@/services/calmModeService';

interface ReducedMotionEnforcerProps {
  children: React.ReactNode;
}

export const ReducedMotionEnforcer: React.FC<ReducedMotionEnforcerProps> = ({ children }) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check initial preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    // Listen for changes
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
      
      // Force remove animations from CSS when reduced motion is enabled
      if (e.matches) {
        enforceReducedMotion();
      } else {
        restoreMotion();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    
    // Apply initial state
    if (mediaQuery.matches) {
      enforceReducedMotion();
    }

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const enforceReducedMotion = () => {
    // Inject CSS to disable all animations
    const styleId = 'reduced-motion-enforcer';
    let style = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }

      .animate-spin, .animate-pulse, .animate-bounce {
        animation: none !important;
      }
    `;
  };

  const restoreMotion = () => {
    const style = document.getElementById('reduced-motion-enforcer');
    if (style) {
      style.remove();
    }
  };

  const motionConfig = {
    // Disable all motion when user prefers reduced motion
    transition: prefersReducedMotion 
      ? { duration: 0.01 }
      : { duration: 0.3 },
    
    // Override all animations to be instant when reduced motion is preferred
    ...(prefersReducedMotion && {
      initial: false,
      animate: { transition: { duration: 0.01 } },
      exit: { transition: { duration: 0.01 } }
    })
  };

  return (
    <MotionConfig 
      reducedMotion={prefersReducedMotion ? "always" : "never"}
      transition={motionConfig.transition}
    >
      <div data-reduced-motion={prefersReducedMotion}>
        {children}
      </div>
    </MotionConfig>
  );
};

// Hook to check reduced motion preference
export const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches || calmModeService.getAnimationPreferences().reduceMotion);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const refresh = () => setPrefersReducedMotion(mediaQuery.matches || calmModeService.getAnimationPreferences().reduceMotion);
    refresh();

    const handleChange = refresh;

    mediaQuery.addEventListener('change', handleChange);
    window.addEventListener('calmModeChange', refresh);
    return () => { mediaQuery.removeEventListener('change', handleChange); window.removeEventListener('calmModeChange', refresh); };
  }, []);

  return prefersReducedMotion;
};

// Utility to create motion-aware variants
export const createMotionVariants = (
  normalVariants: Variants,
  reducedVariants?: Variants
) => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  if (prefersReducedMotion && reducedVariants) {
    return reducedVariants;
  }
  
  if (prefersReducedMotion) {
    // Convert normal variants to instant versions
    const instantVariants: Variants = {};
    Object.keys(normalVariants).forEach(key => {
      const variant = normalVariants[key];
      instantVariants[key] = typeof variant === 'function'
        ? (...args) => { const resolved = variant(...args); return typeof resolved === 'object' ? { ...resolved, transition: { duration: 0.01 } } : resolved; }
        : { ...variant, transition: { duration: 0.01 } };
    });
    return instantVariants;
  }
  
  return normalVariants;
};
