/**
 * Theme Registry - Central management for all themes
 * Singleton pattern for theme registration and retrieval
 */

import type { Theme } from './ThemeTypes';
import { iridescentSoapTheme } from './definitions/iridescent-soap';
import { classicMinimalTheme } from './definitions/classic-minimal';

class ThemeRegistry {
  private themes = new Map<string, Theme>();
  private defaultThemeId = 'iridescent-soap';

  constructor() {
    // Themes will be registered lazily to avoid circular dependencies
  }

  /**
   * Initialize built-in themes (called after all modules are loaded)
   */
  private initializeBuiltInThemes() {
    if (this.themes.size === 0) {
      this.register(iridescentSoapTheme);
      this.register(classicMinimalTheme);
    }
  }

  /**
   * Register a new theme
   * @param theme Theme to register
   * @throws Error if theme ID already exists
   */
  register(theme: Theme): void {
    if (this.themes.has(theme.id)) {
      throw new Error(`Theme with ID "${theme.id}" already exists`);
    }
    
    this.themes.set(theme.id, theme);
  }

  /**
   * Get theme by ID
   * @param id Theme ID
   * @returns Theme or undefined if not found
   */
  get(id: string): Theme | undefined {
    this.initializeBuiltInThemes(); // Lazy initialization
    return this.themes.get(id);
  }

  /**
   * Get all registered themes
   * @returns Array of all themes
   */
  list(): Theme[] {
    this.initializeBuiltInThemes(); // Lazy initialization
    return Array.from(this.themes.values());
  }

  /**
   * Get default theme
   * @returns Default theme
   */
  getDefault(): Theme {
    this.initializeBuiltInThemes(); // Lazy initialization
    const defaultTheme = this.themes.get(this.defaultThemeId);
    if (!defaultTheme) {
      throw new Error(`Default theme "${this.defaultThemeId}" not found`);
    }
    return defaultTheme;
  }

  /**
   * Check if theme exists
   * @param id Theme ID
   * @returns True if theme exists
   */
  has(id: string): boolean {
    return this.themes.has(id);
  }

  /**
   * Set default theme ID
   * @param id Theme ID to set as default
   * @throws Error if theme doesn't exist
   */
  setDefault(id: string): void {
    if (!this.themes.has(id)) {
      throw new Error(`Cannot set default to non-existent theme "${id}"`);
    }
    this.defaultThemeId = id;
  }

  /**
   * Remove theme from registry
   * @param id Theme ID to remove
   * @returns True if theme was removed, false if not found
   */
  unregister(id: string): boolean {
    if (id === this.defaultThemeId) {
      throw new Error('Cannot unregister the default theme');
    }
    return this.themes.delete(id);
  }

  /**
   * Get theme metadata
   * @returns Array of theme metadata (id, name, description)
   */
  getMetadata() {
    return Array.from(this.themes.values()).map(theme => ({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      version: theme.version,
    }));
  }
}

// Export singleton instance
export const themeRegistry = new ThemeRegistry();

// Convenience exports
export const getTheme = (id: string) => themeRegistry.get(id);
export const listThemes = () => themeRegistry.list();
export const getDefaultTheme = () => themeRegistry.getDefault();
export const registerTheme = (theme: Theme) => themeRegistry.register(theme);