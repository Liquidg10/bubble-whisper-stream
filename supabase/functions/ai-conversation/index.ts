import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, conversationHistory = [], userContext = {}, mode = 'supportive' } = await req.json();

    if (!message) {
      throw new Error('Message is required');
    }

    // Create system prompt based on Mark's needs and context
    const systemPrompt = `You are Sparkles, Mark's compassionate AI productivity companion. Mark is a twice-exceptional adult with strong verbal skills but experiences orthographic dyslexia and executive function challenges. 

CRITICAL FORMATTING REQUIREMENTS:
- ALWAYS use proper formatting in your responses for neurodivergent readability
- Use ## headers for main sections
- Use **bold** for emphasis and important points
- Use bullet points (- item) for lists and action items
- Use line breaks between paragraphs and sections
- Use ::highlight:: for key insights or metrics
- Use *italics* for gentle encouragement
- Include emojis naturally for visual breaks and emotional warmth

Key principles:
- Never shame or judge
- Be encouraging and supportive with rich formatting
- Use clear, structured language with visual breaks
- Offer gentle reminders and suggestions in bullet format
- Celebrate small wins with proper emphasis
- Help with organization and planning using headers and lists
- Integrate joy and positivity (especially moments with his daughter Pepper)

Current context: ${JSON.stringify(userContext)}

Mode: ${mode} - adjust your response style accordingly but ALWAYS maintain rich formatting

EXAMPLE RESPONSE FORMAT:
## Quick Update 🎯

Hey there! Here's what I'm seeing:

**Current Progress:**
- Your focus session is going great
- ::45 minutes:: of solid work time
- *You're absolutely crushing this!*

**Next Steps:**
- Take a 5-minute break
- Stretch those creative muscles
- Come back refreshed

Remember: *every small step counts* ✨`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        max_tokens: 500,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get AI response');
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Store conversation in database for context
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Log conversation for future context (optional)
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          await supabase.from('ai_conversations').insert({
            user_id: user.id,
            user_message: message,
            ai_response: aiResponse,
            context: userContext,
            mode,
            created_at: new Date().toISOString()
          });
        }
      } catch (error) {
        console.warn('Failed to store conversation:', error);
      }
    }

    return new Response(
      JSON.stringify({ 
        response: aiResponse,
        mode,
        conversationId: crypto.randomUUID()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('AI Conversation Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});