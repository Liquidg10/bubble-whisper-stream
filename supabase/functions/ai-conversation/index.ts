import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userContext = {}, conversationHistory = [] } = await req.json();

    if (!message) {
      throw new Error('Message is required');
    }

    const userName = userContext.preferences?.name || '';
    const communicationStyle = userContext.preferences?.communicationStyle || 'friend';
    const goals = userContext.preferences?.primaryGoals || [];

    const systemPrompt = `You are Mind Manual's AI companion - empathetic and supportive.

User: ${userName || 'User'}
Style: ${communicationStyle}
Goals: ${goals.join(', ') || 'general well-being'}

Be warm, practical, and ${communicationStyle}-like. Help organize thoughts and suggest creating bubbles/reminders when helpful.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-6),
          { role: 'user', content: message }
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      response: data.choices[0].message.content
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'I\'m having trouble connecting right now. Please try again in a moment.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});