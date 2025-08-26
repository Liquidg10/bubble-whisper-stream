import React, { useState, useCallback } from 'react';

interface PhotoBubbleIridescentProps {
  src: string;
  alt?: string;
  size: number;
  bubbleId?: string;
  debugMode?: boolean;
}

export function PhotoBubbleIridescent({ 
  src, 
  alt, 
  size, 
  bubbleId = 'unknown', 
  debugMode = false 
}: PhotoBubbleIridescentProps) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');

  const logDebugInfo = useCallback((element: HTMLImageElement | null, event: 'load' | 'error') => {
    if (!debugMode || !element) return;

    const DEBUG_PHOTO = localStorage.getItem('DEBUG_PHOTO') === 'true';
    if (!DEBUG_PHOTO) return;

    console.group(`🖼️ PhotoBubbleIridescent Debug - ${event.toUpperCase()}`);
    console.log(`Bubble ID: ${bubbleId}`);
    console.log(`URL Type: ${src.startsWith('data:') ? 'data:' : 'http(s)'}`);
    console.log(`URL Preview: ${src.substring(0, 80)}...`);
    
    const computedStyles = window.getComputedStyle(element);
    const parentStyles = element.parentElement ? window.getComputedStyle(element.parentElement) : null;
    
    console.log('Image Computed Styles:', {
      opacity: computedStyles.opacity,
      filter: computedStyles.filter,
      mixBlendMode: computedStyles.mixBlendMode,
      backdropFilter: computedStyles.backdropFilter,
      maskImage: computedStyles.maskImage || computedStyles.webkitMaskImage,
      zIndex: computedStyles.zIndex,
      visibility: computedStyles.visibility,
      transform: computedStyles.transform
    });
    
    if (parentStyles) {
      console.log('Parent Container Styles:', {
        opacity: parentStyles.opacity,
        filter: parentStyles.filter,
        mixBlendMode: parentStyles.mixBlendMode,
        backdropFilter: parentStyles.backdropFilter,
        maskImage: parentStyles.maskImage || parentStyles.webkitMaskImage,
        zIndex: parentStyles.zIndex,
        visibility: parentStyles.visibility,
        isolation: parentStyles.isolation
      });
    }
    
    if (event === 'error') {
      console.error('Final src at error:', element.src);
    }
    
    console.groupEnd();
  }, [debugMode, bubbleId, src]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoadState('loaded');
    logDebugInfo(e.currentTarget, 'load');
  }, [logDebugInfo]);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoadState('error');
    logDebugInfo(e.currentTarget, 'error');
  }, [logDebugInfo]);

  return (
    <div 
      className="absolute inset-0 flex items-center justify-center" 
      style={{ 
        zIndex: 1, // Base layer for photo 
        isolation: 'isolate' 
      }}
    >
      <div 
        className="rounded-full overflow-hidden" 
        style={{ 
          width: size, 
          height: size, 
          background: 'hsl(var(--muted))', // Subtle fallback background
          border: '2px solid rgba(255,255,255,0.1)' // Subtle inner border
        }}
      >
        <img
          src={src}
          alt={alt || 'Bubble photo'}
          className="w-full h-full object-cover"
          crossOrigin={src.startsWith('http') ? 'anonymous' : undefined}
          style={{ 
            opacity: 1, 
            filter: 'none', 
            mixBlendMode: 'normal', 
            maskImage: 'none', 
            WebkitMaskImage: 'none'
          }}
          onLoad={handleLoad}
          onError={handleError}
        />
        
        {/* Debug badge - only show in development and when debug is explicitly enabled */}
        {debugMode && localStorage.getItem('DEBUG_PHOTO') === 'true' && (
          <div className="absolute top-0 right-0 bg-black/80 text-white text-xs px-1 rounded text-[8px] leading-3 z-10">
            {src.startsWith('data:') ? 'data:' : 'http:'} 
            <br />
            {loadState}
          </div>
        )}
      </div>
    </div>
  );
}