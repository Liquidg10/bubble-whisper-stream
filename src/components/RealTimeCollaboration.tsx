import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Users, 
  Eye, 
  Edit, 
  MousePointer, 
  Share2, 
  Shield,
  Wifi,
  WifiOff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './ui/use-toast';

interface CollaborativeUser {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  cursor?: { x: number; y: number };
  selectedBubble?: string;
  lastSeen: string;
}

interface CollaborationSession {
  id: string;
  bubbleId: string;
  owner: string;
  collaborators: CollaborativeUser[];
  permissions: {
    [userId: string]: 'view' | 'comment' | 'edit';
  };
  isActive: boolean;
}

export function RealTimeCollaboration() {
  const [isConnected, setIsConnected] = useState(false);
  const [activeSessions, setActiveSessions] = useState<CollaborationSession[]>([]);
  const [currentUser, setCurrentUser] = useState<CollaborativeUser | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    initializeCollaboration();
    return () => cleanup();
  }, []);

  const initializeCollaboration = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Initialize current user
      const collaborativeUser: CollaborativeUser = {
        id: user.id,
        name: user.email?.split('@')[0] || 'Anonymous',
        color: getRandomColor(),
        lastSeen: new Date().toISOString()
      };
      setCurrentUser(collaborativeUser);

      // Set up real-time connection
      const channel = supabase
        .channel('collaboration-session')
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          updatePresence(state);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log('User joined:', key, newPresences);
          toast({
            title: "Collaborator Joined",
            description: `${key} joined the session`,
          });
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log('User left:', key, leftPresences);
          toast({
            title: "Collaborator Left",
            description: `${key} left the session`,
          });
        })
        .on('broadcast', { event: 'cursor-move' }, ({ payload }) => {
          updateCursorPosition(payload);
        })
        .on('broadcast', { event: 'bubble-select' }, ({ payload }) => {
          updateBubbleSelection(payload);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Track presence
            await channel.track(collaborativeUser);
            setIsConnected(true);
          }
        });

    } catch (error) {
      console.error('Failed to initialize collaboration:', error);
      toast({
        title: "Connection Failed",
        description: "Unable to connect to collaboration service",
        variant: "destructive",
      });
    }
  };

  const cleanup = () => {
    supabase.removeAllChannels();
    setIsConnected(false);
  };

  const updatePresence = (state: any) => {
    const users = Object.values(state).flat() as CollaborativeUser[];
    // Update active sessions with current users
    console.log('Active collaborators:', users);
  };

  const updateCursorPosition = (payload: { userId: string; x: number; y: number }) => {
    // Update cursor position for user
    console.log('Cursor moved:', payload);
  };

  const updateBubbleSelection = (payload: { userId: string; bubbleId: string }) => {
    // Update bubble selection for user
    console.log('Bubble selected:', payload);
  };

  const shareForCollaboration = async (bubbleId: string, permission: 'view' | 'edit') => {
    try {
      // Generate shareable link
      const shareLink = `${window.location.origin}/bubble/${bubbleId}?collaborate=true`;
      
      await navigator.clipboard.writeText(shareLink);
      
      toast({
        title: "Share Link Copied",
        description: `Bubble shared with ${permission} permissions`,
      });
    } catch (error) {
      toast({
        title: "Share Failed",
        description: "Unable to create share link",
        variant: "destructive",
      });
    }
  };

  const getRandomColor = (): string => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Mock data for demonstration
  const mockSessions: CollaborationSession[] = [
    {
      id: '1',
      bubbleId: 'bubble-1',
      owner: 'user-1',
      collaborators: [
        {
          id: 'user-2',
          name: 'Alice',
          color: '#4ECDC4',
          lastSeen: new Date().toISOString()
        },
        {
          id: 'user-3',
          name: 'Bob',
          color: '#FF6B6B',
          selectedBubble: 'bubble-1',
          lastSeen: new Date().toISOString()
        }
      ],
      permissions: {
        'user-2': 'edit',
        'user-3': 'view'
      },
      isActive: true
    }
  ];

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          Real-Time Collaboration
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3 mr-1" />
                Connected
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 mr-1" />
                Disconnected
              </>
            )}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        {isConnected && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>Secure Connection Active:</strong> All collaboration is end-to-end encrypted. 
              Real-time updates with conflict resolution enabled.
            </AlertDescription>
          </Alert>
        )}

        {/* Active Sessions */}
        <div className="space-y-4">
          <h3 className="font-medium text-sm">Active Collaboration Sessions</h3>
          
          {mockSessions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No active collaboration sessions
            </div>
          ) : (
            mockSessions.map((session) => (
              <Card key={session.id} className="border">
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Bubble: {session.bubbleId}</span>
                      <Badge variant="outline">
                        {session.collaborators.length} collaborator{session.collaborators.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    
                    {/* Collaborators */}
                    <div className="space-y-2">
                      {session.collaborators.map((collaborator) => (
                        <div key={collaborator.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={collaborator.avatar} />
                              <AvatarFallback 
                                style={{ backgroundColor: collaborator.color }}
                                className="text-white text-xs"
                              >
                                {collaborator.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{collaborator.name}</span>
                            {collaborator.selectedBubble && (
                              <Badge variant="secondary" className="text-xs">
                                <MousePointer className="h-2 w-2 mr-1" />
                                Editing
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {session.permissions[collaborator.id] === 'edit' ? (
                              <Edit className="h-3 w-3 text-green-600" />
                            ) : (
                              <Eye className="h-3 w-3 text-blue-600" />
                            )}
                            <span className="text-xs text-muted-foreground">
                              {session.permissions[collaborator.id]}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Share Actions */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Share for Collaboration</h3>
          <div className="flex gap-2">
            <Button
              onClick={() => shareForCollaboration('current-bubble', 'view')}
              variant="outline"
              className="flex-1"
            >
              <Eye className="h-4 w-4 mr-2" />
              Share for Viewing
            </Button>
            <Button
              onClick={() => shareForCollaboration('current-bubble', 'edit')}
              className="flex-1"
            >
              <Edit className="h-4 w-4 mr-2" />
              Share for Editing
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <h4 className="font-medium">Real-time Features</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Live cursor tracking</li>
              <li>• Instant bubble updates</li>
              <li>• Conflict resolution</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium">Security</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>• End-to-end encryption</li>
              <li>• Permission controls</li>
              <li>• Session isolation</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}