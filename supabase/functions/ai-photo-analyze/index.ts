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
    const { imageData, analysis_type = 'content' } = await req.json();
    
    if (!imageData) {
      throw new Error('No image data provided');
    }

    console.log('Received photo analysis request');

    // Prepare form data for OpenAI Vision
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: analysis_type === 'mood' 
                  ? 'Analyze the mood and emotional context of this image. Provide a brief, supportive description focusing on feelings and atmosphere.'
                  : 'Describe this image in a helpful, concise way. Focus on key elements that would be useful for personal organization and memory.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_completion_tokens: 150,
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const analysis = result.choices[0].message.content;

    console.log('Photo analysis successful');

    return new Response(
      JSON.stringify({ 
        success: true,
        analysis,
        analysis_type,
        because: 'Analyzed using OpenAI Vision with privacy protection'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Photo analysis error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        fallback: true,
        error: error instanceof Error ? error.message : 'Photo analysis failed',
        because: 'Photo analysis temporarily unavailable'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});