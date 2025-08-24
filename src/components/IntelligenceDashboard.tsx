import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, TrendingUp, Lightbulb, Shield, Clock, Zap } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import AIIndicator from '@/components/AIIndicator';

const IntelligenceDashboard: React.FC = () => {
  const { 
    settings, 
    bubbles, 
    cbtEntries, 
    glimmers,
    updateSettings 
  } = useBubbleStore();

  const intelligenceStats = {
    totalInteractions: bubbles.length + cbtEntries.length + glimmers.length,
    aiEnhanced: glimmers.filter(g => (g as any).source === 'ai').length,
    patternsFound: 0, // Will be implemented when patterns are added to store
    recentActivity: {
      day: bubbles.filter(b => 
        new Date(b.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000
      ).length,
      week: bubbles.filter(b => 
        new Date(b.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
      ).length
    }
  };

  const toggleIntelligence = () => {
    updateSettings({
      intelligenceEnabled: !settings.intelligenceEnabled
    });
  };

  const toggleFeature = (feature: string) => {
    updateSettings({
      [feature]: !settings[feature as keyof typeof settings]
    });
  };

  return (
    <div className="space-y-6">
      {/* Intelligence Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Intelligence Dashboard
            </CardTitle>
            <AIIndicator showStatus />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Master Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-semibold">AI Intelligence Layer</h3>
                <p className="text-sm text-muted-foreground">
                  Enhanced insights with privacy-first AI processing
                </p>
              </div>
              <Button 
                variant={settings.intelligenceEnabled ? "default" : "outline"}
                onClick={toggleIntelligence}
              >
                {settings.intelligenceEnabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>

            {/* Stats Grid */}
            {settings.intelligenceEnabled && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-accent/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {intelligenceStats.totalInteractions}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total Interactions
                  </div>
                </div>
                
                <div className="text-center p-3 bg-accent/50 rounded-lg">
                  <div className="text-2xl font-bold text-secondary">
                    {intelligenceStats.aiEnhanced}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    AI Enhanced
                  </div>
                </div>
                
                <div className="text-center p-3 bg-accent/50 rounded-lg">
                  <div className="text-2xl font-bold text-accent-foreground">
                    {intelligenceStats.patternsFound}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Patterns Found
                  </div>
                </div>
                
                <div className="text-center p-3 bg-accent/50 rounded-lg">
                  <div className="text-2xl font-bold text-muted-foreground">
                    {intelligenceStats.recentActivity.day}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Today's Activity
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Feature Controls */}
      {settings.intelligenceEnabled && (
        <Tabs defaultValue="features" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>
          
          <TabsContent value="features" className="space-y-4">
            {/* CBT Enhancement */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="w-5 h-5" />
                  CBT Thought Enhancement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm">AI-powered thought reframing and distortion detection</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {cbtEntries.length} entries
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Privacy preserved
                      </Badge>
                    </div>
                  </div>
                  <Button 
                    variant={settings.intelligenceEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleFeature('intelligenceEnabled')}
                  >
                    {settings.intelligenceEnabled ? 'On' : 'Off'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Glimmers */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Self-Compassion Glimmers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm">Contextual encouragement based on your patterns</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {glimmers.length} glimmers received
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Personalized tone
                      </Badge>
                    </div>
                  </div>
                  <Button 
                    variant={settings.glimmersEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleFeature('glimmersEnabled')}
                  >
                    {settings.glimmersEnabled ? 'On' : 'Off'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Adaptive Reminders */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Adaptive Reminders 2.0
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm">Smart reminder timing based on your patterns</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        Learning enabled
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Explains decisions
                      </Badge>
                    </div>
                  </div>
                  <Button 
                    variant={settings.adaptiveRemindersEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleFeature('adaptiveRemindersEnabled')}
                  >
                    {settings.adaptiveRemindersEnabled ? 'On' : 'Off'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="privacy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Privacy & Transparency
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-accent/30 rounded-lg">
                  <h4 className="font-semibold mb-2">Your Data Stays Private</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• All AI processing happens through secure Edge Functions</li>
                    <li>• Personal information is stripped before AI analysis</li>
                    <li>• No data is stored on external AI servers</li>
                    <li>• You can disable AI features anytime</li>
                    <li>• Local fallbacks maintain functionality offline</li>
                  </ul>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2">Explainable AI</h4>
                  <p className="text-sm text-muted-foreground">
                    Every AI decision includes a "Because..." explanation, so you always 
                    understand why the system behaved a certain way. No black boxes.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="insights" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Intelligence Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium mb-1">This Week</h4>
                      <p className="text-2xl font-bold text-primary">
                        {intelligenceStats.recentActivity.week}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        interactions with AI assistance
                      </p>
                    </div>
                    
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium mb-1">AI Enhancement</h4>
                      <p className="text-2xl font-bold text-secondary">
                        {intelligenceStats.totalInteractions > 0 
                          ? Math.round((intelligenceStats.aiEnhanced / intelligenceStats.totalInteractions) * 100)
                          : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        of interactions enhanced by AI
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">AI Features Active</h4>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="text-xs">
                          CBT Enhancement
                        </Badge>
                        <span className="text-muted-foreground">
                          Smart thought reframing
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="text-xs">
                          Voice Transcription
                        </Badge>
                        <span className="text-muted-foreground">
                          Privacy-first voice processing
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default IntelligenceDashboard;