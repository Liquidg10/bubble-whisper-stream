export interface DecisionTrace {
  id: string;
  input: any;
  rules: string[];
  output: any;
  confidence: number;
  timestamp: number;
  becauseText: string;
  revertHook: () => void;
}