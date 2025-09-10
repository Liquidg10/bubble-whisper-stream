/**
 * Enhanced Plan Revision Service
 * AI-powered plan modification that can completely rethink and regenerate plans
 */

import { GeneratedPlan, PlanStep, planGenerationService } from './planGenerationService';
import { userContextService } from './userContextService';
import { supabase } from '@/integrations/supabase/client';
import { devLog } from '@/devtools/devLog';

export interface PlanRevisionRequest {
  originalPlan: GeneratedPlan;
  userFeedback: string;
  conversationHistory: string[];
  revisionType: 'incremental' | 'comprehensive';
}

export interface PlanRevisionResult {
  revisedPlan: GeneratedPlan;
  changesSummary: string;
  confidence: number;
  revisionReason: string;
}

class EnhancedPlanRevisionService {
  /**
   * Revise a plan based on user feedback
   */
  async revisePlan(request: PlanRevisionRequest): Promise<PlanRevisionResult> {
    devLog(`Revising plan: ${request.originalPlan.title} with feedback: ${request.userFeedback}`);
    
    try {
      // Determine if this needs comprehensive revision
      const needsComprehensiveRevision = this.shouldUseComprehensiveRevision(request);
      
      if (needsComprehensiveRevision) {
        return await this.performComprehensiveRevision(request);
      } else {
        return await this.performIncrementalRevision(request);
      }
    } catch (error) {
      devLog(`Plan revision error: ${error}`);
      
      // Fallback to incremental revision
      return await this.performIncrementalRevision(request);
    }
  }

  /**
   * Determine if feedback requires comprehensive plan regeneration
   */
  private shouldUseComprehensiveRevision(request: PlanRevisionRequest): boolean {
    const feedback = request.userFeedback.toLowerCase();
    
    const comprehensiveKeywords = [
      'rethink', 'completely', 'totally', 'entirely', 'from scratch',
      'different approach', 'change everything', 'start over',
      'wrong direction', 'not what i need', 'better way',
      'simplify', 'make it shorter', 'make it longer',
      'focus on', 'prioritize', 'different order'
    ];

    const hasComprehensiveIntent = comprehensiveKeywords.some(keyword => 
      feedback.includes(keyword)
    );

    // Also check if user is asking for fundamental changes
    const hasFundamentalChanges = this.detectFundamentalChanges(feedback);
    
    return hasComprehensiveIntent || hasFundamentalChanges || request.revisionType === 'comprehensive';
  }

  /**
   * Detect if user is asking for fundamental structural changes
   */
  private detectFundamentalChanges(feedback: string): boolean {
    const structuralChanges = [
      'more steps', 'fewer steps', 'less time', 'more time',
      'different focus', 'wrong approach', 'not helpful',
      'too complex', 'too simple', 'missing important'
    ];

    return structuralChanges.some(change => feedback.includes(change));
  }

  /**
   * Perform comprehensive plan revision using AI
   */
  private async performComprehensiveRevision(request: PlanRevisionRequest): Promise<PlanRevisionResult> {
    const userContext = await userContextService.getUserContext();
    const insights = userContextService.getPersonalizationInsights();
    
    // Create enhanced prompt for plan revision
    const revisionPrompt = this.createRevisionPrompt(request, userContext, insights);
    
    try {
      // Use the plan generation service with revision context
      const { data, error } = await supabase.functions.invoke('ai-plan-generate', {
        body: {
          request: revisionPrompt,
          planType: this.inferPlanType(request.originalPlan),
          userContext: {
            ...userContext,
            originalPlan: request.originalPlan,
            userFeedback: request.userFeedback,
            revisionHistory: request.conversationHistory
          }
        }
      });

      if (error) throw error;

      const revisedPlan = {
        ...data.plan,
        id: request.originalPlan.id, // Keep same ID
        version: (request.originalPlan.version || 1) + 1
      };

      // Record the revision for learning
      await userContextService.recordPlanModification(
        this.inferPlanType(request.originalPlan),
        request.userFeedback
      );

      return {
        revisedPlan,
        changesSummary: this.generateChangesSummary(request.originalPlan, revisedPlan),
        confidence: data.confidence || 0.8,
        revisionReason: 'Comprehensive AI-powered revision based on your feedback'
      };

    } catch (error) {
      devLog(`Comprehensive revision failed: ${error}`);
      throw error;
    }
  }

  /**
   * Perform incremental plan revision
   */
  private async performIncrementalRevision(request: PlanRevisionRequest): Promise<PlanRevisionResult> {
    const originalPlan = request.originalPlan;
    const feedback = request.userFeedback;
    
    let revisedPlan = { ...originalPlan };
    let changes: string[] = [];

    // Parse and apply incremental changes
    if (this.isAdditionRequest(feedback)) {
      const result = await this.handleStepAddition(revisedPlan, feedback);
      revisedPlan = result.plan;
      changes.push(result.change);
    }

    if (this.isRemovalRequest(feedback)) {
      const result = await this.handleStepRemoval(revisedPlan, feedback);
      revisedPlan = result.plan;
      changes.push(result.change);
    }

    if (this.isTimeModification(feedback)) {
      const result = await this.handleTimeModification(revisedPlan, feedback);
      revisedPlan = result.plan;
      changes.push(result.change);
    }

    if (this.isReorderingRequest(feedback)) {
      const result = await this.handleStepReordering(revisedPlan, feedback);
      revisedPlan = result.plan;
      changes.push(result.change);
    }

    // Record the modification
    await userContextService.recordPlanModification(
      this.inferPlanType(originalPlan),
      feedback
    );

    return {
      revisedPlan: {
        ...revisedPlan,
        version: (originalPlan.version || 1) + 1
      },
      changesSummary: changes.join('; '),
      confidence: 0.9,
      revisionReason: 'Incremental modification based on specific request'
    };
  }

  /**
   * Create comprehensive revision prompt
   */
  private createRevisionPrompt(
    request: PlanRevisionRequest, 
    userContext: any, 
    insights: any
  ): string {
    return `Please revise this plan based on the user's feedback.

ORIGINAL PLAN: ${request.originalPlan.title}
Description: ${request.originalPlan.description}
Steps: ${request.originalPlan.steps.map(s => `${s.title} (${s.estimatedMinutes}m)`).join(', ')}

USER FEEDBACK: "${request.userFeedback}"

USER PREFERENCES:
- Communication style: ${userContext.preferences.communicationStyle || 'friendly'}
- Primary goals: ${userContext.preferences.primaryGoals?.join(', ') || 'general productivity'}
- Past successful plan types: ${insights.preferredPlanTypes.join(', ')}
- Common modifications: ${insights.commonModifications.slice(0, 3).join(', ')}

REVISION REQUIREMENTS:
1. Address the user's specific feedback directly
2. Maintain the plan's core purpose while improving based on feedback
3. Keep personalization elements that work for this user
4. Ensure the revised plan is practical and actionable
5. Adjust timing, steps, and approach as needed

Create a completely revised plan that incorporates the user's feedback while maintaining the helpful structure.`;
  }

  /**
   * Generate summary of changes between plans
   */
  private generateChangesSummary(original: GeneratedPlan, revised: GeneratedPlan): string {
    const changes: string[] = [];
    
    if (original.title !== revised.title) {
      changes.push(`Updated title to "${revised.title}"`);
    }
    
    if (original.steps.length !== revised.steps.length) {
      const diff = revised.steps.length - original.steps.length;
      changes.push(diff > 0 ? `Added ${diff} steps` : `Removed ${Math.abs(diff)} steps`);
    }
    
    const timeDiff = revised.totalEstimatedMinutes - original.totalEstimatedMinutes;
    if (Math.abs(timeDiff) > 5) {
      changes.push(timeDiff > 0 ? `Increased time by ${timeDiff} minutes` : `Reduced time by ${Math.abs(timeDiff)} minutes`);
    }
    
    // Check for step modifications
    const modifiedSteps = revised.steps.filter(newStep => {
      const originalStep = original.steps.find(s => s.title === newStep.title);
      return originalStep && originalStep.estimatedMinutes !== newStep.estimatedMinutes;
    });
    
    if (modifiedSteps.length > 0) {
      changes.push(`Modified ${modifiedSteps.length} step timings`);
    }
    
    return changes.length > 0 ? changes.join(', ') : 'Minor adjustments made';
  }

  private inferPlanType(plan: GeneratedPlan): string {
    const title = plan.title.toLowerCase();
    if (title.includes('morning')) return 'morning';
    if (title.includes('work') || title.includes('job')) return 'workday';
    if (title.includes('health') || title.includes('fitness')) return 'health';
    if (title.includes('project')) return 'project';
    return 'general';
  }

  // Helper methods for incremental changes
  private isAdditionRequest(feedback: string): boolean {
    return /\badd|include|insert|after|before\b/i.test(feedback);
  }

  private isRemovalRequest(feedback: string): boolean {
    return /\bremove|delete|skip|without|eliminate\b/i.test(feedback);
  }

  private isTimeModification(feedback: string): boolean {
    return /\bminutes?|longer|shorter|time|quick|slow\b/i.test(feedback);
  }

  private isReorderingRequest(feedback: string): boolean {
    return /\bmove|swap|first|last|before|after|reorder\b/i.test(feedback);
  }

  // Implementation methods for incremental changes (simplified)
  private async handleStepAddition(plan: GeneratedPlan, feedback: string): Promise<{plan: GeneratedPlan, change: string}> {
    // Simplified implementation - would extract details from feedback
    const newStep: PlanStep = {
      id: `step-${crypto.randomUUID().slice(0, 8)}`,
      title: this.extractStepTitle(feedback),
      description: '',
      estimatedMinutes: 10,
      priority: 'medium',
      category: 'action',
      flexible: true
    };

    return {
      plan: {
        ...plan,
        steps: [...plan.steps, newStep],
        totalEstimatedMinutes: plan.totalEstimatedMinutes + 10
      },
      change: `Added step: ${newStep.title}`
    };
  }

  private async handleStepRemoval(plan: GeneratedPlan, feedback: string): Promise<{plan: GeneratedPlan, change: string}> {
    // Find step to remove based on feedback
    const stepToRemove = plan.steps.find(step => 
      feedback.toLowerCase().includes(step.title.toLowerCase())
    );

    if (!stepToRemove) {
      return { plan, change: 'No step found to remove' };
    }

    return {
      plan: {
        ...plan,
        steps: plan.steps.filter(s => s.id !== stepToRemove.id),
        totalEstimatedMinutes: plan.totalEstimatedMinutes - stepToRemove.estimatedMinutes
      },
      change: `Removed step: ${stepToRemove.title}`
    };
  }

  private async handleTimeModification(plan: GeneratedPlan, feedback: string): Promise<{plan: GeneratedPlan, change: string}> {
    // Simplified time modification
    const updatedSteps = plan.steps.map(step => {
      if (feedback.toLowerCase().includes('longer')) {
        return { ...step, estimatedMinutes: step.estimatedMinutes + 5 };
      }
      if (feedback.toLowerCase().includes('shorter')) {
        return { ...step, estimatedMinutes: Math.max(5, step.estimatedMinutes - 5) };
      }
      return step;
    });

    return {
      plan: {
        ...plan,
        steps: updatedSteps,
        totalEstimatedMinutes: updatedSteps.reduce((total, step) => total + step.estimatedMinutes, 0)
      },
      change: 'Adjusted step timings'
    };
  }

  private async handleStepReordering(plan: GeneratedPlan, feedback: string): Promise<{plan: GeneratedPlan, change: string}> {
    // Simplified reordering - just return the plan for now
    return { plan, change: 'Reordering not implemented yet' };
  }

  private extractStepTitle(feedback: string): string {
    // Extract meaningful step title from feedback
    const words = feedback.split(' ');
    const addIndex = words.findIndex(word => /add|include|insert/i.test(word));
    
    if (addIndex !== -1 && addIndex < words.length - 1) {
      return words.slice(addIndex + 1, addIndex + 4).join(' ');
    }
    
    return 'New Step';
  }
}

export const enhancedPlanRevisionService = new EnhancedPlanRevisionService();