import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { 
      status: 400,
      headers: corsHeaders 
    });
  }

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    return new Response("OpenAI API key not configured", { 
      status: 500,
      headers: corsHeaders 
    });
  }

  console.log('🔗 Upgrading to WebSocket for realtime voice');

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  let openAISocket: WebSocket | null = null;
  let sessionConfigured = false;

  socket.onopen = () => {
    console.log('📱 Client WebSocket connected');
    
    // Connect to OpenAI Realtime API
    openAISocket = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
      {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    openAISocket.onopen = () => {
      console.log('🤖 OpenAI WebSocket connected');
    };

    openAISocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle session creation to send config
        if (data.type === 'session.created' && !sessionConfigured) {
          console.log('✅ OpenAI session created, ready for config');
        }
        
        // Log important events
        if (data.type === 'input_audio_buffer.speech_started') {
          console.log('🎤 Speech detected');
        } else if (data.type === 'response.audio.delta') {
          console.log('🔊 Audio delta received');
        } else if (data.type === 'error') {
          console.error('❌ OpenAI error:', data.error);
        }
        
        // Forward all messages to client
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      } catch (error) {
        console.error('Error parsing OpenAI message:', error);
      }
    };

    openAISocket.onerror = (error) => {
      console.error('🤖 OpenAI WebSocket error:', error);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'error',
          error: { message: 'OpenAI connection failed' }
        }));
      }
    };

    openAISocket.onclose = () => {
      console.log('🤖 OpenAI WebSocket closed');
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Track session configuration
      if (data.type === 'session.update') {
        sessionConfigured = true;
        console.log('⚙️ Session config received from client');
      }
      
      // Log audio data flow
      if (data.type === 'input_audio_buffer.append') {
        console.log('🎵 Audio data received from client');
      }
      
      // Forward to OpenAI
      if (openAISocket && openAISocket.readyState === WebSocket.OPEN) {
        openAISocket.send(event.data);
      } else {
        console.warn('OpenAI socket not ready, dropping message:', data.type);
      }
    } catch (error) {
      console.error('Error parsing client message:', error);
    }
  };

  socket.onerror = (error) => {
    console.error('📱 Client WebSocket error:', error);
  };

  socket.onclose = () => {
    console.log('📱 Client WebSocket closed');
    if (openAISocket) {
      openAISocket.close();
    }
  };

  return response;
});