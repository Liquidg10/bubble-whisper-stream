import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { 
  Package, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Settings, 
  Trash2,
  Download,
  Eye,
  Zap
} from 'lucide-react';
import { pluginManager } from '@/services/pluginService';

interface PluginManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PluginManager({ isOpen, onClose }: PluginManagerProps) {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlugin, setSelectedPlugin] = useState<any>(null);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    try {
      setLoading(true);
      // Use sample plugins for now
      setPlugins(samplePlugins);
    } catch (error) {
      console.error('Failed to load plugins:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlugin = async (pluginId: string, enabled: boolean) => {
    try {
      // Demo functionality - in real implementation would use pluginManager
      console.log(`${enabled ? 'Enabling' : 'Disabling'} plugin:`, pluginId);
      await loadPlugins();
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
    }
  };

  const handleQuarantinePlugin = async (pluginId: string) => {
    try {
      // Demo functionality - in real implementation would use pluginManager
      console.log('Quarantining plugin:', pluginId);
      await loadPlugins();
    } catch (error) {
      console.error('Failed to quarantine plugin:', error);
    }
  };

  const samplePlugins = [
    {
      id: 'grocery-helper',
      name: 'Grocery Helper',
      version: '1.0.0',
      description: 'Smart grocery list management with "running low" detection',
      capabilities: ['read:bubbles', 'write:reminders'],
      status: 'active',
      memoryUsage: '2.1 MB',
      apiCalls: 45
    },
    {
      id: 'clean-house-cues',
      name: 'Clean House Cues',
      version: '1.0.0', 
      description: '10-minute reset prompts with gentle, anti-shame language',
      capabilities: ['write:reminders', 'read:time'],
      status: 'active',
      memoryUsage: '1.8 MB',
      apiCalls: 23
    },
    {
      id: 'mood-tracker',
      name: 'Advanced Mood Tracker',
      version: '2.1.0',
      description: 'Enhanced mood tracking with pattern recognition',
      capabilities: ['read:bubbles', 'write:bubbles', 'ai:analysis'],
      status: 'quarantined',
      memoryUsage: '5.2 MB',
      apiCalls: 156,
      quarantineReason: 'Excessive API usage detected'
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Plugin Manager
            <Badge variant="secondary">{samplePlugins.length} installed</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Global Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4" />
                Security & Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Safe Mode</div>
                  <div className="text-sm text-muted-foreground">
                    Disable all plugins temporarily
                  </div>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Install Plugin
                </Button>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Global Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Plugin List */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Installed Plugins</h3>
            
            {samplePlugins.map((plugin) => (
              <Card key={plugin.id} className={`${
                plugin.status === 'quarantined' ? 'border-destructive/50' : ''
              }`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{plugin.name}</CardTitle>
                        <Badge variant="outline">v{plugin.version}</Badge>
                        {plugin.status === 'active' && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                        {plugin.status === 'quarantined' && (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Quarantined
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{plugin.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={plugin.status === 'active'}
                        onCheckedChange={(enabled) => handleTogglePlugin(plugin.id, enabled)}
                        disabled={plugin.status === 'quarantined'}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {plugin.status === 'quarantined' && plugin.quarantineReason && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Quarantined: {plugin.quarantineReason}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Capabilities */}
                  <div>
                    <div className="text-sm font-medium mb-2">Permissions</div>
                    <div className="flex flex-wrap gap-1">
                      {plugin.capabilities.map((cap) => (
                        <Badge key={cap} variant="secondary" className="text-xs">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Resource Usage */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3 w-3 text-blue-500" />
                      <span className="text-muted-foreground">Memory:</span>
                      <span>{plugin.memoryUsage}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Eye className="h-3 w-3 text-green-500" />
                      <span className="text-muted-foreground">API Calls:</span>
                      <span>{plugin.apiCalls}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedPlugin(plugin)}
                    >
                      <Settings className="h-3 w-3 mr-1" />
                      Configure
                    </Button>
                    {plugin.status === 'quarantined' && (
                      <Button variant="outline" size="sm">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                    )}
                    {plugin.status === 'active' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleQuarantinePlugin(plugin.id)}
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Quarantine
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="text-destructive">
                      <Trash2 className="h-3 w-3 mr-1" />
                      Uninstall
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}