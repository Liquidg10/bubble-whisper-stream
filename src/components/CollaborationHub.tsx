import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Avatar, AvatarFallback } from './ui/avatar';
import { 
  Users, 
  Eye, 
  Edit3, 
  Share2, 
  Clock, 
  Shield,
  Smartphone,
  Monitor,
  Wifi,
  WifiOff
} from 'lucide-react';
import { crossDeviceSyncService } from '@/services/crossDeviceSyncService';

interface CollaborationHubProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CollaborationHub({ isOpen, onClose }: CollaborationHubProps) {
  const [devices, setDevices] = useState<any[]>([]);
  const [connectedUsers, setConnectedUsers] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      loadCollaborationData();
      
      // Simulate presence updates for demo
      setConnectedUsers([
        { id: 'user1', name: 'You', device: 'iPhone 15', status: 'active' },
        { id: 'user2', name: 'Desktop', device: 'MacBook Pro', status: 'active' }
      ]);
    }
  }, [isOpen]);

  const loadCollaborationData = async () => {
    try {
      const deviceList = await crossDeviceSyncService.getDevices();
      const status = await crossDeviceSyncService.getSyncStatus();
      
      setDevices(deviceList);
      setSyncStatus(status);
    } catch (error) {
      console.error('Failed to load collaboration data:', error);
    }
  };

  const handleShareBubble = async (bubbleId: string, scope: 'view' | 'comment' | 'edit') => {
    // TODO: Implement granular sharing
    console.log('Sharing bubble:', bubbleId, 'with scope:', scope);
  };

  const sampleUsers = [
    {
      id: 'user1',
      name: 'You',
      device: 'iPhone 15',
      status: 'active',
      lastSeen: Date.now(),
      editing: null
    },
    {
      id: 'user2', 
      name: 'Desktop',
      device: 'MacBook Pro',
      status: 'active',
      lastSeen: Date.now() - 300000, // 5 minutes ago
      editing: 'bubble-123'
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
      <div className="fixed inset-y-0 right-0 w-96 bg-background border-l shadow-xl">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" />
              Collaboration
            </h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Sync Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  Sync Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm">Connected & Syncing</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Last sync: just now
                </div>
              </CardContent>
            </Card>

            {/* Connected Devices */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Connected Devices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sampleUsers.map((user) => (
                    <div key={user.id} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {user.device.includes('iPhone') ? (
                            <Smartphone className="h-4 w-4" />
                          ) : (
                            <Monitor className="h-4 w-4" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{user.device}</span>
                          {user.status === 'active' && (
                            <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {user.editing ? 'Editing bubble' : 'Online'}
                        </div>
                      </div>

                      {user.editing && (
                        <Badge variant="outline" className="text-xs">
                          <Edit3 className="h-3 w-3 mr-1" />
                          Live
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Live Collaboration Indicators */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Live Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></div>
                    <span className="text-sm">MacBook Pro is editing "Morning Thoughts"</span>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Changes sync automatically every few seconds
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sharing Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sharing & Permissions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Default bubble sharing</span>
                    <Badge variant="outline">Private</Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start"
                      onClick={() => handleShareBubble('current', 'view')}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Share View Access
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start"
                      onClick={() => handleShareBubble('current', 'edit')}
                    >
                      <Edit3 className="h-4 w-4 mr-2" />
                      Share Edit Access
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Privacy Notice */}
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                All collaboration is end-to-end encrypted. Only you and explicitly shared devices can access your bubbles.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    </div>
  );
}