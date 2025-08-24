import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISTORTIONS = {
  'all-or-nothing': 'seeing things in black and white categories',
  'overgeneralization': 'seeing a single negative event as a never-ending pattern',
  'mental-filter': 'picking out a single negative detail and dwelling on it',
  'disqualifying-positive': 'rejecting positive experiences as not counting',
  'jumping-to-conclusions': 'making negative interpretations without definite facts',
  'magnification': 'exaggerating the importance of things',
  'emotional-reasoning': 'assuming that negative emotions reflect reality',
  'should-statements': 'trying to motivate yourself with shoulds and shouldn\'ts',
  'labeling': 'attaching negative labels to yourself or others',
  'personalization': 'seeing yourself as the cause of negative external events'
};

function stripPII(text: string): string {
  // Remove potential PII patterns
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b\d{3}-?\d{3}-?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '[CARD]');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { thought, distortions, tone = 'compassionate' } = await req.json();

    if (!thought) {
      throw new Error('Thought is required');
    }

    // Strip PII and limit length
    const cleanThought = stripPII(thought).slice(0, 500);
    const distortionsList = distortions?.map((d: string) => DISTORTIONS[d] || d) || [];

    const systemPrompt = `You are a compassionate CBT assistant. Help reframe thoughts in a gentle, non-judgmental way. 
    
Guidelines:
- Use ${tone} tone
- Offer 2-3 brief reframe suggestions (max 50 words each)
- Focus on evidence, alternative perspectives, and self-compassion
- Never minimize feelings or use dismissive language
- Include "Because..." explanations for your suggestions
- Format as JSON: {"reframes": [{"text": "...", "because": "..."}]}`;

    const userPrompt = `Thought: "${cleanThought}"
    ${distortionsList.length > 0 ? `Potential patterns: ${distortionsList.join(', ')}` : ''}
    
    Please provide compassionate reframes:`;

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
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      const parsed = JSON.parse(content);
      return new Response(JSON.stringify({
        success: true,
        reframes: parsed.reframes || [],
        model: 'ai',
        explanation: 'Generated using AI with privacy-preserving techniques'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      // Fallback if JSON parsing fails
      return new Response(JSON.stringify({
        success: true,
        reframes: [{ text: content, because: 'AI-generated reframe' }],
        model: 'ai'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('AI CBT reframe error:', error);
    
    // Return fallback response instead of error
    return new Response(JSON.stringify({
      success: false,
      fallback: true,
      error: 'AI temporarily unavailable, using local processing'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Return 200 to allow graceful fallback
    });
  }
});