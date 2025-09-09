import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  joyContextualService, 
  ContextualNudge, 
  JoyMoment 
} from '@/services/joyContextualService';
import { 
  X, 
  Camera, 
  Heart, 
  Clock, 
  MapPin, 
  Calendar, 
  Mail,
  MessageCircle,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ContextualNudgeSystemProps {
  onPhotoCapture?: () => void;
  className?: string;
}

export const ContextualNudgeSystem: React.FC<ContextualNudgeSystemProps> = ({ 
  onPhotoCapture,
  className = ""
}) => {
  const [activeNudges, setActiveNudges] = useState<ContextualNudge[]>([]);
  const [joyMoments, setJoyMoments] = useState<JoyMoment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadNudges = async () => {
      try {
        setIsLoading(true);
        
        // Load joy moments
        const moments = await joyContextualService.getJoyMoments();
        setJoyMoments(moments);
        
        // Get active nudges
        const nudges = joyContextualService.getActiveNudges();
        setActiveNudges(nudges);
        
        // Generate new nudges from recent joy moments
        for (const moment of moments.slice(0, 3)) {
          const nudge = await joyContextualService.generateContextualNudge(moment);
          if (nudge) {
            setActiveNudges(prev => [...prev, nudge]);
          }
        }
      } catch (error) {
        console.warn('Failed to load contextual nudges:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadNudges();

    // Set up periodic refresh
    const interval = setInterval(loadNudges, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  const handleNudgeAction = async (nudge: ContextualNudge, action: 'accept' | 'dismiss') => {
    if (action === 'accept') {
      switch (nudge.type) {
        case 'photo':
          onPhotoCapture?.();
          toast({
            title: "Photo capture opened",
            description: "Ready to capture this joyful moment!",
            duration: 3000,
          });
          break;
        case 'reflection':
          toast({
            title: "Reflection noted",
            description: "Take a moment to appreciate this joy.",
            duration: 3000,
          });
          break;
        case 'celebration':
          toast({
            title: "Celebration time!",
            description: "This moment deserves recognition.",
            duration: 3000,
          });
          break;
      }
    }

    // Remove from active nudges
    setActiveNudges(prev => prev.filter(n => n.id !== nudge.id));
    
    // Record dismissal with service
    await joyContextualService.dismissNudge(nudge.id);
    
    if (action === 'dismiss') {
      toast({
        title: "Nudge dismissed",
        description: "We'll adjust future suggestions based on your preference.",
        duration: 2000,
      });
    }
  };

  const getNudgeIcon = (nudge: ContextualNudge) => {
    switch (nudge.type) {
      case 'photo': return <Camera className="h-4 w-4" />;
      case 'reflection': return <Heart className="h-4 w-4" />;
      case 'celebration': return <CheckCircle className="h-4 w-4" />;
      default: return <Heart className="h-4 w-4" />;
    }
  };

  const getTriggerIcon = (nudge: ContextualNudge) => {
    if (nudge.triggerContext.location) return <MapPin className="h-3 w-3" />;
    if (nudge.triggerContext.calendar) return <Calendar className="h-3 w-3" />;
    if (nudge.triggerContext.email) return <Mail className="h-3 w-3" />;
    return <MessageCircle className="h-3 w-3" />;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatExpirationTime = (expiresAt: number) => {
    const now = Date.now();
    const timeLeft = expiresAt - now;
    
    if (timeLeft <= 0) return 'Expired';
    
    const minutes = Math.floor(timeLeft / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m left`;
    return `${minutes}m left`;
  };

  // Filter out expired nudges
  const validNudges = activeNudges.filter(nudge => nudge.expiresAt > Date.now());

  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="animate-pulse">
          <Card>
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (validNudges.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {validNudges.map((nudge) => (
        <Card key={nudge.id} className="border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {getNudgeIcon(nudge)}
                  {getTriggerIcon(nudge)}
                </div>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getPriorityColor(nudge.priority)}`}
                >
                  {nudge.priority}
                </Badge>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatExpirationTime(nudge.expiresAt)}
                </div>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleNudgeAction(nudge, 'dismiss')}
                  className="h-6 w-6 p-0 hover:bg-destructive/10"
                  aria-label="Dismiss nudge"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <p className="text-sm text-foreground mb-3">
              {nudge.message}
            </p>

            {/* Safety indicators */}
            <div className="flex flex-wrap gap-1 mb-3">
              {!nudge.safetyCheck.inVehicle && (
                <Badge variant="outline" className="text-xs text-green-600 bg-green-50">
                  ✓ Safe location
                </Badge>
              )}
              {!nudge.safetyCheck.quietHours && (
                <Badge variant="outline" className="text-xs text-green-600 bg-green-50">
                  ✓ Active hours
                </Badge>
              )}
              {nudge.safetyCheck.inVehicle && (
                <Badge variant="outline" className="text-xs text-orange-600 bg-orange-50">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  In vehicle
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleNudgeAction(nudge, 'accept')}
                className="text-xs h-7"
              >
                {getNudgeIcon(nudge)}
                <span className="ml-1">
                  {nudge.type === 'photo' ? 'Take Photo' : 
                   nudge.type === 'reflection' ? 'Reflect' : 'Celebrate'}
                </span>
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleNudgeAction(nudge, 'dismiss')}
                className="text-xs h-7"
              >
                Not now
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};