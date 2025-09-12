import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Eye, 
  Clock, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  Activity,
  FileText,
  Settings
} from 'lucide-react';
import { privacyConsentService } from '@/services/privacyConsentService';
import { privacyEnforcementService } from '@/services/privacyEnforcementService';

interface PrivacyMetric {
  label: string;
  value: number;
  total: number;
  status: 'good' | 'warning' | 'critical';
}

interface PrivacyAuditItem {
  timestamp: number;
  action: string;
  layer: string;
  connector?: string;
  explanation: string[];
}

export function PrivacyDashboard() {
  const [metrics, setMetrics] = useState<PrivacyMetric[]>([]);
  const [auditTrail, setAuditTrail] = useState<PrivacyAuditItem[]>([]);
  const [privacyScore, setPrivacyScore] = useState(0);

  useEffect(() => {
    loadPrivacyData();
  }, []);

  const loadPrivacyData = () => {
    // Load privacy metrics
    const consent = privacyConsentService.getConsentSettings();
    const controls = privacyConsentService.getPrivacyControls();
    const trail = privacyEnforcementService.getPrivacyAuditTrail();
    
    setAuditTrail(trail);

    // Calculate privacy metrics
    const calculatedMetrics: PrivacyMetric[] = [
      {
        label: 'Consent Coverage',
        value: Object.values(consent).filter(v => typeof v === 'boolean' && v).length,
        total: 6,
        status: 'good'
      },
      {
        label: 'Active Integrations',
        value: 6 - controls.disableSpecificIntegrations.length,
        total: 6,
        status: controls.disableSpecificIntegrations.length > 2 ? 'warning' : 'good'
      },
      {
        label: 'Data Retention',
        value: consent.dataRetentionDays,
        total: 90,
        status: consent.dataRetentionDays > 60 ? 'warning' : 'good'
      },
      {
        label: 'Privacy Actions',
        value: trail.length,
        total: 100,
        status: trail.length < 10 ? 'good' : 'warning'
      }
    ];

    setMetrics(calculatedMetrics);

    // Calculate overall privacy score
    const score = calculatedMetrics.reduce((acc, metric) => {
      const percentage = (metric.value / metric.total) * 100;
      return acc + (metric.status === 'good' ? percentage : percentage * 0.7);
    }, 0) / calculatedMetrics.length;

    setPrivacyScore(Math.round(score));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'good':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Eye className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getPrivacyScoreColor = () => {
    if (privacyScore >= 80) return 'text-green-600';
    if (privacyScore >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Privacy Score Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy Dashboard
          </CardTitle>
          <CardDescription>
            Monitor your privacy settings and data handling transparency
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">Privacy Score</span>
                <Badge variant={privacyScore >= 80 ? 'default' : 'secondary'}>
                  {privacyScore >= 80 ? 'Excellent' : privacyScore >= 60 ? 'Good' : 'Needs Attention'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-4xl font-bold ${getPrivacyScoreColor()}`}>
                  {privacyScore}
                </span>
                <span className="text-muted-foreground">/100</span>
              </div>
            </div>
            <div className="w-32 h-32 relative">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={`${privacyScore}, 100`}
                  className={getPrivacyScoreColor()}
                />
              </svg>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="metrics" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="controls">Quick Controls</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {metrics.map((metric, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{metric.label}</span>
                    {getStatusIcon(metric.status)}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{metric.value}</span>
                      <span className="text-muted-foreground">/ {metric.total}</span>
                    </div>
                    <Progress 
                      value={(metric.value / metric.total) * 100} 
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Privacy Audit Trail</CardTitle>
              <CardDescription>
                Recent privacy-related actions and decisions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {auditTrail.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2" />
                    <p>No privacy actions recorded yet</p>
                  </div>
                ) : (
                  auditTrail.slice(0, 20).map((item, index) => (
                    <div key={index} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.action}</span>
                        <Badge variant="outline" className="text-xs">
                          {item.layer} layer
                        </Badge>
                      </div>
                      {item.connector && (
                        <div className="text-xs text-muted-foreground">
                          Connector: {item.connector}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {formatTimestamp(item.timestamp)}
                      </div>
                      {item.explanation.length > 0 && (
                        <div className="text-xs space-y-1">
                          {item.explanation.map((exp, expIndex) => (
                            <div key={expIndex} className="flex items-start gap-1">
                              <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                              <span>{exp}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="controls" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Emergency Controls</CardTitle>
                <CardDescription>
                  One-click privacy actions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => privacyConsentService.pauseLearning()}
                >
                  <Activity className="h-4 w-4 mr-2" />
                  Pause All Learning
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => privacyConsentService.redactLastNDays(7)}
                >
                  <Database className="h-4 w-4 mr-2" />
                  Redact Last 7 Days
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => privacyConsentService.moveToDeepLayer()}
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Move Sensitive to Deep
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Data Insights</CardTitle>
                <CardDescription>
                  Current data usage overview
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span>Surface Layer Data</span>
                  <span className="text-green-600">~2.1 MB</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>Context Layer Data</span>
                  <span className="text-yellow-600">~847 KB</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>Deep Layer Data</span>
                  <span className="text-red-600">~124 KB</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center text-sm font-medium">
                    <span>Total Local Storage</span>
                    <span>~3.1 MB</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}