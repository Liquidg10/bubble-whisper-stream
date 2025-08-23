// Radial FAB for voice/text/sketch capture with immediate autosave

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Type, Palette, Camera, Plus, X, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { audioService } from '@/services/audio';
import { useBubbleStore } from '@/stores/bubbleStore';
import { SketchCapture } from './SketchCapture';
import { PhotoCapture } from './PhotoCapture';
import { Button } from '@/components/ui/button';
import { Bubble, BubbleType, AudioCaptureState } from '@/types/bubble';

interface RadialCaptureProps {
  onCapture?: (bubble: Bubble) => void;
  className?: string;
}

export function RadialCapture({ onCapture, className }: RadialCaptureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureType, setCaptureType] = useState<'voice' | 'text' | 'sketch' | 'photo' | null>(null);
  const [audioState, setAudioState] = useState<AudioCaptureState>({
    isRecording: false,
    isProcessing: false,
    duration: 0,
  });
  const [textInput, setTextInput] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const { addBubble } = useBubbleStore();

  // Generate random position for new bubbles
  const generateRandomPosition = () => ({
    x: (Math.random() - 0.5) * 1000,
    y: (Math.random() - 0.5) * 1000,
  });

  // Start voice capture
  const startVoiceCapture = async () => {
    try {
      setCaptureType('voice');
      setIsCapturing(true);
      setIsOpen(false);
      setAudioState(prev => ({ ...prev, isRecording: true, duration: 0 }));
      
      await audioService.startRecording();
      
      // Start duration counter
      durationInterval.current = setInterval(() => {
        setAudioState(prev => ({ ...prev, duration: prev.duration + 0.1 }));
      }, 100);
      
    } catch (error) {
      console.error('Failed to start voice capture:', error);
      setIsCapturing(false);
      setAudioState(prev => ({ ...prev, isRecording: false }));
    }
  };

  // Stop voice capture and save
  const stopVoiceCapture = async () => {
    try {
      setAudioState(prev => ({ ...prev, isProcessing: true }));
      
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
      
      const audioUrl = await audioService.stopRecording();
      
      // Create bubble with audio
      const bubble: Bubble = {
        id: crypto.randomUUID(),
        type: 'Thought',
        content: 'Voice note',
        audioUri: audioUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...generateRandomPosition(),
        size: 0.8,
        tags: [],
      };
      
      await addBubble(bubble);
      onCapture?.(bubble);
      
    } catch (error) {
      console.error('Failed to stop voice capture:', error);
    } finally {
      setIsCapturing(false);
      setCaptureType(null);
      setAudioState({
        isRecording: false,
        isProcessing: false,
        duration: 0,
      });
    }
  };

  // Save text input
  const saveTextBubble = async () => {
    if (!textInput.trim()) return;
    
    try {
      const bubble: Bubble = {
        id: crypto.randomUUID(),
        type: 'Thought',
        content: textInput.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...generateRandomPosition(),
        size: Math.min(textInput.length / 50, 1),
        tags: [],
      };
      
      await addBubble(bubble);
      onCapture?.(bubble);
      setTextInput('');
      setIsCapturing(false);
      setCaptureType(null);
      
    } catch (error) {
      console.error('Failed to save text bubble:', error);
    }
  };

  // Handle text input mode
  const startTextCapture = () => {
    setCaptureType('text');
    setIsCapturing(true);
    setIsOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const startSketchCapture = () => {
    setCaptureType('sketch');
    setIsCapturing(true);
    setIsOpen(false);
  };

  const startPhotoCapture = () => {
    setCaptureType('photo');
    setIsCapturing(true);
    setIsOpen(false);
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsCapturing(false);
        setCaptureType(null);
        setTextInput('');
      }
    };

    if (isOpen || isCapturing) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isCapturing]);

  // Radial menu items
  const menuItems = [
    { icon: Mic, label: 'Voice', action: startVoiceCapture, angle: -90 },
    { icon: Type, label: 'Text', action: startTextCapture, angle: -30 },
    { icon: Palette, label: 'Sketch', action: startSketchCapture, angle: 30 },
    { icon: Camera, label: 'Photo', action: startPhotoCapture, angle: 90 },
  ];

  return (
    <>
      {/* Main FAB */}
      <div className={cn("fixed bottom-6 right-20 z-50", className)}>
        <button
          className={cn(
            "w-14 h-14 rounded-full bg-gradient-aurora shadow-glow-medium",
            "flex items-center justify-center text-text-primary",
            "transition-all duration-bubble hover:scale-110 active:scale-95",
            "border-2 border-accent-void/30",
            isOpen && "rotate-45"
          )}
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Capture thought"
        >
          <Plus size={24} />
        </button>

        {/* Radial Menu */}
        {isOpen && (
          <div className="absolute bottom-1/2 right-1/2 transform translate-x-1/2 translate-y-1/2">
            {menuItems.map((item, index) => {
              const radius = 80;
              const radian = (item.angle * Math.PI) / 180;
              const x = Math.cos(radian) * radius;
              const y = Math.sin(radian) * radius;

              return (
                <button
                  key={index}
                  className={cn(
                    "absolute w-12 h-12 rounded-full bg-bubble-active/90 backdrop-blur",
                    "flex items-center justify-center text-text-primary",
                    "transition-all duration-bubble hover:scale-110 hover:bg-bubble-selected",
                    "border border-accent-void/20 shadow-depth"
                  )}
                  style={{
                    transform: `translate(${x}px, ${y}px)`,
                    animation: `fadeIn 300ms ease-out ${index * 50}ms both`,
                  }}
                  onClick={() => {
                    item.action();
                    setIsOpen(false);
                  }}
                  aria-label={item.label}
                >
                  <item.icon size={18} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Voice Capture Overlay */}
      {isCapturing && captureType === 'voice' && audioState.isRecording && (
        <div className="fixed inset-0 bg-universe-bg/80 backdrop-blur flex items-center justify-center z-50">
          <div className="bg-bubble-active/90 backdrop-blur rounded-2xl p-8 border border-accent-void/30 shadow-glow-strong">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-gradient-aurora flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Mic size={32} className="text-text-primary" />
              </div>
              <h3 className="text-call font-medium text-text-primary mb-2">Recording...</h3>
              <p className="text-speak text-text-secondary mb-6">
                {audioState.duration.toFixed(1)}s
              </p>
              <button
                onClick={stopVoiceCapture}
                className="px-6 py-3 bg-danger-soft rounded-lg text-text-primary font-medium
                          hover:bg-danger-soft/80 transition-colors duration-gentle"
              >
                Stop Recording
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text Input Overlay */}
      {isCapturing && captureType === 'text' && (
        <div className="fixed inset-0 bg-universe-bg/80 backdrop-blur flex items-center justify-center z-50 p-4">
          <div className="bg-bubble-active/90 backdrop-blur rounded-2xl p-6 border border-accent-void/30 shadow-glow-strong max-w-lg w-full">
            <h3 className="text-call font-medium text-text-primary mb-4">Capture Thought</h3>
            <textarea
              ref={textareaRef}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full h-32 p-3 bg-bubble-idle border border-accent-void/20 rounded-lg
                        text-text-primary placeholder-text-secondary resize-none
                        focus:outline-none focus:border-accent-void/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  saveTextBubble();
                }
              }}
            />
            <div className="flex justify-between items-center mt-4">
              <span className="text-gentle text-text-secondary">
                {textInput.length} characters
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsCapturing(false);
                    setCaptureType(null);
                    setTextInput('');
                  }}
                  className="px-4 py-2 bg-bubble-idle border border-accent-void/20 rounded-lg
                            text-text-secondary hover:bg-bubble-active transition-colors duration-gentle"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTextBubble}
                  disabled={!textInput.trim()}
                  className="px-4 py-2 bg-accent-void rounded-lg text-text-primary font-medium
                            hover:bg-accent-void/80 transition-colors duration-gentle
                            disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sketch capture overlay */}
      {captureType === 'sketch' && (
        <SketchCapture
          onSave={(dataUrl) => {
            const newBubble: Bubble = {
              id: crypto.randomUUID(),
              type: 'Memory',
              content: 'Sketch',
              imageUri: dataUrl,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              ...generateRandomPosition(),
              size: 0.7,
              moodColor: 'hsl(var(--accent-iridescent-c))',
              tags: [],
            };
            addBubble(newBubble);
            setIsCapturing(false);
            setCaptureType(null);
            onCapture?.(newBubble);
          }}
          onCancel={() => {
            setIsCapturing(false);
            setCaptureType(null);
          }}
        />
      )}

      {/* Photo capture overlay */}
      {captureType === 'photo' && (
        <PhotoCapture
          onSave={(dataUrl) => {
            const newBubble: Bubble = {
              id: crypto.randomUUID(),
              type: 'Memory',
              content: 'Photo',
              imageUri: dataUrl,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              ...generateRandomPosition(),
              size: 0.8,
              moodColor: 'hsl(var(--primary))',
              tags: [],
            };
            addBubble(newBubble);
            setIsCapturing(false);
            setCaptureType(null);
            onCapture?.(newBubble);
          }}
          onCancel={() => {
            setIsCapturing(false);
            setCaptureType(null);
          }}
        />
      )}

      {/* Processing Overlay */}
      {audioState.isProcessing && (
        <div className="fixed inset-0 bg-universe-bg/80 backdrop-blur flex items-center justify-center z-50">
          <div className="bg-bubble-active/90 backdrop-blur rounded-2xl p-8 border border-accent-void/30">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-accent-void/20 border-t-accent-void rounded-full animate-spin mx-auto mb-4" />
              <p className="text-speak text-text-primary">Processing audio...</p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translate(0, 0) scale(0.8);
          }
          to {
            opacity: 1;
            transform: var(--transform) scale(1);
          }
        }
      `}</style>
    </>
  );
}