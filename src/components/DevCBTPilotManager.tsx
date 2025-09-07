/**
 * PROMPT 10: CBT Pilot Manager Component
 * UI for managing pilot cohort and environment configuration
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Users, Plus, X, Download, Upload, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { cbtPilotService } from '@/services/cbtPilotService';

export function DevCBTPilotManager() {
  const [pilotStats, setPilotStats] = useState(cbtPilotService.getPilotStats());
  const [newUserId, setNewUserId] = useState('');
  const [bulkUserIds, setBulkUserIds] = useState('');
  const [envUsers, setEnvUsers] = useState('');

  const refreshStats = () => {
    setPilotStats(cbtPilotService.getPilotStats());
  };

  const handleTogglePilot = (enabled: boolean) => {
    cbtPilotService.setPilotEnabled(enabled);
    refreshStats();
    toast.success(`Pilot program ${enabled ? 'enabled' : 'disabled'}`);
  };

  const handleAddUser = () => {
    if (!newUserId.trim()) return;
    
    cbtPilotService.addUserToPilot(newUserId.trim());
    setNewUserId('');
    refreshStats();
    toast.success(`Added ${newUserId} to pilot`);
  };

  const handleRemoveUser = (userId: string) => {
    cbtPilotService.removeUserFromPilot(userId);
    refreshStats();
    toast.success(`Removed ${userId} from pilot`);
  };

  const handleBulkAdd = () => {
    if (!bulkUserIds.trim()) return;
    
    const userIds = bulkUserIds
      .split('\n')
      .map(id => id.trim())
      .filter(Boolean);
    
    userIds.forEach(userId => {
      cbtPilotService.addUserToPilot(userId);
    });
    
    setBulkUserIds('');
    refreshStats();
    toast.success(`Added ${userIds.length} users to pilot`);
  };

  const handleLoadFromEnv = () => {
    if (!envUsers.trim()) {
      toast.error('Please enter user IDs');
      return;
    }

    // Simulate environment loading by storing in localStorage
    localStorage.setItem('CBT_PILOT_ENV_USERS', envUsers);
    cbtPilotService.loadFromEnvironment();
    refreshStats();
    toast.success('Loaded users from environment configuration');
  };

  const handleExportConfig = () => {
    const config = cbtPilotService.exportConfig();
    const blob = new Blob([config], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cbt-pilot-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset the pilot configuration?')) {
      cbtPilotService.resetPilotConfig();
      refreshStats();
      toast.success('Pilot configuration reset');
    }
  };

  useEffect(() => {
    // Load current environment simulation
    const stored = localStorage.getItem('CBT_PILOT_ENV_USERS');
    if (stored) {
      setEnvUsers(stored);
    }
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Pilot Cohort Management
          </CardTitle>
          <CardDescription>
            Manage user inclusion for CBT feature pilot testing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pilot Status */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="pilot-enabled">Pilot Program Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Controls whether pilot users get CBT features
              </p>
            </div>
            <Switch
              id="pilot-enabled"
              checked={pilotStats.enabled}
              onCheckedChange={handleTogglePilot}
            />
          </div>

          <Separator />

          {/* Current Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{pilotStats.totalUsers}</div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </div>
            <div className="text-center">
              <Badge variant={pilotStats.enabled ? 'default' : 'secondary'}>
                {pilotStats.enabled ? 'Active' : 'Disabled'}
              </Badge>
              <div className="text-sm text-muted-foreground">Status</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{pilotStats.flagOverrides.length}</div>
              <div className="text-sm text-muted-foreground">Flag Overrides</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-mono">
                {pilotStats.lastUpdated ? new Date(pilotStats.lastUpdated).toLocaleDateString() : 'Never'}
              </div>
              <div className="text-sm text-muted-foreground">Last Updated</div>
            </div>
          </div>

          <Separator />

          {/* Add Single User */}
          <div className="space-y-2">
            <Label>Add Single User</Label>
            <div className="flex gap-2">
              <Input
                placeholder="user-id-123"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
              />
              <Button onClick={handleAddUser} disabled={!newUserId.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </div>

          {/* Bulk Add Users */}
          <div className="space-y-2">
            <Label>Bulk Add Users</Label>
            <Textarea
              placeholder="user-1&#10;user-2&#10;user-3"
              value={bulkUserIds}
              onChange={(e) => setBulkUserIds(e.target.value)}
              rows={4}
            />
            <Button onClick={handleBulkAdd} disabled={!bulkUserIds.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Multiple Users
            </Button>
          </div>

          <Separator />

          {/* Environment Configuration */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Environment User List (Production)
            </Label>
            <p className="text-sm text-muted-foreground">
              Simulate loading users from CBT_PILOT_USERS environment variable
            </p>
            <Input
              placeholder="user1,user2,user3"
              value={envUsers}
              onChange={(e) => setEnvUsers(e.target.value)}
            />
            <Button onClick={handleLoadFromEnv} variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Load from Environment
            </Button>
          </div>

          <Separator />

          {/* Current Users */}
          {pilotStats.userList.length > 0 && (
            <div className="space-y-2">
              <Label>Current Pilot Users</Label>
              <div className="flex flex-wrap gap-2">
                {pilotStats.userList.map(userId => (
                  <Badge key={userId} variant="outline" className="flex items-center gap-1">
                    {userId}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-3 w-3 p-0 hover:bg-destructive/20"
                      onClick={() => handleRemoveUser(userId)}
                    >
                      <X className="h-2 w-2" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handleExportConfig} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Config
            </Button>
            <Button onClick={handleReset} variant="destructive">
              Reset All
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}