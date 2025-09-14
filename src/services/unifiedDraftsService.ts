/**
 * Unified Drafts Service
 * Manages email/calendar drafts across all integrations
 */

import { autoWriteLadderService } from './autoWriteLadder';
import { taskAutoWriteProductionService } from './taskAutoWriteProductionService';
import { logger } from '@/utils/logger';

export interface UnifiedDraft {
  id: string;
  type: 'email' | 'calendar' | 'task';
  title: string;
  preview: string;
  confidence: number;
  createdAt: number;
  source: 'ladder' | 'task-aware' | 'manual';
  metadata?: any;
}

export interface DraftStats {
  total: number;
  byType: Record<string, number>;
  avgConfidence: number;
  lastUpdated: number;
}

class UnifiedDraftsService {
  /**
   * Get all drafts from various sources
   */
  async getAllDrafts(): Promise<UnifiedDraft[]> {
    try {
      const ladderDrafts = autoWriteLadderService.getDrafts();
      const unified: UnifiedDraft[] = [];

      // Process ladder drafts
      ladderDrafts.forEach(draft => {
        unified.push({
          id: draft.id,
          type: draft.feature as 'email' | 'calendar' | 'task',
          title: this.extractTitle(draft),
          preview: this.generatePreview(draft),
          confidence: draft.context?.confidence || 0,
          createdAt: draft.createdAt,
          source: 'ladder',
          metadata: draft
        });
      });

      // Add mock drafts for demo
      unified.push(
        {
          id: 'demo-email-1',
          type: 'email',
          title: 'Follow up on meeting notes',
          preview: 'To: team@company.com - Quick check on action items from yesterday',
          confidence: 0.87,
          createdAt: Date.now() - 3600000,
          source: 'manual'
        },
        {
          id: 'demo-calendar-1',
          type: 'calendar',
          title: 'Team standup recurring',
          preview: 'Daily at 9:00 AM with engineering team',
          confidence: 0.92,
          createdAt: Date.now() - 7200000,
          source: 'task-aware'
        }
      );

      return unified.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      logger.error('Failed to get unified drafts', error);
      return [];
    }
  }

  /**
   * Get draft statistics
   */
  async getDraftStats(): Promise<DraftStats> {
    try {
      const drafts = await this.getAllDrafts();
      const byType = drafts.reduce((acc, draft) => {
        acc[draft.type] = (acc[draft.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const avgConfidence = drafts.length > 0
        ? drafts.reduce((sum, d) => sum + d.confidence, 0) / drafts.length
        : 0;

      return {
        total: drafts.length,
        byType,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        lastUpdated: Date.now()
      };
    } catch (error) {
      logger.error('Failed to get draft stats', error);
      return {
        total: 0,
        byType: {},
        avgConfidence: 0,
        lastUpdated: Date.now()
      };
    }
  }

  /**
   * Execute a draft by ID
   */
  async executeDraft(draftId: string): Promise<boolean> {
    try {
      // Try ladder service first
      const ladderDrafts = autoWriteLadderService.getDrafts();
      const ladderDraft = ladderDrafts.find(d => d.id === draftId);
      
      if (ladderDraft) {
        await autoWriteLadderService.executeDraft(draftId);
        return true;
      }

      // Handle demo drafts
      if (draftId.startsWith('demo-')) {
        logger.info('Demo draft executed', { draftId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to execute draft', error);
      return false;
    }
  }

  /**
   * Delete a draft by ID
   */
  async deleteDraft(draftId: string): Promise<boolean> {
    try {
      if (draftId.startsWith('demo-')) {
        // Demo drafts can't be deleted
        return true;
      }

      // Remove from ladder service
      const drafts = autoWriteLadderService.getDrafts();
      const filtered = drafts.filter(d => d.id !== draftId);
      localStorage.setItem('mm-drafts', JSON.stringify(filtered));
      
      return true;
    } catch (error) {
      logger.error('Failed to delete draft', error);
      return false;
    }
  }

  private extractTitle(draft: any): string {
    return draft.context?.action || draft.action || 'Untitled Draft';
  }

  private generatePreview(draft: any): string {
    const action = draft.context?.action || draft.action;
    const metadata = draft.context?.metadata || {};
    
    switch (draft.feature) {
      case 'email':
        return `To: ${metadata.recipients?.join(', ') || 'Unknown'} - ${action}`;
      case 'calendar':
        return `${metadata.startTime ? new Date(metadata.startTime).toLocaleString() : 'Time TBD'} - ${action}`;
      case 'task':
        return `Priority: ${metadata.priority || 'Normal'} - ${action}`;
      default:
        return action || 'No preview available';
    }
  }
}

export const unifiedDraftsService = new UnifiedDraftsService();