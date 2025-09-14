/**
 * Hook for managing dev routes and navigation
 * Provides centralized access to development pages
 */

import { useNavigate } from 'react-router-dom';
import { isFeatureEnabled } from '@/config/flags';

export interface DevRoute {
  path: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
}

export function useDevRoutes() {
  const navigate = useNavigate();
  const devRoutesEnabled = isFeatureEnabled('cbtDevRoutes');

  const routes: DevRoute[] = [
    {
      path: '/dev/health',
      title: 'Health Dashboard',
      description: 'System health monitoring and validation checks',
      icon: 'Shield',
      enabled: devRoutesEnabled
    },
    {
      path: '/dev/perf-calendar',
      title: 'Calendar Performance',
      description: 'Calendar and Masonry performance metrics',
      icon: 'Monitor',
      enabled: devRoutesEnabled
    },
    {
      path: '/dev/watch-health',
      title: 'Watch Health',
      description: 'Calendar and Gmail watch monitoring',
      icon: 'Eye',
      enabled: devRoutesEnabled
    },
    {
      path: '/dev/mood',
      title: 'Mood Engine',
      description: 'Mood detection and behavioral analytics',
      icon: 'Brain',
      enabled: devRoutesEnabled && isFeatureEnabled('cbtAssist')
    },
    {
      path: '/dev/cbt',
      title: 'CBT System',
      description: 'Cognitive behavioral therapy system diagnostics',
      icon: 'Heart',
      enabled: devRoutesEnabled && isFeatureEnabled('cbtAssist')
    },
    {
      path: '/dev/jit',
      title: 'Performance JIT',
      description: 'Just-in-time performance monitoring',
      icon: 'Zap',
      enabled: devRoutesEnabled
    },
    {
      path: '/dev/p19',
      title: 'Telemetry Dashboard',
      description: 'Unified metrics and canary monitoring',
      icon: 'BarChart3',
      enabled: devRoutesEnabled && isFeatureEnabled('cbtDevRoutes')
    }
  ];

  const navigateToRoute = (path: string) => {
    if (devRoutesEnabled) {
      navigate(path);
    } else {
      console.warn('Dev routes are disabled');
    }
  };

  const getEnabledRoutes = () => routes.filter(route => route.enabled);

  const isRouteEnabled = (path: string) => {
    const route = routes.find(r => r.path === path);
    return route?.enabled || false;
  };

  return {
    routes,
    enabledRoutes: getEnabledRoutes(),
    navigateToRoute,
    isRouteEnabled,
    devRoutesEnabled
  };
}