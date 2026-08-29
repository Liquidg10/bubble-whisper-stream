import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveContact: vi.fn(),
  composeEmail: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock('@/services/contactDisambiguationService', () => ({
  contactDisambiguationService: {
    resolveContact: mocks.resolveContact
  }
}));

vi.mock('@/services/gmailDraftSendService', () => ({
  gmailDraftSendService: {
    composeEmail: mocks.composeEmail
  }
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError
  }
}));

import { EmailComposeModal } from '../EmailComposeModal';

const draftResult = {
  success: true,
  traceId: 'trace-1',
  draftId: 'provider-draft-1',
  decision: 'drafted' as const,
  requestedOperation: 'draft' as const,
  providerOperation: 'create_draft' as const,
  undoAvailable: true,
  guardrailCheck: {
    canAutoSend: false,
    canDraft: true,
    requiresConfirmation: false,
    blockedReasons: [],
    warnings: [],
    confidence: 0.9,
    decision: 'draft-only' as const
  }
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderModal(onClose = vi.fn()) {
  render(
    <EmailComposeModal
      isOpen
      onClose={onClose}
      accountId="account-1"
      initialRecipients={['recipient@example.com']}
      initialSubject="A subject"
      initialBody="A body"
    />
  );
  return { onClose };
}

describe('EmailComposeModal outcome boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveContact.mockResolvedValue({
      needsDisambiguation: false,
      exactMatch: { email: 'recipient@example.com' }
    });
    mocks.composeEmail.mockResolvedValue(draftResult);
  });

  afterEach(() => cleanup());

  it('keeps Save Draft explicit even when the auto-send switch is enabled', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('switch', { name: 'Enable auto-send for trusted recipients' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(mocks.composeEmail).toHaveBeenCalledOnce());
    expect(mocks.composeEmail).toHaveBeenCalledWith(
      'account-1',
      {
        recipients: ['recipient@example.com'],
        subject: 'A subject',
        body: 'A body'
      },
      expect.objectContaining({
        requestedOperation: 'draft',
        autoSendEnabled: false,
        surface: 'email-compose-modal'
      })
    );
  });

  it('suppresses a rapid duplicate click before React can rerender disabled state', async () => {
    const provider = deferred<typeof draftResult>();
    mocks.composeEmail.mockReturnValue(provider.promise);
    renderModal();

    const saveDraft = screen.getByRole('button', { name: 'Save Draft' });
    fireEvent.click(saveDraft);
    fireEvent.click(saveDraft);

    await waitFor(() => expect(mocks.composeEmail).toHaveBeenCalledOnce());
    expect(mocks.resolveContact).toHaveBeenCalledOnce();

    await act(async () => {
      provider.resolve(draftResult);
      await provider.promise;
    });
    expect(mocks.composeEmail).toHaveBeenCalledOnce();
  });

  it('treats cancel before a provider action as no decision outcome', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.resolveContact).not.toHaveBeenCalled();
    expect(mocks.composeEmail).not.toHaveBeenCalled();
  });
});
