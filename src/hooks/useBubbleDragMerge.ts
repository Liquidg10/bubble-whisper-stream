// Robust bubble drag with merge detection and undo support

import { useCallback, useRef } from 'react';
import { Bubble } from '@/types/bubble';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { checkBubblesOverlapping, calculateMidpoint } from '@/utils/collision';
import { Button } from '@/components/ui/button';

interface DragState {
  draggedBubble: Bubble | null;
  dragOffset: { x: number; y: number };
  originalPosition: { x: number; y: number };
  hasMoved: boolean;
}

interface UseBubbleDragMergeOptions {
  onMergeCandidate?: (bubble1: Bubble, bubble2: Bubble, position: { x: number; y: number }) => void;
  mergeThreshold?: number;
  getScreenPosition?: (bubbleX: number, bubbleY: number) => { x: number; y: number };
}

export function useBubbleDragMerge({
  onMergeCandidate,
  mergeThreshold = 0.1,
  getScreenPosition
}: UseBubbleDragMergeOptions) {
  const { 
    bubbles, 
    updateBubble, 
    mergeBubbles, 
    undoLastMerge, 
    lastOperation 
  } = useBubbleStore();
  const { toast } = useToast();
  
  const dragStateRef = useRef<DragState>({
    draggedBubble: null,
    dragOffset: { x: 0, y: 0 },
    originalPosition: { x: 0, y: 0 },
    hasMoved: false
  });

  const startDrag = useCallback((bubble: Bubble, pointerX: number, pointerY: number) => {
    dragStateRef.current = {
      draggedBubble: bubble,
      dragOffset: { x: pointerX - bubble.x, y: pointerY - bubble.y },
      originalPosition: { x: bubble.x, y: bubble.y },
      hasMoved: false
    };
  }, []);

  const updateDrag = useCallback((pointerX: number, pointerY: number) => {
    const dragState = dragStateRef.current;
    if (!dragState.draggedBubble) return;

    const newX = pointerX - dragState.dragOffset.x;
    const newY = pointerY - dragState.dragOffset.y;
    
    if (!dragState.hasMoved) {
      const distance = Math.sqrt(
        Math.pow(newX - dragState.originalPosition.x, 2) + 
        Math.pow(newY - dragState.originalPosition.y, 2)
      );
      if (distance > 5) {
        dragState.hasMoved = true;
      }
    }

    const updatedBubble = {
      ...dragState.draggedBubble,
      x: newX,
      y: newY,
      updatedAt: Date.now()
    };

    updateBubble(updatedBubble);
    dragState.draggedBubble = updatedBubble;
  }, [updateBubble]);

  const endDrag = useCallback(() => {
    const dragState = dragStateRef.current;
    if (!dragState.draggedBubble) return { wasDragged: false };

    const wasDragged = dragState.hasMoved;

    if (wasDragged) {
      const otherBubbles = bubbles.filter(b => b.id !== dragState.draggedBubble!.id);
      
      for (const otherBubble of otherBubbles) {
        const collision = checkBubblesOverlapping(
          dragState.draggedBubble,
          otherBubble,
          mergeThreshold
        );
        
        if (collision.isOverlapping) {
          const midpoint = calculateMidpoint(dragState.draggedBubble, otherBubble);
          const screenPos = getScreenPosition 
            ? getScreenPosition(midpoint.x, midpoint.y)
            : { x: midpoint.x, y: midpoint.y };
          
          onMergeCandidate?.(dragState.draggedBubble, otherBubble, screenPos);
          
          dragStateRef.current = {
            draggedBubble: null,
            dragOffset: { x: 0, y: 0 },
            originalPosition: { x: 0, y: 0 },
            hasMoved: false
          };
          
          return { wasDragged: true, foundMergeCandidate: true };
        }
      }

      toast({
        title: "Bubble moved",
        description: "Position updated",
        duration: 2000
      });
    }

    dragStateRef.current = {
      draggedBubble: null,
      dragOffset: { x: 0, y: 0 },
      originalPosition: { x: 0, y: 0 },
      hasMoved: false
    };

    return { wasDragged };
  }, [bubbles, mergeThreshold, onMergeCandidate, getScreenPosition, toast]);

  const confirmMerge = useCallback((bubble1: Bubble, bubble2: Bubble) => {
    mergeBubbles(bubble1, bubble2);
    
    toast({
      title: "Bubbles merged",
      description: "Combined bubbles",
      duration: 8000
    });
  }, [mergeBubbles, toast]);

  const getDragState = useCallback(() => {
    return {
      isDragging: !!dragStateRef.current.draggedBubble,
      draggedBubbleId: dragStateRef.current.draggedBubble?.id || null,
      hasMoved: dragStateRef.current.hasMoved
    };
  }, []);

  return {
    startDrag,
    updateDrag,
    endDrag,
    confirmMerge,
    getDragState
  };
}