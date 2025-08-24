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
    const { imageData, documentType } = await req.json();

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
            role: 'system',
            content: `You are an AI document scanner. Extract key information from ${documentType || 'documents'} and return structured data. For receipts, extract items, prices, total, date, vendor. For bills, extract amount due, due date, account info. For handwritten notes, transcribe and categorize content.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      }),
    });

    const data = await response.json();
    const extractedData = data.choices[0].message.content;

    // Parse and structure the extracted data
    let structuredData = {};
    try {
      // Attempt to parse as JSON if the AI returned structured data
      structuredData = JSON.parse(extractedData);
    } catch {
      // If not JSON, return as text with basic structure
      structuredData = {
        type: documentType || 'document',
        content: extractedData,
        extractedAt: new Date().toISOString()
      };
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: structuredData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in document-scan function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});