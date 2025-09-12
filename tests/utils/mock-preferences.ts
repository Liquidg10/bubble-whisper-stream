/**
 * Mock user preferences for accessibility testing
 */

import { Page } from '@playwright/test';

export interface MockPreferences {
  reducedMotion?: boolean;
  highContrast?: boolean;
  fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
  colorScheme?: 'light' | 'dark';
}

/**
 * Apply mock user preferences to a page
 */
export async function applyMockPreferences(page: Page, preferences: MockPreferences): Promise<void> {
  const mediaFeatures: any = {};
  
  // Reduced motion preference
  if (preferences.reducedMotion !== undefined) {
    mediaFeatures.reducedMotion = preferences.reducedMotion ? 'reduce' : 'no-preference';
  }
  
  // Color scheme preference
  if (preferences.colorScheme) {
    mediaFeatures.colorScheme = preferences.colorScheme;
  }
  
  // Apply media query emulation
  if (Object.keys(mediaFeatures).length > 0) {
    await page.emulateMedia(mediaFeatures);
  }
  
  // Font size preference
  if (preferences.fontSize) {
    const fontSizeMap = {
      small: '14px',
      medium: '16px',
      large: '18px',
      xlarge: '20px'
    };
    
    await page.addStyleTag({
      content: `
        * {
          font-size: ${fontSizeMap[preferences.fontSize]} !important;
        }
      `
    });
  }
  
  // High contrast mode
  if (preferences.highContrast) {
    await page.addStyleTag({
      content: `
        * {
          filter: contrast(200%) !important;
        }
      `
    });
  }
}

/**
 * Test common accessibility preference combinations
 */
export const COMMON_PREFERENCE_COMBINATIONS = [
  { name: 'Default', preferences: {} },
  { name: 'Reduced Motion', preferences: { reducedMotion: true } },
  { name: 'High Contrast', preferences: { highContrast: true } },
  { name: 'Large Font', preferences: { fontSize: 'large' as const } },
  { name: 'Dark Mode', preferences: { colorScheme: 'dark' as const } },
  { 
    name: 'Full Accessibility', 
    preferences: { 
      reducedMotion: true, 
      highContrast: true, 
      fontSize: 'large' as const,
      colorScheme: 'dark' as const
    } 
  },
] as const;

/**
 * Reset all preferences to defaults
 */
export async function resetPreferences(page: Page): Promise<void> {
  await page.emulateMedia({ 
    reducedMotion: 'no-preference',
    colorScheme: 'light'
  });
  
  // Remove any custom styles
  await page.evaluate(() => {
    const customStyles = document.querySelectorAll('style[data-custom-preference]');
    customStyles.forEach(style => style.remove());
  });
}