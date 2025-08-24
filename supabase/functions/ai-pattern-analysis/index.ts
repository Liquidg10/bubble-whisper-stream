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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      content,
      contentType,
      operation = 'analyze',
      bubbleCount = 0,
      recentMoods = [],
      timeContext = {}
    } = await req.json();

    if (!content) {
      throw new Error('Content is required');
    }

    const cleanContent = stripPII(content).slice(0, 2000);
    
    let systemPrompt = '';
    let userPrompt = '';
    
    switch (operation) {
      case 'analyze':
        systemPrompt = `You are a compassionate pattern recognition assistant for a neurodivergent-friendly app.
        
Guidelines:
- Identify emotional patterns, cognitive themes, and behavioral insights
- Use supportive, non-judgmental language
- Suggest gentle next steps or reflections
- Never diagnose or provide medical advice
- Format as JSON: {"patterns": ["...", "..."], "insights": ["...", "..."], "suggestions": ["...", "..."], "confidence": 0.8}`;
        
        userPrompt = `Content: "${cleanContent}"
        Type: ${contentType}
        Context: ${bubbleCount} total bubbles, recent moods: ${recentMoods.join(', ')}, time: ${timeContext.timeOfDay || 'unknown'}
        
        Analyze patterns and provide insights:`;
        break;
        
      case 'sentiment':
        systemPrompt = `You are a nuanced sentiment analyzer that understands complex emotions and neurodivergent experiences.
        
Guidelines:
- Recognize mixed emotions and subtle feelings
- Consider context and personal growth patterns  
- Avoid oversimplification
- Format as JSON: {"sentiment": "positive|neutral|negative|mixed", "emotions": ["...", "..."], "intensity": 0.7, "complexity": "simple|moderate|complex"}`;
        
        userPrompt = `Analyze the emotional content: "${cleanContent}"
        
        Consider recent context: ${recentMoods.length > 0 ? `Previous moods: ${recentMoods.join(', ')}` : 'No recent mood data'}`;
        break;
        
      case 'categorize':
        systemPrompt = `You are an intelligent content categorizer for a personal insight app.
        
Guidelines:
- Suggest relevant categories and tags
- Consider both explicit content and implicit themes
- Use user-friendly language
- Format as JSON: {"category": "...", "tags": ["...", "..."], "themes": ["...", "..."], "confidence": 0.9}`;
        
        userPrompt = `Categorize this content: "${cleanContent}"
        Type: ${contentType}
        
        Suggest appropriate categories and tags:`;
        break;
        
      case 'similar':
        systemPrompt = `You are a semantic similarity assistant that finds meaningful connections between thoughts and experiences.
        
Guidelines:
- Focus on emotional resonance and thematic similarity
- Consider both content and emotional context
- Suggest connections that might provide insight or comfort
- Format as JSON: {"similar_themes": ["...", "..."], "connection_type": "emotional|thematic|temporal", "strength": 0.8}`;
        
        userPrompt = `Find themes similar to: "${cleanContent}"
        
        What patterns or themes would resonate with this content?`;
        break;
    }

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
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content_analysis = data.choices[0].message.content;
    
    try {
      const parsed = JSON.parse(content_analysis);
      return new Response(JSON.stringify({
        success: true,
        operation,
        analysis: parsed,
        model: 'ai',
        because: `AI analysis using privacy-preserving techniques for ${operation}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      // Fallback if JSON parsing fails
      return new Response(JSON.stringify({
        success: true,
        operation,
        analysis: { 
          raw: content_analysis,
          patterns: ['Analysis completed'],
          confidence: 0.7
        },
        model: 'ai'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('AI pattern analysis error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      fallback: true,
      error: 'AI pattern analysis temporarily unavailable',
      operation: 'local'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});