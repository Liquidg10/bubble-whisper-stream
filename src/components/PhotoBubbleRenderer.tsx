import React, { useState } from 'react';

interface PhotoBubbleRendererProps {
  src: string;
  alt?: string;
  size: number;
  bubbleId?: string;
  debugMode?: boolean;
}

export function PhotoBubbleRenderer({ 
  src, 
  alt, 
  size, 
  bubbleId,
  debugMode = false 
}: PhotoBubbleRendererProps) {
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const urlType = src.startsWith('data:') ? 'data' : 'http';

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoadStatus('loaded');
    
    if (debugMode) {
      const img = e.currentTarget;
      const computedStyle = window.getComputedStyle(img);
      const parentStyle = window.getComputedStyle(img.parentElement!);
      
      const debug = {
        bubbleId,
        urlType,
        urlPreview: src.substring(0, 80),
        imgStyles: {
          opacity: computedStyle.opacity,
          filter: computedStyle.filter,
          mixBlendMode: computedStyle.mixBlendMode,
          maskImage: computedStyle.maskImage,
          zIndex: computedStyle.zIndex,
          visibility: computedStyle.visibility,
        },
        parentStyles: {
          opacity: parentStyle.opacity,
          backdropFilter: parentStyle.backdropFilter,
          filter: parentStyle.filter,
          mixBlendMode: parentStyle.mixBlendMode,
          zIndex: parentStyle.zIndex,
        }
      };
      
      setDebugInfo(debug);
      console.group('📸 Photo Loaded Successfully');
      console.log('Bubble ID:', bubbleId);
      console.log('URL Type:', urlType);
      console.log('Image Styles:', debug.imgStyles);
      console.log('Parent Styles:', debug.parentStyles);
      console.groupEnd();
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoadStatus('error');
    
    if (debugMode) {
      const img = e.currentTarget;
      const computedStyle = window.getComputedStyle(img);
      
      console.group('❌ Photo Load Failed');
      console.log('Bubble ID:', bubbleId);
      console.log('URL Type:', urlType);
      console.log('URL Preview:', src.substring(0, 80));
      console.log('Computed Styles:', {
        opacity: computedStyle.opacity,
        filter: computedStyle.filter,
        visibility: computedStyle.visibility,
      });
      console.groupEnd();
    }
  };

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ 
        zIndex: 2, 
        isolation: 'isolate'
      }}
    >
      {/* Debug badge showing URL type */}
      {debugMode && (
        <div className="absolute top-1 left-1 z-10 px-1 py-0.5 text-xs bg-black/50 text-white rounded">
          {urlType} {loadStatus === 'loaded' ? '✓' : loadStatus === 'error' ? '✗' : '⏳'}
        </div>
      )}
      
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: size, 
          height: size,
          // Solid neutral background to prevent filter interactions
          background: 'hsl(var(--panel))',
        }}
      >
        <img
          src={src}
          alt={alt || 'Bubble photo'}
          className="w-full h-full object-cover"
          crossOrigin={src.startsWith('http') ? 'anonymous' : undefined}
          onLoad={handleLoad}
          onError={handleError}
          style={{
            // Hard overrides to prevent any inherited effects
            opacity: 1,
            filter: 'none',
            mixBlendMode: 'normal',
            maskImage: 'none',
            WebkitMaskImage: 'none'
          }}
        />
      </div>
    </div>
  );
}