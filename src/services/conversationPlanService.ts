/**
 * Conversation Plan Service
 * Manages plan context within AI conversations and handles plan modifications
 */

import { GeneratedPlan, PlanStep } from './planGenerationService';
import { devLog } from '@/devtools/devLog';

interface ConversationContext {
  activePlan: GeneratedPlan | null;
  planModifications: string[];
  conversationId: string;
}

class ConversationPlanService {
  private contexts: Map<string, ConversationContext> = new Map();

  /**
   * Set the active plan for a conversation
   */
  setActivePlan(conversationId: string, plan: GeneratedPlan): void {
    const context = this.contexts.get(conversationId) || {
      activePlan: null,
      planModifications: [],
      conversationId
    };

    context.activePlan = plan;
    this.contexts.set(conversationId, context);
    
    devLog(`Set active plan for conversation ${conversationId}: ${plan.title}`);
  }

  /**
   * Get the active plan for a conversation
   */
  getActivePlan(conversationId: string): GeneratedPlan | null {
    return this.contexts.get(conversationId)?.activePlan || null;
  }

  /**
   * Check if a user message is requesting plan modification
   */
  isPlanModificationRequest(message: string, conversationId: string): boolean {
    const activePlan = this.getActivePlan(conversationId);
    if (!activePlan) return false;

    const modificationKeywords = [
      'add', 'remove', 'delete', 'change', 'modify', 'update', 'edit',
      'after', 'before', 'between', 'replace', 'swap', 'move',
      'longer', 'shorter', 'more time', 'less time', 'minutes'
    ];

    const lowerMessage = message.toLowerCase();
    return modificationKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Check if user is requesting plan implementation
   */
  isImplementationRequest(message: string): boolean {
    const implementKeywords = [
      'implement', 'execute', 'start', 'begin', 'activate', 'do it',
      'make it happen', 'create bubbles', 'add reminders', 'schedule'
    ];

    const lowerMessage = message.toLowerCase();
    return implementKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Modify an existing plan based on user request
   */
  async modifyPlan(
    conversationId: string, 
    modification: string
  ): Promise<GeneratedPlan | null> {
    const context = this.contexts.get(conversationId);
    if (!context?.activePlan) return null;

    const plan = context.activePlan;
    const lowerModification = modification.toLowerCase();

    try {
      let modifiedPlan = { ...plan };

      // Handle step additions
      if (this.isAdditionRequest(lowerModification)) {
        modifiedPlan = await this.handleStepAddition(plan, modification);
      }
      // Handle step removal
      else if (this.isRemovalRequest(lowerModification)) {
        modifiedPlan = await this.handleStepRemoval(plan, modification);
      }
      // Handle time modifications
      else if (this.isTimeModification(lowerModification)) {
        modifiedPlan = await this.handleTimeModification(plan, modification);
      }
      // Handle step reordering
      else if (this.isReorderingRequest(lowerModification)) {
        modifiedPlan = await this.handleStepReordering(plan, modification);
      }

      // Update context
      context.activePlan = modifiedPlan;
      context.planModifications.push(modification);
      this.contexts.set(conversationId, context);

      devLog(`Modified plan: ${modification}`);
      return modifiedPlan;

    } catch (error) {
      devLog(`Plan modification error: ${error}`);
      return null;
    }
  }

  private isAdditionRequest(modification: string): boolean {
    return modification.includes('add') || modification.includes('insert') || 
           modification.includes('include') || modification.includes('after');
  }

  private isRemovalRequest(modification: string): boolean {
    return modification.includes('remove') || modification.includes('delete') || 
           modification.includes('skip') || modification.includes('without');
  }

  private isTimeModification(modification: string): boolean {
    return modification.includes('minutes') || modification.includes('longer') || 
           modification.includes('shorter') || modification.includes('time');
  }

  private isReorderingRequest(modification: string): boolean {
    return modification.includes('before') || modification.includes('move') || 
           modification.includes('swap') || modification.includes('first') || 
           modification.includes('last');
  }

  private async handleStepAddition(plan: GeneratedPlan, modification: string): Promise<GeneratedPlan> {
    // Parse the modification to extract step details
    const stepTitle = this.extractStepTitle(modification);
    const insertPosition = this.findInsertPosition(plan, modification);
    
    const newStep: PlanStep = {
      id: `step-${crypto.randomUUID().slice(0, 8)}`,
      title: stepTitle,
      description: '',
      estimatedMinutes: 10, // Default, can be refined
      priority: 'medium',
      category: 'action',
      flexible: true
    };

    const updatedSteps = [
      ...plan.steps.slice(0, insertPosition),
      newStep,
      ...plan.steps.slice(insertPosition)
    ];

    return {
      ...plan,
      steps: updatedSteps,
      totalEstimatedMinutes: updatedSteps.reduce((total, step) => total + step.estimatedMinutes, 0)
    };
  }

  private async handleStepRemoval(plan: GeneratedPlan, modification: string): Promise<GeneratedPlan> {
    const stepToRemove = this.findStepToRemove(plan, modification);
    if (!stepToRemove) return plan;

    const updatedSteps = plan.steps.filter(step => step.id !== stepToRemove.id);
    
    return {
      ...plan,
      steps: updatedSteps,
      totalEstimatedMinutes: updatedSteps.reduce((total, step) => total + step.estimatedMinutes, 0)
    };
  }

  private async handleTimeModification(plan: GeneratedPlan, modification: string): Promise<GeneratedPlan> {
    // Extract time-related changes and apply them
    const updatedSteps = plan.steps.map(step => {
      if (this.stepMatchesModification(step, modification)) {
        const newTime = this.extractTimeChange(modification, step.estimatedMinutes);
        return { ...step, estimatedMinutes: newTime };
      }
      return step;
    });

    return {
      ...plan,
      steps: updatedSteps,
      totalEstimatedMinutes: updatedSteps.reduce((total, step) => total + step.estimatedMinutes, 0)
    };
  }

  private async handleStepReordering(plan: GeneratedPlan, modification: string): Promise<GeneratedPlan> {
    // Handle step reordering logic
    // This is a simplified implementation
    return plan; // Return unchanged for now
  }

  private extractStepTitle(modification: string): string {
    // Extract meaningful step title from modification text
    const addWords = ['add', 'include', 'insert'];
    const afterWords = ['after', 'following'];
    
    let title = modification;
    
    // Remove common modification words
    addWords.forEach(word => {
      title = title.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    });
    
    afterWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b.*`, 'gi');
      title = title.replace(regex, '');
    });
    
    return title.trim() || 'New Step';
  }

  private findInsertPosition(plan: GeneratedPlan, modification: string): number {
    const lowerMod = modification.toLowerCase();
    
    if (lowerMod.includes('after')) {
      // Find step mentioned after "after"
      for (let i = 0; i < plan.steps.length; i++) {
        const stepTitle = plan.steps[i].title.toLowerCase();
        if (lowerMod.includes(stepTitle)) {
          return i + 1;
        }
      }
    }
    
    // Default to end
    return plan.steps.length;
  }

  private findStepToRemove(plan: GeneratedPlan, modification: string): PlanStep | null {
    const lowerMod = modification.toLowerCase();
    
    return plan.steps.find(step => 
      lowerMod.includes(step.title.toLowerCase())
    ) || null;
  }

  private stepMatchesModification(step: PlanStep, modification: string): boolean {
    const lowerMod = modification.toLowerCase();
    const stepTitle = step.title.toLowerCase();
    
    return lowerMod.includes(stepTitle);
  }

  private extractTimeChange(modification: string, currentTime: number): number {
    const lowerMod = modification.toLowerCase();
    
    if (lowerMod.includes('longer')) {
      return Math.min(currentTime + 10, 120); // Add 10 minutes, max 120
    }
    
    if (lowerMod.includes('shorter')) {
      return Math.max(currentTime - 5, 5); // Subtract 5 minutes, min 5
    }
    
    // Look for specific minute values
    const minuteMatch = lowerMod.match(/(\d+)\s*minutes?/);
    if (minuteMatch) {
      return parseInt(minuteMatch[1]);
    }
    
    return currentTime;
  }

  /**
   * Clear conversation context
   */
  clearContext(conversationId: string): void {
    this.contexts.delete(conversationId);
    devLog(`Cleared conversation context: ${conversationId}`);
  }

  /**
   * Get modification history for a conversation
   */
  getModificationHistory(conversationId: string): string[] {
    return this.contexts.get(conversationId)?.planModifications || [];
  }
}

export const conversationPlanService = new ConversationPlanService();