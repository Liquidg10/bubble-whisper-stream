import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  CALENDAR_OAUTH_RETURN_PATH,
  clearPendingCalendarOAuth,
  oauthService,
  readPendingCalendarOAuth,
} from '@/services/oauthService';
import { toast } from 'sonner';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const handleAuthCallback = async () => {
      try {
        // Check if this is an OAuth callback with code/error parameters
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const state = searchParams.get('state');
        const hasAmbiguousCalendarParams =
          searchParams.getAll('code').length > 1 ||
          searchParams.getAll('error').length > 1 ||
          searchParams.getAll('state').length !== 1 ||
          Boolean(code && error);
        const isCalendarCallbackRoute = window.location.pathname === '/oauth-callback';

        if (isCalendarCallbackRoute) {
          // Remove the provider code/state from both same-tab and legacy popup
          // Calendar callback URLs before any branch can perform async work.
          window.history.replaceState(
            window.history.state,
            document.title,
            '/oauth-callback',
          );
        }

        if (isCalendarCallbackRoute && !window.opener) {
          const pendingCalendarOAuth = readPendingCalendarOAuth();
          // Consume the browser-side marker before the first await. This makes
          // callback handling one-shot even under React StrictMode or refresh.
          clearPendingCalendarOAuth();

          if (!pendingCalendarOAuth) {
            toast.error('Google Calendar connection failed', {
              description: 'The secure authorization handoff expired or is missing. Start again from Settings.',
            });
            navigate(CALENDAR_OAUTH_RETURN_PATH, { replace: true });
            return;
          }

          if (hasAmbiguousCalendarParams) {
            toast.error('Google Calendar connection failed', {
              description: 'Google returned an invalid authorization response. Start again from Settings.',
            });
            navigate(CALENDAR_OAUTH_RETURN_PATH, { replace: true });
            return;
          }

          if (!state || state !== pendingCalendarOAuth.state) {
            toast.error('Google Calendar connection failed', {
              description: 'The secure authorization state did not match. Start again from Settings.',
            });
            navigate(CALENDAR_OAUTH_RETURN_PATH, { replace: true });
            return;
          }

          if (error) {
            toast.error('Google Calendar access was not granted', {
              description: error === 'access_denied'
                ? 'No Calendar access was saved. You can try again whenever you are ready.'
                : 'Google could not complete Calendar authorization. Try again from Settings.',
            });
            navigate(CALENDAR_OAUTH_RETURN_PATH, { replace: true });
            return;
          }

          if (!code) {
            toast.error('Google Calendar connection failed', {
              description: 'Google returned an incomplete authorization response. Start again from Settings.',
            });
            navigate(CALENDAR_OAUTH_RETURN_PATH, { replace: true });
            return;
          }

          try {
            const receipt = await oauthService.completeGoogleCalendarOAuth(code, state);
            await oauthService.initializeCalendarAccount(receipt.calendarAccountId);
            toast.success('Google Calendar connected', {
              description: 'Calendar events are synced and live updates are active.',
            });
          } catch (calendarError) {
            console.error('Calendar OAuth callback error:', calendarError);
            toast.error('Google Calendar connection failed', {
              description: 'Calendar authorization returned, but secure sync setup did not complete. Try again from Settings.',
            });
          }

          navigate(CALENDAR_OAUTH_RETURN_PATH, { replace: true });
          return;
        }

        if (error) {
          // OAuth error - send to parent window if in popup
          if (window.opener) {
            window.opener.postMessage({
              type: 'GOOGLE_OAUTH_ERROR',
              error,
              state: state || ''
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
