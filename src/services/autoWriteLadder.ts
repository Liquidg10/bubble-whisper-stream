/**
 * Auto-Write Ladder Service
 * Implements confidence-gated actions: Suggest → Draft → Auto-write
 * with enhanced privacy controls. Provider execution fails closed until a
 * concrete calendar/task adapter is wired; it never simulates success.
 */

import { decisionTraceService } from './decisionTraceService';
import { privacyEnforcementService, type PrivacyContext } from './privacyEnforcementService';

export interface AutoWriteContext {
  feature: 'calendar' | 'email' | 'finance' | 'task';
  action: string | {
    title?: string;
    taskId?: string;
    startTime?: string;
    recipients?: string[];
    subject?: string;
    [key: string]: unknown;
  };
  confidence: number;
  signals: Array<{
    type: string;
    value: unknown;
    confidence: number;
    source: string;
    privacyLayer?: 'surface' | 'context' | 'deep';
  }>;
  userId?: string;
  metadata?: {
    isOwnCalendar?: boolean;
    daysAhead?: number;
    hasTime?: boolean;
    hasLocation?: boolean;
    hasInvitees?: boolean;
    [key: string]: unknown;
  };
}

export interface StoredAutoWriteDraft {
  id: string;
  feature: AutoWriteContext['feature'];
  action: AutoWriteContext['action'];
  context: AutoWriteContext;
  traceId: string;
  createdAt: number;
}

export interface AutoWriteResult {
  decision: 'suggest' | 'draft' | 'auto-write' | 'blocked';
  traceId: string;
  undoId?: string;
  explanation: string;
  privacyWatermark: 'surface' | 'context' | 'deep';
}

class AutoWriteLadderService {
  private confidenceThresholds = {
    suggest: 0.3,
    draft: 0.6,
    autoWrite: 0.85
  };

  private greenConditions = {
    calendar: (context: AutoWriteContext) => {
      const metadata = context.metadata || {};
      return (
        metadata.isOwnCalendar &&
        typeof metadata.daysAhead === 'number' &&
        metadata.daysAhead <= 14 &&
        metadata.hasTime &&
        metadata.hasLocation &&
        !metadata.hasInvitees
      );
    },
    email: () => false, // Email always drafts
    finance: () => false, // Finance is read-only
    task: (context: AutoWriteContext) => true // Tasks can auto-write
  };

  /**
   * Process an action through the Auto-Write Ladder
   */
  async processAction(context: AutoWriteContext): Promise<AutoWriteResult> {
    const { confidence, feature, action, signals, userId, metadata } = context;
    const actionLabel = this.describeAction(action);

    // Determine required privacy layer
    const requiredLayer = this.getRequiredPrivacyLayer(signals);
    
    // Check privacy permissions
    const privacyContext: PrivacyContext = {
      requiredLayer,
      connectorType: feature,
      dataTypes: signals.map(s => s.type),
      purpose: actionLabel
    };

    if (!privacyEnforcementService.canPerformAction(privacyContext)) {
      const traceId = decisionTraceService.addTrace({
        feature,
        signals,
        confidenceThreshold: this.confidenceThresholds.suggest,
        finalConfidence: confidence,
        decision: 'skip',
        action: `Blocked: ${actionLabel}`,
        becauseText: privacyEnforcementService.getBlockedActionExplanation(privacyContext),
        privacyWatermark: requiredLayer,
        castMember: 'Privacy Guard',
        metadata: { privacyBlock: true, ...metadata },
        undoable: false
      });

      return {
        decision: 'blocked',
        traceId,
        explanation: privacyEnforcementService.getBlockedActionExplanation(privacyContext),
        privacyWatermark: requiredLayer
      };
    }

    // Determine decision based on confidence and conditions
    let decision: 'suggest' | 'draft' | 'auto-write';
    
    if (confidence < this.confidenceThresholds.suggest) {
      decision = 'suggest';
    } else if (confidence < this.confidenceThresholds.draft) {
      decision = 'suggest';
    } else if (confidence < this.confidenceThresholds.autoWrite) {
      decision = 'draft';
    } else {
      // Check green conditions for auto-write
      const greenConditionCheck = this.greenConditions[feature];
      const isGreen = greenConditionCheck ? greenConditionCheck(context) : false;
      decision = isGreen ? 'auto-write' : 'draft';
    }

    // Generate explanation
    const becauseText = decisionTraceService.generateBecauseText(
      signals, 
      decision, 
      requiredLayer
    );

    // Create decision trace
    const traceId = decisionTraceService.addTrace({
      feature,
      userId,
      signals,
      confidenceThreshold: this.confidenceThresholds[decision === 'auto-write' ? 'autoWrite' : decision],
      finalConfidence: confidence,
      decision,
      action: actionLabel,
      becauseText,
      privacyWatermark: requiredLayer,
      castMember: 'Auto-Write Ladder',
      metadata: { telemetryKind: 'acceptance', ...metadata },
      // Drafts are removable. Direct auto-write attempts are not advertised as
      // undoable before a concrete side effect and compensation handle exist.
      undoable: decision === 'draft'
    });

    // Execute the action based on decision
    let undoId: string | undefined;
    
    if (decision === 'auto-write') {
      undoId = await this.executeAutoWrite(context, traceId);
    } else if (decision === 'draft') {
      undoId = await this.createDraft(context, traceId);
    }

    return {
      decision,
      traceId,
      undoId,
      explanation: becauseText,
      privacyWatermark: requiredLayer
    };
  }

  /** Execute through a concrete provider/store adapter or fail closed. */
  private async executeAutoWrite(context: AutoWriteContext, traceId: string): Promise<string> {
    try {
      let reference: string;
      switch (context.feature) {
        case 'calendar':
          reference = await this.autoWriteCalendar();
          break;
        case 'task':
          reference = await this.autoWriteTask();
          break;
        default:
          throw new Error(`Auto-write not supported for ${context.feature}`);
      }
      decisionTraceService.recordExecution(traceId, 'succeeded', {
        source: 'auto-write-ladder',
        reference
      });
      return reference;
    } catch (error) {
      console.error('Auto-write failed:', error);
      decisionTraceService.recordExecution(traceId, 'failed', {
        source: 'auto-write-ladder',
        reference: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create draft with undo capability
   */
  private async createDraft(context: AutoWriteContext, traceId: string): Promise<string> {
    const draftId = crypto.randomUUID();
    
    // Store draft in local storage or state management
    const drafts = JSON.parse(localStorage.getItem('mm-drafts') || '[]');
    drafts.push({
      id: draftId,
      feature: context.feature,
      action: context.action,
      context,
      traceId,
      createdAt: Date.now()
    });
    localStorage.setItem('mm-drafts', JSON.stringify(drafts));
    decisionTraceService.recordExecution(traceId, 'pending', {
      source: 'auto-write-ladder',
      reference: draftId
    });

    console.log(`📝 Draft created: ${this.describeAction(context.action)}`);
    return draftId;
  }

  /** Calendar writes require the provider-backed calendar service. */
  private async autoWriteCalendar(): Promise<never> {
    throw new Error(
      'Calendar execution is unavailable in AutoWriteLadder; no provider-backed write was attempted'
    );
  }

  /** Task writes require a real task-store adapter. */
  private async autoWriteTask(): Promise<never> {
    throw new Error(
      'Task execution is unavailable in AutoWriteLadder; no task-store write was attempted'
    );
  }

  /**
   * Determine required privacy layer from signals
   */
  private getRequiredPrivacyLayer(signals: Array<{ type: string; privacyLayer?: string }>): 'surface' | 'context' | 'deep' {
    const layers = signals
      .map(s => s.privacyLayer)
      .filter(Boolean) as ('surface' | 'context' | 'deep')[];
    
    if (layers.includes('deep')) return 'deep';
    if (layers.includes('context')) return 'context';
    return 'surface';
  }

  /**
   * Get recent drafts for review
   */
  getDrafts(feature?: string): StoredAutoWriteDraft[] {
    const drafts = this.loadDrafts();
    return feature ? drafts.filter(draft => draft.feature === feature) : drafts;
  }

  /**
   * Execute a draft
   */
  async executeDraft(draftId: string): Promise<void> {
    const drafts = this.loadDrafts();
    const draft = drafts.find(candidate => candidate.id === draftId);
    
    if (!draft) throw new Error('Draft not found');
    
    // Execute before removing the draft or recording acceptance. Unsupported
    // and provider failures reject here, leaving the draft available for review.
    await this.executeAutoWrite(draft.context, draft.traceId);
    
    // Remove from drafts
    const updatedDrafts = drafts.filter(candidate => candidate.id !== draftId);
    localStorage.setItem('mm-drafts', JSON.stringify(updatedDrafts));
    decisionTraceService.recordUserAction(draft.traceId, 'accept', {
      source: 'auto-write-production-center',
      artifactId: draftId
    });
  }

  /** Delete a persisted draft and record the explicit rejection. */
  deleteDraft(draftId: string): boolean {
    const drafts = this.loadDrafts();
    const draft = drafts.find(candidate => candidate.id === draftId);
    if (!draft) return false;

    const updatedDrafts = drafts.filter(candidate => candidate.id !== draftId);
    localStorage.setItem('mm-drafts', JSON.stringify(updatedDrafts));
    decisionTraceService.recordUserAction(draft.traceId, 'reject', {
      source: 'auto-write-production-center',
      artifactId: draftId
    });
    return true;
  }

  private loadDrafts(): StoredAutoWriteDraft[] {
    return JSON.parse(localStorage.getItem('mm-drafts') || '[]') as StoredAutoWriteDraft[];
  }

  private describeAction(action: AutoWriteContext['action']): string {
    return typeof action === 'string' ? action : action.title || 'Untitled action';
  }
}

export const autoWriteLadderService = new AutoWriteLadderService();
