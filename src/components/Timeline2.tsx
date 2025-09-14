/**
 * Timeline 2.0 - Production-Ready Timeline with Mood Ribbons & Explanations
 * Replaces the current Timeline with enhanced features
 */

import React, { useState, useMemo } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';
import { BubbleDetail } from '@/components/BubbleDetail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Search, 
  Filter, 
  Calendar,
  FileDown,
  Play,
  MoreVertical,
  Star,
  Sparkles,
  TrendingUp,
  Heart
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { IntelligentMoodRibbon } from '@/components/IntelligentMoodRibbon';
import { decisionTraceService } from '@/services/decisionTraceService';
import { ttsService } from '@/services/tts';

interface MoodRibbonData {
  date: string;
  mood: 'positive' | 'neutral' | 'negative';
  energy: number; // 0-100
  completion: number; // 0-100
  highlights: string[];
  because: string;
}

interface AccomplishmentCelebration {
  id: string;
  title: string;
  category: 'task' | 'habit' | 'milestone' | 'streak';
  significance: 'minor' | 'major' | 'epic';
  because: string;
  celebratedAt: number;
}

export const Timeline2: React.FC = () => {
  const { bubbles, isLoading } = useBubbleStore();
  const [selectedBubble, setSelectedBubble] = useState<Bubble | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState('ribbons');

  // Mock mood ribbon data - in production, this would come from behavioral analytics
  const moodRibbons = useMemo((): MoodRibbonData[] => {
    const ribbons: MoodRibbonData[] = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      const dayBubbles = bubbles.filter(bubble => {
        const bubbleDate = new Date(bubble.createdAt);
        return bubbleDate.toDateString() === date.toDateString();
      });
      
      const completedTasks = dayBubbles.filter(b => b.type === 'Task' && b.content?.includes('completed'));
      const totalTasks = dayBubbles.filter(b => b.type === 'Task');
      
      ribbons.push({
        date: date.toISOString().split('T')[0],
        mood: completedTasks.length > totalTasks.length * 0.7 ? 'positive' : 
              completedTasks.length > totalTasks.length * 0.3 ? 'neutral' : 'negative',
        energy: Math.min(100, dayBubbles.length * 20 + Math.random() * 30),
        completion: totalTasks.length > 0 ? (completedTasks.length / totalTasks.length) * 100 : 50,
        highlights: dayBubbles.slice(0, 2).map(b => b.content || '').filter(Boolean),
        because: `Based on ${completedTasks.length}/${totalTasks.length} tasks completed and ${dayBubbles.length} activities`
      });
    }
    
    return ribbons;
  }, [bubbles]);

  // Mock accomplishments - in production, this would be calculated from task completion patterns
  const accomplishments = useMemo((): AccomplishmentCelebration[] => {
    const now = Date.now();
    return [
      {
        id: '1',
        title: '7-day Task Completion Streak!',
        category: 'streak',
        significance: 'major',
        because: 'You completed at least one task every day this week. Consistency builds momentum!',
        celebratedAt: now - 3600000
      },
      {
        id: '2', 
        title: 'Inbox Zero Achieved',
        category: 'milestone',
        significance: 'minor',
        because: 'Your timeline is clean and organized. A clear space supports clear thinking.',
        celebratedAt: now - 7200000
      }
    ];
  }, []);

  const filteredBubbles = useMemo(() => {
    let filtered = [...bubbles];

    if (searchTerm) {
      filtered = filtered.filter(bubble =>
        bubble.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bubble.tags.some(tag => tag.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(bubble => bubble.type === filterType);
    }

    if (selectedDate) {
      filtered = filtered.filter(bubble => {
        const bubbleDate = new Date(bubble.createdAt).toDateString();
        const filterDate = new Date(selectedDate).toDateString();
        return bubbleDate === filterDate;
      });
    }

    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [bubbles, searchTerm, filterType, selectedDate]);

  const groupedBubbles = useMemo(() => {
    const groups: { [date: string]: Bubble[] } = {};
    
    filteredBubbles.forEach(bubble => {
      const date = new Date(bubble.createdAt).toDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(bubble);
    });
    
    return groups;
  }, [filteredBubbles]);

  const handleExportData = async () => {
    const dataToExport = {
      bubbles: filteredBubbles,
      moodRibbons,
      accomplishments,
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePlayBubble = async (bubble: Bubble) => {
    if (bubble.content) {
      await ttsService.speak(bubble.content);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const typeColors = {
    task: 'bg-primary/10 text-primary border-primary/20',
    thought: 'bg-secondary/10 text-secondary-foreground border-secondary/20',
    memory: 'bg-accent/10 text-accent-foreground border-accent/20',
    mood: 'bg-destructive/10 text-destructive border-destructive/20',
    reminder: 'bg-warning/10 text-warning-foreground border-warning/20',
    photo: 'bg-success/10 text-success-foreground border-success/20',
    event: 'bg-info/10 text-info-foreground border-info/20'
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Timeline 2.0</h1>
            <p className="text-muted-foreground">Your journey through time, with intelligent insights</p>
          </div>
          <Button onClick={handleExportData} variant="outline" className="gap-2">
            <FileDown className="h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Accomplishment Celebrations */}
        {accomplishments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-warning" />
              Recent Accomplishments
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {accomplishments.map(accomplishment => (
                <Card key={accomplishment.id} className="border-warning/20 bg-warning/5">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${
                        accomplishment.significance === 'epic' ? 'bg-gradient-to-r from-primary to-secondary' :
                        accomplishment.significance === 'major' ? 'bg-warning/20' : 'bg-accent/20'
                      }`}>
                        {accomplishment.category === 'streak' ? <TrendingUp className="h-4 w-4" /> :
                         accomplishment.category === 'milestone' ? <Star className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-sm">{accomplishment.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{accomplishment.because}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ribbons">Mood Ribbons</TabsTrigger>
            <TabsTrigger value="list">Detailed View</TabsTrigger>
          </TabsList>
          
          <TabsContent value="ribbons" className="space-y-6">
            {/* Mood Ribbons View */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Past 7 Days</h2>
              {moodRibbons.map(ribbon => (
                <Card key={ribbon.date} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">{formatDateHeader(ribbon.date)}</h3>
                    <Badge variant={ribbon.mood === 'positive' ? 'default' : ribbon.mood === 'neutral' ? 'secondary' : 'destructive'}>
                      {ribbon.mood}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>Energy</span>
                          <span>{Math.round(ribbon.energy)}%</span>
                        </div>
                        <Progress value={ribbon.energy} className="h-2" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>Completion</span>
                          <span>{Math.round(ribbon.completion)}%</span>
                        </div>
                        <Progress value={ribbon.completion} className="h-2" />
                      </div>
                    </div>
                    
                    {ribbon.highlights.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1">Highlights:</p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {ribbon.highlights.map((highlight, idx) => (
                            <li key={idx} className="truncate">• {highlight}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                      <strong>Because:</strong> {ribbon.because}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="list" className="space-y-6">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search your timeline..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-2">
                {['all', 'task', 'thought', 'memory', 'mood'].map((type) => (
                  <Button
                    key={type}
                    variant={filterType === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterType(type)}
                    className="capitalize"
                  >
                    {type}
                  </Button>
                ))}
              </div>
              
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto"
              />
            </div>

            {/* Timeline Content */}
            <div className="space-y-8">
              {Object.entries(groupedBubbles).map(([date, dayBubbles]) => (
                <div key={date} className="space-y-4">
                  <h2 className="text-xl font-semibold sticky top-0 bg-background/80 backdrop-blur py-2">
                    {formatDateHeader(date)}
                  </h2>
                  <div className="space-y-3">
                    {dayBubbles.map((bubble) => (
                      <Card key={bubble.id} className="overflow-hidden hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className={typeColors[bubble.type as keyof typeof typeColors] || typeColors.task}>
                                  {bubble.type}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {formatTime(bubble.createdAt)}
                                </span>
                              </div>
                              
                              <p className="text-sm text-foreground mb-3 line-clamp-3">
                                {bubble.content}
                              </p>
                              
                              {bubble.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {bubble.tags.map((tag) => (
                                    <Badge key={tag.id} variant="secondary" className="text-xs">
                                      {tag.emoji && `${tag.emoji} `}{tag.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setSelectedBubble(bubble)}>
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePlayBubble(bubble)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Play Audio
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
              
              {filteredBubbles.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No bubbles found matching your criteria.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Bubble Detail Modal */}
        {selectedBubble && (
          <BubbleDetail
            bubble={selectedBubble}
            isOpen={true}
            onClose={() => setSelectedBubble(null)}
          />
        )}
      </div>
    </div>
  );
};