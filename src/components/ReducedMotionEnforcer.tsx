import React, { useEffect, useState } from 'react';
import { motion, MotionConfig } from 'framer-motion';

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
      
      /* Specifically target bubble animations */
      .bubble-float, .bubble-pulse, .bubble-glow {
        animation: none !important;
        transform: none !important;
      }
      
      /* Framer Motion override */
      [data-framer-motion] {
        transform: none !important;
        animation: none !important;
      }
      
      /* Disable CSS transforms */
      .animate-spin, .animate-pulse, .animate-bounce {
        animation: none !important;
      }
      
      /* Disable Tailwind animations */
      .transition-all, .transition-colors, .transition-opacity, .transition-transform {
        transition: none !important;
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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
};

// Utility to create motion-aware variants
export const createMotionVariants = (
  normalVariants: any,
  reducedVariants?: any
) => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  if (prefersReducedMotion && reducedVariants) {
    return reducedVariants;
  }
  
  if (prefersReducedMotion) {
    // Convert normal variants to instant versions
    const instantVariants: any = {};
    Object.keys(normalVariants).forEach(key => {
      instantVariants[key] = {
        ...normalVariants[key],
        transition: { duration: 0.01 }
      };
    });
    return instantVariants;
  }
  
  return normalVariants;
};