import React from 'react';
import { AlertTriangle, Database, Wifi } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { storageService } from '@/services/storage';

export function StorageStatusIndicator() {
  const [isFallbackMode, setIsFallbackMode] = React.useState(false);

  React.useEffect(() => {
    const checkStatus = () => {
      setIsFallbackMode(storageService.isFallbackMode());
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async () => {
    try {
      await storageService.initialize();
      setIsFallbackMode(false);
    } catch (error) {
      console.error('Failed to retry storage initialization:', error);
    }
  };

  const handleReset = async () => {
    try {
      await storageService.resetDatabase();
      setIsFallbackMode(false);
    } catch (error) {
      console.error('Failed to reset database:', error);
    }
  };

  if (!isFallbackMode) {
    return (
      <Badge variant="outline" className="gap-1">
        <Database className="h-3 w-3" />
        <span className="text-xs">Synced</span>
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        <span className="text-xs">Offline Mode</span>
      </Badge>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={handleRetry}>
          <Wifi className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          Reset DB
        </Button>
      </div>
    </div>
  );
}