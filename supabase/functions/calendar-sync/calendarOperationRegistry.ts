import {
  type CalendarOperationIdentity,
  type CalendarOperationResult,
  calendarOperationIdentity,
  parseCalendarOperationIdentity,
  parseCalendarOperationResult,
} from '../_shared/calendarOperationReceiptContract.ts';
import { reviewedUpdateRecord, reviewedUpdateUuid } from '../_shared/calendarReviewedUpdateContract.ts';

export interface CalendarOperationRegistry {
  claimOperation(owner: string, identity: CalendarOperationIdentity): Promise<unknown>;
  readOperation(owner: string, identity: CalendarOperationIdentity): Promise<unknown>;
  finalizeOperation(owner: string, identity: CalendarOperationIdentity, claimToken: string, result: CalendarOperationResult): Promise<unknown>;
}

type CalendarOperationRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const UNAVAILABLE = 'Calendar operation registry unavailable';

// Only own data properties cross this boundary. Accessors must not change an
// already-validated identity/result between validation and asynchronous dispatch.
function dataSnapshot(value: unknown): Record<string, unknown> | null {
  if (!reviewedUpdateRecord(value)) return null;
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

/** No fallback writes, retries, provider requests, or raw database error exposure. */
export function createCalendarOperationRegistry(rpc: CalendarOperationRpc): CalendarOperationRegistry {
  async function invoke(
    name: string,
    owner: string,
    identity: CalendarOperationIdentity,
    completion?: { claimToken: string; result: CalendarOperationResult },
  ): Promise<unknown> {
    try {
      if (!reviewedUpdateUuid(owner)) throw new Error(UNAVAILABLE);
      const validatedIdentity = parseCalendarOperationIdentity(dataSnapshot(identity));
      if (!validatedIdentity) throw new Error(UNAVAILABLE);
      const args: Record<string, unknown> = {
        p_owner: owner,
        p_identity: calendarOperationIdentity(validatedIdentity),
      };
      if (completion) {
        if (!reviewedUpdateUuid(completion.claimToken)) throw new Error(UNAVAILABLE);
        const validatedResult = parseCalendarOperationResult(dataSnapshot(completion.result), validatedIdentity.expectedEtag);
        if (!validatedResult) throw new Error(UNAVAILABLE);
        args.p_claim_token = completion.claimToken;
        args.p_result = { ...validatedResult };
      }
      const response = await rpc(name, args);
      if (!reviewedUpdateRecord(response) || !Object.prototype.hasOwnProperty.call(response, 'data') ||
        !Object.prototype.hasOwnProperty.call(response, 'error') || response.error !== null) throw new Error(UNAVAILABLE);
      // This adapter attests neither identity nor completion. The handler must
      // strictly validate this unknown SQL result before using it as evidence.
      return response.data;
    } catch {
      throw new Error(UNAVAILABLE);
    }
  }

  return {
    claimOperation: (owner, identity) => invoke('calendar_operation_claim', owner, identity),
    readOperation: (owner, identity) => invoke('calendar_operation_read', owner, identity),
    finalizeOperation: (owner, identity, claimToken, result) => invoke('calendar_operation_finalize', owner, identity, { claimToken, result }),
  };
}
