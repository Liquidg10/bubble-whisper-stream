import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { WifiOff, Wifi } from 'lucide-react';
import { useState, useEffect } from 'react';

export const OfflineStatusBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !wasOffline) return null;

  return (
    <Alert className={`mb-4 ${isOnline ? 'border-green-500 bg-green-50' : 'border-amber-500 bg-amber-50'}`}>
      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi className="h-4 w-4 text-green-600" />
        ) : (
          <WifiOff className="h-4 w-4 text-amber-600" />
        )}
        <AlertDescription className="flex-1">
          {isOnline ? (
            <span className="text-green-800">
              Connection restored. All your data was saved locally while offline.
            </span>
          ) : (
            <span className="text-amber-800">
              You're offline. Don't worry - everything still works and your data is safe.
            </span>
          )}
        </AlertDescription>
        <Badge variant={isOnline ? 'default' : 'secondary'} className="ml-2">
          {isOnline ? 'Online' : 'Offline'}
        </Badge>
      </div>
    </Alert>
  );
};

// Hook version for components that need offline status
export const useOfflineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
};