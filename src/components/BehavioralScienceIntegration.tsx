/**
 * Behavioral Science Integration Component
 * Integrates all Phase 1-4 services into the UI
 */

import React, { useEffect } from 'react';
import { behavioralScienceEngine } from '@/services/behavioralScienceEngine';
import { moodBehaviorEngine } from '@/services/moodBehaviorEngine';
import { permaIntegration } from '@/services/permaIntegration';
import { contemplativeNeuroscience } from '@/services/contemplativeNeuroscience';
import { useBubbleStore } from '@/stores/bubbleStore';

export const BehavioralScienceIntegration: React.FC = () => {
  const { bubbles, settings } = useBubbleStore();

  useEffect(() => {
    if (!settings.intelligenceEnabled) return;

    // Monitor task completion patterns for learning
    const completedTasks = bubbles.filter(b => b.completed);
    const recentCompletions = completedTasks.filter(b => 
      Date.now() - b.updatedAt < 3600000 // Last hour
    );

    // Learn energy windows from completions
    recentCompletions.forEach(() => {
      behavioralScienceEngine.learnEnergyWindow(true);
    });

    // Add PERMA signals from task content
    recentCompletions.forEach(bubble => {
      const signals = permaIntegration.analyzeTaskContent(bubble.content, true);
      signals.forEach(signal => permaIntegration.addPERMASignal(signal));
    });

    // Assess DMN activity
    const taskSwitches = bubbles.filter(b => 
      Date.now() - b.updatedAt < 300000 // Last 5 minutes
    ).length;
    
    contemplativeNeuroscience.assessDMNActivity(taskSwitches, 300000);

  }, [bubbles.length, settings.intelligenceEnabled]);

  // This component runs behavioral science in the background
  return null;
};