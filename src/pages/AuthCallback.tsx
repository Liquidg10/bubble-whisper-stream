import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check if this is an OAuth callback with code/error parameters
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const state = searchParams.get('state');

        if (error) {
          // OAuth error - send to parent window if in popup
          if (window.opener) {
            window.opener.postMessage({
              type: 'GOOGLE_OAUTH_ERROR',
              error: error
            }, window.location.origin);
            window.close();
            return;
          }
          toast.error(`Authentication failed: ${error}`);
          navigate('/');
          return;
        }

        if (code && state) {
          // OAuth success - send to parent window if in popup
          if (window.opener) {
            window.opener.postMessage({
              type: 'GOOGLE_OAUTH_SUCCESS',
              code: code,
              state: state
            }, window.location.origin);
            window.close();
            return;
          }
          
          // If not in popup, handle the OAuth flow directly
          toast.success('OAuth completed successfully');
          navigate('/');
          return;
        }

        // Fallback to Supabase session handling
        const { data, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Auth callback error:', sessionError);
          toast.error('Authentication failed');
          navigate('/');
          return;
        }

        if (data.session) {
          toast.success('Successfully signed in!');
          navigate('/');
        } else {
          toast.error('No session found');
          navigate('/');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        toast.error('Authentication failed');
        navigate('/');
      }
    };

    handleAuthCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing authentication...</p>
      </div>
    </div>
  );
};