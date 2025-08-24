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
    .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[NAME]');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { texts, operation = 'embed' } = await req.json();

    if (!texts || !Array.isArray(texts)) {
      throw new Error('Texts array is required');
    }

    // Clean and limit input
    const cleanTexts = texts
      .slice(0, 20) // Limit batch size
      .map(text => stripPII(String(text)).slice(0, 1000)); // Limit text length

    if (operation === 'embed') {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: cleanTexts,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      
      return new Response(JSON.stringify({
        success: true,
        embeddings: data.data.map((item: any) => ({
          embedding: item.embedding,
          index: item.index
        })),
        model: 'text-embedding-3-small',
        usage: data.usage
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Similarity search operation
    if (operation === 'similarity') {
      const { query, embeddings } = await req.json();
      
      if (!query || !embeddings) {
        throw new Error('Query and embeddings required for similarity search');
      }

      // Get query embedding
      const queryResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: stripPII(query).slice(0, 1000),
        }),
      });

      if (!queryResponse.ok) {
        throw new Error(`OpenAI API error: ${queryResponse.status}`);
      }

      const queryData = await queryResponse.json();
      const queryEmbedding = queryData.data[0].embedding;

      // Calculate cosine similarity
      const similarities = embeddings.map((item: any, index: number) => {
        const similarity = cosineSimilarity(queryEmbedding, item.embedding);
        return {
          index,
          similarity,
          id: item.id,
          text: item.text
        };
      });

      // Sort by similarity and return top results
      similarities.sort((a, b) => b.similarity - a.similarity);

      return new Response(JSON.stringify({
        success: true,
        results: similarities.slice(0, 10),
        query: stripPII(query)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid operation');

  } catch (error) {
    console.error('AI embeddings error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      fallback: true,
      error: 'AI embeddings temporarily unavailable'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}