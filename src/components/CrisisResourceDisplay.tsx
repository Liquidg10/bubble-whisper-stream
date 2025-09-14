/**
 * Crisis Resource Display - Safety-first crisis support interface
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Phone, 
  MessageCircle, 
  Globe, 
  Heart,
  X
} from 'lucide-react';
import { crisisDetectionService } from '@/services/crisisDetectionService';

interface CrisisResourceDisplayProps {
  onDismiss?: () => void;
  compact?: boolean;
}

export function CrisisResourceDisplay({ 
  onDismiss,
  compact = false 
}: CrisisResourceDisplayProps) {
  const crisisState = crisisDetectionService.getCurrentState();
  const resources = crisisDetectionService.getCrisisResources();

  if (!crisisState.isActive || !resources) {
    return null;
  }

  const handleDismiss = () => {
    crisisDetectionService.dismissCrisisAlert('user_dismissed');
    onDismiss?.();
  };

  const openResource = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Default resource structure for compatibility
  const defaultHotlines = [
    {
      name: 'Crisis Lifeline',
      phone: resources.hotline || '988',
      url: resources.web || 'https://suicidepreventionlifeline.org',
      availability: '24/7'
    }
  ];

  const hotlines = (resources as any).hotlines || defaultHotlines;
  const professional = (resources as any).professional || [];
  const selfCare = (resources as any).selfCare || [];

  if (compact) {
    return (
      <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium">Support resources available</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openResource(hotlines[0]?.url || '#')}
              >
                Get Help
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">You're Not Alone</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="text-sm text-blue-700 dark:text-blue-300">
          We've paused suggestions to give you space. Here are some immediate support options:
        </div>

        {/* Emergency Hotlines */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Immediate Support</h4>
          {hotlines.map((hotline: any, index: number) => (
            <div key={index} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded border">
              <div>
                <div className="font-medium text-sm">{hotline.name}</div>
                <div className="text-xs text-muted-foreground">
                  Available {hotline.availability}
                </div>
              </div>
              <div className="flex gap-2">
                {hotline.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`tel:${hotline.phone}`)}
                  >
                    <Phone className="h-4 w-4 mr-1" />
                    Call
                  </Button>
                )}
                {hotline.chat && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openResource(hotline.chat)}
                  >
                    <MessageCircle className="h-4 w-4 mr-1" />
                    Chat
                  </Button>
                )}
                {hotline.url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openResource(hotline.url)}
                  >
                    <Globe className="h-4 w-4 mr-1" />
                    Visit
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Professional Resources */}
        {professional.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Professional Support</h4>
            {professional.map((resource: any, index: number) => (
              <div key={index} className="p-3 bg-white dark:bg-gray-800 rounded border">
                <div className="font-medium text-sm">{resource.name}</div>
                <div className="text-xs text-muted-foreground mb-2">
                  {resource.description}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openResource(resource.url)}
                >
                  Learn More
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Self-Care Resources */}
        {selfCare.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Self-Care Tools</h4>
            <div className="grid grid-cols-2 gap-2">
              {selfCare.map((tool: any, index: number) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => openResource(tool.url)}
                  className="text-xs"
                >
                  {tool.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t text-xs text-muted-foreground">
          <Badge variant="secondary" className="mr-2">
            Crisis Level: {crisisState.level}
          </Badge>
          Remember: This tool is not a substitute for professional help.
        </div>
      </CardContent>
    </Card>
  );
}