import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Laptop, 
  Smartphone, 
  Globe, 
  Users, 
  GitMerge,
  Wifi,
  WifiOff,
  AlertTriangle,
  Clock,
  CheckCircle
} from 'lucide-react';
import { enhancedSyncService } from '@/services/enhancedSyncService';
import { useToast } from '@/hooks/use-toast';

interface SimulatedDevice {
  id: string;
  name: string;
  type: 'laptop' | 'mobile' | 'tablet';
  isActive: boolean;
  lastSeen: Date;
  conflicts: number;
}

interface SimulatedBubble {
  id: string;
  content: string;
  lastModified: Date;
  deviceId: string;
  hasConflict?: boolean;
}

export const DevSyncBasic: React.FC = () => {
  const { toast } = useToast();
  const [devices, setDevices] = useState<SimulatedDevice[]>([
    {
      id: 'device-1',
      name: 'Laptop',
      type: 'laptop',
      isActive: true,
      lastSeen: new Date(),
      conflicts: 0
    },
    {
      id: 'device-2', 
      name: 'Phone',
      type: 'mobile',
      isActive: false,
      lastSeen: new Date(Date.now() - 30000),
      conflicts: 1
    }
  ]);

  const [bubbles, setBubbles] = useState<SimulatedBubble[]>([
    {
      id: 'bubble-1',
      content: 'Test bubble from laptop',
      lastModified: new Date(Date.now() - 60000),
      deviceId: 'device-1'
    },
    {
      id: 'bubble-2',
      content: 'Shopping list: milk, bread, eggs',
      lastModified: new Date(Date.now() - 120000),
      deviceId: 'device-2',
      hasConflict: true
    }
  ]);

  const [selectedDevice, setSelectedDevice] = useState<string>('device-1');
  const [isOnline, setIsOnline] = useState(true);
  const [conflictScenario, setConflictScenario] = useState<string>('none');

  const deviceIcons = {
    laptop: Laptop,
    mobile: Smartphone,
    tablet: Globe
  };

  const simulateDeviceToggle = (deviceId: string) => {
    setDevices(prev => prev.map(device => 
      device.id === deviceId 
        ? { ...device, isActive: !device.isActive, lastSeen: new Date() }
        : device
    ));

    const device = devices.find(d => d.id === deviceId);
    toast({
      title: `Device ${device?.isActive ? 'Disconnected' : 'Connected'}`,
      description: `${device?.name} is now ${device?.isActive ? 'offline' : 'online'}`
    });
  };

  const simulateConflict = () => {
    // Create a conflict scenario
    setBubbles(prev => prev.map(bubble => 
      bubble.id === 'bubble-2'
        ? { ...bubble, hasConflict: true }
        : bubble
    ));

    setDevices(prev => prev.map(device => 
      device.id === 'device-2'
        ? { ...device, conflicts: device.conflicts + 1 }
        : device
    ));

    toast({
      title: "Conflict Simulated",
      description: "Created a sync conflict between devices",
      variant: "destructive"
    });
  };

  const simulateEdit = (bubbleId: string, newContent: string) => {
    setBubbles(prev => prev.map(bubble =>
      bubble.id === bubbleId
        ? { 
            ...bubble, 
            content: newContent, 
            lastModified: new Date(),
            deviceId: selectedDevice
          }
        : bubble
    ));

    toast({
      title: "Edit Simulated",
      description: `Bubble updated from ${devices.find(d => d.id === selectedDevice)?.name}`
    });
  };

  const resolveConflict = (bubbleId: string) => {
    setBubbles(prev => prev.map(bubble =>
      bubble.id === bubbleId
        ? { ...bubble, hasConflict: false }
        : bubble
    ));

    setDevices(prev => prev.map(device => ({
      ...device,
      conflicts: Math.max(0, device.conflicts - 1)
    })));

    toast({
      title: "Conflict Resolved",
      description: "Sync conflict has been resolved"
    });
  };

  const simulateNetworkToggle = () => {
    setIsOnline(!isOnline);
    toast({
      title: isOnline ? "Going Offline" : "Going Online",
      description: isOnline ? "Simulating network disconnection" : "Reconnecting to network"
    });
  };

  const addNewBubble = () => {
    const newBubble: SimulatedBubble = {
      id: `bubble-${Date.now()}`,
      content: `New bubble from ${devices.find(d => d.id === selectedDevice)?.name}`,
      lastModified: new Date(),
      deviceId: selectedDevice
    };

    setBubbles(prev => [...prev, newBubble]);
    
    toast({
      title: "Bubble Created",
      description: `New bubble added from ${devices.find(d => d.id === selectedDevice)?.name}`
    });
  };

  const renderPresenceIndicator = () => {
    const activeDevices = devices.filter(d => d.isActive);
    
    return (
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          {activeDevices.map((device) => {
            const Icon = deviceIcons[device.type];
            return (
              <div
                key={device.id}
                className="w-8 h-8 bg-primary rounded-full flex items-center justify-center border-2 border-background"
                title={device.name}
              >
                <Icon className="h-4 w-4 text-primary-foreground" />
              </div>
            );
          })}
        </div>
        <span className="text-sm text-muted-foreground">
          {activeDevices.length} active
        </span>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sync Development - Basic Testing</h1>
        <div className="flex items-center gap-4">
          {renderPresenceIndicator()}
          <Button
            variant={isOnline ? "default" : "destructive"}
            size="sm"
            onClick={simulateNetworkToggle}
          >
            {isOnline ? <Wifi className="h-4 w-4 mr-2" /> : <WifiOff className="h-4 w-4 mr-2" />}
            {isOnline ? 'Online' : 'Offline'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="devices" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="bubbles">Bubbles</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
          <TabsTrigger value="presence">Presence</TabsTrigger>
        </TabsList>

        <TabsContent value="devices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Connected Devices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {devices.map((device) => {
                  const Icon = deviceIcons[device.type];
                  return (
                    <Card 
                      key={device.id} 
                      className={`p-4 cursor-pointer transition-colors ${
                        selectedDevice === device.id 
                          ? 'ring-2 ring-primary' 
                          : 'hover:bg-accent'
                      } ${!device.isActive ? 'opacity-60' : ''}`}
                      onClick={() => setSelectedDevice(device.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className="h-6 w-6" />
                          <div>
                            <h3 className="font-medium">{device.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {device.isActive ? 'Active' : 'Inactive'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {device.conflicts > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {device.conflicts} conflicts
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant={device.isActive ? "destructive" : "default"}
                            onClick={(e) => {
                              e.stopPropagation();
                              simulateDeviceToggle(device.id);
                            }}
                          >
                            {device.isActive ? 'Disconnect' : 'Connect'}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Last seen: {device.lastSeen.toLocaleTimeString()}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bubbles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Synchronized Bubbles
                <Button onClick={addNewBubble}>Add Bubble</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bubbles.map((bubble) => (
                  <Card key={bubble.id} className={`p-4 ${bubble.hasConflict ? 'border-destructive' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            {devices.find(d => d.id === bubble.deviceId)?.name}
                          </Badge>
                          {bubble.hasConflict && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Conflict
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {bubble.lastModified.toLocaleTimeString()}
                          </span>
                        </div>
                        
                        <Input
                          value={bubble.content}
                          onChange={(e) => simulateEdit(bubble.id, e.target.value)}
                          className="mb-2"
                        />
                      </div>
                      
                      <div className="ml-4 flex items-center gap-2">
                        {bubble.hasConflict && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveConflict(bubble.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conflict Simulation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button onClick={simulateConflict} variant="destructive">
                    <GitMerge className="h-4 w-4 mr-2" />
                    Simulate Conflict
                  </Button>
                  <Button variant="outline">
                    Enable Safe Mode
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-4">
                    <h4 className="font-medium mb-2">Total Conflicts</h4>
                    <div className="text-2xl font-bold text-destructive">
                      {devices.reduce((sum, device) => sum + device.conflicts, 0)}
                    </div>
                  </Card>
                  
                  <Card className="p-4">
                    <h4 className="font-medium mb-2">Auto-Resolved</h4>
                    <div className="text-2xl font-bold text-green-600">0</div>
                  </Card>
                  
                  <Card className="p-4">
                    <h4 className="font-medium mb-2">Manual Review</h4>
                    <div className="text-2xl font-bold text-orange-600">
                      {bubbles.filter(b => b.hasConflict).length}
                    </div>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presence" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Real-time Presence</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {devices.filter(d => d.isActive).map((device) => {
                    const Icon = deviceIcons[device.type];
                    return (
                      <Card key={device.id} className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Icon className="h-6 w-6" />
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></div>
                          </div>
                          <div>
                            <h4 className="font-medium">{device.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              Currently editing bubble-2
                            </p>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
                
                {devices.filter(d => d.isActive).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No active devices. Connect devices to see presence.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};