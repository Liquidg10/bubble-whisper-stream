import type { TaskRelationshipKind } from '@/types/task';
import type { ResolvedTaskRelationship } from '@/domain/taskRelationships';

export const taskRelationshipLabel = (kind: TaskRelationshipKind) =>
  kind === 'depends-on' ? 'depends on' : kind === 'supports' ? 'helps' : 'has a tradeoff with';

export const taskRelationshipTraceKey = ({ source, relationship }: ResolvedTaskRelationship) =>
  JSON.stringify([source.id, relationship.id, relationship.kind, relationship.targetTaskId]);
