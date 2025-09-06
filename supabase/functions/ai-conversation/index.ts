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
    const { 
      message, 
      conversationHistory = [], 
      userContext = {}, 
      mode = 'supportive',
      threadId,
      loadHistory = true 
    } = await req.json();

    if (!message) {
      throw new Error('Message is required');
    }

    // Initialize Supabase client for database operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let user = null;
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user: authUser } } = await supabase.auth.getUser(token);
        user = authUser;
      } catch (error) {
        console.warn('Failed to get user from token:', error);
      }
    }

    // Load conversation history and user memory if requested
    let enhancedHistory = conversationHistory;
    let memoryContext = {};
    
    if (loadHistory && user && threadId) {
      // Load recent conversation history from database
      const { data: dbHistory } = await supabase
        .from('ai_conversations')
        .select('user_message, ai_response, created_at')
        .eq('conversation_thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(15);

      if (dbHistory && dbHistory.length > 0) {
        // Convert DB history to OpenAI format and combine with current history
        const dbMessages = dbHistory.reverse().flatMap(conv => [
          { role: 'user', content: conv.user_message },
          { role: 'assistant', content: conv.ai_response }
        ]);
        
        // Combine with any new messages in conversationHistory
        enhancedHistory = [...dbMessages, ...conversationHistory];
        
        // Keep only the most recent 20 messages to stay within token limits
        if (enhancedHistory.length > 20) {
          enhancedHistory = enhancedHistory.slice(-20);
        }
      }

      // Load user memory for context
      const { data: userMemories } = await supabase
        .from('user_memory')
        .select('memory_type, key, value, confidence')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('confidence', { ascending: false })
        .limit(20);

      if (userMemories) {
        memoryContext = {
          preferences: {},
          facts: {},
          patterns: {},
          relationships: {},
          goals: {}
        };

        userMemories.forEach(memory => {
          memoryContext[memory.memory_type + 's'][memory.key] = memory.value;
        });
      }
    }

    // Create system prompt with memory context
    const systemPrompt = `You are Sparkles, Mark's compassionate AI productivity companion. Mark is a twice-exceptional adult with strong verbal skills but experiences orthographic dyslexia and executive function challenges.

MEMORY CONTEXT - Remember these facts about Mark:
${Object.keys(memoryContext).length > 0 ? 
  Object.entries(memoryContext).map(([type, items]) => 
    Object.keys(items).length > 0 ? 
      `${type.toUpperCase()}: ${Object.entries(items).map(([k, v]) => `${k}: ${v}`).join(', ')}` 
      : ''
  ).filter(Boolean).join('\n') 
  : 'No stored memories yet - learn about Mark through conversation'}

CRITICAL FORMATTING REQUIREMENTS:
- ALWAYS use proper formatting in your responses for neurodivergent readability
- Use ## headers for main sections
- Use **bold** for emphasis and important points
- Use bullet points (- item) for lists and action items
- Use line breaks between paragraphs and sections
- Use ::highlight:: for key insights or metrics
- Use *italics* for gentle encouragement
- Include emojis naturally for visual breaks and emotional warmth

NATURAL SPEAKING STYLE:
- Speak with natural energy and pace - like an engaged, articulate friend
- Use crisp, clear sentences that flow when spoken aloud
- Be direct and purposeful - every word should matter
- Remove filler words and unnecessary phrases completely
- Sound conversational but efficient - no rambling or wordiness
- Use natural speech rhythm with clear transitions between ideas

MEMORY PRINCIPLES:
- Reference previous conversations naturally when relevant
- Build on established patterns and preferences
- Don't repeat information unnecessarily if already discussed
- Update understanding based on new information

Key principles:
- Never shame or judge
- Be encouraging and supportive with rich formatting
- Use clear, structured language with visual breaks
- Offer gentle reminders and suggestions in bullet format
- Celebrate small wins with proper emphasis
- Help with organization and planning using headers and lists
- Integrate joy and positivity (especially moments with his daughter Pepper)
- Remember and build on our ongoing relationship

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
      ...enhancedHistory,
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

    // Store conversation in database with thread context
    if (user && threadId) {
      try {
        await supabase.from('ai_conversations').insert({
          user_id: user.id,
          conversation_thread_id: threadId,
          user_message: message,
          ai_response: aiResponse,
          context: userContext,
          mode,
          session_start: userContext.sessionStart || false
        });

        // Extract and store any new memories from the conversation
        await extractAndStoreMemories(supabase, user.id, message, aiResponse, userContext);
      } catch (error) {
        console.warn('Failed to store conversation:', error);
      }
    }

    return new Response(
      JSON.stringify({ 
        response: aiResponse,
        mode,
        conversationId: crypto.randomUUID(),
        threadId: threadId || null,
        memoryContext
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

// Helper function to extract and store memories from conversations
async function extractAndStoreMemories(supabase, userId, userMessage, aiResponse, context) {
  try {
    // Extract preferences (work patterns, communication style)
    if (userMessage.toLowerCase().includes('prefer') || 
        userMessage.toLowerCase().includes('like to') ||
        userMessage.toLowerCase().includes('usually')) {
      
      // Simple pattern extraction - could be enhanced with AI analysis
      if (userMessage.includes('minute') && userMessage.includes('session')) {
        const duration = userMessage.match(/(\d+)\s*minute/)?.[1];
        if (duration) {
          await updateMemory(supabase, userId, 'preference', 'session_duration', `${duration} minutes`);
        }
      }
    }

    // Extract facts about work style or personal info
    if (userMessage.toLowerCase().includes('work on') || 
        userMessage.toLowerCase().includes('daughter') ||
        userMessage.toLowerCase().includes('pepper')) {
      
      if (userMessage.toLowerCase().includes('pepper') || userMessage.toLowerCase().includes('daughter')) {
        await updateMemory(supabase, userId, 'relationship', 'daughter', 'Pepper');
      }
    }

    // Extract goals from context
    if (context.sessionStart && context.anchorTask) {
      await updateMemory(supabase, userId, 'goal', 'current_focus', context.anchorTask);
    }

  } catch (error) {
    console.warn('Failed to extract memories:', error);
  }
}

async function updateMemory(supabase, userId, memoryType, key, value, confidence = 0.8) {
  // Check if memory exists
  const { data: existing } = await supabase
    .from('user_memory')
    .select('id')
    .eq('user_id', userId)
    .eq('memory_type', memoryType)
    .eq('key', key)
    .eq('is_active', true)
    .maybeSingle();

  if (existing) {
    // Update existing memory
    await supabase
      .from('user_memory')
      .update({ 
        value, 
        confidence,
        updated_at: new Date().toISOString() 
      })
      .eq('id', existing.id);
  } else {
    // Create new memory
    await supabase
      .from('user_memory')
      .insert({
        user_id: userId,
        memory_type: memoryType,
        key,
        value,
        confidence
      });
  }
}
