-- Enhanced AI Conversations with Threading and Memory
-- Add conversation threading support
ALTER TABLE ai_conversations ADD COLUMN conversation_thread_id UUID DEFAULT gen_random_uuid();
ALTER TABLE ai_conversations ADD COLUMN session_start BOOLEAN DEFAULT false;
ALTER TABLE ai_conversations ADD COLUMN summary TEXT;

-- Create conversation threads table
CREATE TABLE IF NOT EXISTS conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  message_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user memory table for persistent facts
CREATE TABLE IF NOT EXISTS user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'fact', 'pattern', 'relationship', 'goal')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source_conversation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

-- Create conversation summaries table for long-term context
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL,
  user_id UUID NOT NULL,
  summary_text TEXT NOT NULL,
  time_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  time_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  message_count INTEGER NOT NULL,
  key_topics TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversation_threads
CREATE POLICY "Users can manage their own conversation threads"
  ON conversation_threads FOR ALL
  USING (auth.uid() = user_id);

-- RLS policies for user_memory
CREATE POLICY "Users can manage their own memory"
  ON user_memory FOR ALL
  USING (auth.uid() = user_id);

-- RLS policies for conversation_summaries
CREATE POLICY "Users can view their own conversation summaries"
  ON conversation_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage conversation summaries"
  ON conversation_summaries FOR ALL
  USING (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_conversation_threads_user_id ON conversation_threads(user_id);
CREATE INDEX idx_conversation_threads_last_message_at ON conversation_threads(last_message_at);
CREATE INDEX idx_user_memory_user_id ON user_memory(user_id);
CREATE INDEX idx_user_memory_type_key ON user_memory(memory_type, key);
CREATE INDEX idx_conversation_summaries_thread_id ON conversation_summaries(thread_id);
CREATE INDEX idx_ai_conversations_thread_id ON ai_conversations(conversation_thread_id);

-- Function to update thread last message time
CREATE OR REPLACE FUNCTION update_thread_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversation_threads 
  SET last_message_at = NEW.created_at,
      message_count = message_count + 1
  WHERE id = NEW.conversation_thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update thread timestamp
CREATE TRIGGER update_thread_on_message
  AFTER INSERT ON ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_last_message();