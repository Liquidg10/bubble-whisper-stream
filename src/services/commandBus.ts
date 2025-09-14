/**
 * Domain Command Bus & DecisionTrace
 * Atomic command execution with undo support and external integration
 */

import { decisionTraceService } from '@/services/decisionTraceService';

export type CommandType = 
  | 'SetPriority'
  | 'SetHorizon' 
  | 'SetColumn'
  | 'SetQuadrant'
  | 'Complete'
  | 'Snooze'
  | 'BatchCommand'
  | 'CreateCalendarEvent'
  | 'CreateEmailDraft';

export interface DomainCommand {
  type: CommandType;
  payload: any;
  taskId?: string;
  batchId?: string;
  metadata?: {
    source: string;
    timestamp: number;
    userId?: string;
  };
}

export interface CommandResult {
  success: boolean;
  traceId?: string;
  undoId?: string;
  error?: string;
  externalIds?: string[];
}

export interface BatchCommand extends DomainCommand {
  type: 'BatchCommand';
  payload: {
    commands: DomainCommand[];
    atomic: boolean;
  };
}

interface CommandHandler {
  execute(command: DomainCommand): Promise<CommandResult>;
  undo(undoId: string): Promise<boolean>;
  canUndo(undoId: string): boolean;
}

class DomainCommandBus {
  private handlers = new Map<CommandType, CommandHandler>();
  private undoHistory = new Map<string, DomainCommand>();

  registerHandler(type: CommandType, handler: CommandHandler): void {
    this.handlers.set(type, handler);
  }

  async execute(command: DomainCommand): Promise<CommandResult> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      return {
        success: false,
        error: `No handler registered for command type: ${command.type}`
      };
    }

    try {
      // Record decision trace using existing addTrace method
      const traceId = decisionTraceService.addTrace({
        feature: 'system',
        userId: command.metadata?.userId,
        signals: [{
          type: 'command',
          value: command.type,
          confidence: 100,
          source: 'commandBus'
        }],
        confidenceThreshold: 90,
        finalConfidence: 100,
        decision: 'auto-write',
        action: `Execute ${command.type}`,
        becauseText: this.generateBecauseText(command),
        privacyWatermark: 'surface',
        metadata: command.payload,
        undoable: true
      });

      // Execute command
      const result = await handler.execute(command);
      
      if (result.success) {
        // Store for potential undo
        this.undoHistory.set(traceId, command);
        result.traceId = traceId;
        result.undoId = traceId;

        // Decision trace already recorded with addTrace
      }

      return result;
    } catch (error) {
      console.error(`Command execution failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async executeBatch(batchCommand: BatchCommand): Promise<CommandResult> {
    const { commands, atomic } = batchCommand.payload;
    const results: CommandResult[] = [];
    const successfulCommands: string[] = [];

    try {
      for (const command of commands) {
        const result = await this.execute(command);
        results.push(result);

        if (result.success) {
          if (result.undoId) {
            successfulCommands.push(result.undoId);
          }
        } else if (atomic) {
          // Rollback all successful commands in atomic mode
          for (const undoId of successfulCommands.reverse()) {
            await this.undo(undoId);
          }
          return {
            success: false,
            error: `Batch command failed atomically: ${result.error}`
          };
        }
      }

      const batchUndoId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store batch undo information with extended metadata type
      this.undoHistory.set(batchUndoId, {
        ...batchCommand,
        metadata: {
          ...batchCommand.metadata,
          batchUndoIds: successfulCommands
        } as any
      });

      return {
        success: results.every(r => r.success),
        undoId: batchUndoId,
        traceId: batchUndoId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Batch execution failed'
      };
    }
  }

  async undo(undoId: string): Promise<boolean> {
    const command = this.undoHistory.get(undoId);
    if (!command) {
      console.warn(`No command found for undo ID: ${undoId}`);
      return false;
    }

    try {
      // Handle batch undo
      if (command.type === 'BatchCommand' && (command.metadata as any)?.batchUndoIds) {
        const batchUndoIds = (command.metadata as any).batchUndoIds as string[];
        let allSuccess = true;

        for (const batchUndoId of batchUndoIds.reverse()) {
          const success = await this.undo(batchUndoId);
          if (!success) {
            allSuccess = false;
          }
        }

        if (allSuccess) {
          this.undoHistory.delete(undoId);
        }
        return allSuccess;
      }

      // Handle single command undo
      const handler = this.handlers.get(command.type);
      if (!handler || !handler.canUndo(undoId)) {
        return false;
      }

      const success = await handler.undo(undoId);
      if (success) {
        this.undoHistory.delete(undoId);
        decisionTraceService.markAsUndone(undoId, `undo_${undoId}`);
      }

      return success;
    } catch (error) {
      console.error(`Undo failed for ${undoId}:`, error);
      return false;
    }
  }

  private generateBecauseText(command: DomainCommand): string {
    const templates: Record<CommandType, string> = {
      SetPriority: 'Priority adjusted based on your input',
      SetHorizon: 'Time horizon updated for better planning', 
      SetColumn: 'Moved to requested workflow column',
      SetQuadrant: 'Quadrant updated per urgency/importance',
      Complete: 'Marked complete—nice work!',
      Snooze: 'Snoozed for later when you\'re ready',
      BatchCommand: 'Multiple changes applied together',
      CreateCalendarEvent: 'Added to calendar with undo option',
      CreateEmailDraft: 'Email draft created for review'
    };

    return templates[command.type] || 'Command executed successfully';
  }

  canUndo(undoId: string): boolean {
    const command = this.undoHistory.get(undoId);
    if (!command) return false;

    const handler = this.handlers.get(command.type);
    return handler ? handler.canUndo(undoId) : false;
  }

  getUndoHistory(): Array<{ undoId: string; command: DomainCommand; timestamp: number }> {
    return Array.from(this.undoHistory.entries()).map(([undoId, command]) => ({
      undoId,
      command,
      timestamp: command.metadata?.timestamp || 0
    }));
  }
}

export const commandBus = new DomainCommandBus();