import { supabase } from '@/integrations/supabase/client';

export interface ConversationThread {
  id: string;
  user_id: string;
  title?: string;
  last_message_at: string;
  message_count: number;
  is_active: boolean;
  created_at: string;
}

export interface UserMemory {
  id: string;
  user_id: string;
  memory_type: 'preference' | 'fact' | 'pattern' | 'relationship' | 'goal';
  key: string;
  value: string;
  confidence: number;
  source_conversation_id?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  is_active: boolean;
}

export interface ConversationMessage {
  id: string;
  user_id: string;
  conversation_thread_id: string;
  user_message: string;
  ai_response: string;
  context?: any;
  mode?: string;
  session_start: boolean;
  summary?: string;
  created_at: string;
  updated_at: string;
}

class ConversationService {
  async getOrCreateActiveThread(): Promise<ConversationThread | null> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null; // Gracefully handle unauthenticated state

    // Get the most recent active thread
    const { data: existingThread } = await supabase
      .from('conversation_threads')
      .select('*')
      .eq('is_active', true)
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingThread) {
      return existingThread;
    }

    // Create new thread if none exists
    const { data: newThread, error } = await supabase
      .from('conversation_threads')
      .insert({
        user_id: user.id,
        title: `Conversation ${new Date().toLocaleDateString()}`,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;
    return newThread;
  }

  async getConversationHistory(threadId: string, limit: number = 20): Promise<ConversationMessage[]> {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('conversation_thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data?.reverse() || [];
  }

  async saveConversation(
    threadId: string,
    userMessage: string,
    aiResponse: string,
    context?: any,
    mode?: string,
    sessionStart: boolean = false
  ): Promise<void> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: user.id,
        conversation_thread_id: threadId,
        user_message: userMessage,
        ai_response: aiResponse,
        context,
        mode,
        session_start: sessionStart
      });

    if (error) throw error;
  }

  async getUserMemories(): Promise<UserMemory[]> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('user_memory')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('confidence', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data || []) as UserMemory[];
  }

  async updateUserMemory(
    memoryType: UserMemory['memory_type'],
    key: string,
    value: string,
    confidence: number = 1.0,
    sourceConversationId?: string
  ): Promise<void> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Check if memory already exists
    const { data: existingMemory } = await supabase
      .from('user_memory')
      .select('*')
      .eq('user_id', user.id)
      .eq('memory_type', memoryType)
      .eq('key', key)
      .eq('is_active', true)
      .maybeSingle();

    if (existingMemory) {
      // Update existing memory
      const { error } = await supabase
        .from('user_memory')
        .update({
          value,
          confidence,
          updated_at: new Date().toISOString(),
          source_conversation_id: sourceConversationId
        })
        .eq('id', existingMemory.id);

      if (error) throw error;
    } else {
      // Create new memory
      const { error } = await supabase
        .from('user_memory')
        .insert({
          user_id: user.id,
          memory_type: memoryType,
          key,
          value,
          confidence,
          source_conversation_id: sourceConversationId
        });

      if (error) throw error;
    }
  }

  async getMemoryContext(): Promise<{
    preferences: Record<string, string>;
    facts: Record<string, string>;
    patterns: Record<string, string>;
    relationships: Record<string, string>;
    goals: Record<string, string>;
  }> {
    const memories = await this.getUserMemories();
    
    const context = {
      preferences: {},
      facts: {},
      patterns: {},
      relationships: {},
      goals: {}
    };

    memories.forEach(memory => {
      context[memory.memory_type + 's'][memory.key] = memory.value;
    });

    return context;
  }

  async endCurrentThread(): Promise<void> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('conversation_threads')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (error) throw error;
  }

  async createNewThread(title?: string): Promise<ConversationThread> {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // End current thread
    await this.endCurrentThread();

    // Create new thread
    const { data: newThread, error } = await supabase
      .from('conversation_threads')
      .insert({
        user_id: user.id,
        title: title || `Conversation ${new Date().toLocaleDateString()}`,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;
    return newThread;
  }
}

export const conversationService = new ConversationService();