/**
 * P14 Nudge Recap Service - Converts blocked nudges into valuable summaries
 * Preserves user value while respecting cognitive load limits
 */

import type { BlockedNudge, NudgeRecap, RecapDeliveryOptions } from '@/types/cognitiveLoad';
import { toast } from 'sonner';

class NudgeRecapService {
  private pendingRecaps: Map<string, NudgeRecap> = new Map();
  private scheduledDeliveries: Map<string, NodeJS.Timeout> = new Map();
  private deliveryOptions: RecapDeliveryOptions = {
    preferredTime: 'next_break',
    maxRecapsPerDay: 3,
    combineMultipleDomains: true,
    includeActionableItems: true,
    includeInsights: true,
    deliveryMethod: 'toast'
  };

  /**
   * Convert a blocked nudge into a valuable recap
   */
  async convertNudgeToRecap(blockedNudge: BlockedNudge): Promise<NudgeRecap> {
    const recap: NudgeRecap = {
      id: `recap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: this.determineRecapType(blockedNudge),
      blockedNudges: [blockedNudge],
      summary: await this.generateSummary([blockedNudge]),
      insights: await this.extractInsights([blockedNudge]),
      actionableItems: await this.generateActionableItems([blockedNudge]),
      scheduledFor: this.calculateDeliveryTime(blockedNudge),
      priority: this.calculateRecapPriority(blockedNudge),
      deliveryMethod: this.deliveryOptions.deliveryMethod,
      estimatedReadTime: this.estimateReadTime([blockedNudge]),
      metadata: {
        originalDomain: blockedNudge.domain,
        blockReason: blockedNudge.blockReason,
        createdAt: Date.now()
      }
    };

    // Check if we can combine with existing pending recaps
    const combinedRecap = await this.attemptRecapCombination(recap);
    return combinedRecap;
  }

  /**
   * Schedule recap delivery at optimal time
   */
  async scheduleRecapDelivery(recap: NudgeRecap): Promise<void> {
    this.pendingRecaps.set(recap.id, recap);
    
    const deliveryDelay = recap.scheduledFor - Date.now();
    
    if (deliveryDelay <= 0) {
      // Deliver immediately
      await this.deliverRecap(recap);
    } else {
      // Schedule for later
      const timeout = setTimeout(async () => {
        await this.deliverRecap(recap);
        this.scheduledDeliveries.delete(recap.id);
      }, deliveryDelay);
      
      this.scheduledDeliveries.set(recap.id, timeout);
    }
    
    console.log('[Nudge Recap] Scheduled recap delivery:', {
      id: recap.id,
      type: recap.type,
      scheduledFor: new Date(recap.scheduledFor).toLocaleString(),
      delay: deliveryDelay
    });
  }

  /**
   * Deliver recap to user
   */
  private async deliverRecap(recap: NudgeRecap): Promise<void> {
    try {
      switch (recap.deliveryMethod) {
        case 'toast':
          await this.deliverAsToast(recap);
          break;
        case 'modal':
          await this.deliverAsModal(recap);
          break;
        case 'sidebar':
          await this.deliverAsSidebar(recap);
          break;
        case 'email':
          await this.deliverAsEmail(recap);
          break;
        default:
          await this.deliverAsToast(recap);
      }
      
      this.pendingRecaps.delete(recap.id);
      this.recordRecapDelivery(recap);
      
    } catch (error) {
      console.error('[Nudge Recap] Failed to deliver recap:', error);
      // Retry with fallback method
      await this.deliverAsToast(recap);
    }
  }

  /**
   * Deliver recap as toast notification
   */
  private async deliverAsToast(recap: NudgeRecap): Promise<void> {
    const actionButton = recap.actionableItems.length > 0 ? {
      label: 'View Details',
      onClick: () => this.showRecapDetails(recap)
    } : undefined;

    toast(recap.summary, {
      description: recap.insights.slice(0, 2).join(' • '),
      duration: 8000,
      action: actionButton,
      className: 'cognitive-load-recap-toast'
    });
  }

  /**
   * Show detailed recap modal
   */
  private showRecapDetails(recap: NudgeRecap): void {
    // This would integrate with your modal system
    console.log('[Nudge Recap] Showing details for:', recap);
    
    // For now, create a detailed toast
    toast('Nudge Summary Details', {
      description: `${recap.insights.join(' • ')} | Actions: ${recap.actionableItems.join(', ')}`,
      duration: 12000
    });
  }

  /**
   * Attempt to combine recap with existing pending recaps
   */
  private async attemptRecapCombination(newRecap: NudgeRecap): Promise<NudgeRecap> {
    if (!this.deliveryOptions.combineMultipleDomains) {
      return newRecap;
    }

    // Find pending recaps that could be combined
    const combinableRecaps = Array.from(this.pendingRecaps.values()).filter(pending => 
      this.canCombineRecaps(pending, newRecap)
    );

    if (combinableRecaps.length === 0) {
      return newRecap;
    }

    // Combine recaps
    const combinedRecap = await this.combineRecaps([...combinableRecaps, newRecap]);
    
    // Remove old recaps
    combinableRecaps.forEach(recap => {
      this.pendingRecaps.delete(recap.id);
      const timeout = this.scheduledDeliveries.get(recap.id);
      if (timeout) {
        clearTimeout(timeout);
        this.scheduledDeliveries.delete(recap.id);
      }
    });

    return combinedRecap;
  }

  /**
   * Check if two recaps can be combined
   */
  private canCombineRecaps(recap1: NudgeRecap, recap2: NudgeRecap): boolean {
    // Combine if scheduled within 30 minutes of each other
    const timeDiff = Math.abs(recap1.scheduledFor - recap2.scheduledFor);
    const maxCombineWindow = 30 * 60 * 1000; // 30 minutes
    
    return timeDiff <= maxCombineWindow && 
           recap1.type === recap2.type &&
           recap1.priority === recap2.priority;
  }

  /**
   * Combine multiple recaps into one
   */
  private async combineRecaps(recaps: NudgeRecap[]): Promise<NudgeRecap> {
    const allBlockedNudges = recaps.flatMap(r => r.blockedNudges);
    const allInsights = [...new Set(recaps.flatMap(r => r.insights))];
    const allActionableItems = [...new Set(recaps.flatMap(r => r.actionableItems))];
    
    return {
      id: `combined-recap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'insight_collection',
      blockedNudges: allBlockedNudges,
      summary: await this.generateSummary(allBlockedNudges),
      insights: allInsights.slice(0, 5), // Limit to top 5 insights
      actionableItems: allActionableItems.slice(0, 3), // Limit to top 3 actions
      scheduledFor: Math.min(...recaps.map(r => r.scheduledFor)),
      priority: this.calculateCombinedPriority(recaps),
      deliveryMethod: this.deliveryOptions.deliveryMethod,
      estimatedReadTime: this.estimateReadTime(allBlockedNudges),
      metadata: {
        combinedFrom: recaps.map(r => r.id),
        domainsCombined: [...new Set(allBlockedNudges.map(n => n.domain))],
        createdAt: Date.now()
      }
    };
  }

  /**
   * Determine the type of recap to create
   */
  private determineRecapType(blockedNudge: BlockedNudge): NudgeRecap['type'] {
    const hour = new Date().getHours();
    
    if (hour >= 17) {
      return 'daily_summary';
    } else if (blockedNudge.urgency === 'high') {
      return 'priority_rollup';
    } else {
      return 'insight_collection';
    }
  }

  /**
   * Generate summary text for blocked nudges
   */
  private async generateSummary(blockedNudges: BlockedNudge[]): Promise<string> {
    if (blockedNudges.length === 1) {
      const nudge = blockedNudges[0];
      return `We held back a ${nudge.domain} nudge to respect your focus time.`;
    }
    
    const domains = [...new Set(blockedNudges.map(n => n.domain))];
    const domainText = domains.length === 1 ? domains[0] : `${domains.length} areas`;
    
    return `We quietly handled ${blockedNudges.length} notifications from ${domainText} while you were focused.`;
  }

  /**
   * Extract insights from blocked nudges
   */
  private async extractInsights(blockedNudges: BlockedNudge[]): Promise<string[]> {
    const insights: string[] = [];
    
    const domainCounts = blockedNudges.reduce((counts, nudge) => {
      counts[nudge.domain] = (counts[nudge.domain] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // Generate domain-specific insights
    Object.entries(domainCounts).forEach(([domain, count]) => {
      if (count > 1) {
        insights.push(`Your ${domain} system was quite active (${count} notifications)`);
      }
    });
    
    // Add time-based insights
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 17) {
      insights.push('Your productivity focus was protected during work hours');
    }
    
    // Add pattern insights
    const highUrgencyCount = blockedNudges.filter(n => n.urgency === 'high').length;
    if (highUrgencyCount > 0) {
      insights.push(`${highUrgencyCount} high-priority items may need your attention later`);
    }
    
    return insights.slice(0, 3); // Limit to 3 insights
  }

  /**
   * Generate actionable items from blocked nudges
   */
  private async generateActionableItems(blockedNudges: BlockedNudge[]): Promise<string[]> {
    const actions: string[] = [];
    
    const domains = [...new Set(blockedNudges.map(n => n.domain))];
    
    domains.forEach(domain => {
      const domainNudges = blockedNudges.filter(n => n.domain === domain);
      const highUrgency = domainNudges.filter(n => n.urgency === 'high');
      
      if (highUrgency.length > 0) {
        actions.push(`Review ${highUrgency.length} high-priority ${domain} items`);
      } else if (domainNudges.length > 2) {
        actions.push(`Check ${domain} for updates when convenient`);
      }
    });
    
    return actions.slice(0, 2); // Limit to 2 actions
  }

  /**
   * Calculate optimal delivery time
   */
  private calculateDeliveryTime(blockedNudge: BlockedNudge): number {
    const now = Date.now();
    
    switch (this.deliveryOptions.preferredTime) {
      case 'immediate':
        return now;
        
      case 'next_break':
        // Schedule for next :00 or :30 minute mark
        const nextBreak = new Date();
        const minutes = nextBreak.getMinutes();
        if (minutes < 30) {
          nextBreak.setMinutes(30, 0, 0);
        } else {
          nextBreak.setMinutes(60, 0, 0);
        }
        return nextBreak.getTime();
        
      case 'end_of_day':
        const endOfDay = new Date();
        endOfDay.setHours(17, 0, 0, 0);
        return endOfDay.getTime() > now ? endOfDay.getTime() : now + (60 * 60 * 1000);
        
      case 'morning_digest':
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.getTime();
        
      default:
        return now + (5 * 60 * 1000); // 5 minutes default
    }
  }

  /**
   * Calculate recap priority
   */
  private calculateRecapPriority(blockedNudge: BlockedNudge): 'low' | 'medium' | 'high' {
    if (blockedNudge.urgency === 'high') return 'high';
    if (blockedNudge.domain === 'cbt-assist' || blockedNudge.domain === 'auto-write') return 'medium';
    return 'low';
  }

  /**
   * Calculate combined recap priority
   */
  private calculateCombinedPriority(recaps: NudgeRecap[]): 'low' | 'medium' | 'high' {
    const priorities = recaps.map(r => r.priority);
    if (priorities.includes('high')) return 'high';
    if (priorities.includes('medium')) return 'medium';
    return 'low';
  }

  /**
   * Estimate reading time for recap
   */
  private estimateReadTime(blockedNudges: BlockedNudge[]): number {
    // Base time + time per nudge
    const baseTime = 15; // 15 seconds base
    const perNudgeTime = 5; // 5 seconds per nudge
    return baseTime + (blockedNudges.length * perNudgeTime);
  }

  /**
   * Record recap delivery for analytics
   */
  private recordRecapDelivery(recap: NudgeRecap): void {
    try {
      const deliveries = this.getRecapDeliveries();
      deliveries.push({
        id: recap.id,
        type: recap.type,
        deliveredAt: Date.now(),
        blockedNudgeCount: recap.blockedNudges.length,
        domains: [...new Set(recap.blockedNudges.map(n => n.domain))],
        priority: recap.priority,
        deliveryMethod: recap.deliveryMethod,
        estimatedReadTime: recap.estimatedReadTime
      });
      
      // Keep only last 100 deliveries
      const recentDeliveries = deliveries.slice(-100);
      localStorage.setItem('cognitiveLoadRecapDeliveries', JSON.stringify(recentDeliveries));
      
    } catch (error) {
      console.error('[Nudge Recap] Failed to record delivery:', error);
    }
  }

  /**
   * Get recap deliveries from localStorage
   */
  private getRecapDeliveries(): any[] {
    try {
      const stored = localStorage.getItem('cognitiveLoadRecapDeliveries');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[Nudge Recap] Failed to get deliveries:', error);
      return [];
    }
  }

  /**
   * Placeholder methods for future modal/sidebar/email delivery
   */
  private async deliverAsModal(recap: NudgeRecap): Promise<void> {
    // Future: integrate with modal system
    console.log('[Nudge Recap] Modal delivery not implemented, falling back to toast');
    await this.deliverAsToast(recap);
  }

  private async deliverAsSidebar(recap: NudgeRecap): Promise<void> {
    // Future: integrate with sidebar system
    console.log('[Nudge Recap] Sidebar delivery not implemented, falling back to toast');
    await this.deliverAsToast(recap);
  }

  private async deliverAsEmail(recap: NudgeRecap): Promise<void> {
    // Future: integrate with email system
    console.log('[Nudge Recap] Email delivery not implemented, falling back to toast');
    await this.deliverAsToast(recap);
  }

  /**
   * Update delivery options
   */
  updateDeliveryOptions(options: Partial<RecapDeliveryOptions>): void {
    this.deliveryOptions = { ...this.deliveryOptions, ...options };
    localStorage.setItem('cognitiveLoadRecapOptions', JSON.stringify(this.deliveryOptions));
  }

  /**
   * Get current delivery options
   */
  getDeliveryOptions(): RecapDeliveryOptions {
    return { ...this.deliveryOptions };
  }

  /**
   * Load delivery options from localStorage
   */
  private loadDeliveryOptions(): void {
    try {
      const stored = localStorage.getItem('cognitiveLoadRecapOptions');
      if (stored) {
        this.deliveryOptions = { ...this.deliveryOptions, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('[Nudge Recap] Failed to load delivery options:', error);
    }
  }

  /**
   * Initialize service
   */
  initialize(): void {
    this.loadDeliveryOptions();
  }
}

export const nudgeRecapService = new NudgeRecapService();

// Initialize on module load
nudgeRecapService.initialize();
