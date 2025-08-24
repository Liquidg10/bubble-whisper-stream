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

  try {
    const { text, voice = 'alloy', tone = 'neutral', context } = await req.json();

    if (!text) {
      throw new Error('Text is required');
    }

    // Context-aware voice selection with enhanced personality mapping
    let selectedVoice = voice;
    
    // Smart voice selection based on context and tone
    if (context) {
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
    } else {
      // Original tone-based selection as fallback
      if (tone === 'compassionate') selectedVoice = 'nova';
      if (tone === 'gentle') selectedVoice = 'shimmer';
      if (tone === 'encouraging') selectedVoice = 'echo';
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text,
        voice: selectedVoice,
        response_format: 'mp3',
        speed: (tone === 'compassionate' || context === 'cbt') ? 0.9 : 1.0,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate speech');
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );

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