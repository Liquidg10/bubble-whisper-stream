import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOwnedPhotoPath, photoPathFromUrl, photoService } from '../photoService';

const mock = vi.hoisted(() => ({ getUser: vi.fn(), invoke: vi.fn(), signed: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: mock.getUser }, functions: { invoke: mock.invoke }, storage: { from: mock.from },
} }));
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const project = 'https://abcdefghijklmnopqrst.supabase.co';
const path = `${owner}/33333333-3333-4333-8333-333333333333.png`;
const signedUrl = `${project}/storage/v1/object/sign/photos/${path}?token=private-test-token`;

describe('photo service admitted gateway', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', project);
    mock.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    mock.invoke.mockResolvedValue({ data: { path }, error: null });
    mock.signed.mockResolvedValue({ data: { signedUrl }, error: null });
    // Any old upload/remove method would fail here instead of silently falling back.
    mock.from.mockReturnValue({ createSignedUrl: mock.signed });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sends binary image once to admitted gateway and uses Storage only for private reads', async () => {
    const file = new File(['image'], 'ignored-name.png', { type: 'image/png' });
    await expect(photoService.uploadPhoto(file)).resolves.toBe(signedUrl);
    expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('storage-photo', {
      body: file, headers: { 'content-type': 'image/png', 'x-storage-operation': 'upload' },
    });
    expect(mock.signed).toHaveBeenCalledExactlyOnceWith(path, 10 * 365 * 24 * 60 * 60);
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
  ])('rejects invalid or oversized input before any gateway call', async (file) => {
    await expect(photoService.uploadPhoto(file)).rejects.toThrow();
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it('requires authenticated user before upload or delete', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' }))).rejects.toThrow(/authenticated/);
    await expect(photoService.deletePhoto(signedUrl)).rejects.toThrow(/authenticated/);
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it.each([null, { path: `${other}/photo.png` }, { path: `${owner}/../photo.png` }])('rejects unverifiable upload response without read, retry or compensation', async (data) => {
    mock.invoke.mockResolvedValue({ data, error: null });
    await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' }))).rejects.toThrow(/verified result/);
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('does not expose backend error context or compensate after uncertain upload', async () => {
    mock.invoke.mockResolvedValue({ data: null, error: new Error('PRIVATE_SECRET_PATH') });
    const log = vi.spyOn(console, 'error');
    await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' }))).rejects.toThrow('Photo upload did not return a verified result. Do not retry automatically.');
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    expect(mock.from).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('does not delete an uploaded photo when private read signing fails', async () => {
    mock.signed.mockResolvedValue({ data: null, error: new Error('private') });
    await expect(photoService.uploadPhoto(new File(['png'], 'x.png', { type: 'image/png' }))).rejects.toThrow(/private photo URL/);
    expect(mock.invoke).toHaveBeenCalledTimes(1);
  });

  it('deletes exactly the owned path through the gateway, never a direct Storage mutation', async () => {
    await photoService.deletePhoto(signedUrl);
    expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('storage-photo', {
      body: { path }, headers: { 'x-storage-operation': 'delete' },
    });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it.each([
    signedUrl.replace(project, 'https://foreign.test'),
    signedUrl.replace(owner, other),
    `${project}/storage/v1/object/sign/photos/${owner}/../${path}`,
    `${project}/storage/v1/object/sign/photos/${owner}/%2e%2e/${path}`,
    `${project}/storage/v1/object/sign/photos/${owner}/nested/photo.png`,
    signedUrl.replace('https://', 'https://user:password@'),
    `${signedUrl}#fragment`,
  ])('rejects foreign or normalized/traversal delete URL before gateway call', async (url) => {
    await expect(photoService.deletePhoto(url)).rejects.toThrow();
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it('requires matching delete receipt and never retries uncertainty', async () => {
    mock.invoke.mockResolvedValue({ data: { path: `${owner}/other.png` }, error: null });
    await expect(photoService.deletePhoto(signedUrl)).rejects.toThrow(/verified result/);
    expect(mock.invoke).toHaveBeenCalledTimes(1);
  });

  it('limits accepted path and URL forms to the current owner/project', () => {
    expect(isOwnedPhotoPath(path, owner)).toBe(true);
    expect(isOwnedPhotoPath(`${owner}/..png`, owner)).toBe(false);
    expect(photoPathFromUrl(signedUrl, project, owner)).toBe(path);
    expect(photoPathFromUrl(signedUrl.replace('/sign/', '/public/'), project, owner)).toBe(path);
  });
});
