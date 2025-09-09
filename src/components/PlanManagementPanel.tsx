import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Trash2, 
  Clock, 
  CheckCircle,
  AlertCircle,
  Calendar,
  Target
} from 'lucide-react';
import { GeneratedPlan } from '@/services/planGenerationService';
import { planImplementationService } from '@/services/planImplementationService';
import { userContextService } from '@/services/userContextService';

interface PlanManagementPanelProps {
  className?: string;
}

export const PlanManagementPanel: React.FC<PlanManagementPanelProps> = ({
  className = ''
}) => {
  const [plans, setPlans] = useState<GeneratedPlan[]>([]);
  const [activePlans, setActivePlans] = useState<GeneratedPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setIsLoading(true);
      
      // Get stored plans from localStorage
      const storedPlans = localStorage.getItem('userPlans');
      const allPlans = storedPlans ? JSON.parse(storedPlans) : [];
      
      // Get active plans
      const active = await planImplementationService.getActivePlans();
      
      setPlans(allPlans);
      setActivePlans(active);
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivatePlan = async (plan: GeneratedPlan) => {
    try {
      // Implementation options can be set to defaults or show dialog
      const options = {
        createBubbles: true,
        createReminders: false,
        createCalendarEvents: false,
        startTime: new Date(),
        reminderOffset: 15
      };

      await planImplementationService.implementPlan(plan, options);
      await userContextService.recordPlanCompletion(plan.id, plan.category);
      
      await loadPlans(); // Refresh
    } catch (error) {
      console.error('Error activating plan:', error);
    }
  };

  const handlePausePlan = async (planId: string) => {
    try {
      await planImplementationService.pausePlan(planId);
      await loadPlans(); // Refresh
    } catch (error) {
      console.error('Error pausing plan:', error);
    }
  };

  const handleDeletePlan = (planId: string) => {
    const updatedPlans = plans.filter(plan => plan.id !== planId);
    setPlans(updatedPlans);
    localStorage.setItem('userPlans', JSON.stringify(updatedPlans));
  };

  const getPlanStatusColor = (plan: GeneratedPlan): string => {
    if (activePlans.some(ap => ap.id === plan.id)) {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  };

  const getPlanStatusIcon = (plan: GeneratedPlan) => {
    if (activePlans.some(ap => ap.id === plan.id)) {
      return <Play className="h-3 w-3" />;
    }
    return <Pause className="h-3 w-3" />;
  };

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const PlanCard: React.FC<{ plan: GeneratedPlan }> = ({ plan }) => {
    const isActive = activePlans.some(ap => ap.id === plan.id);
    
    return (
      <Card className="mb-3">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">{plan.title}</CardTitle>
              <Badge className={`text-xs ${getPlanStatusColor(plan)}`}>
                {getPlanStatusIcon(plan)}
                <span className="ml-1">{isActive ? 'Active' : 'Inactive'}</span>
              </Badge>
            </div>
            <Badge variant="outline" className="text-xs capitalize">
              {plan.category}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{plan.description}</p>
        </CardHeader>
        
        <CardContent className="pt-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{Math.round(plan.totalEstimatedMinutes)} min</span>
              </div>
              <div className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                <span>{plan.steps.length} steps</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatTimeAgo(plan.createdAt)}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {isActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePausePlan(plan.id)}
                >
                  <Pause className="h-3 w-3 mr-1" />
                  Pause
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleActivatePlan(plan)}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Activate
                </Button>
              )}
              
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDeletePlan(plan.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
          
          {/* Quick preview of steps */}
          <div className="space-y-1">
            {plan.steps.slice(0, 2).map((step, index) => (
              <div key={step.id} className="text-xs flex justify-between text-muted-foreground">
                <span>{index + 1}. {step.title}</span>
                <span>{step.estimatedMinutes}m</span>
              </div>
            ))}
            {plan.steps.length > 2 && (
              <div className="text-xs text-muted-foreground">
                +{plan.steps.length - 2} more steps
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          Plan Management
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All Plans ({plans.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({activePlans.length})</TabsTrigger>
            <TabsTrigger value="completed">Recent</TabsTrigger>
          </TabsList>
          
          <TabsContent value="all">
            <ScrollArea className="h-[400px] pr-4">
              {plans.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No plans created yet</p>
                  <p className="text-xs text-muted-foreground">Ask the AI Assistant to create your first plan!</p>
                </div>
              ) : (
                plans.map(plan => <PlanCard key={plan.id} plan={plan} />)
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="active">
            <ScrollArea className="h-[400px] pr-4">
              {activePlans.length === 0 ? (
                <div className="text-center py-8">
                  <Play className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No active plans</p>
                  <p className="text-xs text-muted-foreground">Activate a plan to start tracking your progress</p>
                </div>
              ) : (
                activePlans.map(plan => <PlanCard key={plan.id} plan={plan} />)
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="completed">
            <ScrollArea className="h-[400px] pr-4">
              <div className="text-center py-8">
                <CheckCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Plan history coming soon</p>
                <p className="text-xs text-muted-foreground">This will show your completed plans and progress</p>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};