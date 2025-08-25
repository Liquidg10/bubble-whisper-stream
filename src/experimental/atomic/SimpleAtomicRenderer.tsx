import React from 'react';
import { BubbleCanvasProps } from '@/themes/ThemeTypes';

const AtomicRenderer: React.FC<BubbleCanvasProps> = ({ onBubbleSelect, onBubbleEdit, className }) => {
  console.log('AtomicRenderer simple component loaded');
  
  return (
    <div className={`relative w-full h-full bg-slate-900 flex items-center justify-center ${className}`}>
      <div className="text-white text-2xl">🧬 Atomic/Molecular Theme Active</div>
    </div>
  );
};

export default AtomicRenderer;