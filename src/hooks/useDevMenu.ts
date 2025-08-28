/**
 * Hook for managing the development menu
 * Handles keyboard shortcuts and state management
 */

import { useState, useEffect } from 'react';

export function useDevMenu() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl/Cmd+Shift+D
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyD') {
        event.preventDefault();
        setIsOpen(prev => !prev);
      }

      // Close on Escape
      if (event.code === 'Escape' && isOpen) {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const openMenu = () => setIsOpen(true);
  const closeMenu = () => setIsOpen(false);

  return {
    isOpen,
    openMenu,
    closeMenu
  };
}