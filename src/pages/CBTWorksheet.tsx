// CBT Worksheet Page
// Dedicated page for cognitive behavioral therapy thought checking

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, History, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CBTThoughtCheck } from '@/components/CBTThoughtCheck';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CBTEntry } from '@/types/bubble';
import { cbtService, DISTORTION_DEFINITIONS } from '@/services/cbtService';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

export const CBTWorksheet: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [showForm, setShowForm] = useState(false);
  const [entries, setEntries] = useState<CBTEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Get initial data from URL params
  const initialThought = searchParams.get('thought') || '';
  const bubbleId = searchParams.get('bubbleId') || undefined;

  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    // If there's an initial thought, show the form immediately
    if (initialThought) {
      setShowForm(true);
    }
  }, [initialThought]);

  const loadEntries = async () => {
    try {
      const allEntries = await cbtService.getAllEntries();
      setEntries(allEntries);
    } catch (error) {
      toast({
        title: "Load failed",
        description: "Couldn't load your previous entries",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEntry = async (entry: CBTEntry) => {
    setEntries(prev => [entry, ...prev]);
    setShowForm(false);
    
    toast({
      title: "Thought check complete",
      description: "Your reflection has been saved"
    });

    // Clear URL params after saving
    navigate('/cbt-worksheet', { replace: true });
  };

  const handleCancel = () => {
    setShowForm(false);
    navigate('/cbt-worksheet', { replace: true });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffDays === 0) {
      return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (showForm) {
    return (
      <CBTThoughtCheck
        initialThought={initialThought}
        bubbleId={bubbleId}
        onSave={handleSaveEntry}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Thought Check</h1>
            <p className="text-sm text-muted-foreground">
              Gentle tools for challenging difficult thoughts
            </p>
          </div>
        </div>
        
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New thought check
        </Button>
      </div>

      {/* Quick stats */}
      {entries.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold">{entries.length}</div>
                <div className="text-xs text-muted-foreground">Total entries</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {entries.filter(e => e.reframe).length}
                </div>
                <div className="text-xs text-muted-foreground">With reframes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {entries.filter(e => 
                    Date.now() - e.createdAt < 7 * 24 * 60 * 60 * 1000
                  ).length}
                </div>
                <div className="text-xs text-muted-foreground">This week</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entries list */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4" />
          <h2 className="text-lg font-semibold">Your reflections</h2>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading your entries...</p>
          </div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="space-y-4">
                <div className="text-4xl">🌱</div>
                <div>
                  <h3 className="text-lg font-medium">Start your first thought check</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    When difficult thoughts arise, these gentle tools can help you find a more balanced perspective
                  </p>
                </div>
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Begin your first reflection
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-24rem)]">
            <div className="space-y-3">
              {entries.map((entry) => (
                <Card key={entry.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">
                        {entry.thought.slice(0, 80)}
                        {entry.thought.length > 80 && '...'}
                      </CardTitle>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {/* Distortions */}
                      {entry.distortions.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-2">Patterns identified:</p>
                          <div className="flex flex-wrap gap-1">
                            {entry.distortions.map((distortion) => (
                              <Badge key={distortion} variant="outline" className="text-xs">
                                {DISTORTION_DEFINITIONS[distortion].label}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reframe */}
                      {entry.reframe && (
                        <div className="p-3 bg-primary/5 rounded-lg">
                          <p className="text-xs font-medium mb-1">Gentler perspective:</p>
                          <p className="text-sm">{entry.reframe}</p>
                        </div>
                      )}

                      {/* Evidence */}
                      {(entry.evidenceFor || entry.evidenceAgainst) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          {entry.evidenceFor && (
                            <div>
                              <p className="font-medium mb-1">Supporting evidence:</p>
                              <p className="text-muted-foreground">{entry.evidenceFor}</p>
                            </div>
                          )}
                          {entry.evidenceAgainst && (
                            <div>
                              <p className="font-medium mb-1">Challenging evidence:</p>
                              <p className="text-muted-foreground">{entry.evidenceAgainst}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};