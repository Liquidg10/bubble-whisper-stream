import { supabase } from '@/integrations/supabase/client';

export class PhotoService {
  private static instance: PhotoService;
  
  static getInstance(): PhotoService {
    if (!PhotoService.instance) {
      PhotoService.instance = new PhotoService();
    }
    return PhotoService.instance;
  }

  /**
   * Uploads a photo to Supabase storage and returns the public URL
   */
  async uploadPhoto(file: File | string, fileName?: string): Promise<string> {
    try {
      let fileToUpload: File;
      
      // Handle data URL (base64) input
      if (typeof file === 'string' && file.startsWith('data:')) {
        fileToUpload = this.dataURLToFile(file, fileName || `photo-${Date.now()}.jpg`);
      } else if (file instanceof File) {
        fileToUpload = file;
      } else {
        throw new Error('Invalid file input');
      }

      // Generate unique filename, scoped under the owning user's ID.
      // Required for the storage RLS policies (migration 31) which authorize
      // access via storage.foldername(name)[1] = auth.uid()::text -- flat
      // filenames with no user-id folder would fail every policy check.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Cannot upload photo: no authenticated user');
      }
      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}-${fileToUpload.name}`;
      const storagePath = `${user.id}/${uniqueFileName}`;
      
      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('photos')
        .upload(storagePath, fileToUpload, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Migration 31 makes the 'photos' bucket private (it previously allowed
      // anonymous read/write of any user's photos -- a real exposure for a
      // mental-health app). getPublicUrl() no longer resolves against a private
      // bucket, so we sign a long-lived URL instead. 10 years is a pragmatic
      // stand-in for "effectively permanent" for a personal-use app with no
      // URL-rotation job; revisit if that job gets built.
      const TEN_YEARS_IN_SECONDS = 10 * 365 * 24 * 60 * 60;
      const { data: signedData, error: signError } = await supabase.storage
        .from('photos')
        .createSignedUrl(data.path, TEN_YEARS_IN_SECONDS);

      if (signError || !signedData) {
        console.error('Failed to sign photo URL:', signError);
        throw new Error(`Failed to generate photo URL: ${signError?.message}`);
      }

      return signedData.signedUrl;
    } catch (error) {
      console.error('Photo upload failed:', error);
      throw error;
    }
  }

  /**
   * Converts a data URL to a File object
   */
  private dataURLToFile(dataURL: string, filename: string): File {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], filename, { type: mime });
  }

  /**
   * Deletes a photo from Supabase storage
   */
  async deletePhoto(photoUrl: string): Promise<void> {
    try {
      // Extract the storage path from the URL -- must keep the `{userId}/{fileName}`
      // prefix (last two segments), not just the trailing filename, since uploads
      // are now stored under a per-user folder (see uploadPhoto above).
      const url = new URL(photoUrl);
      const pathParts = url.pathname.split('/');
      const storagePath = pathParts.slice(-2).join('/');
      
      const { error } = await supabase.storage
        .from('photos')
        .remove([storagePath]);

      if (error) {
        console.error('Delete error:', error);
        throw new Error(`Delete failed: ${error.message}`);
      }
    } catch (error) {
      console.error('Photo delete failed:', error);
      throw error;
    }
  }
}

export const photoService = PhotoService.getInstance();