import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { request, planType, userContext, timestamp } = await req.json();

    console.log(`Generating ${planType} plan for request: ${request}`);

    // Create personalized system prompt based on user context
    const systemPrompt = createPersonalizedPrompt(planType, userContext);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Create a ${planType} plan for: ${request}` }
        ],
        max_completion_tokens: 1000,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const planData = JSON.parse(data.choices[0].message.content);

    console.log('Plan generated successfully:', planData.title);

    return new Response(JSON.stringify({
      ...planData,
      confidence: calculatePersonalizationConfidence(userContext)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-plan-generate function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function createPersonalizedPrompt(planType: string, userContext: any): string {
  const basePrompt = `You are an expert personal planning assistant. Create personalized, actionable plans that are specific to the user's needs and context.

Your response must be valid JSON with this structure:
{
  "title": "Clear plan title",
  "description": "Brief description of what this plan accomplishes",
  "steps": [
    {
      "title": "Specific action step",
      "description": "Detailed explanation if needed",
      "estimatedMinutes": 15,
      "priority": "high|medium|low",
      "category": "preparation|action|review|followup",
      "flexible": true|false
    }
  ]
}

Key principles:
- Be specific and actionable, not generic
- Consider the user's context and preferences
- Make time estimates realistic
- Include both preparation and action steps
- Balance structure with flexibility`;

  // Add user-specific context
  let contextualPrompt = basePrompt;

  if (userContext?.preferences?.communicationStyle) {
    contextualPrompt += `\n\nUser's communication style: ${userContext.preferences.communicationStyle}`;
  }

  if (userContext?.preferences?.goals?.length > 0) {
    contextualPrompt += `\n\nUser's current goals: ${userContext.preferences.goals.join(', ')}`;
  }

  if (userContext?.patterns?.timeOfDay) {
    contextualPrompt += `\n\nUser's preferred time patterns: ${userContext.patterns.timeOfDay}`;
  }

  // Add plan type specific guidance
  switch (planType) {
    case 'morning':
      contextualPrompt += `\n\nFor morning plans:
- Consider wake-up time and energy levels
- Include mindfulness or centering activities
- Balance routine with flexibility
- Set positive intentions for the day`;
      break;
      
    case 'health':
      contextualPrompt += `\n\nFor health plans:
- Consider current health challenges mentioned by user
- Include both physical and mental health aspects
- Make recommendations specific and measurable
- Consider supplement research if mentioned`;
      break;
      
    case 'workday':
    case 'project':
      contextualPrompt += `\n\nFor work/project plans:
- Break down complex goals into manageable steps
- Consider the user's work style and constraints
- Include review and adjustment periods
- Be realistic about time commitments`;
      break;
  }

  return contextualPrompt;
}

function calculatePersonalizationConfidence(userContext: any): number {
  let confidence = 0.3; // Base confidence
  
  if (userContext?.preferences?.goals?.length > 0) confidence += 0.2;
  if (userContext?.preferences?.communicationStyle) confidence += 0.1;
  if (userContext?.patterns?.recentActivity?.length > 0) confidence += 0.2;
  if (userContext?.personalContext?.currentChallenges?.length > 0) confidence += 0.2;
  
  return Math.min(confidence, 1.0);
}