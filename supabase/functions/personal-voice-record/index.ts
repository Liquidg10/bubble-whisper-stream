import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioData, sampleIndex, totalSamples } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Store voice sample in encrypted storage
    const fileName = `voice-samples/${user.id}/sample-${sampleIndex}.webm`;
    
    // Convert base64 to binary
    const binaryAudio = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
    
    const { error: uploadError } = await supabase.storage
      .from('voice-samples')
      .upload(fileName, binaryAudio, {
        contentType: 'audio/webm',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Update user's voice sample progress
    const { error: updateError } = await supabase
      .from('voice_samples')
      .upsert({
        user_id: user.id,
        sample_index: sampleIndex,
        file_path: fileName,
        created_at: new Date().toISOString()
      });

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    // Check if all samples are collected
    const { data: samples } = await supabase
      .from('voice_samples')
      .select('sample_index')
      .eq('user_id', user.id);

    const isComplete = samples && samples.length >= totalSamples;

    if (isComplete) {
      // Trigger voice model training (placeholder for actual ML pipeline)
      console.log(`Voice training ready for user ${user.id}`);
    }

    return new Response(JSON.stringify({
      success: true,
      sampleIndex,
      isComplete,
      totalCollected: samples?.length || 0,
      totalRequired: totalSamples
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in personal-voice-record function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});