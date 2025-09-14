export interface DecisionTrace {
  id: string;
  input: any;
  rules: string[];
  output: any;
  confidence: number;
  timestamp: number;
  becauseText: string;
  revertHook: () => void;
  // Enhanced calendar-specific metadata
  calendarMetadata?: {
    stressLevelBefore: number;
    stressLevelAfter: number;
    energyAlignment: number;
    habitMatch: number;
    densityImpact: number;
    predictedStressLevel?: number;
    energyWindowScore?: number;
    habitPatternMatch?: number;
  };
}