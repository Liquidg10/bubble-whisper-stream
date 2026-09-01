import { supabase, supabaseConfig, supabaseDeploymentBoundary } from '@/integrations/supabase/client';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID}$`, 'u');
const PHOTO_PATH = new RegExp(`^${UUID}/[A-Za-z0-9][A-Za-z0-9._-]{0,254}$`, 'u');
const PHOTO_TYPES = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif'],
]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const TEN_YEARS_IN_SECONDS = 10 * 365 * 24 * 60 * 60;

async function sanitized<T>(operation: () => PromiseLike<T>, message: string): Promise<T> {
  try { return await operation(); }
  catch { throw new Error(message); }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function verifiedDirectDelete(value: unknown, path: string): boolean {
  if (!Array.isArray(value) || value.length !== 1 || !record(value[0])) return false;
  const item = value[0];
  return item.name === path && typeof item.id === 'string' && UUID_PATTERN.test(item.id)
    && (item.bucket_id === undefined || item.bucket_id === 'photos');
}

function verifiedSignedPhotoUrl(value: unknown, projectUrl: string, userId: string, path: string): value is string {
  if (typeof value !== 'string') return false;
  try { return photoPathFromUrl(value, projectUrl, userId) === path; }
  catch { return false; }
}

/** Validate a returned path before using it for any authenticated read. */
export function isOwnedPhotoPath(path: unknown, userId: string): path is string {
  return typeof path === 'string' && PHOTO_PATH.test(path) &&
    path.startsWith(`${userId}/`) && !path.includes('..');
}

/** Only known photo URLs may become a privileged delete request. */
export function photoPathFromUrl(photoUrl: string, projectUrl: string, userId: string): string {
  // URL normalizes dot segments and backslashes; reject them before parsing.
  const rawPath = photoUrl.split(/[?#]/u)[0];
  if (rawPath.includes('%') || rawPath.includes('\\') ||
      [...rawPath].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) ||
      /(?:^|\/)\.{1,2}(?:\/|$)/u.test(rawPath)) {
    throw new Error('Invalid photo URL');
  }
  let url: URL;
  let origin: URL;
  try {
    url = new URL(photoUrl);
    origin = new URL(projectUrl);
  } catch {
    throw new Error('Invalid photo URL');
  }
  const match = /^\/storage\/v1\/object\/(?:sign|public)\/photos\/(.+)$/u.exec(url.pathname);
  if (url.origin !== origin.origin || url.username || url.password || url.hash || !match ||
      !isOwnedPhotoPath(match[1], userId)) {
    throw new Error('Photo URL must belong to the current user and project');
  }
  return match[1];
}

export class PhotoService {
  private static instance: PhotoService;

  static getInstance(): PhotoService {
    if (!PhotoService.instance) PhotoService.instance = new PhotoService();
    return PhotoService.instance;
  }

  /** Owner-isolated builds use the admitted gateway; the shared build keeps its existing private bucket path. */
  async uploadPhoto(file: File | string, fileName?: string): Promise<string> {
    const fileToUpload = typeof file === 'string' && file.startsWith('data:')
      ? this.dataURLToFile(file, fileName || 'photo.jpg')
      : file;
    const photoExtension = fileToUpload instanceof File ? PHOTO_TYPES.get(fileToUpload.type) : undefined;
    if (!(fileToUpload instanceof File) || !photoExtension ||
        fileToUpload.size < 1 || fileToUpload.size > MAX_PHOTO_BYTES) {
      throw new Error('Photo must be JPEG, PNG, WebP or GIF, up to 10 MiB');
    }
    const { data: { user }, error: authError } = await sanitized(
      () => supabase.auth.getUser(),
      'Cannot upload photo: no authenticated user',
    );
    if (authError || !user) throw new Error('Cannot upload photo: no authenticated user');

    let uploadedPath: string;
    if (supabaseDeploymentBoundary.mode === 'owner-isolated') {
      const { data, error } = await sanitized(
        () => supabase.functions.invoke('storage-photo', {
          body: fileToUpload,
          headers: { 'content-type': fileToUpload.type, 'x-storage-operation': 'upload' },
        }),
        'Photo upload did not return a verified result. Do not retry automatically.',
      );
      if (error || !isOwnedPhotoPath(data?.path, user.id)) {
        // Do not log function error contexts, tokens, private paths, or signed URLs.
        // A lost response is not permission to retry or compensate with a delete.
        throw new Error('Photo upload did not return a verified result. Do not retry automatically.');
      }
      uploadedPath = data.path;
    } else {
      let fileId: string;
      try { fileId = globalThis.crypto.randomUUID(); }
      catch { throw new Error('Photo upload is unavailable. Do not retry automatically.'); }
      const storagePath = `${user.id}/${fileId}.${photoExtension}`;
      if (!isOwnedPhotoPath(storagePath, user.id)) {
        throw new Error('Photo upload is unavailable. Do not retry automatically.');
      }
      const { data, error } = await sanitized(
        () => supabase.storage.from('photos').upload(storagePath, fileToUpload, {
          cacheControl: '3600', upsert: false,
        }),
        'Photo upload did not return a verified result. Do not retry automatically.',
      );
      if (error || data?.path !== storagePath) {
        throw new Error('Photo upload did not return a verified result. Do not retry automatically.');
      }
      uploadedPath = storagePath;
    }

    // Preserve the existing private-photo read contract. URL lifetime/rotation is
    // a separate product change, not part of ingress/drain hardening.
    const { data: signedData, error: signError } = await sanitized(
      () => supabase.storage.from('photos').createSignedUrl(uploadedPath, TEN_YEARS_IN_SECONDS),
      'Could not generate the private photo URL. Do not retry automatically.',
    );
    if (signError || !signedData ||
        !verifiedSignedPhotoUrl(signedData.signedUrl, supabaseConfig.url, user.id, uploadedPath)) {
      throw new Error('Could not generate the private photo URL. Do not retry automatically.');
    }
    return signedData.signedUrl;
  }

  private dataURLToFile(dataURL: string, filename: string): File {
    // Bound encoded input before allocating decoded bytes. Do not accept SVG,
    // arbitrary data URL metadata, or caller-controlled content-type fallbacks.
    if (dataURL.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 64) {
      throw new Error('Photo exceeds 10 MiB');
    }
    const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/u.exec(dataURL);
    if (!match || !match[2]) throw new Error('Invalid photo data URL');
    let decoded: string;
    try { decoded = atob(match[2]); } catch { throw new Error('Invalid photo data URL'); }
    return new File([Uint8Array.from(decoded, (character) => character.charCodeAt(0))], filename, { type: match[1] });
  }

  async deletePhoto(photoUrl: string): Promise<void> {
    const { data: { user }, error: authError } = await sanitized(
      () => supabase.auth.getUser(),
      'Cannot delete photo: no authenticated user',
    );
    if (authError || !user) throw new Error('Cannot delete photo: no authenticated user');
    const storagePath = photoPathFromUrl(photoUrl, supabaseConfig.url, user.id);
    if (supabaseDeploymentBoundary.mode === 'owner-isolated') {
      const { data, error } = await sanitized(
        () => supabase.functions.invoke('storage-photo', {
          body: { path: storagePath },
          headers: { 'x-storage-operation': 'delete' },
        }),
        'Photo deletion did not return a verified result. Do not retry automatically.',
      );
      if (error || data?.path !== storagePath) {
        throw new Error('Photo deletion did not return a verified result. Do not retry automatically.');
      }
      return;
    }
    const { data, error } = await sanitized(
      () => supabase.storage.from('photos').remove([storagePath]),
      'Photo deletion did not return a verified result. Do not retry automatically.',
    );
    if (error || !verifiedDirectDelete(data, storagePath)) {
      throw new Error('Photo deletion did not return a verified result. Do not retry automatically.');
    }
  }
}

export const photoService = PhotoService.getInstance();
