/**
 * Persona Response Card - Displays persona guidance with autonomy preservation
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Clock, HelpCircle } from 'lucide-react';
import { PersonaResponse, PersonaAction } from '@/types/persona';
import { personaOrchestrationService } from '@/services/personaOrchestrationService';

interface PersonaResponseCardProps {
  response: PersonaResponse;
  onAction?: (actionId: string) => void;
  onDismiss?: () => void;
  onHelpfulness?: (rating: number) => void;
  className?: string;
}

export const PersonaResponseCard: React.FC<PersonaResponseCardProps> = ({
  response,
  onAction,
  onDismiss,
  onHelpfulness,
  className = ''
}) => {
  const handleActionClick = (action: PersonaAction) => {
    if (onAction) {
      onAction(action.id);
    }
    
    // Record interaction
    personaOrchestrationService.handlePersonaInteraction(
      response.personaId,
      action.type === 'decline' ? 'dismissed' : 'engaged',
      action.id
    );
  };

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
    
    // Record dismissal
    personaOrchestrationService.handlePersonaInteraction(
      response.personaId,
      'dismissed'
    );
  };

  const getPersonaDisplayName = (personaId: string) => {
    const names: Record<string, string> = {
      'coach_autonomy': 'Coach Autonomy',
      'dr_seligman': 'Dr. Seligman',
      'dr_anila': 'Dr. Anila',
      'sous_chef': 'Sous-Chef',
      'dr_rhea': 'Dr. Rhea'
    };
    return names[personaId] || personaId;
  };

  const getPersonaColor = (personaId: string) => {
    const colors: Record<string, string> = {
      'coach_autonomy': 'bg-blue-50 border-blue-200',
      'dr_seligman': 'bg-green-50 border-green-200',
      'dr_anila': 'bg-purple-50 border-purple-200',
      'sous_chef': 'bg-orange-50 border-orange-200',
      'dr_rhea': 'bg-pink-50 border-pink-200'
    };
    return colors[personaId] || 'bg-muted border-border';
  };

  return (
    <Card className={`${getPersonaColor(response.personaId)} ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Assistant
            </Badge>
            {response.cooldownMinutes && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {response.cooldownMinutes}m
              </div>
            )}
          </div>
          {response.canDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <p className="text-sm mb-3">{response.message}</p>

        {response.actionOptions && response.actionOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {response.actionOptions.map((action) => (
              <Button
                key={action.id}
                variant={action.type === 'accept' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleActionClick(action)}
                className="text-xs"
              >
                {action.label}
                {action.undoable && <span className="ml-1 text-xs opacity-70">↶</span>}
              </Button>
            ))}
          </div>
        )}

        {response.becauseText && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <HelpCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>{response.becauseText}</span>
          </div>
        )}

        {response.evidenceNote && (
          <div className="mt-2 p-2 bg-background/50 rounded text-xs text-muted-foreground">
            Evidence: {response.evidenceNote}
          </div>
        )}
      </CardContent>
    </Card>
  );
};