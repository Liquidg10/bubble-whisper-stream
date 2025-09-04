import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mic, Camera, Type, Heart, Calendar, MapPin } from 'lucide-react';
import { Bubble } from '@/types/bubble';
import { format } from 'date-fns';

interface JoyCardProps {
  bubble: Bubble;
}

export const JoyCard: React.FC<JoyCardProps> = ({ bubble }) => {
  const getSourceIcon = () => {
    if (bubble.audioUri) return <Mic className="h-3 w-3" />;
    if (bubble.imageUri) return <Camera className="h-3 w-3" />;
    return <Type className="h-3 w-3" />;
  };

  const getSourceType = () => {
    if (bubble.audioUri) return 'voice';
    if (bubble.imageUri) return 'photo';
    return 'text';
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return `Today at ${format(date, 'h:mm a')}`;
    }
    
    const isThisWeek = now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000;
    if (isThisWeek) {
      return format(date, 'EEEE \'at\' h:mm a');
    }
    
    return format(date, 'MMM d, yyyy \'at\' h:mm a');
  };

  const getCaption = () => {
    if (!bubble.content) return 'Joyful moment';
    
    // Truncate long content for display
    const maxLength = 80;
    if (bubble.content.length <= maxLength) {
      return bubble.content;
    }
    return bubble.content.substring(0, maxLength) + '...';
  };

  // Generate accessible label for screen readers
  const getAriaLabel = () => {
    const sourceType = getSourceType();
    const date = formatDate(bubble.createdAt);
    const content = bubble.content || 'Joyful moment';
    
    return `Joy: '${content}', ${sourceType}, captured ${date}`;
  };

  return (
    <Card 
      className="group hover:shadow-md transition-all duration-200 cursor-pointer border-accent/20 hover:border-accent/40"
      role="article"
      aria-label={getAriaLabel()}
      tabIndex={0}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header with source icon and date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-accent">
              {getSourceIcon()}
              <span className="text-xs font-medium capitalize">{getSourceType()}</span>
            </div>
            <Heart className="h-3 w-3 text-primary fill-primary/20" />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <time dateTime={new Date(bubble.createdAt).toISOString()}>
              {formatDate(bubble.createdAt)}
            </time>
          </div>
        </div>

        {/* Photo/Image Preview */}
        {bubble.imageUri && (
          <div className="aspect-video rounded-lg overflow-hidden bg-muted">
            <img 
              src={bubble.imageUri} 
              alt={`Joy moment: ${getCaption()}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>
        )}

        {/* Audio indicator */}
        {bubble.audioUri && !bubble.imageUri && (
          <div className="aspect-video rounded-lg bg-gradient-to-br from-accent/5 to-accent/20 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Mic className="h-8 w-8 text-accent" />
              <span className="text-xs text-muted-foreground">Voice Recording</span>
            </div>
          </div>
        )}

        {/* Content/Caption */}
        <div className="space-y-2">
          <p className="text-sm text-foreground leading-relaxed">
            {getCaption()}
          </p>
          
          {/* Location if available */}
          {bubble.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>Location recorded</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {bubble.tags && bubble.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {bubble.tags.slice(0, 3).map((tag) => (
              <Badge 
                key={tag.id} 
                variant="secondary" 
                className="text-xs h-5"
              >
                {tag.emoji && <span className="mr-1">{tag.emoji}</span>}
                {tag.name}
              </Badge>
            ))}
            {bubble.tags.length > 3 && (
              <Badge variant="outline" className="text-xs h-5">
                +{bubble.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Mood indicator if available */}
        {bubble.mood && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Mood:</span>
            <Badge 
              variant="outline" 
              className="text-xs h-5"
              style={{ 
                backgroundColor: bubble.moodColor ? `${bubble.moodColor}20` : undefined,
                borderColor: bubble.moodColor || undefined 
              }}
            >
              {bubble.mood}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};