import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from } = vi.hoisted(() => ({
  from: vi.fn()
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from }
}));

import { plaidService } from '../plaidService';

describe('plaidService privilege boundary', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it('joins sync status metadata through plaid_items_safe, never plaid_items', async () => {
    from.mockImplementation((relation: string) => ({
      select: vi.fn().mockResolvedValue(
        relation === 'plaid_sync_status'
          ? {
              data: [{ id: 'status-1', plaid_item_id: 'item-row-1' }],
              error: null
            }
          : {
              data: [{
                id: 'item-row-1',
                item_id: 'provider-item-1',
                institution_name: 'Test Bank'
              }],
              error: null
            }
      )
    }));

    await expect(plaidService.getSyncStatuses()).resolves.toEqual([
      {
        id: 'status-1',
        plaid_item_id: 'item-row-1',
        plaid_items: {
          item_id: 'provider-item-1',
          institution_name: 'Test Bank'
        }
      }
    ]);

    expect(from).toHaveBeenCalledWith('plaid_sync_status');
    expect(from).toHaveBeenCalledWith('plaid_items_safe');
    expect(from).not.toHaveBeenCalledWith('plaid_items');
  });
});
