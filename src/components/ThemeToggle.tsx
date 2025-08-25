/**
 * ThemeToggle - Mobile-first theme switching component
 * Dropdown interface with large touch targets and clear visual feedback
 */

import React from 'react';
import { Check, Palette } from 'lucide-react';
import { useTheme } from '@/themes/provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg';
}

export function ThemeToggle({ 
  className,
  showLabel = false,
  variant = 'ghost',
  size = 'default'
}: ThemeToggleProps) {
  const themeContext = useTheme();
  
  // Handle loading state gracefully
  if (!themeContext || themeContext.isLoading) {
    return (
      <Button
        variant={variant}
        size={size}
        className={cn(
          'min-h-[44px] min-w-[44px] gap-2 opacity-50',
          'focus-visible:ring-2 focus-visible:ring-accent-void focus-visible:ring-offset-2',
          className
        )}
        disabled
      >
        <Palette className="h-4 w-4" />
        {showLabel && (
          <span className="hidden sm:inline-block">
            Loading...
          </span>
        )}
      </Button>
    );
  }
  
  const { currentTheme, themes, setTheme } = themeContext;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn(
            // Mobile-first: ensure ≥44px touch target
            'min-h-[44px] min-w-[44px] gap-2',
            // Focus states for accessibility
            'focus-visible:ring-2 focus-visible:ring-accent-void focus-visible:ring-offset-2',
            className
          )}
        >
          <Palette className="h-4 w-4" />
          {showLabel && (
            <span className="hidden sm:inline-block">
              {currentTheme.name}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        align="end" 
        className={cn(
          // Ensure dropdown is not transparent and has proper z-index
          'bg-card/95 backdrop-blur-sm z-50 border border-border',
          // Mobile-friendly sizing
          'min-w-[200px] max-w-[280px]',
          // Pointer events for interaction inside dialogs
          'pointer-events-auto'
        )}
      >
        <DropdownMenuLabel className="text-gentle font-medium">
          Choose Theme
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {themes.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className={cn(
              // Mobile-first: large touch targets
              'min-h-[44px] gap-3 cursor-pointer',
              // Hover states (graceful enhancement)
              'focus:bg-accent focus:text-accent-foreground',
              'active:bg-accent/80',
              // Current theme styling
              currentTheme.id === theme.id && 'bg-accent/20'
            )}
          >
            <div className="flex items-center gap-3 flex-1">
              {/* Theme indicator */}
              <div 
                className={cn(
                  'w-4 h-4 rounded-full border-2 border-border flex-shrink-0',
                  // Theme-specific preview colors
                  theme.id === 'iridescent-soap' && 'bg-gradient-aurora'
                )}
              />
              
              {/* Theme info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-natural truncate">
                  {theme.name}
                </div>
                <div className="text-whisper text-muted-foreground truncate">
                  {theme.description}
                </div>
              </div>
              
              {/* Current theme check */}
              {currentTheme.id === theme.id && (
                <Check className="h-4 w-4 text-accent-void flex-shrink-0" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Compact theme toggle for use in navigation bars
 */
export function CompactThemeToggle({ className }: { className?: string }) {
  return (
    <ThemeToggle
      className={className}
      variant="ghost"
      size="sm"
      showLabel={false}
    />
  );
}

/**
 * Detailed theme toggle for settings pages
 */
export function DetailedThemeToggle({ className }: { className?: string }) {
  const themeContext = useTheme();
  
  // Handle loading state gracefully
  if (!themeContext || themeContext.isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-accent-void" />
          <h3 className="text-speak font-semibold">Theme</h3>
        </div>
        <div className="p-4 text-center text-muted-foreground">
          Loading themes...
        </div>
      </div>
    );
  }
  
  const { currentTheme, themes, setTheme } = themeContext;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2">
        <Palette className="h-5 w-5 text-accent-void" />
        <h3 className="text-speak font-semibold">Theme</h3>
      </div>
      
      <div className="grid gap-3">
        {themes.map((theme) => (
          <div
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            className={cn(
              // Mobile-first card design
              'p-4 rounded-lg border cursor-pointer transition-all',
              'min-h-[60px] flex items-center gap-4',
              // Interactive states
              'hover:bg-accent/10 focus:bg-accent/10 focus:outline-none',
              'active:scale-[0.98]',
              // Current theme highlighting
              currentTheme.id === theme.id
                ? 'border-accent-void bg-accent-void/10'
                : 'border-border bg-card/50'
            )}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setTheme(theme.id);
              }
            }}
          >
            {/* Theme preview */}
            <div 
              className={cn(
                'w-12 h-12 rounded-lg border-2 border-border flex-shrink-0',
                theme.id === 'iridescent-soap' && 'bg-gradient-aurora'
              )}
            />
            
            {/* Theme details */}
            <div className="flex-1 min-w-0">
              <div className="text-natural font-medium mb-1">
                {theme.name}
              </div>
              <div className="text-gentle text-muted-foreground text-sm">
                {theme.description}
              </div>
            </div>
            
            {/* Selection indicator */}
            {currentTheme.id === theme.id && (
              <Check className="h-5 w-5 text-accent-void flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}