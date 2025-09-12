import React from 'react';
import { motion } from 'framer-motion';
import { Target, Heart, AlertTriangle, Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PlanningMetadata {
  wish?: string;
  outcome?: string;
  obstacle?: string;
  plan?: string;
  createdAt?: number;
  skippedAt?: number;
}

interface PlanningIndicatorProps {
  planning: PlanningMetadata;
  className?: string;
  compact?: boolean;
}

export const PlanningIndicator: React.FC<PlanningIndicatorProps> = ({
  planning,
  className,
  compact = false
}) => {
  const hasCompleteSession = planning.wish && planning.outcome && planning.obstacle && planning.plan;
  const stepsCompleted = [planning.wish, planning.outcome, planning.obstacle, planning.plan]
    .filter(Boolean).length;

  if (planning.skippedAt) {
    return (
      <Badge 
        variant="outline" 
        className={cn('text-xs text-muted-foreground', className)}
      >
        Planning skipped
      </Badge>
    );
  }

  if (compact) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          'flex items-center gap-1 text-xs',
          hasCompleteSession ? 'text-accent-flow' : 'text-muted-foreground',
          className
        )}
      >
        <Target className="w-3 h-3" />
        <span>{stepsCompleted}/4</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('space-y-2 p-3 bg-accent-flow/5 rounded-lg border border-accent-flow/20', className)}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-accent-flow">
        <Target className="w-4 h-4" />
        <span>Planning Session</span>
        {hasCompleteSession && (
          <Badge variant="outline" className="text-xs bg-accent-flow/10 text-accent-flow">
            Complete
          </Badge>
        )}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {planning.wish && (
          <div className="flex items-start gap-2">
            <Target className="w-3 h-3 mt-0.5 text-accent-flow" />
            <span><strong>Wish:</strong> {planning.wish}</span>
          </div>
        )}
        
        {planning.outcome && (
          <div className="flex items-start gap-2">
            <Heart className="w-3 h-3 mt-0.5 text-accent-flow" />
            <span><strong>Outcome:</strong> {planning.outcome}</span>
          </div>
        )}
        
        {planning.obstacle && (
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 mt-0.5 text-accent-flow" />
            <span><strong>Obstacle:</strong> {planning.obstacle}</span>
          </div>
        )}
        
        {planning.plan && (
          <div className="flex items-start gap-2">
            <Lightbulb className="w-3 h-3 mt-0.5 text-accent-flow" />
            <span><strong>Plan:</strong> {planning.plan}</span>
          </div>
        )}
      </div>

      {planning.createdAt && (
        <div className="text-xs text-muted-foreground pt-1 border-t border-accent-flow/10">
          Planned {new Date(planning.createdAt).toLocaleDateString()}
        </div>
      )}
    </motion.div>
  );
};