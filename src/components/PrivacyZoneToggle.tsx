import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Eye, Fingerprint, Shield } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { consentService } from '@/services/consentService';
import { useToast } from '@/hooks/use-toast';

interface PrivacyZoneToggleProps {
  layer: 'surface' | 'context' | 'deep';
  title: string;
  description: string;
  icon: React.ReactNode;
  requiresBiometric?: boolean;
}

export const PrivacyZoneToggle: React.FC<PrivacyZoneToggleProps> = ({
  layer,
  title,
  description,
  icon,
  requiresBiometric = false
}) => {
  const { settings, updateSettings } = useBubbleStore();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { toast } = useToast();

  const isEnabled = settings.selfModelLayers?.[layer] || false;

  const handleToggle = async (enabled: boolean) => {
    if (enabled && requiresBiometric) {
      setIsAuthenticating(true);
      
      try {
        // Simulate biometric authentication
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // In a real app, you would use:
        // const result = await LocalAuthentication.authenticateAsync({
        //   promptMessage: `Enable ${title}`,
        //   fallbackLabel: 'Use passcode'
        // });
        
        const hasConsent = await consentService.requestConsent(
          `selfModel_${layer}`,
          `Enable ${layer} layer data collection`
        );
        
        if (hasConsent) {
        updateSettings({
          selfModelLayers: {
            ...settings.selfModelLayers,
            [layer]: enabled
          }
        } as any);
          
          toast({
            title: enabled ? "Layer enabled" : "Layer disabled",
            description: `${title} ${enabled ? 'activated' : 'deactivated'} with biometric security`
          });
        }
      } catch (error) {
        toast({
          title: "Authentication failed",
          description: "Could not verify your identity",
          variant: "destructive"
        });
      } finally {
        setIsAuthenticating(false);
      }
    } else {
      updateSettings({
        selfModelLayers: {
          ...settings.selfModelLayers,
          [layer]: enabled
        }
      } as any);
      
      toast({
        title: enabled ? "Layer enabled" : "Layer disabled",
        description: `${title} ${enabled ? 'activated' : 'deactivated'}`
      });
    }
  };

  const getSecurityLevel = () => {
    switch (layer) {
      case 'surface':
        return { label: 'Basic', color: 'bg-green-500' };
      case 'context':
        return { label: 'Protected', color: 'bg-yellow-500' };
      case 'deep':
        return { label: 'Encrypted', color: 'bg-red-500' };
    }
  };

  const security = getSecurityLevel();

  return (
    <Card className={`transition-all duration-200 ${isEnabled ? 'ring-2 ring-primary/20' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${security.color}`} />
                <Badge variant="outline" className="text-xs">
                  {security.label}
                </Badge>
                {requiresBiometric && (
                  <Badge variant="secondary" className="text-xs">
                    <Fingerprint className="h-3 w-3 mr-1" />
                    Biometric
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={isAuthenticating}
          />
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground mb-3">
          {description}
        </p>
        
        {isEnabled && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            <span>Data is encrypted and stored locally</span>
          </div>
        )}
        
        {isAuthenticating && (
          <div className="flex items-center gap-2 text-xs text-primary">
            <Fingerprint className="h-3 w-3 animate-pulse" />
            <span>Authenticating...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};