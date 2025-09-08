import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar, 
  Mail, 
  Wallet, 
  Trash2, 
  Shield, 
  Clock,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { oauthService, OAuthAccount } from '@/services/oauthService';
import { plaidService } from '@/services/plaidService';
import { useToast } from '@/hooks/use-toast';
import { ScopeConsentModal } from './ScopeConsentModal';

interface ConnectedService {
  type: 'oauth' | 'plaid';
  account?: OAuthAccount;
  plaidData?: any;
}

export function OAuthAccountManager() {
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [pendingScopeRequest, setPendingScopeRequest] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadConnectedServices();
  }, []);

  const loadConnectedServices = async () => {
    setIsLoading(true);
    try {
      const [oauthAccounts, plaidAccounts] = await Promise.all([
        oauthService.getConnectedAccounts(),
        plaidService.getAccounts()
      ]);

      const allServices: ConnectedService[] = [
        ...oauthAccounts.map(account => ({ type: 'oauth' as const, account })),
        ...plaidAccounts.map(account => ({ type: 'plaid' as const, plaidData: account }))
      ];

      setServices(allServices);
    } catch (error) {
      console.error('Failed to load connected services:', error);
      toast({
        title: "Load Failed",
        description: "Unable to load connected services",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeAccess = async (service: ConnectedService) => {
    try {
      if (service.type === 'oauth' && service.account) {
        await oauthService.revokeAccess(service.account.id);
        toast({
          title: "Access Revoked",
          description: `${service.account.provider} account disconnected`
        });
      } else if (service.type === 'plaid' && service.plaidData) {
        await plaidService.disconnectAccount(service.plaidData.account_id);
        toast({
          title: "Bank Disconnected",
          description: "Bank account disconnected successfully"
        });
      }
      
      await loadConnectedServices();
    } catch (error) {
      console.error('Failed to revoke access:', error);
      toast({
        title: "Revoke Failed",
        description: "Unable to disconnect account",
        variant: "destructive"
      });
    }
  };

  const getServiceIcon = (service: ConnectedService) => {
    if (service.type === 'plaid') return Wallet;
    if (service.account?.provider === 'google') {
      return service.account.scopes.some(s => s.includes('calendar')) ? Calendar : Mail;
    }
    return Shield;
  };

  const getServiceName = (service: ConnectedService) => {
    if (service.type === 'plaid') return 'Bank Account';
    if (service.account?.provider === 'google') {
      const hasCalendar = service.account.scopes.some(s => s.includes('calendar'));
      const hasEmail = service.account.scopes.some(s => s.includes('gmail'));
      if (hasCalendar && hasEmail) return 'Google (Calendar & Gmail)';
      if (hasCalendar) return 'Google Calendar';
      if (hasEmail) return 'Gmail';
      return 'Google Account';
    }
    return service.account?.provider || 'Unknown';
  };

  const getScopeLevel = (scopes: string[]): { level: string; color: string } => {
    const hasWrite = scopes.some(s => 
      s.includes('calendar') && !s.includes('readonly') || 
      s.includes('compose') || 
      s.includes('modify')
    );
    
    if (hasWrite) {
      return { level: 'Write Access', color: 'bg-red-100 text-red-700' };
    }
    
    const hasRead = scopes.some(s => s.includes('readonly') || s.includes('metadata'));
    if (hasRead) {
      return { level: 'Read Access', color: 'bg-blue-100 text-blue-700' };
    }
    
    return { level: 'Limited', color: 'bg-gray-100 text-gray-700' };
  };

  const formatLastUsed = (date?: string) => {
    if (!date) return 'Never';
    const lastUsed = new Date(date);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Less than 1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} days ago`;
    
    return lastUsed.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connected Services</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading connected services...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Connected Services
          </CardTitle>
        </CardHeader>
        <CardContent>
          {services.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No connected services found. Use the integration plugins to connect your accounts.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {services.map((service, index) => {
                const ServiceIcon = getServiceIcon(service);
                const serviceName = getServiceName(service);

                return (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <ServiceIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="space-y-2">
                          <div>
                            <h4 className="font-medium">{serviceName}</h4>
                            {service.account && (
                              <p className="text-sm text-muted-foreground">
                                {service.account.account_email}
                              </p>
                            )}
                          </div>

                          {/* OAuth Scopes */}
                          {service.account && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const { level, color } = getScopeLevel(service.account.scopes);
                                  return (
                                    <Badge className={color} variant="secondary">
                                      {level}
                                    </Badge>
                                  );
                                })()}
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  Last used: {formatLastUsed(service.account.last_used_at)}
                                </div>
                              </div>
                              
                              {/* Individual Scopes */}
                              <div className="text-xs text-muted-foreground">
                                <details className="cursor-pointer">
                                  <summary className="hover:text-foreground">
                                    View permissions ({service.account.scopes.length})
                                  </summary>
                                  <div className="mt-2 pl-4 space-y-1">
                                    {service.account.scopes.map((scope, idx) => (
                                      <div key={idx} className="font-mono text-xs">
                                        {scope.split('/').pop()}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </div>
                            </div>
                          )}

                          {/* Plaid Account Info */}
                          {service.plaidData && (
                            <div className="space-y-1">
                              <Badge variant="secondary" className="bg-green-100 text-green-700">
                                Read-Only Access
                              </Badge>
                              <p className="text-xs text-muted-foreground">
                                Account: {service.plaidData.name} ({service.plaidData.type})
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {service.account && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Open provider settings
                              const url = service.account?.provider === 'google' 
                                ? 'https://myaccount.google.com/permissions'
                                : '#';
                              window.open(url, '_blank');
                            }}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRevokeAccess(service)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scope Consent Modal */}
      {pendingScopeRequest && (
        <ScopeConsentModal
          open={showScopeModal}
          onOpenChange={setShowScopeModal}
          request={pendingScopeRequest}
          onApprove={(authUrl) => {
            window.open(authUrl, '_blank');
            setShowScopeModal(false);
          }}
          onDeny={() => {
            setShowScopeModal(false);
            setPendingScopeRequest(null);
          }}
        />
      )}
    </>
  );
}