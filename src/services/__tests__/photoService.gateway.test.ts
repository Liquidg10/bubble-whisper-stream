import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOwnedPhotoPath, photoPathFromUrl, photoService } from '../photoService';

const mock = vi.hoisted(() => ({
  getUser: vi.fn(), invoke: vi.fn(), signed: vi.fn(), upload: vi.fn(), remove: vi.fn(), from: vi.fn(),
  config: { url: 'https://abcdefghijklmnopqrst.supabase.co' },
  boundary: {
    mode: 'owner-isolated' as 'owner-isolated' | 'shared',
    projectRef: 'abcdefghijklmnopqrst',
    origin: 'https://owner.example.test' as string | null,
  },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: mock.getUser }, functions: { invoke: mock.invoke }, storage: { from: mock.from },
  },
  supabaseConfig: mock.config,
  supabaseDeploymentBoundary: mock.boundary,
}));

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const objectId = '33333333-3333-4333-8333-333333333333';
const project = 'https://abcdefghijklmnopqrst.supabase.co';
const path = `${owner}/${objectId}.png`;
const signedUrl = `${project}/storage/v1/object/sign/photos/${path}?token=private-test-token`;

function sharedMode() {
  mock.boundary.mode = 'shared';
  mock.boundary.projectRef = 'abcdefghijklmnopqrst';
  mock.boundary.origin = null;
}

describe('photo service deployment routing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.boundary.mode = 'owner-isolated';
    mock.boundary.projectRef = 'abcdefghijklmnopqrst';
    mock.boundary.origin = 'https://owner.example.test';
    vi.stubEnv('VITE_SUPABASE_URL', project);
    mock.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    mock.invoke.mockResolvedValue({ data: { path }, error: null });
    mock.upload.mockImplementation(async (storagePath: string) => ({ data: { path: storagePath }, error: null }));
    mock.remove.mockImplementation(async ([storagePath]: string[]) => ({
      data: [{ id: objectId, name: storagePath, bucket_id: 'photos' }], error: null,
    }));
    mock.signed.mockImplementation(async (storagePath: string) => ({
      data: { signedUrl: `${project}/storage/v1/object/sign/photos/${storagePath}?token=private-test-token` }, error: null,
    }));
    mock.from.mockReturnValue({ createSignedUrl: mock.signed, upload: mock.upload, remove: mock.remove });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('uses the admitted gateway only in owner-isolated mode', async () => {
    const file = new File(['image'], 'ignored-name.png', { type: 'image/png' });
    await expect(photoService.uploadPhoto(file)).resolves.toBe(signedUrl);
    expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('storage-photo', {
      body: file, headers: { 'content-type': 'image/png', 'x-storage-operation': 'upload' },
    });
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.signed).toHaveBeenCalledExactlyOnceWith(path, 10 * 365 * 24 * 60 * 60);
  });

  it('preserves direct private-bucket upload in shared mode without invoking the gateway', async () => {
    sharedMode();
    const file = new File(['image'], '../../caller-name.png', { type: 'image/png' });
    const result = await photoService.uploadPhoto(file);
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.upload).toHaveBeenCalledTimes(1);
    const [storagePath, body, options] = mock.upload.mock.calls[0];
    expect(isOwnedPhotoPath(storagePath, owner)).toBe(true);
    expect(storagePath).toMatch(new RegExp(`^${owner}/[0-9a-f-]+\\.png$`, 'u'));
    expect(storagePath).not.toContain('caller-name');
    expect(body).toBe(file);
    expect(options).toEqual({ cacheControl: '3600', upsert: false });
    expect(mock.signed).toHaveBeenCalledExactlyOnceWith(storagePath, 10 * 365 * 24 * 60 * 60);
    expect(result).toBe(`${project}/storage/v1/object/sign/photos/${storagePath}?token=private-test-token`);
  });

  it('accepts supported camera data URLs but ignores their filename for ownership', async () => {
    await photoService.uploadPhoto('data:image/png;base64,aW1hZ2U=', '../../foreign.png');
    const body = mock.invoke.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(File);
    expect(body.type).toBe('image/png');
    expect(body.size).toBe(5);
  });

  it.each([
    new File([], 'empty.png', { type: 'image/png' }),
    new File(['svg'], 'photo.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }),
    'data:image/svg+xml;base64,aW1hZ2U=', 'data:image/png;base64,!!!', 'https://foreign.test/image.png',
  ])('rejects invalid or oversized input before either write path', async file => {
    await expect(photoService.uploadPhoto(file)).rejects.toThrow();
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
  });

  it('requires an authenticated user before upload or delete in either mode', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' }))).rejects.toThrow(/authenticated/u);
    sharedMode();
    await expect(photoService.deletePhoto(signedUrl)).rejects.toThrow(/authenticated/u);
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it.each(['upload', 'delete'])('sanitizes thrown authentication transport failure for %s', async action => {
    mock.getUser.mockRejectedValue(new Error('PRIVATE_AUTH_TRANSPORT'));
    const promise = action === 'upload'
      ? photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' }))
      : photoService.deletePhoto(signedUrl);
    await expect(promise).rejects.toThrow(`Cannot ${action} photo: no authenticated user`);
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it.each([null, { path: `${other}/photo.png` }, { path: `${owner}/../photo.png` }])(
    'rejects unverifiable gateway upload response without direct fallback', async data => {
      mock.invoke.mockResolvedValue({ data, error: null });
      await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' }))).rejects.toThrow(/verified result/u);
      expect(mock.invoke).toHaveBeenCalledTimes(1);
      expect(mock.upload).not.toHaveBeenCalled();
      expect(mock.remove).not.toHaveBeenCalled();
      expect(mock.signed).not.toHaveBeenCalled();
    });

  it('does not expose gateway error context, retry, compensate, or fall back after uncertainty', async () => {
    mock.invoke.mockRejectedValue(new Error('PRIVATE_SECRET_PATH'));
    const log = vi.spyOn(console, 'error');
    await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' })))
      .rejects.toThrow('Photo upload did not return a verified result. Do not retry automatically.');
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.signed).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each([
    { label: 'provider error', result: new Error('PRIVATE_SHARED_FAILURE') },
    { label: 'mismatched receipt', result: { data: { path: `${other}/wrong.png` }, error: null } },
  ])('does not invoke the gateway, retry, or compensate after shared upload $label', async ({ result }) => {
    sharedMode();
    if (result instanceof Error) mock.upload.mockRejectedValue(result);
    else mock.upload.mockResolvedValue(result);
    const log = vi.spyOn(console, 'error');
    await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' })))
      .rejects.toThrow('Photo upload did not return a verified result. Do not retry automatically.');
    expect(mock.upload).toHaveBeenCalledTimes(1);
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.signed).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('does not delete an uploaded photo when private URL signing fails', async () => {
    mock.signed.mockRejectedValue(new Error('PRIVATE_SIGNING_FAILURE'));
    await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' })))
      .rejects.toThrow(/private photo URL/u);
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it.each([
    'https://foreign.invalid/storage/v1/object/sign/photos/' + path + '?token=private-test-token',
    `${project}/storage/v1/object/sign/photos/${other}/${objectId}.png?token=private-test-token`,
    `${project}/storage/v1/object/sign/photos/${owner}/other.png?token=private-test-token`,
  ])('rejects an unverified signed URL without compensating or changing write paths', async unverifiedUrl => {
    mock.signed.mockResolvedValue({ data: { signedUrl: unverifiedUrl }, error: null });
    await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' })))
      .rejects.toThrow('Could not generate the private photo URL. Do not retry automatically.');
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('deletes exactly the owned path through the gateway only in owner-isolated mode', async () => {
    await photoService.deletePhoto(signedUrl);
    expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('storage-photo', {
      body: { path }, headers: { 'x-storage-operation': 'delete' },
    });
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('preserves direct private-bucket delete in shared mode without invoking the gateway', async () => {
    sharedMode();
    await photoService.deletePhoto(signedUrl);
    expect(mock.remove).toHaveBeenCalledExactlyOnceWith([path]);
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it.each(['owner-isolated', 'shared'] as const)('uses validated backend URL in %s mode instead of raw environment', async mode => {
    mock.boundary.mode = mode;
    vi.stubEnv('VITE_SUPABASE_URL', 'https://foreign.invalid');
    await photoService.deletePhoto(signedUrl);
    if (mode === 'owner-isolated') expect(mock.invoke).toHaveBeenCalledTimes(1);
    else expect(mock.remove).toHaveBeenCalledTimes(1);
  });

  it.each([
    signedUrl.replace(project, 'https://foreign.test'),
    signedUrl.replace(owner, other),
    `${project}/storage/v1/object/sign/photos/${owner}/../${path}`,
    `${project}/storage/v1/object/sign/photos/${owner}/%2e%2e/${path}`,
    `${project}/storage/v1/object/sign/photos/${owner}/nested/photo.png`,
    signedUrl.replace('https://', 'https://user:password@'),
    `${signedUrl}#fragment`,
  ])('rejects foreign or normalized/traversal delete URL before either mutation path', async url => {
    for (const mode of ['owner-isolated', 'shared'] as const) {
      mock.boundary.mode = mode;
      await expect(photoService.deletePhoto(url)).rejects.toThrow();
    }
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('requires matching gateway delete receipt and never falls back to direct delete', async () => {
    mock.invoke.mockResolvedValue({ data: { path: `${owner}/other.png` }, error: null });
    await expect(photoService.deletePhoto(signedUrl)).rejects.toThrow(/verified result/u);
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it.each([
    { data: [], error: null },
    { data: [{ id: objectId, name: `${owner}/other.png` }], error: null },
    { data: [{ id: objectId, name: path, bucket_id: 'voice-samples' }], error: null },
    new Error('PRIVATE_DELETE_FAILURE'),
  ])('requires exact shared delete receipt without gateway fallback or retry', async result => {
    sharedMode();
    if (result instanceof Error) mock.remove.mockRejectedValue(result);
    else mock.remove.mockResolvedValue(result);
    await expect(photoService.deletePhoto(signedUrl))
      .rejects.toThrow('Photo deletion did not return a verified result. Do not retry automatically.');
    expect(mock.remove).toHaveBeenCalledTimes(1);
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it('limits accepted path and URL forms to the current owner and validated project', () => {
    expect(isOwnedPhotoPath(path, owner)).toBe(true);
    expect(isOwnedPhotoPath(`${owner}/..png`, owner)).toBe(false);
    expect(photoPathFromUrl(signedUrl, project, owner)).toBe(path);
    expect(photoPathFromUrl(signedUrl.replace('/sign/', '/public/'), project, owner)).toBe(path);
  });
});
