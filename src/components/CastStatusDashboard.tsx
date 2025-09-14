/**
 * Cast Status Dashboard - Shows active Cast members and their contributions
 * Dev tool for monitoring Cast Synthesizer activity
 */

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  Heart, 
  Target, 
  Users, 
  Zap, 
  Shield, 
  Wind,
  Sun,
  RefreshCw,
  Activity
} from 'lucide-react';
import { castSynthesizer } from '@/services/castSynthesizer';
import { contextualBandits } from '@/services/contextualBandits';
import { isFeatureEnabled } from '@/config/flags';

interface CastMemberStatus {
  name: string;
  active: boolean;
  confidence: number;
  lastActivated: number;
  contributionCount: number;
  icon: React.ReactNode;
  color: string;
}

export const CastStatusDashboard: React.FC = () => {
  const [castMembers, setCastMembers] = useState<CastMemberStatus[]>([]);
  const [banditInsights, setBanditInsights] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const CAST_MEMBER_CONFIGS = {
    'Builder Mode': { icon: <Zap className="h-4 w-4" />, color: 'bg-blue-500' },
    'Clinical Psych': { icon: <Heart className="h-4 w-4" />, color: 'bg-pink-500' },
    'Neurologist': { icon: <Brain className="h-4 w-4" />, color: 'bg-purple-500' },
    'Buddhist/Breathwork': { icon: <Wind className="h-4 w-4" />, color: 'bg-green-500' },
    'Positive Psych': { icon: <Sun className="h-4 w-4" />, color: 'bg-yellow-500' },
    'UX Master': { icon: <Users className="h-4 w-4" />, color: 'bg-orange-500' },
    'Systems Architect': { icon: <Shield className="h-4 w-4" />, color: 'bg-gray-500' },
    'UI Master': { icon: <Target className="h-4 w-4" />, color: 'bg-indigo-500' }
  };

  useEffect(() => {
    loadCastStatus();
    const interval = setInterval(loadCastStatus, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [refreshTrigger]);

  const loadCastStatus = async () => {
    // Simulate Cast member activity data
    const mockData: CastMemberStatus[] = Object.entries(CAST_MEMBER_CONFIGS).map(([name, config]) => ({
      name,
      active: Math.random() > 0.5,
      confidence: Math.random() * 0.4 + 0.6, // 0.6-1.0
      lastActivated: Date.now() - Math.random() * 3600000, // Within last hour
      contributionCount: Math.floor(Math.random() * 20),
      icon: config.icon,
      color: config.color
    }));

    setCastMembers(mockData);

    // Load bandit insights
    if (isFeatureEnabled('cbtAssist')) {
      const insights = contextualBandits.getBanditInsights('demo-user');
      setBanditInsights(insights);
    }
  };

  const getActivityLevel = (member: CastMemberStatus): 'high' | 'medium' | 'low' => {
    if (member.contributionCount > 15) return 'high';
    if (member.contributionCount > 5) return 'medium';
    return 'low';
  };

  const getActivityColor = (level: 'high' | 'medium' | 'low'): string => {
    switch (level) {
      case 'high': return 'text-green-600 dark:text-green-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'low': return 'text-gray-600 dark:text-gray-400';
    }
  };

  const formatLastActive = (timestamp: number): string => {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Cast Status</h2>
          <p className="text-sm text-muted-foreground">
            Monitoring unified AI assistant with multi-expert synthesis
          </p>
        </div>
        <Button 
          onClick={() => setRefreshTrigger(prev => prev + 1)}
          variant="outline"
          size="sm"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overall System Health */}
      <Card className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">System Health</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {castMembers.filter(m => m.active).length}
            </div>
            <div className="text-xs text-muted-foreground">Active Members</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {Math.round(castMembers.reduce((sum, m) => sum + m.confidence, 0) / castMembers.length * 100)}%
            </div>
            <div className="text-xs text-muted-foreground">Avg Confidence</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {castMembers.reduce((sum, m) => sum + m.contributionCount, 0)}
            </div>
            <div className="text-xs text-muted-foreground">Total Contributions</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {banditInsights?.totalContexts || 0}
            </div>
            <div className="text-xs text-muted-foreground">Learned Contexts</div>
          </div>
        </div>
      </Card>

      {/* Cast Member Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {castMembers.map((member) => {
          const activityLevel = getActivityLevel(member);
          
          return (
            <Card key={member.name} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${member.color} text-white`}>
                    {member.icon}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{member.name}</h4>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={member.active ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {member.active ? 'Active' : 'Standby'}
                      </Badge>
                      <span className={`text-xs ${getActivityColor(activityLevel)}`}>
                        {activityLevel} activity
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Confidence</span>
                    <span>{Math.round(member.confidence * 100)}%</span>
                  </div>
                  <Progress 
                    value={member.confidence * 100} 
                    className="h-2"
                  />
                </div>

                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Contributions: {member.contributionCount}</span>
                  <span>{formatLastActive(member.lastActivated)}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Contextual Bandits Insights */}
      {banditInsights && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Learning Insights</h3>
          
          <div className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">Exploration Rate: </span>
              <span className="text-muted-foreground">
                {Math.round(banditInsights.globalExplorationRate * 100)}%
              </span>
            </div>
            
            <div>
              <h4 className="font-medium text-sm mb-2">Top Performing Actions</h4>
              {banditInsights.insights.slice(0, 3).map((insight: any, idx: number) => (
                <div key={idx} className="text-xs p-2 bg-muted rounded mb-1">
                  <div className="font-medium">{insight.context}</div>
                  <div className="text-muted-foreground">
                    {insight.totalAttempts} attempts, {insight.topPerformers.length} learned patterns
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => console.log('Reset Cast learning')}
          >
            Reset Learning
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => console.log('Export Cast data')}
          >
            Export Data
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => console.log('Test Cast response')}
          >
            Test Response
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default CastStatusDashboard;