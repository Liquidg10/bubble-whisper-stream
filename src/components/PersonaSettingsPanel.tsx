/**
 * Persona Settings Panel - User control over persona system
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PersonaId } from '@/types/persona';
import { personaOrchestrationService } from '@/services/personaOrchestrationService';
import { Brain, Heart, Focus, ChefHat, Shield } from 'lucide-react';

interface PersonaSettingsProps {
  onClose?: () => void;
}

const PERSONA_INFO = [
  {
    id: 'coach_autonomy' as PersonaId,
    name: 'Coach Autonomy',
    description: 'Helps with motivation while preserving your choice',
    evidenceBase: 'Self-Determination Theory',
    icon: Brain,
    category: 'Motivation'
  },
  {
    id: 'dr_seligman' as PersonaId,
    name: 'Dr. Seligman',
    description: 'Suggests wellbeing opportunities (PERMA)',
    evidenceBase: 'Positive Psychology Research',
    icon: Heart,
    category: 'Wellbeing'
  },
  {
    id: 'dr_anila' as PersonaId,
    name: 'Dr. Anila',
    description: 'Offers brief attention resets when helpful',
    evidenceBase: 'Contemplative Neuroscience',
    icon: Focus,
    category: 'Attention'
  },
  {
    id: 'sous_chef' as PersonaId,
    name: 'Sous-Chef',
    description: 'Preps task details without slowing you down',
    evidenceBase: 'Cognitive Load Theory',
    icon: ChefHat,
    category: 'Productivity'
  },
  {
    id: 'dr_rhea' as PersonaId,
    name: 'Dr. Rhea',
    description: 'Neurodivergent-aware support and alternatives',
    evidenceBase: '2e/ND Research',
    icon: Shield,
    category: 'Accessibility'
  }
];

export const PersonaSettingsPanel: React.FC<PersonaSettingsProps> = ({ onClose }) => {
  const [personaStates, setPersonaStates] = useState<Partial<Record<PersonaId, boolean>>>({});
  const [autonomyPreferences, setAutonomyPreferences] = useState({
    nudgeFrequency: 'occasional' as 'minimal' | 'occasional' | 'regular',
    respectQuietHours: true
  });

  useEffect(() => {
    // Load current persona states
    const states: Partial<Record<PersonaId, boolean>> = {};
    PERSONA_INFO.forEach(persona => {
      states[persona.id] = personaOrchestrationService.isPersonaEnabled(persona.id);
    });
    setPersonaStates(states);

    // Load autonomy preferences
    const stored = localStorage.getItem('autonomyPreferences');
    if (stored) {
      setAutonomyPreferences(JSON.parse(stored));
    }
  }, []);

  const handlePersonaToggle = (personaId: PersonaId, enabled: boolean) => {
    personaOrchestrationService.setPersonaEnabled(personaId, enabled);
    setPersonaStates(prev => ({ ...prev, [personaId]: enabled }));
  };

  const handlePreferenceChange = (key: string, value: any) => {
    const newPrefs = { ...autonomyPreferences, [key]: value };
    setAutonomyPreferences(newPrefs);
    localStorage.setItem('autonomyPreferences', JSON.stringify(newPrefs));
  };

  const handleDisableAll = () => {
    PERSONA_INFO.forEach(persona => {
      personaOrchestrationService.setPersonaEnabled(persona.id, false);
    });
    setPersonaStates(prev => {
      const newStates = { ...prev };
      PERSONA_INFO.forEach(persona => {
        newStates[persona.id] = false;
      });
      return newStates;
    });
  };

  const handleEnableAll = () => {
    PERSONA_INFO.forEach(persona => {
      personaOrchestrationService.setPersonaEnabled(persona.id, true);
    });
    setPersonaStates(prev => {
      const newStates = { ...prev };
      PERSONA_INFO.forEach(persona => {
        newStates[persona.id] = true;
      });
      return newStates;
    });
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Persona Guide Settings</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Control which evidence-based guides can offer suggestions
            </p>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Autonomy Preferences */}
        <div className="space-y-4">
          <h3 className="font-medium">Your Autonomy Preferences</h3>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="nudge-frequency">Suggestion Frequency</Label>
            <select
              id="nudge-frequency"
              value={autonomyPreferences.nudgeFrequency}
              onChange={(e) => handlePreferenceChange('nudgeFrequency', e.target.value)}
              className="px-3 py-1 border rounded text-sm"
            >
              <option value="minimal">Minimal (1/day max)</option>
              <option value="occasional">Occasional (3/day max)</option>
              <option value="regular">Regular (6/day max)</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="quiet-hours">Respect Quiet Hours (7am-10pm)</Label>
            <Switch
              id="quiet-hours"
              checked={autonomyPreferences.respectQuietHours}
              onCheckedChange={(checked) => handlePreferenceChange('respectQuietHours', checked)}
            />
          </div>
        </div>

        <Separator />

        {/* Persona Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Available Personas</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDisableAll}>
                Disable All
              </Button>
              <Button variant="outline" size="sm" onClick={handleEnableAll}>
                Enable All
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {PERSONA_INFO.map((persona) => {
              const Icon = persona.icon;
              const enabled = personaStates[persona.id] || false;
              
              return (
                <div key={persona.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                  <Icon className="h-5 w-5 mt-1 text-muted-foreground" />
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{persona.name}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {persona.category}
                        </Badge>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) => handlePersonaToggle(persona.id, checked)}
                      />
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      {persona.description}
                    </p>
                    
                    <p className="text-xs text-muted-foreground">
                      Evidence base: {persona.evidenceBase}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Important Notes */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Important</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• All suggestions preserve your choice and can be dismissed</li>
            <li>• Personas respect cooldowns to avoid overwhelming you</li>
            <li>• "Because..." explanations show evidence basis</li>
            <li>• You can disable any persona or the entire system anytime</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};