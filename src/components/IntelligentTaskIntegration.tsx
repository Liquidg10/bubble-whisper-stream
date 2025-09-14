/**
 * Intelligent Task Integration Component
 * Adds PERMA signals and Cast intelligence to task creation/editing
 */

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lightbulb, Heart, Users, Target, Trophy, Sparkles } from 'lucide-react';
import { permaIntegration } from '@/services/permaIntegration';
import { autoWriteLadderService } from '@/services/autoWriteLadder';
import { PrivacyWatermark } from '@/components/privacy/PrivacyWatermark';
import type { Task } from '@/types/task';

interface IntelligentTaskIntegrationProps {
  task: Task;
  onTaskUpdate?: (task: Task) => void;
  compact?: boolean;
}

export const IntelligentTaskIntegration: React.FC<IntelligentTaskIntegrationProps> = ({
  task,
  onTaskUpdate,
  compact = false
}) => {
  const [permaSignals, setPermaSignals] = useState<any[]>([]);
  const [strengthsFrame, setStrengthsFrame] = useState<{ strength: string; frame: string } | null>(null);
  const [autoWriteSuggestions, setAutoWriteSuggestions] = useState<any[]>([]);

  useEffect(() => {
    if (!task.title && !task.description) return;

    // Analyze PERMA signals
    const content = `${task.title} ${task.description || ''}`;
    const signals = permaIntegration.analyzeTaskContent(content, task.completed);
    setPermaSignals(signals);

    // Get strengths-based framing
    const frame = permaIntegration.suggestStrengthsFrame(content);
    setStrengthsFrame(frame);

    // Skip auto-write suggestions for now (service method doesn't exist)
    setAutoWriteSuggestions([]);

  }, [task.title, task.description, task.completed]);

  const getPERMAIcon = (dimension: string) => {
    switch (dimension) {
      case 'positive_emotion': return Heart;
      case 'engagement': return Sparkles;
      case 'relationships': return Users;
      case 'meaning': return Target;
      case 'accomplishment': return Trophy;
      default: return Lightbulb;
    }
  };

  const getPERMAColor = (dimension: string) => {
    switch (dimension) {
      case 'positive_emotion': return 'text-pink-400 bg-pink-500/10';
      case 'engagement': return 'text-blue-400 bg-blue-500/10';
      case 'relationships': return 'text-green-400 bg-green-500/10';
      case 'meaning': return 'text-purple-400 bg-purple-500/10';
      case 'accomplishment': return 'text-amber-400 bg-amber-500/10';
      default: return 'text-gray-400 bg-gray-500/10';
    }
  };

  const handleApplyStrengthsFrame = () => {
    if (!strengthsFrame || !onTaskUpdate) return;

    const updatedTask = {
      ...task,
      description: `${task.description || ''}\n\n💪 ${strengthsFrame.frame}`.trim()
    };

    onTaskUpdate(updatedTask);
    permaIntegration.recordStrengthUse(strengthsFrame.strength);
  };

  const handleApplyAutoWrite = (suggestion: any) => {
    if (!onTaskUpdate) return;

    const updatedTask = {
      ...task,
      ...suggestion.changes
    };

    onTaskUpdate(updatedTask);
  };

  if (compact && permaSignals.length === 0 && !strengthsFrame) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* PERMA Signals */}
      {permaSignals.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Well-being signals</span>
            <PrivacyWatermark layer="context" />
          </div>
          
          <div className="flex flex-wrap gap-1">
            {permaSignals.slice(0, compact ? 2 : 5).map((signal, index) => {
              const PERMAIcon = getPERMAIcon(signal.dimension);
              const colorClass = getPERMAColor(signal.dimension);
              
              return (
                <Badge 
                  key={index}
                  variant="outline" 
                  className={`text-xs ${colorClass} border-current/20`}
                >
                  <PERMAIcon className="h-3 w-3 mr-1" />
                  {signal.dimension.replace('_', ' ')}
                  {signal.confidence > 0.8 && ' ✨'}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Strengths Frame */}
      {strengthsFrame && !compact && (
        <div className="p-3 bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-400/20 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium">Strengths perspective</span>
                <PrivacyWatermark layer="context" />
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                "{strengthsFrame.frame}"
              </p>
              <Badge variant="outline" className="text-xs">
                {strengthsFrame.strength}
              </Badge>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyStrengthsFrame}
              className="ml-2"
            >
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Auto-Write Suggestions */}
      {autoWriteSuggestions.length > 0 && !compact && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Smart suggestions</span>
            <PrivacyWatermark layer="surface" />
          </div>
          
          {autoWriteSuggestions.slice(0, 2).map((suggestion, index) => (
            <div 
              key={index}
              className="p-3 bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-400/20 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm mb-1">{suggestion.description}</p>
                  <span className="text-xs text-muted-foreground">
                    Because: {suggestion.reason}
                  </span>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyAutoWrite(suggestion)}
                  className="ml-2"
                >
                  Apply
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};