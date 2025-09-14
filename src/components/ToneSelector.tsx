/**
 * Tone Selector Component
 * Friend/Coach/Scientist tone switching
 */

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Target, FlaskConical } from 'lucide-react';
import { toneSystem, type ToneType } from '@/services/toneSystem';

interface ToneSelectorProps {
  className?: string;
}

export function ToneSelector({ className }: ToneSelectorProps) {
  const [currentTone, setCurrentTone] = React.useState<ToneType>('friend');

  React.useEffect(() => {
    setCurrentTone(toneSystem.getCurrentTone());
  }, []);

  const handleToneChange = (tone: ToneType) => {
    setCurrentTone(tone);
    toneSystem.setTone(tone);
  };

  const getToneIcon = (tone: ToneType) => {
    switch (tone) {
      case 'friend': return <Heart className="h-4 w-4" />;
      case 'coach': return <Target className="h-4 w-4" />;
      case 'scientist': return <FlaskConical className="h-4 w-4" />;
    }
  };

  const getToneDescription = (tone: ToneType) => {
    const profile = toneSystem.getToneProfile(tone);
    return profile.voice;
  };

  const getToneExample = (tone: ToneType) => {
    const examples = {
      friend: "When you're ready, might be worth checking that email.",
      coach: "Great momentum—let's tackle that next step.",
      scientist: "Data suggests optimal timing for this task."
    };
    return examples[tone];
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {getToneIcon(currentTone)}
          Assistant Tone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Select value={currentTone} onValueChange={handleToneChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select tone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="friend">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  Friend
                </div>
              </SelectItem>
              <SelectItem value="coach">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Coach
                </div>
              </SelectItem>
              <SelectItem value="scientist">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4" />
                  Scientist
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          
          <div className="mt-3 p-3 bg-muted/50 rounded-md">
            <p className="text-sm text-muted-foreground mb-2">
              {getToneDescription(currentTone)}
            </p>
            <p className="text-xs italic text-foreground/70">
              "{getToneExample(currentTone)}"
            </p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          This tone affects all micro-prompts, suggestions, and feedback throughout the app.
        </div>
      </CardContent>
    </Card>
  );
}