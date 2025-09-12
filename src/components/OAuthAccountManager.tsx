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
  AlertTriangle,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { oauthService, OAuthAccount, ScopeRequest } from '@/services/oauthService';
import { plaidService } from '@/services/plaidService';
import { useToast } from '@/hooks/use-toast';
import { ScopeConsentModal } from './ScopeConsentModal';
import { ScopeDowngradeModal } from './ScopeDowngradeModal';
import { ScopeStatusIndicator } from './ScopeStatusIndicator';
import { isFeatureEnabled } from '@/config/flags';

interface ConnectedService {
  type: 'oauth' | 'plaid';
  account?: OAuthAccount;
  plaidData?: any;
}

export function OAuthAccountManager() {
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [pendingScopeRequest, setPendingScopeRequest] = useState<any>(null);
  const [isUpdatingScopes, setIsUpdatingScopes] = useState(false);
  const [scopeUpdateStatus, setScopeUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
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

  const getScopeLevel = (scopes: string[]): { level: string; color: string; canUpgrade: boolean; canDowngrade: boolean } => {
    const hasCalendarWrite = scopes.some(s => s.includes('calendar.events'));
    const hasCalendarRead = scopes.some(s => s.includes('calendar.readonly'));
    const hasGmailSend = scopes.some(s => s.includes('gmail.send'));
    const hasGmailModify = scopes.some(s => s.includes('gmail.modify'));
    const hasGmailRead = scopes.some(s => s.includes('gmail.readonly'));
    const hasGmailMetadata = scopes.some(s => s.includes('gmail.metadata'));
    
    // Determine highest permission level
    if (hasGmailSend) {
      return { 
        level: 'Full Access', 
        color: 'bg-red-100 text-red-700',
        canUpgrade: false,
        canDowngrade: true
      };
    }
    
    if (hasCalendarWrite || hasGmailModify) {
      return { 
        level: 'Write Access', 
        color: 'bg-orange-100 text-orange-700',
        canUpgrade: hasGmailModify && !hasGmailSend,
        canDowngrade: true
      };
    }
    
    if (hasCalendarRead || hasGmailRead) {
      return { 
        level: 'Read Access', 
        color: 'bg-blue-100 text-blue-700',
        canUpgrade: true,
        canDowngrade: hasGmailRead || hasCalendarRead
      };
    }
    
    if (hasGmailMetadata) {
      return { 
        level: 'Metadata Only', 
        color: 'bg-green-100 text-green-700',
        canUpgrade: true,
        canDowngrade: false
      };
    }
    
    return { 
      level: 'Limited', 
      color: 'bg-gray-100 text-gray-700',
      canUpgrade: true,
      canDowngrade: false
    };
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

  const handleScopeUpgrade = async (account: OAuthAccount) => {
    setScopeUpdateStatus('loading');
    try {
      const service = account.scopes.some(s => s.includes('calendar')) ? 'calendar' : 'gmail';
      
      // Determine next level scopes
      let requiredScopes: string[] = [];
      if (service === 'calendar') {
        requiredScopes = [
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/calendar.events'
        ];
      } else {
        const hasRead = account.scopes.some(s => s.includes('gmail.readonly'));
        if (!hasRead) {
          requiredScopes = [
            'https://www.googleapis.com/auth/gmail.metadata',
            'https://www.googleapis.com/auth/gmail.readonly'
          ];
        } else {
          requiredScopes = [
            'https://www.googleapis.com/auth/gmail.metadata',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify'
          ];
        }
      }
      
      const scopeRequest: ScopeRequest = {
        provider: 'google',
        service: service === 'gmail' ? 'email' : service,
        reason: `unlock additional ${service} features`,
        requiredScopes,
        accountId: account.id
      };
      
      setPendingScopeRequest(scopeRequest);
      setShowScopeModal(true);
      setScopeUpdateStatus('idle');
    } catch (error) {
      console.error('Failed to upgrade scope:', error);
      setScopeUpdateStatus('error');
      toast({
        title: "Upgrade Failed",
        description: "Unable to upgrade permissions",
        variant: "destructive"
      });
    }
  };

  const handleScopeDowngrade = async (account: OAuthAccount) => {
    try {
      const service = account.scopes.some(s => s.includes('calendar')) ? 'calendar' : 'gmail';
      
      // Determine minimal scopes
      let requiredScopes: string[] = [];
      if (service === 'calendar') {
        requiredScopes = ['https://www.googleapis.com/auth/calendar.readonly'];
      } else {
        requiredScopes = ['https://www.googleapis.com/auth/gmail.metadata'];
      }
      
      const scopeRequest: ScopeRequest = {
        provider: 'google',
        service: service === 'gmail' ? 'email' : service,
        reason: `reduce to minimal ${service} permissions`,
        requiredScopes,
        accountId: account.id
      };
      
      setPendingScopeRequest(scopeRequest);
      setShowDowngradeModal(true);
    } catch (error) {
      console.error('Failed to downgrade scope:', error);
      toast({
        title: "Downgrade Failed",
        description: "Unable to reduce permissions",
        variant: "destructive"
      });
    }
  };

  const handleConfirmDowngrade = async () => {
    if (!pendingScopeRequest) return;
    
    setIsUpdatingScopes(true);
    setScopeUpdateStatus('loading');
    try {
      // For downgrades, we update the scopes directly in the database
      // Since we're reducing permissions, no OAuth flow is needed
      const account = services.find(s => s.account?.id === pendingScopeRequest.accountId)?.account;
      if (account) {
        // Update the account with reduced scopes
        await oauthService.storeTokens({
          ...account,
          scopes: pendingScopeRequest.requiredScopes
        });
        
        setScopeUpdateStatus('success');
        toast({
          title: "Permissions Reduced",
          description: `${pendingScopeRequest.service} permissions successfully reduced`,
        });
        
        await loadConnectedServices();
        
        // Reset status after a short delay
        setTimeout(() => setScopeUpdateStatus('idle'), 2000);
      }
    } catch (error) {
      console.error('Failed to reduce permissions:', error);
      setScopeUpdateStatus('error');
      toast({
        title: "Update Failed",
        description: "Unable to reduce permissions",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingScopes(false);
      setShowDowngradeModal(false);
      setPendingScopeRequest(null);
    }
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
                              <div className="flex items-center gap-2 flex-wrap">
                                {(() => {
                                  const { level, color, canUpgrade, canDowngrade } = getScopeLevel(service.account.scopes);
                                  return (
                                    <>
                                       <Badge className={color} variant="secondary">
                                         {level}
                                       </Badge>
                                       {scopeUpdateStatus !== 'idle' && (
                                         <ScopeStatusIndicator 
                                           status={scopeUpdateStatus} 
                                           message={
                                             scopeUpdateStatus === 'loading' ? 'Updating...' :
                                             scopeUpdateStatus === 'success' ? 'Updated!' :
                                             'Failed'
                                           }
                                         />
                                       )}
                                      {isFeatureEnabled('incrementalOAuth') && (
                                        <div className="flex items-center gap-1">
                                          {canUpgrade && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-6 px-2 text-xs"
                                              onClick={() => handleScopeUpgrade(service.account!)}
                                            >
                                              <ArrowUp className="h-3 w-3 mr-1" />
                                              Upgrade
                                            </Button>
                                          )}
                                          {canDowngrade && (
                                           <Button
                                             size="sm"
                                             variant="ghost"
                                             className="h-6 px-2 text-xs"
                                             onClick={() => handleScopeDowngrade(service.account!)}
                                             disabled={isUpdatingScopes}
                                           >
                                             <ArrowDown className="h-3 w-3 mr-1" />
                                             {isUpdatingScopes ? 'Updating...' : 'Reduce'}
                                           </Button>
                                          )}
                                        </div>
                                      )}
                                    </>
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
      {pendingScopeRequest && showScopeModal && (
        <ScopeConsentModal
          open={showScopeModal}
          onOpenChange={setShowScopeModal}
          request={pendingScopeRequest}
          currentScopes={services.find(s => s.account?.id === pendingScopeRequest.accountId)?.account?.scopes || []}
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

      {/* Scope Downgrade Modal */}
      {pendingScopeRequest && showDowngradeModal && (
        <ScopeDowngradeModal
          open={showDowngradeModal}
          onOpenChange={setShowDowngradeModal}
          request={pendingScopeRequest}
          currentScopes={services.find(s => s.account?.id === pendingScopeRequest.accountId)?.account?.scopes || []}
          onConfirm={handleConfirmDowngrade}
          onCancel={() => {
            setShowDowngradeModal(false);
            setPendingScopeRequest(null);
          }}
        />
      )}
    </>
  );
}