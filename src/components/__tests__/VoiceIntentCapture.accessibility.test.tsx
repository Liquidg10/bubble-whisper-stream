import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceIntentCapture } from '../VoiceIntentCapture';

const toast = vi.fn();
const addBubble = vi.fn();

vi.mock('@/stores/bubbleStore', () => ({
  useBubbleStore: () => ({
    addBubble,
    settings: {
      ttsEnabled: false,
      voiceAutoCommit: true,
      voiceConfidenceThreshold: 0.7,
    },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/services/tts', () => ({
  ttsService: { speak: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));

class MediaRecorderMock {
  static instances: MediaRecorderMock[] = [];

  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    void this.onstop?.();
  });

  constructor() {
    MediaRecorderMock.instances.push(this);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function pointerEvent(
  type: string,
  options: {
    pointerId: number;
    pointerType: 'mouse' | 'touch';
    button?: number;
    isPrimary?: boolean;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId },
    pointerType: { value: options.pointerType },
    isPrimary: { value: options.isPrimary ?? true },
  });
  return event;
}

describe('VoiceIntentCapture recording ownership', () => {
  const stopTrack = vi.fn();
  const createStream = () => ({
    getTracks: () => [{ stop: stopTrack }],
  });
  const getUserMedia = vi.fn(async () => createStream());

  beforeEach(() => {
    vi.clearAllMocks();
    getUserMedia.mockReset();
    getUserMedia.mockImplementation(async () => createStream());
    MediaRecorderMock.instances = [];
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: MediaRecorderMock,
    });
  });

  it('starts and stops default hold-mode recording from keyboard activation', async () => {
    const user = userEvent.setup();
    render(<VoiceIntentCapture compact />);

    const idleButton = screen.getByRole('button', { name: 'Hold to record' });
    idleButton.focus();
    await user.keyboard('{Enter}');

    const recordingButton = await screen.findByRole('button', {
      name: 'Recording (release to stop)',
    });
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(MediaRecorderMock.instances).toHaveLength(1);
    expect(MediaRecorderMock.instances[0].start).toHaveBeenCalledOnce();

    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByRole('button', {
      name: 'Hold to record',
    })).toBeVisible());
    expect(MediaRecorderMock.instances[0].stop).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it.each(['mouse', 'touch'])('holds recording for a %s pointer until that pointer releases', async (pointerType) => {
    render(<VoiceIntentCapture compact />);

    fireEvent(screen.getByRole('button', { name: 'Hold to record' }), pointerEvent('pointerdown', {
      pointerId: 7,
      pointerType: pointerType as 'mouse' | 'touch',
      button: 0,
      isPrimary: true,
    }));

    const recordingButton = await screen.findByRole('button', {
      name: 'Recording (release to stop)',
    });
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(MediaRecorderMock.instances[0].start).toHaveBeenCalledOnce();

    fireEvent(recordingButton, pointerEvent('pointerup', {
      pointerId: 7,
      pointerType: pointerType as 'mouse' | 'touch',
      button: 0,
      isPrimary: true,
    }));
    fireEvent.click(recordingButton, {
      detail: 1,
    });

    await waitFor(() => expect(screen.getByRole('button', {
      name: 'Hold to record',
    })).toBeVisible());
    expect(MediaRecorderMock.instances[0].stop).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('lets only the pointer that began the hold stop recording', async () => {
    render(<VoiceIntentCapture compact />);

    const button = screen.getByRole('button', { name: 'Hold to record' });
    fireEvent(button, pointerEvent('pointerdown', {
      pointerId: 17,
      pointerType: 'touch',
    }));
    const recordingButton = await screen.findByRole('button', {
      name: 'Recording (release to stop)',
    });

    fireEvent(recordingButton, pointerEvent('pointerup', {
      pointerId: 18,
      pointerType: 'touch',
    }));
    expect(MediaRecorderMock.instances[0].stop).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {
      name: 'Recording (release to stop)',
    })).toBeVisible();

    fireEvent(recordingButton, pointerEvent('pointerup', {
      pointerId: 17,
      pointerType: 'touch',
    }));
    await waitFor(() => expect(screen.getByRole('button', {
      name: 'Hold to record',
    })).toBeVisible());
    expect(MediaRecorderMock.instances[0].stop).toHaveBeenCalledOnce();
  });

  it('discards microphone access that resolves after a held pointer releases', async () => {
    const pendingStream = deferred<ReturnType<typeof createStream>>();
    getUserMedia.mockReturnValueOnce(pendingStream.promise);
    render(<VoiceIntentCapture compact />);

    const button = screen.getByRole('button', { name: 'Hold to record' });
    fireEvent(button, pointerEvent('pointerdown', {
      pointerId: 11,
      pointerType: 'touch',
      button: 0,
      isPrimary: true,
    }));
    expect(getUserMedia).toHaveBeenCalledOnce();

    fireEvent(button, pointerEvent('pointerup', {
      pointerId: 11,
      pointerType: 'touch',
      button: 0,
      isPrimary: true,
    }));
    await act(async () => {
      pendingStream.resolve(createStream());
      await pendingStream.promise;
    });

    expect(MediaRecorderMock.instances).toHaveLength(0);
    await waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Hold to record' })).toBeVisible();
  });

  it('does not create duplicate starts from repeated pointer-down events', async () => {
    const pendingStream = deferred<ReturnType<typeof createStream>>();
    getUserMedia.mockReturnValueOnce(pendingStream.promise);
    render(<VoiceIntentCapture compact />);

    const button = screen.getByRole('button', { name: 'Hold to record' });
    const pointer = {
      pointerId: 13,
      pointerType: 'mouse' as const,
      button: 0,
      isPrimary: true,
    };
    fireEvent(button, pointerEvent('pointerdown', pointer));
    fireEvent(button, pointerEvent('pointerdown', pointer));

    expect(getUserMedia).toHaveBeenCalledOnce();
    fireEvent(button, pointerEvent('pointerup', pointer));
    await act(async () => {
      pendingStream.resolve(createStream());
      await pendingStream.promise;
    });
    expect(MediaRecorderMock.instances).toHaveLength(0);
    await waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
  });

  it('uses a second keyboard activation to cancel one pending start', async () => {
    const user = userEvent.setup();
    const pendingStream = deferred<ReturnType<typeof createStream>>();
    getUserMedia.mockReturnValueOnce(pendingStream.promise);
    render(<VoiceIntentCapture compact />);

    const button = screen.getByRole('button', { name: 'Hold to record' });
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    expect(getUserMedia).toHaveBeenCalledOnce();
    await act(async () => {
      pendingStream.resolve(createStream());
      await pendingStream.promise;
    });
    expect(MediaRecorderMock.instances).toHaveLength(0);
    await waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
  });
});
