/**
 * AI-Powered Plan Generation Service
 * Creates personalized, actionable plans based on user context
 */

import { supabase } from '@/integrations/supabase/client';
import { userContextService } from './userContextService';
import { devLog } from '@/devtools/devLog';

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes: number;
  priority: 'low' | 'medium' | 'high';
  category: 'preparation' | 'action' | 'review' | 'followup';
  scheduledTime?: Date;
  flexible: boolean;
  dependsOn?: string[];
}

export interface GeneratedPlan {
  id: string;
  title: string;
  description: string;
  category: string;
  steps: PlanStep[];
  totalEstimatedMinutes: number;
  createdAt: Date;
  isActive: boolean;
  personalizationConfidence: number;
}

class PlanGenerationService {
  async generatePlan(
    request: string, 
    planType: 'morning' | 'workday' | 'health' | 'project' | 'general' = 'general'
  ): Promise<GeneratedPlan> {
    try {
      devLog(`Generating ${planType} plan for: ${request}`);
      
      // Get user context for personalization
      const userContext = await userContextService.getUserContext();
      
      // Call AI plan generation function
      const { data, error } = await supabase.functions.invoke('ai-plan-generate', {
        body: {
          request,
          planType,
          userContext,
          timestamp: new Date().toISOString()
        }
      });

      if (error) throw error;

      // Transform response into structured plan
      const plan: GeneratedPlan = {
        id: crypto.randomUUID(),
        title: data.title || `${this.capitalize(planType)} Plan`,
        description: data.description || request,
        category: planType,
        steps: this.transformSteps(data.steps || []),
        totalEstimatedMinutes: this.calculateTotalTime(data.steps || []),
        createdAt: new Date(),
        isActive: false,
        personalizationConfidence: data.confidence || 0.5
      };

      // Store plan for later retrieval
      await this.storePlan(plan);
      
      devLog(`Generated plan with ${plan.steps.length} steps`);
      return plan;
      
    } catch (error) {
      devLog('Plan generation error, falling back to template-based generation');
      return this.generateTemplatePlan(request, planType);
    }
  }

  private transformSteps(rawSteps: any[]): PlanStep[] {
    return rawSteps.map((step, index) => ({
      id: `step-${crypto.randomUUID().slice(0, 8)}`,
      title: step.title || `Step ${index + 1}`,
      description: step.description,
      estimatedMinutes: step.estimatedMinutes || step.duration || 15,
      priority: step.priority || 'medium',
      category: step.category || 'action',
      flexible: step.flexible !== false,
      dependsOn: step.dependsOn || (index > 0 ? [`step-${index}`] : undefined)
    }));
  }

  private calculateTotalTime(steps: any[]): number {
    return steps.reduce((total, step) => total + (step.estimatedMinutes || step.duration || 15), 0);
  }

  private async storePlan(plan: GeneratedPlan): Promise<void> {
    const stored = localStorage.getItem('userPlans') || '[]';
    const plans = JSON.parse(stored);
    plans.push(plan);
    localStorage.setItem('userPlans', JSON.stringify(plans));
  }

  async getStoredPlans(): Promise<GeneratedPlan[]> {
    const stored = localStorage.getItem('userPlans') || '[]';
    return JSON.parse(stored);
  }

  async activatePlan(planId: string): Promise<void> {
    const plans = await this.getStoredPlans();
    const updatedPlans = plans.map(plan => ({
      ...plan,
      isActive: plan.id === planId
    }));
    localStorage.setItem('userPlans', JSON.stringify(updatedPlans));
  }

  private generateTemplatePlan(request: string, planType: string): GeneratedPlan {
    const templates = this.getTemplateSteps(planType);
    
    return {
      id: crypto.randomUUID(),
      title: `${this.capitalize(planType)} Plan`,
      description: request,
      category: planType,
      steps: templates,
      totalEstimatedMinutes: this.calculateTotalTime(templates),
      createdAt: new Date(),
      isActive: false,
      personalizationConfidence: 0.3
    };
  }

  private getTemplateSteps(planType: string): PlanStep[] {
    const baseId = crypto.randomUUID().slice(0, 8);
    
    switch (planType) {
      case 'morning':
        return [
          {
            id: `${baseId}-1`,
            title: 'Wake up and hydrate',
            estimatedMinutes: 5,
            priority: 'high',
            category: 'preparation',
            flexible: false
          },
          {
            id: `${baseId}-2`,
            title: 'Quick mindfulness check-in',
            estimatedMinutes: 5,
            priority: 'medium',
            category: 'action',
            flexible: true
          },
          {
            id: `${baseId}-3`,
            title: 'Review daily priorities',
            estimatedMinutes: 10,
            priority: 'high',
            category: 'action',
            flexible: true
          }
        ];
        
      case 'health':
        return [
          {
            id: `${baseId}-1`,
            title: 'Set health intention for today',
            estimatedMinutes: 5,
            priority: 'medium',
            category: 'preparation',
            flexible: true
          },
          {
            id: `${baseId}-2`,
            title: 'Plan meals and nutrition',
            estimatedMinutes: 15,
            priority: 'high',
            category: 'action',
            flexible: true
          },
          {
            id: `${baseId}-3`,
            title: 'Schedule movement or exercise',
            estimatedMinutes: 30,
            priority: 'high',
            category: 'action',
            flexible: true
          }
        ];
        
      default:
        return [
          {
            id: `${baseId}-1`,
            title: 'Define clear objective',
            estimatedMinutes: 10,
            priority: 'high',
            category: 'preparation',
            flexible: false
          },
          {
            id: `${baseId}-2`,
            title: 'Break into smaller steps',
            estimatedMinutes: 15,
            priority: 'medium',
            category: 'action',
            flexible: true
          },
          {
            id: `${baseId}-3`,
            title: 'Take action on first step',
            estimatedMinutes: 30,
            priority: 'high',
            category: 'action',
            flexible: true
          }
        ];
    }
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

export const planGenerationService = new PlanGenerationService();