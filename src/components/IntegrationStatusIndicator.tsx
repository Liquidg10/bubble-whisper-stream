import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Calendar, 
  Mail, 
  CreditCard,
  CheckCircle, 
  AlertCircle,
  Link
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export function IntegrationStatusIndicator() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Mock integration status - in real app this would come from actual integration state
  const integrations = [
    {
      name: 'Gmail',
      icon: Mail,
      connected: !!user, // Assume connected if authenticated
      status: user ? 'active' : 'disconnected',
      path: '/settings/integrations'
    },
    {
      name: 'Calendar',
      icon: Calendar,
      connected: !!user,
      status: user ? 'active' : 'disconnected', 
      path: '/settings/integrations'
    },
    {
      name: 'Banking',
      icon: CreditCard,
      connected: false, // Banking requires explicit setup
      status: 'available',
      path: '/settings/integrations'
    }
  ];

  const connectedCount = integrations.filter(i => i.connected).length;
  const totalCount = integrations.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'disconnected': return 'text-amber-600';
      case 'available': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return CheckCircle;
      case 'disconnected': return AlertCircle;
      case 'available': return Link;
      default: return AlertCircle;
    }
  };

  if (!user) {
    return null; // Hide indicator when not authenticated
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Link className="h-4 w-4" />
          <Badge 
            variant={connectedCount === totalCount ? "default" : "secondary"}
            className="absolute -top-1 -right-1 h-5 w-5 text-xs p-0 flex items-center justify-center"
          >
            {connectedCount}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Integration Status</h4>
            <p className="text-xs text-muted-foreground">
              {connectedCount} of {totalCount} services connected
            </p>
          </div>
          
          <div className="space-y-2">
            {integrations.map((integration) => {
              const StatusIcon = getStatusIcon(integration.status);
              return (
                <div 
                  key={integration.name}
                  className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(integration.path)}
                >
                  <div className="flex items-center gap-2">
                    <integration.icon className="h-4 w-4" />
                    <span className="text-sm">{integration.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusIcon className={`h-3 w-3 ${getStatusColor(integration.status)}`} />
                    <Badge 
                      variant="outline" 
                      className="text-xs capitalize"
                    >
                      {integration.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => navigate('/settings/integrations')}
          >
            Manage Integrations
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}