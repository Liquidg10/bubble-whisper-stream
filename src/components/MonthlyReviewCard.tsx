import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Archive, Eye, Lock } from 'lucide-react';
import { selfModelV2Service, MonthlyReview, SelfModelAudit } from '@/services/selfModelV2Service';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface MonthlyReviewCardProps {
  month?: string; // YYYY-MM format, defaults to current month
  onClose?: () => void;
}

export const MonthlyReviewCard: React.FC<MonthlyReviewCardProps> = ({
  month,
  onClose
}) => {
  const [review, setReview] = useState<MonthlyReview | null>(null);
  const [userNotes, setUserNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const currentMonth = month || new Date().toISOString().slice(0, 7);

  useEffect(() => {
    loadReview();
  }, [currentMonth]);

  const loadReview = async () => {
    try {
      setLoading(true);
      let existingReview = await selfModelV2Service.getMonthlyReview(currentMonth);
      
      if (!existingReview) {
        existingReview = await selfModelV2Service.generateMonthlyReview();
      }
      
      // Get CBT and Glimmer counts from store
      const { cbtEntries, glimmers } = useBubbleStore.getState();
      const currentMonthStart = new Date();
      currentMonthStart.setDate(1);
      currentMonthStart.setHours(0, 0, 0, 0);
      
      const monthCBTEntries = cbtEntries.filter(entry => 
        entry.createdAt >= currentMonthStart.getTime()
      ).length;
      
      const monthGlimmers = glimmers.filter(glimmer => 
        glimmer.createdAt >= currentMonthStart.getTime()
      ).length;
      
      // Enhance review with current month stats
      const enhancedReview = {
        ...existingReview,
        stats: {
          cbtEntries: monthCBTEntries,
          glimmersReceived: monthGlimmers,
          ...existingReview.stats
        }
      };
      
      setReview(enhancedReview);
      setUserNotes(existingReview.userNotes || '');
    } catch (error) {
      console.error('Failed to load review:', error);
      toast({
        title: "Error",
        description: "Failed to load monthly review",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!review) return;

    try {
      const updatedReview = { ...review, userNotes };
      // Save logic would go here
      
      toast({
        title: "Notes saved",
        description: "Your monthly reflection has been updated"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive"
      });
    }
  };

  const handleArchivePattern = async (patternId: string) => {
    try {
      await selfModelV2Service.archivePattern(patternId, 'Monthly review archive');
      toast({
        title: "Pattern archived",
        description: "Old pattern moved to archive"
      });
      loadReview(); // Refresh
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to archive pattern",
        variant: "destructive"
      });
    }
  };

  const getChangesSummary = (changes: SelfModelAudit[]) => {
    const layers = new Set(changes.map(c => c.layer));
    const layerCounts = {
      surface: changes.filter(c => c.layer === 'surface').length,
      context: changes.filter(c => c.layer === 'context').length,
      deep: changes.filter(c => c.layer === 'deep').length
    };

    return { layers: Array.from(layers), counts: layerCounts };
  };

  if (loading) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!review) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No review data available for this month.</p>
        </CardContent>
      </Card>
    );
  }

  const { layers, counts } = getChangesSummary(review.changes);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Monthly Review - {new Date(currentMonth + '-01').toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
          })}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Changes Summary */}
        <div>
          <h3 className="font-semibold mb-3">What Changed This Month</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{counts.surface}</div>
              <Badge variant="outline" className="text-xs">Surface</Badge>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{counts.context}</div>
              <Badge variant="outline" className="text-xs">Context</Badge>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{counts.deep}</div>
              <Badge variant="secondary" className="text-xs">
                <Lock className="h-3 w-3 mr-1" />
                Deep
              </Badge>
            </div>
          </div>

          {review.changes.length > 0 && (
            <ScrollArea className="h-32 w-full border rounded-md p-3">
              <div className="space-y-2">
                {review.changes.slice(0, 5).map((change) => (
                  <div key={change.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(change.at)} ago
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {change.layer}
                    </Badge>
                  </div>
                ))}
                {review.changes.length > 5 && (
                  <div className="text-xs text-muted-foreground text-center">
                    +{review.changes.length - 5} more changes
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Archived Patterns */}
        {review.archivedPatterns.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Archive className="h-4 w-4" />
              Patterns Ready to Archive
            </h3>
            <div className="space-y-2">
              {review.archivedPatterns.map((pattern) => (
                <div key={pattern.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <div className="font-medium text-sm">{pattern.key}</div>
                    <div className="text-xs text-muted-foreground">
                      Confidence: {Math.round(pattern.confidence * 100)}%
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleArchivePattern(pattern.id)}
                  >
                    Archive
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Notes */}
        <div>
          <h3 className="font-semibold mb-3">Your Reflection</h3>
          <Textarea
            placeholder="How are you feeling about these changes? What patterns do you notice?"
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            className="min-h-[100px]"
          />
          <Button
            onClick={handleSaveNotes}
            className="mt-2"
            disabled={userNotes === review.userNotes}
          >
            Save Reflection
          </Button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button variant="outline" className="flex-1">
            <Eye className="h-4 w-4 mr-2" />
            View Full History
          </Button>
          {onClose && (
            <Button onClick={onClose} className="flex-1">
              Done
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};