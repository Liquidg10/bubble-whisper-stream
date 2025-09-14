import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HelpCircle, Shield, Eye, Lock } from 'lucide-react';

interface PrivacyWatermarkProps {
  layer: 'surface' | 'context' | 'deep';
  dataTypes?: string[];
  castMember?: string;
  className?: string;
}

export const PrivacyWatermark: React.FC<PrivacyWatermarkProps> = ({
  layer,
  dataTypes = [],
  castMember,
  className = ''
}) => {
  const getLayerConfig = () => {
    switch (layer) {
      case 'surface':
        return {
          icon: Eye,
          color: 'bg-green-500/10 text-green-700 border-green-200',
          label: 'SURFACE',
          description: 'Basic task and timing data'
        };
      case 'context':
        return {
          icon: Shield,
          color: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
          label: 'CONTEXT',
          description: 'Behavioral patterns and preferences'
        };
      case 'deep':
        return {
          icon: Lock,
          color: 'bg-red-500/10 text-red-700 border-red-200',
          label: 'DEEP',
          description: 'Personal insights and emotional context'
        };
    }
  };

  const config = getLayerConfig();
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Badge variant="outline" className={`text-xs ${config.color}`}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
      
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-4 w-4 p-0 opacity-60 hover:opacity-100">
            <HelpCircle className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 text-sm" side="top">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="font-medium">{config.label} Layer</span>
            </div>
            <p className="text-muted-foreground">{config.description}</p>
            
            {dataTypes.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Data used:</p>
                <p className="text-xs text-muted-foreground">{dataTypes.join(', ')}</p>
              </div>
            )}
            
            {castMember && (
              <div>
                <p className="text-xs font-medium mb-1">Suggested by:</p>
                <p className="text-xs text-muted-foreground">{castMember}</p>
              </div>
            )}
            
            <div className="pt-2 border-t">
              <Button variant="outline" size="sm" className="w-full text-xs">
                Privacy Settings
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};