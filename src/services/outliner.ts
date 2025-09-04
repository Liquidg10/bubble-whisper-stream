/**
 * Task Outliner Service
 * Breaks down tasks into manageable steps with duration estimates
 */

export interface TaskStep {
  id: string;
  title: string;
  estMins: number;
  dependsOn?: string; // ID of prerequisite step
  completed?: boolean;
}

export interface OutlineContext {
  complexity?: 'simple' | 'medium' | 'complex';
  deadline?: Date;
  userSkills?: string[];
}

/**
 * Break down a task into actionable steps
 */
export async function outline(taskText: string, context?: OutlineContext): Promise<TaskStep[]> {
  // Simple rule-based outliner for now
  // In production, this could use AI for more sophisticated breakdown
  
  const steps: TaskStep[] = [];
  const baseId = crypto.randomUUID().slice(0, 8);
  
  // Detect task patterns and generate appropriate steps
  const lowerTask = taskText.toLowerCase();
  
  if (lowerTask.includes('grocery') || lowerTask.includes('shopping') || lowerTask.includes('buy')) {
    return generateShoppingSteps(taskText, baseId);
  }
  
  if (lowerTask.includes('clean') || lowerTask.includes('organize')) {
    return generateCleaningSteps(taskText, baseId);
  }
  
  if (lowerTask.includes('project') || lowerTask.includes('report') || lowerTask.includes('presentation')) {
    return generateProjectSteps(taskText, baseId);
  }
  
  if (lowerTask.includes('cook') || lowerTask.includes('recipe') || lowerTask.includes('meal')) {
    return generateCookingSteps(taskText, baseId);
  }
  
  if (lowerTask.includes('exercise') || lowerTask.includes('workout') || lowerTask.includes('run')) {
    return generateExerciseSteps(taskText, baseId);
  }
  
  // Default breakdown for general tasks
  return generateGenericSteps(taskText, baseId, context);
}

function generateShoppingSteps(taskText: string, baseId: string): TaskStep[] {
  return [
    {
      id: `${baseId}-1`,
      title: 'Review and organize shopping list',
      estMins: 5,
    },
    {
      id: `${baseId}-2`,
      title: 'Check current supplies',
      estMins: 10,
      dependsOn: `${baseId}-1`,
    },
    {
      id: `${baseId}-3`,
      title: 'Plan route and shopping locations',
      estMins: 5,
      dependsOn: `${baseId}-2`,
    },
    {
      id: `${baseId}-4`,
      title: 'Complete shopping trip',
      estMins: 45,
      dependsOn: `${baseId}-3`,
    },
    {
      id: `${baseId}-5`,
      title: 'Store items properly',
      estMins: 15,
      dependsOn: `${baseId}-4`,
    },
  ];
}

function generateCleaningSteps(taskText: string, baseId: string): TaskStep[] {
  return [
    {
      id: `${baseId}-1`,
      title: 'Gather cleaning supplies',
      estMins: 5,
    },
    {
      id: `${baseId}-2`,
      title: 'Clear and declutter space',
      estMins: 15,
      dependsOn: `${baseId}-1`,
    },
    {
      id: `${baseId}-3`,
      title: 'Clean surfaces and areas',
      estMins: 30,
      dependsOn: `${baseId}-2`,
    },
    {
      id: `${baseId}-4`,
      title: 'Organize and put items back',
      estMins: 20,
      dependsOn: `${baseId}-3`,
    },
    {
      id: `${baseId}-5`,
      title: 'Final cleanup and supply storage',
      estMins: 10,
      dependsOn: `${baseId}-4`,
    },
  ];
}

function generateProjectSteps(taskText: string, baseId: string): TaskStep[] {
  return [
    {
      id: `${baseId}-1`,
      title: 'Research and gather requirements',
      estMins: 30,
    },
    {
      id: `${baseId}-2`,
      title: 'Create outline or plan',
      estMins: 20,
      dependsOn: `${baseId}-1`,
    },
    {
      id: `${baseId}-3`,
      title: 'Complete first draft/version',
      estMins: 60,
      dependsOn: `${baseId}-2`,
    },
    {
      id: `${baseId}-4`,
      title: 'Review and revise',
      estMins: 30,
      dependsOn: `${baseId}-3`,
    },
    {
      id: `${baseId}-5`,
      title: 'Finalize and submit/present',
      estMins: 15,
      dependsOn: `${baseId}-4`,
    },
  ];
}

function generateCookingSteps(taskText: string, baseId: string): TaskStep[] {
  return [
    {
      id: `${baseId}-1`,
      title: 'Review recipe and ingredients',
      estMins: 5,
    },
    {
      id: `${baseId}-2`,
      title: 'Prep ingredients and tools',
      estMins: 15,
      dependsOn: `${baseId}-1`,
    },
    {
      id: `${baseId}-3`,
      title: 'Cook main dish',
      estMins: 35,
      dependsOn: `${baseId}-2`,
    },
    {
      id: `${baseId}-4`,
      title: 'Plate and serve',
      estMins: 10,
      dependsOn: `${baseId}-3`,
    },
    {
      id: `${baseId}-5`,
      title: 'Clean up kitchen',
      estMins: 20,
      dependsOn: `${baseId}-4`,
    },
  ];
}

function generateExerciseSteps(taskText: string, baseId: string): TaskStep[] {
  return [
    {
      id: `${baseId}-1`,
      title: 'Prepare workout gear',
      estMins: 5,
    },
    {
      id: `${baseId}-2`,
      title: 'Warm-up exercises',
      estMins: 10,
      dependsOn: `${baseId}-1`,
    },
    {
      id: `${baseId}-3`,
      title: 'Main workout routine',
      estMins: 30,
      dependsOn: `${baseId}-2`,
    },
    {
      id: `${baseId}-4`,
      title: 'Cool-down and stretching',
      estMins: 10,
      dependsOn: `${baseId}-3`,
    },
    {
      id: `${baseId}-5`,
      title: 'Log progress and clean up',
      estMins: 5,
      dependsOn: `${baseId}-4`,
    },
  ];
}

function generateGenericSteps(taskText: string, baseId: string, context?: OutlineContext): TaskStep[] {
  const complexity = context?.complexity || 'medium';
  const baseTime = complexity === 'simple' ? 15 : complexity === 'medium' ? 25 : 40;
  
  return [
    {
      id: `${baseId}-1`,
      title: 'Plan and prepare',
      estMins: Math.round(baseTime * 0.2),
    },
    {
      id: `${baseId}-2`,
      title: 'Start initial work',
      estMins: Math.round(baseTime * 0.4),
      dependsOn: `${baseId}-1`,
    },
    {
      id: `${baseId}-3`,
      title: 'Complete main task',
      estMins: Math.round(baseTime * 0.3),
      dependsOn: `${baseId}-2`,
    },
    {
      id: `${baseId}-4`,
      title: 'Review and finish',
      estMins: Math.round(baseTime * 0.1),
      dependsOn: `${baseId}-3`,
    },
  ];
}

/**
 * Estimate total time for a set of steps
 */
export function estimateTotalTime(steps: TaskStep[]): number {
  return steps.reduce((total, step) => total + step.estMins, 0);
}

/**
 * Get next available step (considering dependencies)
 */
export function getNextStep(steps: TaskStep[]): TaskStep | null {
  for (const step of steps) {
    if (step.completed) continue;
    
    // Check if dependencies are met
    if (step.dependsOn) {
      const dependency = steps.find(s => s.id === step.dependsOn);
      if (!dependency?.completed) continue;
    }
    
    return step;
  }
  
  return null;
}

/**
 * Mark a step as completed
 */
export function completeStep(steps: TaskStep[], stepId: string): TaskStep[] {
  return steps.map(step =>
    step.id === stepId ? { ...step, completed: true } : step
  );
}