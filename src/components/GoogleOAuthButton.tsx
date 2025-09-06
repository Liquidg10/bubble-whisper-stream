import React from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface GoogleOAuthButtonProps {
  onSuccess?: (user: any) => void;
  onError?: (error: string) => void;
  className?: string;
  children?: React.ReactNode;
}

export const GoogleOAuthButton: React.FC<GoogleOAuthButtonProps> = ({
  onSuccess,
  onError,
  className,
  children = "Continue with Google"
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    
    try {
      // Google OAuth configuration
      const clientId = "your-google-client-id"; // This should be set in your environment
      const redirectUri = window.location.origin;
      const scope = "openid email profile";
      
      // Build OAuth URL
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scope,
        access_type: 'offline',
        prompt: 'consent'
      });
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      
      // Open popup window
      const popup = window.open(
        authUrl,
        'google-oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      
      // Listen for the authorization code
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setIsLoading(false);
        }
      }, 1000);
      
      // Listen for messages from popup
      const messageListener = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_OAUTH_SUCCESS') {
          clearInterval(checkClosed);
          popup.close();
          window.removeEventListener('message', messageListener);
          
          try {
            // Exchange code for tokens via our edge function
            const { data, error } = await supabase.functions.invoke('oauth-google', {
              body: {
                code: event.data.code,
                redirect_uri: redirectUri
              }
            });
            
            if (error) throw error;
            
            if (data.success) {
              // Store session token
              localStorage.setItem('session_token', data.session_token);
              
              toast({
                title: "Welcome!",
                description: `Successfully signed in as ${data.user.name}`,
              });
              
              onSuccess?.(data.user);
            } else {
              throw new Error(data.error || 'OAuth failed');
            }
          } catch (error: any) {
            console.error('OAuth error:', error);
            toast({
              title: "Sign in failed",
              description: error.message,
              variant: "destructive",
            });
            onError?.(error.message);
          }
          
          setIsLoading(false);
        }
        
        if (event.data.type === 'GOOGLE_OAUTH_ERROR') {
          clearInterval(checkClosed);
          popup.close();
          window.removeEventListener('message', messageListener);
          
          const errorMessage = event.data.error || 'OAuth failed';
          toast({
            title: "Sign in failed",
            description: errorMessage,
            variant: "destructive",
          });
          onError?.(errorMessage);
          setIsLoading(false);
        }
      };
      
      window.addEventListener('message', messageListener);
      
    } catch (error: any) {
      console.error('Google OAuth error:', error);
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
      onError?.(error.message);
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleGoogleLogin}
      disabled={isLoading}
      className={className}
      variant="outline"
    >
      <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
      {isLoading ? 'Signing in...' : children}
    </Button>
  );
};