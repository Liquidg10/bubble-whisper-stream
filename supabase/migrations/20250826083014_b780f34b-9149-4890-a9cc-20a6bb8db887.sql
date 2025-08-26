-- Update storage policies to allow unauthenticated uploads for local-first app
-- This is appropriate since the app stores data locally and photos are just for local storage

-- Drop existing policies
DROP POLICY IF EXISTS "Users can upload their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Photos are publicly readable" ON storage.objects;

-- Create policies that allow unauthenticated uploads
CREATE POLICY "Allow photo uploads" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'photos');

-- Allow public read access for photos
CREATE POLICY "Allow photo reads" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'photos');

-- Allow photo updates
CREATE POLICY "Allow photo updates" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'photos');

-- Allow photo deletions  
CREATE POLICY "Allow photo deletions" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'photos');