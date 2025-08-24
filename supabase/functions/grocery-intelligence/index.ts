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
    const { receiptData, currentGroceryList } = await req.json();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a smart grocery assistant. Analyze receipt data and current grocery lists to suggest items that might be running low. Return suggestions in JSON format with item names, estimated usage patterns, and confidence scores.'
          },
          {
            role: 'user',
            content: `Recent receipt: ${JSON.stringify(receiptData)}
Current grocery list: ${JSON.stringify(currentGroceryList)}
Suggest items that might be running low based on typical consumption patterns.`
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      }),
    });

    const data = await response.json();
    const suggestions = data.choices[0].message.content;

    let structuredSuggestions = [];
    try {
      structuredSuggestions = JSON.parse(suggestions);
    } catch {
      // Fallback to basic suggestions
      structuredSuggestions = [
        { item: 'Milk', confidence: 0.7, reason: 'Commonly consumed item' },
        { item: 'Bread', confidence: 0.6, reason: 'Daily staple' },
        { item: 'Eggs', confidence: 0.5, reason: 'Weekly essential' }
      ];
    }

    return new Response(JSON.stringify({
      success: true,
      suggestions: structuredSuggestions,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in grocery-intelligence function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});