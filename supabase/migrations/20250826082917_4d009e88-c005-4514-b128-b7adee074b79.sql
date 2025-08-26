-- First, drop the INSERT policy if it exists to recreate it properly
DROP POLICY IF EXISTS "Users can upload their own photos" ON storage.objects;

-- Create INSERT policy for photo uploads  
CREATE POLICY "Users can upload their own photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'photos' 
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Ensure public read access exists
DROP POLICY IF EXISTS "Photos are publicly readable" ON storage.objects;
CREATE POLICY "Photos are publicly readable" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'photos');