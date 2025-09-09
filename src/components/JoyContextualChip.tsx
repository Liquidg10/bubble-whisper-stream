import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { JoyMoment } from '@/services/joyContextualService';
import { 
  Heart, 
  MapPin, 
  Calendar, 
  Mail, 
  MessageCircle, 
  Camera, 
  Star,
  Archive,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface JoyContextualChipProps {
  joyMoment: JoyMoment;
  onFavorite?: (momentId: string) => void;
  onArchive?: (momentId: string) => void;
  onPhotoNudge?: (momentId: string) => void;
  compact?: boolean;
}

export const JoyContextualChip: React.FC<JoyContextualChipProps> = ({ 
  joyMoment, 
  onFavorite, 
  onArchive, 
  onPhotoNudge,
  compact = false 
}) => {
  const getSourceIcon = () => {
    switch (joyMoment.source) {
      case 'calendar': return <Calendar className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'location': return <MapPin className="h-4 w-4" />;
      case 'conversation': return <MessageCircle className="h-4 w-4" />;
      default: return <Heart className="h-4 w-4" />;
    }
  };

  const getJoyTypeColor = (type: string) => {
    const colors = {
      celebration: 'text-pink-600 bg-pink-50 border-pink-200',
      milestone: 'text-purple-600 bg-purple-50 border-purple-200',
      experience: 'text-blue-600 bg-blue-50 border-blue-200',
      memory: 'text-green-600 bg-green-50 border-green-200',
      accomplishment: 'text-orange-600 bg-orange-50 border-orange-200'
    };
    return colors[type as keyof typeof colors] || colors.memory;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-orange-600 bg-orange-50';
  };

  const getTimingIcon = () => {
    switch (joyMoment.context.timing) {
      case 'current': return <Clock className="h-3 w-3 text-green-500" />;
      case 'upcoming': return <AlertTriangle className="h-3 w-3 text-orange-500" />;
      case 'past': return <Archive className="h-3 w-3 text-muted-foreground" />;
      default: return null;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - timestamp;
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (compact) {
    return (
      <Card className="hover:shadow-sm transition-shadow duration-200 border border-primary/20">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-1">
                {getSourceIcon()}
                {getTimingIcon()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {joyMoment.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {joyMoment.description}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 ml-2">
              <Badge 
                variant="outline" 
                className={`text-xs ${getJoyTypeColor(joyMoment.joyType)}`}
              >
                {joyMoment.joyType}
              </Badge>
              
              {joyMoment.photoNudge && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onPhotoNudge?.(joyMoment.id)}
                  className="h-6 w-6 p-0"
                  aria-label="Photo opportunity"
                >
                  <Camera className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow duration-200" role="article">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {getSourceIcon()}
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {joyMoment.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(joyMoment.createdAt)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {getTimingIcon()}
              <Badge 
                variant="outline" 
                className={`text-xs ${getConfidenceColor(joyMoment.confidence)}`}
              >
                {(joyMoment.confidence * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-foreground">
            {joyMoment.description}
          </p>

          {/* Context Info */}
          <div className="flex flex-wrap gap-2">
            <Badge 
              variant="secondary" 
              className={`text-xs ${getJoyTypeColor(joyMoment.joyType)}`}
            >
              {joyMoment.joyType}
            </Badge>
            
            <Badge variant="outline" className="text-xs">
              {joyMoment.source}
            </Badge>
            
            {joyMoment.context.location && (
              <Badge variant="outline" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                {joyMoment.context.location.place?.name || 'Location'}
              </Badge>
            )}
          </div>

          {/* Photo Nudge */}
          {joyMoment.photoNudge && (
            <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Camera className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-primary">Photo Opportunity</span>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${
                    joyMoment.photoNudge.priority === 'high' 
                      ? 'text-red-600 bg-red-50' 
                      : joyMoment.photoNudge.priority === 'medium'
                      ? 'text-yellow-600 bg-yellow-50'
                      : 'text-blue-600 bg-blue-50'
                  }`}
                >
                  {joyMoment.photoNudge.priority}
                </Badge>
              </div>
              <p className="text-xs text-foreground mb-2">
                {joyMoment.photoNudge.message}
              </p>
              <Button
                size="sm"
                onClick={() => onPhotoNudge?.(joyMoment.id)}
                className="text-xs h-7"
              >
                <Camera className="h-3 w-3 mr-1" />
                Capture Moment
              </Button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={joyMoment.favorited ? "default" : "ghost"}
                onClick={() => onFavorite?.(joyMoment.id)}
                className="text-xs h-7"
              >
                <Star className={`h-3 w-3 mr-1 ${joyMoment.favorited ? 'fill-current' : ''}`} />
                {joyMoment.favorited ? 'Favorited' : 'Favorite'}
              </Button>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onArchive?.(joyMoment.id)}
                className="text-xs h-7"
              >
                <Archive className="h-3 w-3 mr-1" />
                Archive
              </Button>
            </div>
            
            <div className="text-xs text-muted-foreground">
              {joyMoment.context.timing} moment
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};