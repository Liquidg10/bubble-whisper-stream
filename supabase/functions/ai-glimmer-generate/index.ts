import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function stripPII(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b\d{3}-?\d{3}-?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '[CARD]');
}

const TONE_STYLES = {
  'friend': 'warm, understanding friend who knows you well',
  'coach': 'supportive coach who believes in your potential',
  'scientist': 'curious researcher exploring patterns with you',
  'future-you': 'wise future version of yourself looking back with compassion'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      trigger, 
      tone = 'friend', 
      patterns = [], 
      timeContext = {},
      userPreferences = {} 
    } = await req.json();

    if (!trigger) {
      throw new Error('Trigger is required');
    }

    // Clean and limit input data
    const cleanPatterns = patterns.map((p: any) => stripPII(p.description || '')).slice(0, 3);
    const timeOfDay = timeContext.timeOfDay || 'unknown';
    const mood = timeContext.mood || 'neutral';

    const systemPrompt = `You are a ${TONE_STYLES[tone]} offering gentle self-compassion glimmers.

Guidelines:
- Write 1-2 sentences max (under 100 characters total)
- Use ${tone} voice
- Be specific to their situation, not generic
- Focus on small wins, progress, or gentle reminders
- Never be preachy or overwhelming
- Include subtle context awareness
- Format as JSON: {"message": "...", "because": "...", "type": "encouragement|progress|rest"}`;

    const userPrompt = `Context:
- Trigger: ${trigger}
- Time: ${timeOfDay}
- Recent patterns: ${cleanPatterns.join(', ') || 'none noted'}
- Mood: ${mood}

Generate a personalized glimmer:`;

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
        max_tokens: 150,
        temperature: 0.8,
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
        glimmer: {
          message: parsed.message,
          tone,
          trigger,
          because: parsed.because,
          type: parsed.type || 'encouragement',
          model: 'ai',
          createdAt: new Date().toISOString()
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      // Fallback if JSON parsing fails
      return new Response(JSON.stringify({
        success: true,
        glimmer: {
          message: content,
          tone,
          trigger,
          because: 'AI-generated based on your recent activity',
          type: 'encouragement',
          model: 'ai'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('AI glimmer generation error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      fallback: true,
      error: 'AI temporarily unavailable, using local glimmer generation'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});