import React, { useState, useEffect } from 'react';
import { IntelligenceHubExtension } from '@/components/intelligence/IntelligenceHubExtension';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmailIntegrationHub } from '@/components/EmailIntegrationHub';
import { FinancialTaskDashboard } from '@/components/FinancialTaskDashboard';
import { SmartFinancialInsights } from '@/components/SmartFinancialInsights';
import { crossDomainIntelligenceService, CrossDomainSuggestion } from '@/services/crossDomainIntelligenceService';
import { Brain, Mail, DollarSign, Link, AlertTriangle, CheckCircle, TrendingUp, Zap } from 'lucide-react';

interface UnifiedIntelligenceHubProps {
  className?: string;
}

export const UnifiedIntelligenceHub: React.FC<UnifiedIntelligenceHubProps> = ({ className }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [crossDomainSuggestions, setCrossDomainSuggestions] = useState<CrossDomainSuggestion[]>([]);
  const [intelligenceMetrics, setIntelligenceMetrics] = useState({
    emailProcessed: 0,
    financialTasksCreated: 0,
    crossDomainConnections: 0,
    automationRate: 0,
    duplicatesDetected: 0,
  });

  useEffect(() => {
    loadIntelligenceData();
  }, []);

  const loadIntelligenceData = async () => {
    try {
      const context = crossDomainIntelligenceService.getContext();
      setCrossDomainSuggestions(context.suggestions);
      
      // Calculate metrics from context
      setIntelligenceMetrics({
        emailProcessed: context.emailFinancialClassifications.size,
        financialTasksCreated: context.financialEmailMappings.size,
        crossDomainConnections: Array.from(context.financialEmailMappings.values()).flat().length,
        automationRate: context.emailFinancialClassifications.size > 0 
          ? (context.financialEmailMappings.size / context.emailFinancialClassifications.size) * 100 
          : 0,
        duplicatesDetected: Array.from(context.duplicateDetections.values()).flat().length,
      });
    } catch (error) {
      console.error('Error loading intelligence data:', error);
    }
  };

  const handleSuggestionAction = async (suggestion: CrossDomainSuggestion, action: 'accept' | 'dismiss') => {
    try {
      if (action === 'accept') {
        // Implement suggestion acceptance logic
        console.log('Accepting suggestion:', suggestion);
        // Remove from suggestions
        setCrossDomainSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      } else {
        // Remove from suggestions
        setCrossDomainSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      }
    } catch (error) {
      console.error('Error handling suggestion action:', error);
    }
  };

  const renderOverviewMetrics = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{intelligenceMetrics.emailProcessed}</div>
          <p className="text-xs text-muted-foreground">Emails analyzed</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Financial Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{intelligenceMetrics.financialTasksCreated}</div>
          <p className="text-xs text-muted-foreground">Auto-created from emails</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Link className="h-4 w-4 text-primary" />
            Cross-Domain Links
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{intelligenceMetrics.crossDomainConnections}</div>
          <p className="text-xs text-muted-foreground">Email-financial connections</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Automation Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{intelligenceMetrics.automationRate.toFixed(1)}%</div>
          <Progress value={intelligenceMetrics.automationRate} className="mt-2" />
          <p className="text-xs text-muted-foreground mt-1">Email-to-task conversion</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Duplicates Detected
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{intelligenceMetrics.duplicatesDetected}</div>
          <p className="text-xs text-muted-foreground">Prevented duplicates</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Intelligence Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {Math.round((intelligenceMetrics.automationRate + (intelligenceMetrics.crossDomainConnections * 5)) / 2)}
          </div>
          <p className="text-xs text-muted-foreground">Overall efficiency</p>
        </CardContent>
      </Card>
    </div>
  );

  const renderCrossDomainSuggestions = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Smart Suggestions
        </CardTitle>
        <CardDescription>
          AI-powered recommendations based on email and financial patterns
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {crossDomainSuggestions.length === 0 ? (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              No suggestions at the moment. Your email and financial data are well-organized!
            </AlertDescription>
          </Alert>
        ) : (
          crossDomainSuggestions.map((suggestion) => (
            <div key={suggestion.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={suggestion.type === 'email_to_financial' ? 'default' : 'secondary'}>
                      {suggestion.type.replace('_', ' ')}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {Math.round(suggestion.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-sm font-medium">{suggestion.reason}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleSuggestionAction(suggestion, 'accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSuggestionAction(suggestion, 'dismiss')}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
              
              {suggestion.suggestedTask && (
                <div className="bg-muted/50 rounded p-3">
                  <p className="text-sm font-medium">{suggestion.suggestedTask.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {suggestion.suggestedTask.description?.slice(0, 100)}...
                  </p>
                </div>
              )}
              
              {suggestion.suggestedEmail && (
                <div className="bg-muted/50 rounded p-3">
                  <p className="text-sm font-medium">Email: {suggestion.suggestedEmail.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    To: {suggestion.suggestedEmail.to.join(', ') || 'To be determined'}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className={className}>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Brain className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Intelligence Hub</h1>
            <p className="text-muted-foreground">
              Unified email and financial intelligence with cross-domain automation
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="email">Email Intelligence</TabsTrigger>
          <TabsTrigger value="financial">Financial Intelligence</TabsTrigger>
          <TabsTrigger value="insights">Smart Insights</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {renderOverviewMetrics()}
          {renderCrossDomainSuggestions()}
        </TabsContent>

        <TabsContent value="email">
          <EmailIntegrationHub />
        </TabsContent>

        <TabsContent value="financial">
          <FinancialTaskDashboard />
        </TabsContent>

        <TabsContent value="insights">
          <SmartFinancialInsights />
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-6">
          {renderCrossDomainSuggestions()}
          
          {/* Phase 2: Advanced Intelligence */}
          <IntelligenceHubExtension />
        </TabsContent>
      </Tabs>
    </div>
  );
};