// Bulletproof photo renderer with proper layering and cross-origin support
import React, { useState, useCallback } from 'react';
import { getBubbleColorScheme } from '@/utils/bubbleColors';

interface BulletproofPhotoRendererProps {
  src: string;
  alt?: string;
  size: number;
  bubbleType: string;
  completed?: boolean;
  bubbleId?: string;
  debugMode?: boolean;
}

export function BulletproofPhotoRenderer({ 
  src, 
  alt, 
  size, 
  bubbleType,
  completed = false,
  bubbleId = 'unknown', 
  debugMode = false 
}: BulletproofPhotoRendererProps) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');

  const isDataUrl = src.startsWith('data:');
  const isHttpUrl = src.startsWith('http');
  
  const colorScheme = getBubbleColorScheme(bubbleType as any, 0.8);
  const typeColor = colorScheme.accent;

  const logDebugInfo = useCallback((element: HTMLImageElement | null, event: 'load' | 'error') => {
    if (!debugMode || !element) return;

    const DEBUG = localStorage.getItem('DEBUG') === 'true';
    if (!DEBUG) return;

    console.group(`🖼️ Photo ${event.toUpperCase()} - ${bubbleId}`);
    console.log(`Type: ${bubbleType} | Completed: ${completed}`);
    console.log(`URL Type: ${isDataUrl ? 'data:' : isHttpUrl ? 'http(s)' : 'unknown'}`);
    console.log(`URL Preview: ${src.substring(0, 60)}...`);
    
    const computedStyles = window.getComputedStyle(element);
    const container = element.parentElement;
    const containerStyles = container ? window.getComputedStyle(container) : null;
    
    console.log('Image Styles:', {
      opacity: computedStyles.opacity,
      filter: computedStyles.filter,
      mixBlendMode: computedStyles.mixBlendMode,
      mask: computedStyles.mask || computedStyles.webkitMask,
      zIndex: computedStyles.zIndex,
      visibility: computedStyles.visibility
    });
    
    if (containerStyles) {
      console.log('Container Styles:', {
        backgroundColor: containerStyles.backgroundColor,
        backdropFilter: containerStyles.backdropFilter,
        zIndex: containerStyles.zIndex,
        isolation: containerStyles.isolation
      });
    }
    
    if (event === 'error') {
      console.error('Failed to load:', element.src);
    }
    
    console.groupEnd();
  }, [debugMode, bubbleId, bubbleType, completed, src, isDataUrl, isHttpUrl]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoadState('loaded');
    logDebugInfo(e.currentTarget, 'load');
  }, [logDebugInfo]);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoadState('error');
    logDebugInfo(e.currentTarget, 'error');
  }, [logDebugInfo]);

  return (
    <div className="absolute inset-0 rounded-full" style={{ isolation: 'isolate' }}>
      {/* Debug badge */}
      {debugMode && (
        <div 
          className="absolute top-1 left-1 z-10 px-1 py-0.5 text-xs bg-black/80 text-white rounded text-[10px] leading-3"
          style={{ zIndex: 10 }}
        >
          {isDataUrl ? 'data:' : isHttpUrl ? 'http:' : 'file:'}<br/>
          {loadState === 'loaded' ? '✓' : loadState === 'error' ? '✗' : '⏳'}
          {completed && <><br/>DIM</>}
        </div>
      )}

      {/* z=5: Specular highlight layer (photos only) */}
      <div 
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          zIndex: 5,
          background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, transparent 50%)',
          mixBlendMode: 'overlay'
        }}
      />

      {/* z=4: Glass reflection layer (photos only) */}
      <div 
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          zIndex: 4,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%)',
          mixBlendMode: 'overlay'
        }}
      />

      {/* z=3: Type-colored rim */}
      <div 
        className="absolute inset-0 rounded-full"
        style={{
          zIndex: 3,
          background: `conic-gradient(from 0deg, ${typeColor}, ${typeColor})`,
          padding: '2px'
        }}
      >
        <div 
          className="w-full h-full rounded-full"
          style={{ 
            backgroundColor: '#0b0f14' // Solid background to isolate photo
          }}
        />
      </div>

      {/* z=2: Aura glow */}
      <div 
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          zIndex: 2,
          background: `radial-gradient(circle, transparent 60%, ${typeColor}40 100%)`,
          filter: 'blur(4px)',
          opacity: completed ? 0.3 : 0.6
        }}
      />

      {/* z=1: Photo container with solid background */}
      <div 
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{
          zIndex: 1,
          backgroundColor: '#0b0f14', // Solid background prevents transparency issues
          padding: '3px' // Account for rim
        }}
      >
        <div className="w-full h-full rounded-full overflow-hidden">
          <img
            src={src}
            alt={alt || `${bubbleType} photo`}
            className="w-full h-full object-cover"
            crossOrigin={isHttpUrl ? 'anonymous' : undefined}
            onLoad={handleLoad}
            onError={handleError}
            style={{
              // Hard overrides to prevent any inherited effects
              opacity: 1,
              filter: 'none',
              mixBlendMode: 'normal',
              mask: 'none',
              WebkitMask: 'none'
            }}
          />
        </div>
      </div>

      {/* Completion dimming overlay - applied only to decorative layers, not photo */}
      {completed && (
        <div 
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            zIndex: 6, // Above all decorative layers but doesn't affect photo
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            mixBlendMode: 'multiply'
          }}
        />
      )}
    </div>
  );
}