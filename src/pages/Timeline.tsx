import React, { useState, useMemo } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';
import { BubbleDetail } from '@/components/BubbleDetail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Search, 
  Filter, 
  Calendar,
  FileDown,
  Play,
  MoreVertical 
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TemporalNavigation from '@/components/TemporalNavigation';
import { ttsService } from '@/services/tts';
import { hapticsService } from '@/services/haptics';

export const Timeline: React.FC = () => {
  const { bubbles, isLoading } = useBubbleStore();
  const [selectedBubble, setSelectedBubble] = useState<Bubble | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState('list');

  const filteredBubbles = useMemo(() => {
    let filtered = [...bubbles];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(bubble =>
        bubble.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bubble.tags.some(tag => tag.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(bubble => bubble.type === filterType);
    }

    // Date filter
    if (selectedDate) {
      const selectedDateMs = new Date(selectedDate).getTime();
      const nextDay = selectedDateMs + (24 * 60 * 60 * 1000);
      filtered = filtered.filter(bubble => 
        bubble.createdAt >= selectedDateMs && bubble.createdAt < nextDay
      );
    }

    // Sort by creation date (newest first)
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [bubbles, searchTerm, filterType, selectedDate]);

  const groupedBubbles = useMemo(() => {
    const groups: { [date: string]: Bubble[] } = {};
    
    filteredBubbles.forEach(bubble => {
      const date = new Date(bubble.createdAt).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(bubble);
    });

    return groups;
  }, [filteredBubbles]);

  const handleExportData = async () => {
    try {
      const exportData = {
        bubbles: filteredBubbles,
        exportedAt: Date.now(),
        totalCount: filteredBubbles.length,
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `bubble-timeline-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      hapticsService.success();
    } catch (error) {
      console.error('Export failed:', error);
      hapticsService.error();
    }
  };

  const handlePlayBubble = async (bubble: Bubble) => {
    if (!bubble.content) return;
    
    try {
      await ttsService.speak(bubble.content);
      hapticsService.tap();
    } catch (error) {
      console.error('TTS failed:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const typeColors = {
    Thought: 'bg-blue-500/20 text-blue-300',
    Task: 'bg-green-500/20 text-green-300',
    Memory: 'bg-purple-500/20 text-purple-300',
    Mood: 'bg-orange-500/20 text-orange-300',
    ReminderNote: 'bg-red-500/20 text-red-300',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading timeline...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Timeline</h1>
          <Button variant="outline" size="sm" onClick={handleExportData}>
            <FileDown className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
        
        {/* Timeline Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="temporal">Temporal View</TabsTrigger>
          </TabsList>
          
          <TabsContent value="list" className="mt-4">
            {/* Search and Filters for List View */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search bubbles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2">
                <Button
                  variant={filterType === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterType('all')}
                >
                  All
                </Button>
                {['Thought', 'Task', 'Memory', 'Mood', 'ReminderNote'].map((type) => (
                  <Button
                    key={type}
                    variant={filterType === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType(type)}
                    className="whitespace-nowrap"
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
          </TabsContent>
          
          <TabsContent value="temporal" className="mt-4">
            <TemporalNavigation 
              onTimeRangeChange={() => {}}
              isVisible={true}
              isMinimized={false}
            />
          </TabsContent>
        </Tabs>

      </div>

      {/* Timeline Content - Only show for List View */}
      {activeTab === 'list' && (
        <div className="flex-1 overflow-y-auto p-4">
          {Object.keys(groupedBubbles).length === 0 ? (
            <div className="text-center text-muted-foreground mt-8">
              {searchTerm || filterType !== 'all' || selectedDate 
                ? 'No bubbles match your filters' 
                : 'No bubbles yet. Start capturing your thoughts!'}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedBubbles).map(([date, dayBubbles]) => (
                <div key={date} className="space-y-3">
                  <h2 className="text-lg font-medium text-foreground sticky top-0 bg-background/95 backdrop-blur py-2">
                    {formatDateHeader(date)}
                  </h2>
                  <div className="space-y-3">
                    {dayBubbles.map((bubble) => (
                      <Card 
                        key={bubble.id} 
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => setSelectedBubble(bubble)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge 
                                  variant="secondary" 
                                  className={`text-xs ${typeColors[bubble.type]}`}
                                >
                                  {bubble.type}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatTime(bubble.createdAt)}
                                </span>
                              </div>
                              
                              <p className="text-sm line-clamp-3 mb-2">
                                {bubble.content || 'No content'}
                              </p>
                              
                              {bubble.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {bubble.tags.slice(0, 3).map((tag) => (
                                    <Badge key={tag.id} variant="outline" className="text-xs">
                                      {tag.emoji} {tag.name}
                                    </Badge>
                                  ))}
                                  {bubble.tags.length > 3 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{bubble.tags.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {bubble.content && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePlayBubble(bubble);
                                    }}
                                  >
                                    <Play className="h-4 w-4 mr-2" />
                                    Play Audio
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBubble(bubble);
                                  }}
                                >
                                  <Calendar className="h-4 w-4 mr-2" />
                                  View Details
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
            </div>
          )}
        </div>
      )}

      {/* Bubble Detail Modal */}
      <BubbleDetail
        bubble={selectedBubble}
        isOpen={!!selectedBubble}
        onClose={() => setSelectedBubble(null)}
      />
    </div>
  );
};