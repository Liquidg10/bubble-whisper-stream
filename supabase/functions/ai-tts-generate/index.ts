import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('🎤 AI TTS function called');

  try {
    const { text, voice: userVoice, tone = 'neutral', context } = await req.json();
    console.log('📝 Request params:', { textLength: text?.length, userVoice: userVoice || 'none', tone, context });

    if (!text) {
      console.error('❌ No text provided');
      throw new Error('Text is required');
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY not found in environment');
      throw new Error('OpenAI API key not configured');
    }
    console.log('✅ OpenAI API key found');

    // Voice selection priority: user preference → context mapping → default
    let selectedVoice = userVoice || 'alloy';
    
    // Only use context-based mapping if no user voice preference is provided
    if (!userVoice && context) {
      switch (context) {
        case 'banking':
        case 'financial':
          selectedVoice = 'onyx'; // Professional, authoritative
          break;
        case 'companion':
        case 'ai-conversation':
          selectedVoice = tone === 'compassionate' ? 'nova' : 'shimmer'; // Warm, supportive
          break;
        case 'notes':
        case 'bubble-detail':
          selectedVoice = 'shimmer'; // Clear, neutral
          break;
        case 'cbt':
        case 'therapy':
          selectedVoice = 'nova'; // Compassionate, slow
          break;
        case 'reminders':
          selectedVoice = 'echo'; // Gentle but firm
          break;
        case 'glimmers':
          selectedVoice = 'shimmer'; // Uplifting, bright
          break;
        default:
          // Tone-based fallback
          if (tone === 'compassionate') selectedVoice = 'nova';
          else if (tone === 'gentle') selectedVoice = 'shimmer';
          else if (tone === 'encouraging') selectedVoice = 'echo';
          else if (tone === 'professional') selectedVoice = 'onyx';
      }
    } else if (!userVoice) {
      // Original tone-based selection as fallback
      if (tone === 'compassionate') selectedVoice = 'nova';
      if (tone === 'gentle') selectedVoice = 'shimmer';
      if (tone === 'encouraging') selectedVoice = 'echo';
    }

    console.log('🎵 Selected voice:', selectedVoice, 'for context:', context, 'tone:', tone, 'user preference:', !!userVoice);

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text,
        voice: selectedVoice,
        response_format: 'mp3',
        speed: 1.57,
      }),
    });

    if (!response.ok) {
      console.error('❌ OpenAI API error:', response.status, response.statusText);
      const error = await response.json();
      console.error('❌ OpenAI API error details:', error);
      throw new Error(error.error?.message || 'Failed to generate speech');
    }

    console.log('✅ OpenAI TTS response received, converting to base64...');
    const arrayBuffer = await response.arrayBuffer();
    console.log('📊 Audio buffer size:', arrayBuffer.byteLength, 'bytes');
    
    // Convert arrayBuffer to base64 properly
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Use built-in base64 encoding for binary data
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64Audio = btoa(binary);

    console.log('✅ Base64 conversion complete, length:', base64Audio.length);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        voice: selectedVoice,
        tone 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('TTS Generation Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});