import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Calendar, Mail, MapPin, Brain, CreditCard, Camera } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';

interface Connector {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  sensitive: boolean;
  description: string;
}

const connectors: Connector[] = [
  { 
    id: 'calendar', 
    name: 'Calendar', 
    icon: Calendar, 
    sensitive: true,
    description: 'Event titles, attendees, meeting patterns'
  },
  { 
    id: 'gmail', 
    name: 'Gmail', 
    icon: Mail, 
    sensitive: true,
    description: 'Email metadata, auto-write suggestions'
  },
  { 
    id: 'location', 
    name: 'Location', 
    icon: MapPin, 
    sensitive: true,
    description: 'GPS coordinates, movement patterns'
  },
  { 
    id: 'cbt', 
    name: 'CBT Data', 
    icon: Brain, 
    sensitive: true,
    description: 'Thought patterns, emotional insights'
  },
  { 
    id: 'financial', 
    name: 'Financial', 
    icon: CreditCard, 
    sensitive: true,
    description: 'Transaction history, spending patterns'
  },
  { 
    id: 'camera', 
    name: 'Camera/Photos', 
    icon: Camera, 
    sensitive: false,
    description: 'Image analysis, visual content'
  }
];

export function ConnectorPrivacyMatrix() {
  const { settings, updateSettings } = useBubbleStore();

  const getConnectorAccess = (connectorId: string, layer: string): boolean => {
    const key = `${connectorId}${layer.charAt(0).toUpperCase() + layer.slice(1)}Access`;
    return settings[key as keyof typeof settings] as boolean ?? true;
  };

  const toggleConnectorAccess = async (connectorId: string, layer: string, enabled: boolean) => {
    const key = `${connectorId}${layer.charAt(0).toUpperCase() + layer.slice(1)}Access`;
    await updateSettings({ [key]: enabled });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connector Privacy Controls</CardTitle>
        <CardDescription>
          Choose which privacy layer each connector can access
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-spacing-2">
            <thead>
              <tr>
                <th className="text-left pb-3">Connector</th>
                <th className="text-center pb-3 px-2">Surface</th>
                <th className="text-center pb-3 px-2">Context</th>
                <th className="text-center pb-3 px-2">Deep</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((connector) => (
                <tr key={connector.id} className="border-b border-border/50">
                  <td className="py-3">
                    <div className="flex items-start gap-3">
                      <connector.icon className="h-4 w-4 mt-1 text-muted-foreground" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{connector.name}</span>
                          {connector.sensitive && (
                            <Badge variant="secondary" className="text-xs">
                              Sensitive
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {connector.description}
                        </p>
                      </div>
                    </div>
                  </td>
                  {['surface', 'context', 'deep'].map((layer) => (
                    <td key={layer} className="text-center py-3 px-2">
                      <Checkbox
                        checked={getConnectorAccess(connector.id, layer)}
                        onCheckedChange={(checked) => 
                          toggleConnectorAccess(connector.id, layer, !!checked)
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 p-3 bg-muted/30 rounded-md">
          <p className="text-xs text-muted-foreground">
            <strong>Surface:</strong> Basic functionality only • 
            <strong> Context:</strong> Pattern learning • 
            <strong> Deep:</strong> Full personalization
          </p>
        </div>
      </CardContent>
    </Card>
  );
}