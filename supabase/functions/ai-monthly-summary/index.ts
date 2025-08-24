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
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '[CARD]')
    .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[NAME]'); // Common name patterns
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      bubbleStats = {},
      cbtEntries = [],
      glimmers = [],
      patterns = [],
      auditCount = 0,
      month,
      preferences = {}
    } = await req.json();

    if (!month) {
      throw new Error('Month is required');
    }

    // Clean and aggregate data safely
    const cleanCBTEntries = cbtEntries.slice(0, 10).map((entry: any) => ({
      mood: entry.mood || 'neutral',
      distortions: entry.detectedDistortions?.slice(0, 3) || [],
      hasReframe: !!entry.reframedThoughts?.length
    }));

    const cleanPatterns = patterns.slice(0, 5).map((p: any) => ({
      key: p.key,
      confidence: p.confidence,
      layer: p.layer
    }));

    const stats = {
      totalBubbles: bubbleStats.total || 0,
      cbtCount: cleanCBTEntries.length,
      glimmerCount: glimmers.length,
      auditCount,
      topMoods: bubbleStats.topMoods?.slice(0, 3) || [],
      topDistortions: cleanCBTEntries.flatMap((e: any) => e.distortions).slice(0, 3)
    };

    const systemPrompt = `You are a compassionate reflection assistant creating monthly summaries.

Guidelines:
- Write in warm, encouraging tone
- Focus on growth, patterns, and gentle insights
- Acknowledge both challenges and progress
- Suggest gentle next steps or reflections
- Keep under 200 words total
- Use personal "you" language
- Never be judgmental or prescriptive
- Format as JSON: {"summary": "...", "insights": ["...", "..."], "gentleNext": "..."}`;

    const userPrompt = `Month: ${month}
    
Data overview:
- Created ${stats.totalBubbles} bubbles
- Completed ${stats.cbtCount} thought checks
- Received ${stats.glimmerCount} glimmers
- ${stats.auditCount} self-model updates
- Common moods: ${stats.topMoods.join(', ') || 'varied'}
- Growth patterns: ${cleanPatterns.map(p => p.key).join(', ') || 'exploring'}

Create a gentle monthly reflection:`;

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
        summary: {
          month,
          summary: parsed.summary,
          insights: parsed.insights || [],
          gentleNext: parsed.gentleNext,
          stats,
          model: 'ai',
          generatedAt: new Date().toISOString()
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({
        success: true,
        summary: {
          summary: content,
          insights: [],
          stats,
          model: 'ai'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('AI monthly summary error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      fallback: true,
      error: 'AI temporarily unavailable, using standard monthly summary'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});