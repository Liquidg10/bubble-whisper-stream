/**
 * Privacy Layer Inspector - Visualize and test privacy layer data distribution
 * Shows Surface/Context/Deep data with interactive testing controls
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Shield,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Database,
  Settings,
  BarChart3,
  ArrowUpDown,
  TestTube,
  RefreshCw
} from 'lucide-react';
import { privacyConsentService } from '@/services/privacyConsentService';
import { toast } from 'sonner';

interface PrivacyLayerData {
  surface: {
    tasks: number;
    events: number;
    contacts: number;
  };
  context: {
    tasks: number;
    events: number;
    habits: number;
    patterns: number;
  };
  deep: {
    tasks: number;
    events: number;
    sensitive: number;
    traces: number;
  };
}

interface PrivacyControls {
  pauseLearning: boolean;
  redactLastNDays: number;
  moveToDeepLayer: boolean;
  disableSpecificIntegrations: string[];
}

export function PrivacyLayerInspector() {
  const [layerData, setLayerData] = useState<PrivacyLayerData>({
    surface: { tasks: 0, events: 0, contacts: 0 },
    context: { tasks: 0, events: 0, habits: 0, patterns: 0 },
    deep: { tasks: 0, events: 0, sensitive: 0, traces: 0 }
  });
  const [controls, setControls] = useState<PrivacyControls>({
    pauseLearning: false,
    redactLastNDays: 0,
    moveToDeepLayer: false,
    disableSpecificIntegrations: []
  });
  const [selectedLayer, setSelectedLayer] = useState<'surface' | 'context' | 'deep'>('surface');
  const [testMode, setTestMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadPrivacyData = async () => {
    setLoading(true);
    try {
      // Get current privacy controls
      const currentControls = privacyConsentService.getPrivacyControls();
      setControls(currentControls);

      // Simulate privacy layer data distribution
      // In real implementation, this would query actual data stores
      const mockData: PrivacyLayerData = {
        surface: {
          tasks: Math.floor(Math.random() * 100) + 50,
          events: Math.floor(Math.random() * 80) + 30,
          contacts: Math.floor(Math.random() * 200) + 100
        },
        context: {
          tasks: Math.floor(Math.random() * 150) + 75,
          events: Math.floor(Math.random() * 120) + 60,
          habits: Math.floor(Math.random() * 20) + 10,
          patterns: Math.floor(Math.random() * 50) + 25
        },
        deep: {
          tasks: Math.floor(Math.random() * 50) + 10,
          events: Math.floor(Math.random() * 30) + 5,
          sensitive: Math.floor(Math.random() * 25) + 5,
          traces: Math.floor(Math.random() * 100) + 50
        }
      };

      setLayerData(mockData);
    } catch (error) {
      console.error('Error loading privacy data:', error);
      toast.error('Failed to load privacy data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrivacyData();
  }, []);

  const getTotalItems = () => {
    const surface = Object.values(layerData.surface).reduce((a, b) => a + b, 0);
    const context = Object.values(layerData.context).reduce((a, b) => a + b, 0);
    const deep = Object.values(layerData.deep).reduce((a, b) => a + b, 0);
    return surface + context + deep;
  };

  const getLayerPercentage = (layer: 'surface' | 'context' | 'deep') => {
    const total = getTotalItems();
    if (total === 0) return 0;
    const layerTotal = Object.values(layerData[layer]).reduce((a, b) => a + b, 0);
    return (layerTotal / total) * 100;
  };

  const getLayerColor = (layer: 'surface' | 'context' | 'deep') => {
    switch (layer) {
      case 'surface': return 'text-green-600';
      case 'context': return 'text-yellow-600';
      case 'deep': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const simulateLayerMovement = async (fromLayer: string, toLayer: string, itemType: string, count: number) => {
    setTestMode(true);
    try {
      // Simulate moving data between privacy layers
      const from = fromLayer as keyof PrivacyLayerData;
      const to = toLayer as keyof PrivacyLayerData;
      const type = itemType as keyof typeof layerData.surface;

      if (layerData[from][type] >= count) {
        setLayerData(prev => ({
          ...prev,
          [from]: {
            ...prev[from],
            [type]: prev[from][type] - count
          },
          [to]: {
            ...prev[to],
            [type]: (prev[to][type] || 0) + count
          }
        }));

        toast.success(`Moved ${count} ${itemType} from ${fromLayer} to ${toLayer}`);
      } else {
        toast.error(`Not enough ${itemType} in ${fromLayer} layer`);
      }
    } catch (error) {
      console.error('Error simulating layer movement:', error);
      toast.error('Failed to simulate layer movement');
    } finally {
      setTestMode(false);
    }
  };

  const togglePrivacyControl = (control: keyof PrivacyControls) => {
    const newValue = !controls[control];
    setControls(prev => ({ ...prev, [control]: newValue }));
    
    switch (control) {
      case 'pauseLearning':
        if (newValue) {
          privacyConsentService.pauseLearning();
        } else {
          privacyConsentService.resumeLearning();
        }
        break;
      case 'moveToDeepLayer':
        if (newValue) {
          privacyConsentService.moveToDeepLayer();
        }
        break;
    }
    
    toast.success(`${control} ${newValue ? 'enabled' : 'disabled'}`);
  };

  const performRedaction = (days: number) => {
    privacyConsentService.redactLastNDays(days);
    setControls(prev => ({ ...prev, redactLastNDays: days }));
    
    // Simulate data reduction
    const reductionFactor = Math.min(0.5, days / 30);
    setLayerData(prev => ({
      surface: {
        tasks: Math.floor(prev.surface.tasks * (1 - reductionFactor)),
        events: Math.floor(prev.surface.events * (1 - reductionFactor)),
        contacts: prev.surface.contacts // Contacts not affected by redaction
      },
      context: {
        tasks: Math.floor(prev.context.tasks * (1 - reductionFactor)),
        events: Math.floor(prev.context.events * (1 - reductionFactor)),
        habits: Math.floor(prev.context.habits * (1 - reductionFactor)),
        patterns: Math.floor(prev.context.patterns * (1 - reductionFactor))
      },
      deep: prev.deep // Deep layer protected from automatic redaction
    }));
    
    toast.success(`Redacted last ${days} days of data`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Privacy Layer Inspector</CardTitle>
              {testMode && <Badge variant="outline">Test Mode</Badge>}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadPrivacyData}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className={`text-2xl font-bold ${getLayerColor('surface')}`}>
                {getLayerPercentage('surface').toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">Surface Layer</div>
              <div className="text-xs text-green-600">Public data</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getLayerColor('context')}`}>
                {getLayerPercentage('context').toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">Context Layer</div>
              <div className="text-xs text-yellow-600">Pattern data</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getLayerColor('deep')}`}>
                {getLayerPercentage('deep').toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">Deep Layer</div>
              <div className="text-xs text-red-600">Sensitive data</div>
            </div>
          </div>

          <Tabs defaultValue="distribution" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="distribution">Distribution</TabsTrigger>
              <TabsTrigger value="controls">Controls</TabsTrigger>
              <TabsTrigger value="testing">Testing</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
            </TabsList>

            <TabsContent value="distribution">
              <div className="space-y-4">
                {(['surface', 'context', 'deep'] as const).map(layer => (
                  <div key={layer} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium capitalize flex items-center gap-2">
                        {layer === 'surface' && <Eye className="h-4 w-4 text-green-600" />}
                        {layer === 'context' && <Database className="h-4 w-4 text-yellow-600" />}
                        {layer === 'deep' && <Lock className="h-4 w-4 text-red-600" />}
                        {layer} Layer
                      </h4>
                      <Badge variant="outline">
                        {Object.values(layerData[layer]).reduce((a, b) => a + b, 0)} items
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      {Object.entries(layerData[layer]).map(([type, count]) => (
                        <div key={type} className="flex justify-between">
                          <span className="capitalize">{type}:</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                    
                    <Progress value={getLayerPercentage(layer)} className="h-2" />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="controls">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Privacy Controls
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Pause Learning</span>
                        <Button
                          variant={controls.pauseLearning ? "default" : "outline"}
                          size="sm"
                          onClick={() => togglePrivacyControl('pauseLearning')}
                        >
                          {controls.pauseLearning ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Move to Deep Layer</span>
                        <Button
                          variant={controls.moveToDeepLayer ? "default" : "outline"}
                          size="sm"
                          onClick={() => togglePrivacyControl('moveToDeepLayer')}
                        >
                          {controls.moveToDeepLayer ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h4 className="font-medium mb-3">Data Redaction</h4>
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        Last redaction: {controls.redactLastNDays} days ago
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => performRedaction(7)}
                        >
                          7 days
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => performRedaction(30)}
                        >
                          30 days
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="testing">
              <div className="space-y-4">
                <Card className="p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Layer Movement Testing
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">From Layer</label>
                      <Select defaultValue="surface">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="surface">Surface</SelectItem>
                          <SelectItem value="context">Context</SelectItem>
                          <SelectItem value="deep">Deep</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">To Layer</label>
                      <Select defaultValue="context">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="surface">Surface</SelectItem>
                          <SelectItem value="context">Context</SelectItem>
                          <SelectItem value="deep">Deep</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => simulateLayerMovement('surface', 'context', 'tasks', 5)}
                      disabled={testMode}
                    >
                      <ArrowUpDown className="h-4 w-4 mr-1" />
                      Move 5 Tasks
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => simulateLayerMovement('context', 'deep', 'events', 3)}
                      disabled={testMode}
                    >
                      Move 3 Events
                    </Button>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="compliance">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Consent Status</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Telemetry</span>
                        <Badge variant={privacyConsentService.canCollectData('telemetry') ? 'default' : 'outline'}>
                          {privacyConsentService.canCollectData('telemetry') ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Analytics</span>
                        <Badge variant={privacyConsentService.canCollectData('analytics') ? 'default' : 'outline'}>
                          {privacyConsentService.canCollectData('analytics') ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Personal Data</span>
                        <Badge variant={privacyConsentService.canCollectData('personal') ? 'default' : 'outline'}>
                          {privacyConsentService.canCollectData('personal') ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Data Export</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Can Export Basic</span>
                        <Badge variant={privacyConsentService.canExportData(false) ? 'default' : 'outline'}>
                          {privacyConsentService.canExportData(false) ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Can Export PII</span>
                        <Badge variant={privacyConsentService.canExportData(true) ? 'default' : 'outline'}>
                          {privacyConsentService.canExportData(true) ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Consent Current</span>
                        <Badge variant={privacyConsentService.isConsentCurrent() ? 'default' : 'destructive'}>
                          {privacyConsentService.isConsentCurrent() ? 'Current' : 'Outdated'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}