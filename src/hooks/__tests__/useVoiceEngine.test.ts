import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceEngine } from '@/hooks/useVoiceEngine';
import { useBubbleStore } from '@/stores/bubbleStore';
import { voiceEngine } from '@/services/voiceEngine';
import { voiceHotkeyManager } from '@/services/voiceHotkeyManager';
import { isKillSwitchActive } from '@/config/flags';

vi.mock('@/stores/bubbleStore');
vi.mock('@/services/voiceEngine');
vi.mock('@/services/voiceHotkeyManager');
vi.mock('@/config/flags');
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

describe('useVoiceEngine — auto-write kill switch gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useBubbleStore as any).mockReturnValue({
      settings: { voiceAutoCommit: true, voiceHotkey: 'Space', voiceConfidenceThreshold: 0.7 }
    });

    (voiceEngine.getState as any) = vi.fn(() => ({
      isRecording: false,
      liveTranscript: '',
      source: null
    }));
    (voiceEngine.startCapture as any) = vi.fn().mockResolvedValue(true);
    (voiceEngine.stopCapture as any) = vi.fn().mockResolvedValue(null);
    (voiceEngine.forceStop as any) = vi.fn();

    (voiceHotkeyManager.setHotkey as any) = vi.fn();
    (voiceHotkeyManager.registerTarget as any) = vi.fn(() => vi.fn());
    (voiceHotkeyManager.isHotkeyPressed as any) = vi.fn(() => false);
  });

  it('passes autoCommitEnabled: true through to voiceEngine.startCapture when kill switch is inactive and store setting is on', async () => {
    (isKillSwitchActive as any).mockReturnValue(false);

    const { result } = renderHook(() => useVoiceEngine({ source: 'test' }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(voiceEngine.startCapture).toHaveBeenCalledWith(
      expect.objectContaining({ autoCommitEnabled: true }),
      expect.anything()
    );
  });

  it('forces autoCommitEnabled: false when the kill switch is active, even though voiceAutoCommit is on', async () => {
    (isKillSwitchActive as any).mockReturnValue(true);

    const { result } = renderHook(() => useVoiceEngine({ source: 'test' }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(voiceEngine.startCapture).toHaveBeenCalledWith(
      expect.objectContaining({ autoCommitEnabled: false }),
      expect.anything()
    );
  });

  it('kill switch overrides an explicit autoCommitOverride: true passed by the caller', async () => {
    (isKillSwitchActive as any).mockReturnValue(true);

    const { result } = renderHook(() =>
      useVoiceEngine({ source: 'test', autoCommitOverride: true })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(voiceEngine.startCapture).toHaveBeenCalledWith(
      expect.objectContaining({ autoCommitEnabled: false }),
      expect.anything()
    );
  });
});
