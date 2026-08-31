import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSupabasePublicConfig, type SupabasePublicConfig } from '@/integrations/supabase/config';
import { assertDeploymentOrigin, resolveDeploymentBoundary, SHARED_PROJECT_REF, ISOLATED_PROJECT_REF, SHARED_APP_ORIGIN } from '@/integrations/supabase/deploymentBoundary';

const mocks = vi.hoisted(() => ({ config: null as SupabasePublicConfig | null, fetch: vi.fn(), websocket: vi.fn(), microphone: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ get supabaseConfig() { return mocks.config; } }));
vi.mock('@/components/DevPerformanceMonitor', () => ({ DevPerformanceMonitor: () => null }));
vi.mock('@/components/BulletproofPhotoRenderer', () => ({ BulletproofPhotoRenderer: ({ src, bubbleId }: { src: string; bubbleId: string }) =>
  React.createElement('img', { src, alt: bubbleId }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const modernKey = `sb_publishable_${'r'.repeat(22)}_${'c'.repeat(8)}`;
const encoded = (value: object) => btoa(JSON.stringify(value)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=/gu, '');
const legacyKey = (ref: string) => `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ iss: 'supabase', ref, role: 'anon' })}.${'s'.repeat(43)}`;
const sampleAudio = btoa(String.fromCharCode(255, 251) + 'a'.repeat(100));
const audioResponse = () => new Response(JSON.stringify({ audioContent: sampleAudio }), { status: 200 });

function configure(ref: string, modern = false): SupabasePublicConfig {
  const environment = { VITE_SUPABASE_PROJECT_ID: ref, VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: modern ? modernKey : legacyKey(ref),
    ...(ref === ISOLATED_PROJECT_REF ? { VITE_MIND_MANUAL_DEPLOYMENT_MODE: 'owner-isolated',
      VITE_MIND_MANUAL_DEPLOYMENT_ORIGIN: 'https://owner.example.test' } : {}) };
  const boundary = resolveDeploymentBoundary(environment);
  assertDeploymentOrigin(boundary, ref === ISOLATED_PROJECT_REF ? 'https://owner.example.test' : SHARED_APP_ORIGIN);
  mocks.config = resolveSupabasePublicConfig(environment);
  expect(Object.isFrozen(mocks.config)).toBe(true);
  return mocks.config;
}

class FakeAudioContext {
  state = 'running'; destination = {};
  createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  createScriptProcessor() { return { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }; }
  async close() { this.state = 'closed'; }
}
class FakeWebSocket {
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn();
  constructor(url: string) { mocks.websocket(url); queueMicrotask(() => this.onopen?.()); }
  close() { this.readyState = 3; this.onclose?.(); }
}

describe('runtime diagnostics and voice obey the validated deployment backend', () => {
  let voice: typeof import('@/services/voiceRealtime')['voiceRealtimeService'] | undefined;
  beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks(); localStorage.clear(); voice = undefined;
    configure(SHARED_PROJECT_REF);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.fetch.mockImplementation(async () => audioResponse()); vi.stubGlobal('fetch', mocks.fetch);
    mocks.microphone.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: mocks.microphone } });
    vi.stubGlobal('AudioContext', FakeAudioContext); vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(async () => {
    await voice?.stopSession(); cleanup();
    const logged = JSON.stringify([vi.mocked(console.log).mock.calls, vi.mocked(console.error).mock.calls]);
    expect(logged).not.toContain(mocks.config!.publishableKey);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  it.each([SHARED_PROJECT_REF, ISOLATED_PROJECT_REF])('routes explicit realtime voice only to the configured %s relay', async ref => {
    const config = configure(ref);
    ({ voiceRealtimeService: voice } = await import('@/services/voiceRealtime'));
    expect(mocks.websocket).not.toHaveBeenCalled(); expect(mocks.microphone).not.toHaveBeenCalled();
    await voice.startSession();
    expect(mocks.websocket).toHaveBeenCalledExactlyOnceWith(`wss://${ref}.functions.supabase.co/ai-realtime-voice`);
    expect(mocks.websocket.mock.calls[0][0]).not.toContain(config.publishableKey);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([SHARED_PROJECT_REF, ISOLATED_PROJECT_REF])('renders both Supabase photo examples only from configured %s storage', async ref => {
    configure(ref); const { default: DevPhotoTest } = await import('@/pages/DevPhotoTest');
    render(React.createElement(DevPhotoTest));
    expect(screen.getByAltText('supabase-memory')).toHaveAttribute('src', `https://${ref}.supabase.co/storage/v1/object/public/photos/sample-memory.jpg`);
    expect(screen.getByAltText('supabase-mood-completed')).toHaveAttribute('src', `https://${ref}.supabase.co/storage/v1/object/public/photos/sample-mood.jpg`);
    const backendSources = screen.getAllByRole('img').map(image => image.getAttribute('src')).filter(src => src?.includes('supabase.co'));
    expect(backendSources).toHaveLength(2);
    expect(backendSources.every(src => new URL(src!).hostname === `${ref}.supabase.co`)).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.websocket).not.toHaveBeenCalled();
  });
  it.each([SHARED_PROJECT_REF, ISOLATED_PROJECT_REF])('routes both TTS diagnostic requests and validated legacy anon headers to %s', async ref => {
    const config = configure(ref); const { TTSDiagnostic } = await import('@/test/tts-diagnostic');
    vi.spyOn(TTSDiagnostic, 'testAudioPlayability').mockResolvedValue({ testName: 'Synthetic audio fixture', passed: true, details: 'Synthetic only', confidence: 80 });
    expect(mocks.fetch).not.toHaveBeenCalled(); await TTSDiagnostic.runCompleteDiagnostic();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    for (const [url, options] of mocks.fetch.mock.calls) {
      expect(url).toBe(`${config.url}/functions/v1/ai-tts-generate`);
      expect(url).not.toContain(config.publishableKey);
      expect(options).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}` } });
      expect(options.body).not.toContain(config.publishableKey);
    }
  });
  it.each([SHARED_PROJECT_REF, ISOLATED_PROJECT_REF])('never presents a modern publishable key as a user JWT on %s', async ref => {
    const config = configure(ref, true); const { TTSDiagnostic } = await import('@/test/tts-diagnostic');
    mocks.fetch.mockResolvedValue(new Response('PRIVATE_REFLECTED_BODY', { status: 401, statusText: 'Rejected' }));
    const result = await TTSDiagnostic.testEdgeFunctionResponse();
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(`${config.url}/functions/v1/ai-tts-generate`, expect.objectContaining({ headers: {
      'Content-Type': 'application/json', apikey: config.publishableKey } }));
    expect(result.passed).toBe(false); expect(result.details).toContain('HTTP 401');
    expect(result.details).toContain('not verified'); expect(JSON.stringify(result)).not.toContain('PRIVATE_REFLECTED_BODY');
  });
  it.each(['transport', 'http', 'invalid-json'])('does not fall back to source or reflect %s failure details', async failure => {
    const config = configure(ISOLATED_PROJECT_REF); const { TTSDiagnostic } = await import('@/test/tts-diagnostic');
    if (failure === 'transport') mocks.fetch.mockRejectedValue(new Error(`PRIVATE ${config.publishableKey}`));
    if (failure === 'http') mocks.fetch.mockResolvedValue(new Response(`PRIVATE ${config.publishableKey}`, { status: 500, statusText: `PRIVATE ${config.publishableKey}` }));
    if (failure === 'invalid-json') mocks.fetch.mockResolvedValue(new Response(`PRIVATE ${config.publishableKey}`, { status: 200 }));
    const result = await TTSDiagnostic.testEdgeFunctionResponse();
    expect(result.passed).toBe(false); expect(JSON.stringify(result)).not.toMatch(/PRIVATE/); expect(JSON.stringify(result)).not.toContain(config.publishableKey);
    expect(mocks.fetch).toHaveBeenCalledTimes(1); expect(mocks.fetch.mock.calls[0][0]).toBe(`${config.url}/functions/v1/ai-tts-generate`);
  });
  it.each(['transport', 'http', 'invalid-json'])('keeps second sample %s failure sanitized and on the selected target', async failure => {
    const config = configure(ISOLATED_PROJECT_REF); const { TTSDiagnostic } = await import('@/test/tts-diagnostic');
    mocks.fetch.mockResolvedValueOnce(audioResponse());
    if (failure === 'transport') mocks.fetch.mockRejectedValueOnce(new Error(`PRIVATE ${config.publishableKey}`));
    if (failure === 'http') mocks.fetch.mockResolvedValueOnce(new Response(`PRIVATE ${config.publishableKey}`, { status: 500 }));
    if (failure === 'invalid-json') mocks.fetch.mockResolvedValueOnce(new Response(`PRIVATE ${config.publishableKey}`, { status: 200 }));
    await expect(TTSDiagnostic.runCompleteDiagnostic()).rejects.toThrow(/^Diagnostic audio (?:request failed|sample is unavailable)\.$/u);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls.every(([url]) => url === `${config.url}/functions/v1/ai-tts-generate`)).toBe(true);
  });
});
