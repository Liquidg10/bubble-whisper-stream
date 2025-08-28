import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Calendar, Clock } from 'lucide-react';

interface HorizonFlashLabelProps {
  isVisible: boolean;
  horizonName: string;
  position: { x: number; y: number };
  onComplete: () => void;
}

const HORIZON_CONFIG = {
  'Today': { icon: Home, color: '#EF4444' },
  'Week': { icon: Calendar, color: '#F59E0B' },
  'Later': { icon: Clock, color: '#10B981' }
};

export function HorizonFlashLabel({ 
  isVisible, 
  horizonName, 
  position, 
  onComplete 
}: HorizonFlashLabelProps) {
  const config = HORIZON_CONFIG[horizonName as keyof typeof HORIZON_CONFIG];
  const Icon = config?.icon || Clock;

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ 
            opacity: 1, 
            y: 0, 
            scale: 1,
            transition: { duration: 0.15, ease: "easeOut" }
          }}
          exit={{ 
            opacity: 0, 
            y: -5, 
            scale: 0.9,
            transition: { duration: 0.4, ease: "easeOut" }
          }}
          style={{
            position: 'absolute',
            left: position.x,
            top: position.y - 40,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 9999
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-background/90 backdrop-blur-sm border rounded-full shadow-lg"
        >
          <Icon 
            className="h-4 w-4" 
            style={{ color: config?.color || '#10B981' }}
          />
          <span className="text-sm font-medium text-foreground">
            {horizonName}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}