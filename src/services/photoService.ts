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

      // Generate unique filename
      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}-${fileToUpload.name}`;
      
      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('photos')
        .upload(uniqueFileName, fileToUpload, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(data.path);

      return publicUrl;
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
      // Extract file path from URL
      const url = new URL(photoUrl);
      const pathParts = url.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      
      const { error } = await supabase.storage
        .from('photos')
        .remove([fileName]);

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