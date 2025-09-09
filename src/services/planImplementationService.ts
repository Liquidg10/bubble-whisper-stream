/**
 * Plan Implementation Service
 * Converts AI-generated plans into actionable bubbles, reminders, and calendar events
 */

import { useBubbleStore } from '@/stores/bubbleStore';
import { reminderEngine } from './reminderEngine';
import { calendarWriteService } from './calendarWriteService';
import { GeneratedPlan, PlanStep } from './planGenerationService';
import { devLog } from '@/devtools/devLog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Bubble, Reminder } from '@/types/bubble';

export interface PlanImplementationOptions {
  createBubbles: boolean;
  createReminders: boolean;
  createCalendarEvents: boolean;
  startTime?: Date;
  reminderOffset?: number; // minutes before each step
}

export interface ImplementationResult {
  bubblesCreated: number;
  remindersCreated: number;
  calendarEventsCreated: number;
  errors: string[];
}

class PlanImplementationService {
  async implementPlan(
    plan: GeneratedPlan, 
    options: PlanImplementationOptions
  ): Promise<ImplementationResult> {
    const result: ImplementationResult = {
      bubblesCreated: 0,
      remindersCreated: 0,
      calendarEventsCreated: 0,
      errors: []
    };

    devLog(`Implementing plan: ${plan.title} with ${plan.steps.length} steps`);

    try {
      // Create bubbles for each step
      if (options.createBubbles) {
        await this.createBubbles(plan, result);
      }

      // Create reminders for time-sensitive steps
      if (options.createReminders) {
        await this.createReminders(plan, options, result);
      }

      // Create calendar events for scheduled steps
      if (options.createCalendarEvents && options.startTime) {
        await this.createCalendarEvents(plan, options, result);
      }

      // Mark plan as active
      await this.activatePlan(plan.id);

      toast({
        title: "Plan Implemented Successfully!",
        description: `Created ${result.bubblesCreated} bubbles, ${result.remindersCreated} reminders, and ${result.calendarEventsCreated} calendar events.`,
      });

      devLog(`Plan implementation complete:`, result);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMsg);
      
      toast({
        title: "Plan Implementation Error",
        description: errorMsg,
        variant: "destructive"
      });

      return result;
    }
  }

  private async createBubbles(plan: GeneratedPlan, result: ImplementationResult): Promise<void> {
    // Get store state
    const store = useBubbleStore.getState();
    
    // Use default canvas size if not available
    const centerX = 400; // Default center
    const centerY = 300; // Default center

    // Create main plan bubble first
    const now = Date.now();
    const mainBubble: Bubble = {
      id: `plan-${plan.id}`,
      type: 'Thought' as const,
      content: plan.title,
      x: centerX,
      y: centerY - 100,
      size: 0.8,
      createdAt: now,
      updatedAt: now,
      tags: [],
      metadata: {
        description: plan.description,
        planId: plan.id,
        isPlanMain: true
      }
    };

    await store.addBubble(mainBubble);
    result.bubblesCreated++;

    // Create bubbles for each step in a circular pattern
    const radius = 150;
    const angleStep = (2 * Math.PI) / plan.steps.length;

    for (let index = 0; index < plan.steps.length; index++) {
      const step = plan.steps[index];
      const angle = index * angleStep;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      const stepBubble: Bubble = {
        id: `step-${step.id}`,
        type: this.getStepBubbleType(step),
        content: step.title,
        x,
        y,
        size: 0.6,
        createdAt: now + index, // Slight offset for uniqueness
        updatedAt: now + index,
        tags: [],
        metadata: {
          description: step.description,
          planId: plan.id,
          stepId: step.id,
          estimatedMinutes: step.estimatedMinutes,
          priority: step.priority,
          flexible: step.flexible
        }
      };

      await store.addBubble(stepBubble);
      result.bubblesCreated++;
    }
  }

  private getStepBubbleType(step: PlanStep): 'Task' | 'ReminderNote' | 'Thought' {
    if (step.category === 'action' || step.category === 'preparation') {
      return 'Task';
    }
    if (step.scheduledTime) {
      return 'ReminderNote';
    }
    return 'Thought';
  }

  private async createReminders(
    plan: GeneratedPlan, 
    options: PlanImplementationOptions, 
    result: ImplementationResult
  ): Promise<void> {
    if (!options.startTime) return;

    let currentTime = new Date(options.startTime);
    const reminderOffset = options.reminderOffset || 5;
    const store = useBubbleStore.getState();

    for (const step of plan.steps) {
      if (step.flexible) continue; // Skip flexible steps for reminders

      const reminderTime = new Date(currentTime.getTime() - reminderOffset * 60000);
      
      try {
        // Create a bubble for the reminder first
        const bubbleId = `reminder-bubble-${step.id}`;
        const reminderBubble: Bubble = {
          id: bubbleId,
          type: 'ReminderNote',
          content: `Time for: ${step.title}`,
          x: 200 + (result.remindersCreated * 50),
          y: 100,
          size: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
          metadata: {
            planId: plan.id,
            stepId: step.id,
            type: 'plan-reminder',
            description: step.description || `Estimated time: ${step.estimatedMinutes} minutes`
          }
        };

        await store.addBubble(reminderBubble);

        // Create the reminder
        const reminder: Reminder = {
          id: `plan-reminder-${step.id}`,
          bubbleId: bubbleId,
          scheduledAt: reminderTime.getTime(),
          status: 'Active',
          level: step.priority === 'high' ? 3 : 2,
          snoozes: []
        };
        
        await store.addReminder(reminder);
        result.remindersCreated++;
        
        // Advance time for next step
        currentTime = new Date(currentTime.getTime() + step.estimatedMinutes * 60000);
        
      } catch (error) {
        result.errors.push(`Failed to create reminder for step: ${step.title}`);
      }
    }
  }

  private async createCalendarEvents(
    plan: GeneratedPlan, 
    options: PlanImplementationOptions, 
    result: ImplementationResult
  ): Promise<void> {
    if (!options.startTime) return;

    let currentTime = new Date(options.startTime);

    for (const step of plan.steps) {
      if (step.flexible) continue; // Skip flexible steps for calendar

      const endTime = new Date(currentTime.getTime() + step.estimatedMinutes * 60000);
      
      try {
        // Get available calendar accounts  
        const { data: accounts } = await supabase
          .from('calendar_accounts')
          .select('id')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
          .limit(1);

        if (accounts && accounts.length > 0) {
          await calendarWriteService.createEventDraft(accounts[0].id, {
            title: step.title,
            description: `${step.description || ''}\n\nPart of plan: ${plan.title}`,
            startTime: currentTime.toISOString(),
            endTime: endTime.toISOString()
          });

          result.calendarEventsCreated++;
          currentTime = endTime; // Next step starts when this one ends
        }
        
      } catch (error) {
        result.errors.push(`Failed to create calendar event for step: ${step.title}`);
      }
    }
  }

  private async activatePlan(planId: string): Promise<void> {
    // Mark plan as active in local storage
    const stored = localStorage.getItem('userPlans') || '[]';
    const plans = JSON.parse(stored);
    const updatedPlans = plans.map((plan: GeneratedPlan) => ({
      ...plan,
      isActive: plan.id === planId
    }));
    localStorage.setItem('userPlans', JSON.stringify(updatedPlans));
  }

  async pausePlan(planId: string): Promise<void> {
    // Mark plan as inactive
    const stored = localStorage.getItem('userPlans') || '[]';
    const plans = JSON.parse(stored);
    const updatedPlans = plans.map((plan: GeneratedPlan) => ({
      ...plan,
      isActive: plan.id === planId ? false : plan.isActive
    }));
    localStorage.setItem('userPlans', JSON.stringify(updatedPlans));
    
    toast({
      title: "Plan Paused",
      description: "You can reactivate it anytime from the plan manager."
    });
  }

  async getActivePlans(): Promise<GeneratedPlan[]> {
    const stored = localStorage.getItem('userPlans') || '[]';
    const plans = JSON.parse(stored);
    return plans.filter((plan: GeneratedPlan) => plan.isActive);
  }
}

export const planImplementationService = new PlanImplementationService();