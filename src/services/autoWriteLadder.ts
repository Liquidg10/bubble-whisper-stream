/**
 * Auto-Write Ladder Service
 * Implements confidence-gated actions: Suggest → Draft → Auto-write
 * With enhanced privacy controls and idempotent operations
 */

import { decisionTraceService } from './decisionTraceService';
import { privacyEnforcementService, type PrivacyContext } from './privacyEnforcementService';

export interface AutoWriteContext {
  feature: 'calendar' | 'email' | 'finance' | 'task';
  action: string;
  confidence: number;
  signals: Array<{
    type: string;
    value: any;
    confidence: number;
    source: string;
    privacyLayer?: 'surface' | 'context' | 'deep';
  }>;
  userId?: string;
  metadata?: any;
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

    // Determine required privacy layer
    const requiredLayer = this.getRequiredPrivacyLayer(signals);
    
    // Check privacy permissions
    const privacyContext: PrivacyContext = {
      requiredLayer,
      connectorType: feature,
      dataTypes: signals.map(s => s.type),
      purpose: action
    };

    if (!privacyEnforcementService.canPerformAction(privacyContext)) {
      const traceId = decisionTraceService.addTrace({
        feature,
        signals,
        confidenceThreshold: this.confidenceThresholds.suggest,
        finalConfidence: confidence,
        decision: 'skip',
        action: `Blocked: ${action}`,
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
      action,
      becauseText,
      privacyWatermark: requiredLayer,
      castMember: 'Auto-Write Ladder',
      metadata,
      undoable: decision === 'auto-write' || decision === 'draft'
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

  /**
   * Execute auto-write action with idempotent ID
   */
  private async executeAutoWrite(context: AutoWriteContext, traceId: string): Promise<string> {
    const idempotentId = this.generateIdempotentId(context);
    
    try {
      switch (context.feature) {
        case 'calendar':
          return await this.autoWriteCalendar(context, idempotentId);
        case 'task':
          return await this.autoWriteTask(context, idempotentId);
        default:
          throw new Error(`Auto-write not supported for ${context.feature}`);
      }
    } catch (error) {
      console.error('Auto-write failed:', error);
      // Mark trace as failed
      decisionTraceService.markAsUndone(traceId, 'failed');
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

    console.log(`📝 Draft created: ${context.action}`);
    return draftId;
  }

  /**
   * Auto-write calendar event
   */
  private async autoWriteCalendar(context: AutoWriteContext, idempotentId: string): Promise<string> {
    // Simulate calendar API call with idempotent ID
    console.log(`📅 Auto-writing calendar event: ${context.action} (${idempotentId})`);
    
    // In real implementation, would call calendar API with idempotent ID
    // and handle 409/412 conflicts
    
    return crypto.randomUUID();
  }

  /**
   * Auto-write task
   */
  private async autoWriteTask(context: AutoWriteContext, idempotentId: string): Promise<string> {
    console.log(`✅ Auto-writing task: ${context.action} (${idempotentId})`);
    return crypto.randomUUID();
  }

  /**
   * Generate deterministic idempotent ID
   */
  private generateIdempotentId(context: AutoWriteContext): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const hour = new Date().getHours().toString().padStart(2, '0');
    const minute = Math.floor(new Date().getMinutes() / 15) * 15; // 15-minute windows
    
    const userId = context.userId || 'anonymous';
    const actionHash = btoa(context.action).slice(0, 8);
    
    return `${userId}:${context.feature}:${actionHash}:${date}${hour}${minute}`;
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
  getDrafts(feature?: string): any[] {
    const drafts = JSON.parse(localStorage.getItem('mm-drafts') || '[]');
    return feature ? drafts.filter((d: any) => d.feature === feature) : drafts;
  }

  /**
   * Execute a draft
   */
  async executeDraft(draftId: string): Promise<void> {
    const drafts = JSON.parse(localStorage.getItem('mm-drafts') || '[]');
    const draft = drafts.find((d: any) => d.id === draftId);
    
    if (!draft) throw new Error('Draft not found');
    
    // Execute the draft as auto-write
    await this.executeAutoWrite(draft.context, draft.traceId);
    
    // Remove from drafts
    const updatedDrafts = drafts.filter((d: any) => d.id !== draftId);
    localStorage.setItem('mm-drafts', JSON.stringify(updatedDrafts));
  }
}

export const autoWriteLadderService = new AutoWriteLadderService();