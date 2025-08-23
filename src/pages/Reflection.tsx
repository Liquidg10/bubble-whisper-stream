import React, { useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Flower,
  Zap,
  Sprout,
  Save,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { hapticsService } from '@/services/haptics';

interface ReflectionEntry {
  rose: string;
  thorn: string;
  bud: string;
  date: string;
}

export const Reflection: React.FC = () => {
  const { addBubble } = useBubbleStore();
  const [rose, setRose] = useState('');
  const [thorn, setThorn] = useState('');
  const [bud, setBud] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!rose.trim() && !thorn.trim() && !bud.trim()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      const reflectionContent = `Daily Reflection - ${new Date(selectedDate).toLocaleDateString()}

🌹 Rose (What went well):
${rose.trim() || 'Nothing noted'}

🌿 Thorn (What was challenging):
${thorn.trim() || 'Nothing noted'}

🌱 Bud (What I'm looking forward to):
${bud.trim() || 'Nothing noted'}`;

      const reflectionBubble: Bubble = {
        id: crypto.randomUUID(),
        type: 'Memory',
        content: reflectionContent,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        x: Math.random() * 400 - 200,
        y: Math.random() * 400 - 200,
        size: 0.8,
        tags: [
          { id: crypto.randomUUID(), name: 'Reflection', emoji: '🪞' },
          { id: crypto.randomUUID(), name: 'Daily', emoji: '📅' },
        ],
      };

      await addBubble(reflectionBubble);

      // Clear form
      setRose('');
      setThorn('');
      setBud('');

      hapticsService.success();
    } catch (error) {
      console.error('Failed to save reflection:', error);
      hapticsService.error();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateChange = (direction: 'prev' | 'next') => {
    const current = new Date(selectedDate);
    const newDate = new Date(current);
    
    if (direction === 'prev') {
      newDate.setDate(current.getDate() - 1);
    } else {
      newDate.setDate(current.getDate() + 1);
    }
    
    setSelectedDate(newDate.toISOString().split('T')[0]);
  };

  const formatDisplayDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString([], { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  const isFuture = new Date(selectedDate) > new Date();

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-semibold">Daily Reflection</h1>
        <p className="text-sm text-muted-foreground">
          Rose, Thorn, Bud - A gentle way to process your day
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Date Selector */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDateChange('prev')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="text-center">
                <CardTitle className="text-lg">{formatDisplayDate(selectedDate)}</CardTitle>
                <CardDescription>{new Date(selectedDate).toLocaleDateString()}</CardDescription>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDateChange('next')}
                disabled={isFuture}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
        </Card>

        {isFuture ? (
          <Card>
            <CardContent className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">
                Reflections are for processing past experiences
              </p>
              <p className="text-sm text-muted-foreground">
                Choose today or a previous date
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Rose Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flower className="h-5 w-5 text-pink-500" />
                  Rose
                  <Badge variant="secondary" className="ml-auto">
                    What went well
                  </Badge>
                </CardTitle>
                <CardDescription>
                  What was the highlight of your day? What brought you joy or satisfaction?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="I'm grateful for... I accomplished... I enjoyed..."
                  value={rose}
                  onChange={(e) => setRose(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </CardContent>
            </Card>

            {/* Thorn Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-orange-500" />
                  Thorn
                  <Badge variant="secondary" className="ml-auto">
                    What was challenging
                  </Badge>
                </CardTitle>
                <CardDescription>
                  What was difficult or frustrating? What would you do differently?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="I struggled with... I felt frustrated when... Next time I'll..."
                  value={thorn}
                  onChange={(e) => setThorn(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </CardContent>
            </Card>

            {/* Bud Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sprout className="h-5 w-5 text-green-500" />
                  Bud
                  <Badge variant="secondary" className="ml-auto">
                    Looking forward
                  </Badge>
                </CardTitle>
                <CardDescription>
                  What are you excited about? What are you learning or growing toward?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="I'm looking forward to... I want to learn... Tomorrow I hope..."
                  value={bud}
                  onChange={(e) => setBud(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </CardContent>
            </Card>

            {/* Submit Button */}
            <div className="pb-4">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || (!rose.trim() && !thorn.trim() && !bud.trim())}
                className="w-full"
                size="lg"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Saving Reflection...' : 'Save Reflection'}
              </Button>
              
              {!rose.trim() && !thorn.trim() && !bud.trim() && (
                <p className="text-center text-sm text-muted-foreground mt-2">
                  Fill in at least one section to save your reflection
                </p>
              )}
            </div>
          </>
        )}

        {/* Instructions */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-2">How it works</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>🌹 <strong>Rose:</strong> Celebrate what went well and what you're grateful for</li>
              <li>🌿 <strong>Thorn:</strong> Acknowledge challenges without judgment</li>
              <li>🌱 <strong>Bud:</strong> Look forward with hope and intention</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3">
              Your reflections are saved as bubbles in your universe, creating a timeline of growth.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};