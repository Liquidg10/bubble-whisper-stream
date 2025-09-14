/**
 * Labs Settings - Experimental Features Control
 * Provides access to beta features and experimental capabilities
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFeatureFlags } from '@/components/FeatureFlags';
import { shouldShowFeature, setRolloutOverride, getRolloutStatus } from '@/utils/gradualRollout';
import { Brain, Sparkles, TestTube, Zap, Eye, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function LabsSettings() {
  const { flags, updateFlag, isFeatureEnabled } = useFeatureFlags();
  const navigate = useNavigate();
  const rolloutStatus = getRolloutStatus();

  const experimentalFeatures = [
    {
      key: 'cbtEnabled' as keyof typeof flags,
      title: 'CBT Intelligence',
      description: 'Cognitive behavioral therapy insights and support',
      icon: Brain,
      category: 'AI',
      enabled: isFeatureEnabled('cbtEnabled'),
      rolloutFeature: 'predictiveIntelligence'
    },
    {
      key: 'pinboardView' as keyof typeof flags,
      title: 'Pinboard View',
      description: 'Masonry-style task visualization',
      icon: Sparkles,
      category: 'Views',
      enabled: isFeatureEnabled('pinboardView'),
      rolloutFeature: 'masonryView'
    },
    {
      key: 'calendarAIIntegration' as keyof typeof flags,
      title: 'Calendar AI',
      description: 'Smart calendar integration and scheduling',
      icon: Calendar,
      category: 'Integrations',
      enabled: isFeatureEnabled('calendarAIIntegration'),
      rolloutFeature: 'calendarAI'
    },
    {
      key: 'performanceMonitoringEnabled' as keyof typeof flags,
      title: 'Performance Monitoring',
      description: 'Real-time app performance insights',
      icon: Zap,
      category: 'Performance',
      enabled: isFeatureEnabled('performanceMonitoringEnabled'),
      rolloutFeature: 'performanceMonitoring'
    },
    {
      key: 'devRoutes' as keyof typeof flags,
      title: 'Developer Routes',
      description: 'Access to development and testing tools',
      icon: TestTube,
      category: 'Development',
      enabled: isFeatureEnabled('devRoutes'),
      rolloutFeature: null
    }
  ];

  const handleFeatureToggle = (featureKey: keyof typeof flags, enabled: boolean) => {
    updateFlag(featureKey, enabled);
  };

  const handleRolloutOverride = (rolloutFeature: string, enabled: boolean) => {
    setRolloutOverride(rolloutFeature, enabled);
    window.location.reload(); // Refresh to apply rollout changes
  };

  const getRolloutBadge = (rolloutFeature: string | null) => {
    if (!rolloutFeature || !rolloutStatus[rolloutFeature]) return null;
    
    const status = rolloutStatus[rolloutFeature];
    const percentage = status.percentage;
    
    if (percentage === 100) {
      return <Badge variant="outline" className="text-xs">Full Release</Badge>;
    } else if (percentage >= 75) {
      return <Badge variant="secondary" className="text-xs">Wide Beta</Badge>;
    } else if (percentage >= 25) {
      return <Badge variant="secondary" className="text-xs">Limited Beta</Badge>;
    } else {
      return <Badge variant="secondary" className="text-xs">Early Access</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Labs</h2>
        <p className="text-muted-foreground">
          Experimental features and early access capabilities. Use with caution in production workflows.
        </p>
      </div>

      {/* Feature Categories */}
      {['AI', 'Views', 'Integrations', 'Performance', 'Development'].map(category => {
        const categoryFeatures = experimentalFeatures.filter(f => f.category === category);
        if (categoryFeatures.length === 0) return null;

        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {category === 'AI' && <Brain className="h-5 w-5" />}
                {category === 'Views' && <Eye className="h-5 w-5" />}
                {category === 'Integrations' && <Zap className="h-5 w-5" />}
                {category === 'Performance' && <Zap className="h-5 w-5" />}
                {category === 'Development' && <TestTube className="h-5 w-5" />}
                {category}
              </CardTitle>
              <CardDescription>
                {category === 'AI' && 'Intelligence and predictive features'}
                {category === 'Views' && 'Alternative task visualization modes'}
                {category === 'Integrations' && 'External service connections'}
                {category === 'Performance' && 'System optimization features'}
                {category === 'Development' && 'Tools for testing and debugging'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {categoryFeatures.map(feature => (
                  <div key={feature.key} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <feature.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{feature.title}</h4>
                          {getRolloutBadge(feature.rolloutFeature)}
                        </div>
                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                        {feature.rolloutFeature && rolloutStatus[feature.rolloutFeature] && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Rollout: {rolloutStatus[feature.rolloutFeature].percentage}% | 
                            Status: {rolloutStatus[feature.rolloutFeature].enabled ? 'Active' : 'Inactive'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {feature.rolloutFeature && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRolloutOverride(feature.rolloutFeature!, !shouldShowFeature(feature.rolloutFeature!))}
                          className="text-xs"
                        >
                          {shouldShowFeature(feature.rolloutFeature!) ? 'Force Off' : 'Force On'}
                        </Button>
                      )}
                      <Switch
                        checked={feature.enabled}
                        onCheckedChange={(checked) => handleFeatureToggle(feature.key, checked)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Shortcuts to experimental features and tools
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/intelligence-lab')}
              className="flex items-center gap-2"
            >
              <Brain className="h-4 w-4" />
              Intelligence Lab
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/pinboard')}
              className="flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Pinboard View
            </Button>
            {isFeatureEnabled('devRoutes') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/dev/gradual-rollout')}
                className="flex items-center gap-2"
              >
                <TestTube className="h-4 w-4" />
                Dev Tools
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}