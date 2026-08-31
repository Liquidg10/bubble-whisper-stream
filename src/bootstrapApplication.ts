import { assertDeploymentOrigin, resolveDeploymentBoundary, type DeploymentEnvironment } from './integrations/supabase/deploymentBoundary';

type BootstrapInputs = {
  environment: DeploymentEnvironment;
  document: Document;
  origin: string | undefined;
  mount: (root: HTMLElement) => Promise<void>;
};

function stopped(document: Document, root: HTMLElement, configuration: boolean): void {
  const panel = document.createElement('main');
  panel.setAttribute('role', 'alert');
  panel.style.cssText = 'font-family:system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:2rem;line-height:1.6;color:#172b32;background:#fff;border:1px solid #ddd;border-radius:1rem';
  const title = document.createElement('h1');
  title.textContent = configuration ? 'App connection paused' : 'App could not start';
  const detail = document.createElement('p');
  detail.textContent = configuration
    ? 'This build is not configured for this address. No app connection was started. Use the correct app address or contact the release owner.'
    : 'The app could not finish loading. Reload this page or contact the release owner. No automatic retry was started.';
  panel.append(title, detail);
  root.replaceChildren(panel);
}

/** App, SDK, services and font-loading CSS are imported only after this check. */
export async function bootstrapApplication({ environment, document, origin, mount }: BootstrapInputs): Promise<'started' | 'blocked' | 'unavailable'> {
  const root = document.getElementById('root') ?? document.body.appendChild(document.createElement('div'));
  try {
    assertDeploymentOrigin(resolveDeploymentBoundary(environment), origin);
  } catch {
    stopped(document, root, true);
    return 'blocked';
  }
  try {
    await mount(root);
    return 'started';
  } catch {
    // An import/mount failure may happen after app work began. Do not make the
    // stopped-before-connection claim used for configuration rejection above.
    stopped(document, root, false);
    return 'unavailable';
  }
}
