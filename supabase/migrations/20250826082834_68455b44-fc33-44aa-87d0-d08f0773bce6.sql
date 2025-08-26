-- Create storage policies for photo uploads
-- Allow authenticated users to upload their own photos
CREATE POLICY "Users can upload their own photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to view their own photos
CREATE POLICY "Users can view their own photos" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to update their own photos
CREATE POLICY "Users can update their own photos" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own photos
CREATE POLICY "Users can delete their own photos" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Also allow public read access since the bucket is public
CREATE POLICY "Photos are publicly readable" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'photos');