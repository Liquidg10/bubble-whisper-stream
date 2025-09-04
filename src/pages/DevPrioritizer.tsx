import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Plus, RotateCcw } from 'lucide-react';
import { Bubble, BubbleType } from '@/types/bubble';
import { TimeHorizon } from '@/types/atomic';
import { prioritizerService, PriorityContext } from '@/services/prioritizer';
import { BecausePill } from '@/components/BecausePill';

interface SeedBubble {
  content: string;
  type: BubbleType;
  tags: string[];
  hasReminder?: boolean;
  estimatedMinutes?: number;
  metadata?: any;
}

const SEED_BUBBLES: SeedBubble[] = [
  {
    content: "Pick up Pepper from school",
    type: "Task",
    tags: ["Family", "Pepper"],
    hasReminder: true,
    estimatedMinutes: 30
  },
  {
    content: "Review quarterly financial reports",
    type: "Task", 
    tags: ["Work", "Finance"],
    estimatedMinutes: 90,
    metadata: { finance: { category: "business" } }
  },
  {
    content: "Buy groceries for the week",
    type: "Task",
    tags: ["Home", "Errands"],
    estimatedMinutes: 45
  },
  {
    content: "Feeling overwhelmed about work deadlines",
    type: "Thought",
    tags: ["Work", "Stress"]
  },
  {
    content: "Schedule dentist appointment",
    type: "Task",
    tags: ["Health", "Personal"],
    estimatedMinutes: 15
  },
  {
    content: "Plan weekend activities with Pepper",
    type: "Task",
    tags: ["Family", "Pepper", "Weekend"],
    estimatedMinutes: 60
  },
  {
    content: "Update budget spreadsheet",
    type: "Task",
    tags: ["Finance", "Personal"],
    estimatedMinutes: 30,
    metadata: { finance: { category: "personal" } }
  },
  {
    content: "Research new project management tools",
    type: "Task",
    tags: ["Work", "Research"],
    estimatedMinutes: 120
  }
];

export const DevPrioritizer: React.FC = () => {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [scores, setScores] = useState<Array<{ bubble: Bubble; score: any }>>([]);
  const [context, setContext] = useState<PriorityContext>({
    timeOfDay: new Date().getHours(),
    sessionType: 'planning',
    recentCompletions: [],
    userEnergyLevel: 'medium'
  });
  const [isLoading, setIsLoading] = useState(false);

  // Generate bubbles from seed data
  const generateSeedBubbles = () => {
    const newBubbles: Bubble[] = SEED_BUBBLES.map((seed, index) => ({
      id: `seed-${index}`,
      type: seed.type,
      content: seed.content,
      createdAt: Date.now() - (Math.random() * 86400000), // Random time in last 24h
      updatedAt: Date.now() - (Math.random() * 3600000),  // Random time in last hour
      x: Math.random() * 800,
      y: Math.random() * 600,
      size: 0.5 + Math.random() * 0.5,
      tags: seed.tags.map((name, tagIndex) => ({
        id: `tag-${index}-${tagIndex}`,
        name,
        emoji: name === 'Pepper' ? '👧' : name === 'Finance' ? '💰' : undefined
      })),
      reminderId: seed.hasReminder ? `reminder-${index}` : undefined,
      metadata: {
        ...seed.metadata,
        outliner: seed.estimatedMinutes ? {
          estimatedMinutes: seed.estimatedMinutes
        } : undefined
      }
    }));

    setBubbles(newBubbles);
  };

  // Score all bubbles
  const scoreAllBubbles = async () => {
    setIsLoading(true);
    try {
      const scoredBubbles = await Promise.all(
        bubbles.map(async (bubble) => ({
          bubble,
          score: await prioritizerService.score(bubble, context)
        }))
      );
      
      // Sort by score descending
      setScores(scoredBubbles.sort((a, b) => b.score.score - a.score.score));
    } catch (error) {
      console.error('Failed to score bubbles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Add a custom bubble
  const addCustomBubble = () => {
    const newBubble: Bubble = {
      id: `custom-${Date.now()}`,
      type: 'Task',
      content: 'Custom task...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: Math.random() * 800,
      y: Math.random() * 600,
      size: 0.7,
      tags: []
    };
    setBubbles(prev => [...prev, newBubble]);
  };

  // Update context
  const updateContext = (key: keyof PriorityContext, value: any) => {
    setContext(prev => ({ ...prev, [key]: value }));
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'bg-red-100 text-red-800 border-red-200';
    if (score >= 0.6) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (score >= 0.4) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getHorizonColor = (horizon: TimeHorizon) => {
    switch (horizon) {
      case TimeHorizon.Today: return 'bg-red-100 text-red-800 border-red-200';
      case TimeHorizon.Week: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case TimeHorizon.Later: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  useEffect(() => {
    generateSeedBubbles();
  }, []);

  useEffect(() => {
    if (bubbles.length > 0) {
      scoreAllBubbles();
    }
  }, [bubbles, context]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Brain className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Prioritizer Development</h1>
      </div>

      {/* Context Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Priority Context</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="timeOfDay">Time of Day</Label>
              <Input
                id="timeOfDay"
                type="number"
                min="0"
                max="23"
                value={context.timeOfDay}
                onChange={(e) => updateContext('timeOfDay', parseInt(e.target.value) || 0)}
              />
            </div>
            
            <div>
              <Label htmlFor="sessionType">Session Type</Label>
              <Select 
                value={context.sessionType} 
                onValueChange={(value) => updateContext('sessionType', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="focus">Focus</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="energyLevel">Energy Level</Label>
              <Select 
                value={context.userEnergyLevel} 
                onValueChange={(value) => updateContext('userEnergyLevel', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={generateSeedBubbles} variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Bubbles
              </Button>
              <Button onClick={addCustomBubble} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Bubble
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Priority Scores & Suggestions
            {isLoading && (
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {scores.map(({ bubble, score }, index) => (
              <div key={bubble.id} className="border rounded-lg p-4 bg-card">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        #{index + 1}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {bubble.type}
                      </Badge>
                      <Badge className={`text-xs ${getScoreColor(score.score)}`}>
                        Score: {Math.round(score.score * 100)}%
                      </Badge>
                      <Badge className={`text-xs ${getHorizonColor(score.suggestedHorizon)}`}>
                        → {score.suggestedHorizon}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Confidence: {Math.round(score.confidence * 100)}%
                      </Badge>
                    </div>
                    
                    <p className="font-medium mb-2">{bubble.content}</p>
                    
                    {bubble.tags.length > 0 && (
                      <div className="flex gap-1 mb-2">
                        {bubble.tags.map(tag => (
                          <Badge key={tag.id} variant="secondary" className="text-xs">
                            {tag.emoji} {tag.name}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {(bubble.reminderId || bubble.metadata?.outliner?.estimatedMinutes) && (
                      <div className="flex gap-2 text-sm text-muted-foreground mb-2">
                        {bubble.reminderId && <span>📅 Has reminder</span>}
                        {bubble.metadata?.outliner?.estimatedMinutes && (
                          <span>⏱️ {bubble.metadata.outliner.estimatedMinutes}min</span>
                        )}
                        {bubble.metadata?.finance && <span>💰 Financial</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Because:</div>
                  <div className="flex flex-wrap gap-1">
                    {score.why.map((reason, idx) => (
                      <BecausePill key={idx} explanation={reason} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {scores.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No bubbles to score. Click "Reset Bubbles" to generate test data.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};