import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, AlertTriangle, PlayCircle } from 'lucide-react';

interface WatchHealthControlsProps {
  onRefresh: () => void;
}

export function WatchHealthControls({ onRefresh }: WatchHealthControlsProps) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');

  const handleRenewalTest = async () => {
    setIsSimulating(true);
    // Simulate renewal operation
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsSimulating(false);
    onRefresh();
  };

  const handle410Simulation = async () => {
    if (!selectedAccount) return;
    
    setIsSimulating(true);
    // Simulate 410 Gone error and recovery
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsSimulating(false);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Manual Renewal Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleRenewalTest}
            disabled={isSimulating}
            className="w-full"
          >
            {isSimulating ? 'Testing Renewal...' : 'Test Manual Renewal'}
          </Button>
          
          <div className="text-sm text-muted-foreground">
            Manually trigger watch renewal for testing purposes
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            410 Gone Error Simulation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-select">Select Account</Label>
            <Input
              id="account-select"
              placeholder="Enter account ID for 410 simulation"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
            />
          </div>
          
          <Button 
            onClick={handle410Simulation}
            disabled={isSimulating || !selectedAccount}
            variant="outline"
            className="w-full"
          >
            {isSimulating ? 'Simulating 410...' : 'Simulate 410 Gone'}
          </Button>
          
          <div className="text-sm text-muted-foreground">
            Simulate a 410 Gone error to test recovery mechanisms
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" />
            Recovery Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" size="sm">
              Reset Failed Watches
            </Button>
            <Button variant="outline" size="sm">
              Force Resync
            </Button>
            <Button variant="outline" size="sm">
              Clear Error State
            </Button>
            <Button variant="outline" size="sm">
              Test Connectivity
            </Button>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">Auto-recovery enabled</span>
              <Badge variant="secondary">✅ Active</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Fallback polling</span>
              <Badge variant="outline">Standby</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}