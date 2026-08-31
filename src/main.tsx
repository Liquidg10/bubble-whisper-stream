import { bootstrapApplication } from './bootstrapApplication';
import { buildDeploymentEnvironment } from './integrations/supabase/deploymentBoundary';

void bootstrapApplication({
  // Read only these fields: passing import.meta.env would embed every VITE_ value.
  environment: buildDeploymentEnvironment({
    VITE_SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_MIND_MANUAL_DEPLOYMENT_MODE: import.meta.env.VITE_MIND_MANUAL_DEPLOYMENT_MODE,
    VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: import.meta.env.VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN,
  }),
  document,
  origin: window.location.origin,
  mount: async root => {
    const { mountApplication } = await import('./mountApplication');
    mountApplication(root);
  },
});
