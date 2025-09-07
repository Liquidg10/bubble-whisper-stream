import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  Plus, 
  Send, 
  Lightbulb, 
  Target, 
  Clock,
  MapPin,
  Sparkles,
  BookOpen,
  CheckCircle,
  Play,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  TrendingUp,
  Zap,
  Timer,
  Activity,
  Eye
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cbtConversationIntegration } from '@/services/cbtConversationIntegration';
import { ttsService } from '@/services/tts';
import { modalityService } from '@/services/modalityService';
import { productivityLearningService } from '@/services/productivityLearningService';
import { contextPatternService } from '@/services/contextPatternService';
import { CBTConversationWrapper } from '@/components/CBTConversationWrapper';


// Helper functions for rich text formatting
const escapeHtml = (unsafe: string) => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const formatAIResponse = (content: string) => {
  // Convert markdown-style formatting to HTML
  let formatted = content
    // Headers (## Header -> <h3>Header</h3>)
    .replace(/^### (.*$)/gm, '<h4 class="font-semibold text-base mb-2 mt-3 text-accent-growth">$1</h4>')
    .replace(/^## (.*$)/gm, '<h3 class="font-semibold text-lg mb-2 mt-3 text-primary">$1</h3>')
    .replace(/^# (.*$)/gm, '<h2 class="font-bold text-xl mb-3 mt-4 text-primary">$1</h2>')
    
    // Bold text (**text** -> <strong>text</strong>)
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    
    // Italic text (*text* -> <em>text</em>)
    .replace(/\*(.*?)\*/g, '<em class="italic text-muted-foreground">$1</em>')
    
    // Bullet points (- item -> <li>item</li>)
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc list-inside mb-1">$1</li>')
    
    // Numbered lists (1. item -> <li>item</li>)
    .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal list-inside mb-1">$1</li>')
    
    // Code blocks (`code` -> <code>code</code>)
    .replace(/`([^`]*)`/g, '<code class="bg-muted px-2 py-1 rounded text-sm font-mono">$1</code>')
    
    // Line breaks (double newline -> <br><br>)
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    
    // Highlights (::text:: -> highlighted span)
    .replace(/::(.*?)::/g, '<span class="bg-accent-growth/20 text-accent-growth px-1 rounded">$1</span>')
    
    // Emojis with better spacing
    .replace(/([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}])/gu, '<span class="emoji">$1</span>');

  // Wrap consecutive list items in ul/ol tags
  formatted = formatted
    .replace(/(<li class="ml-4 list-disc[^>]*>.*?<\/li>)(?:\s*<li class="ml-4 list-disc[^>]*>.*?<\/li>)*/gs, (match) => {
      return `<ul class="space-y-1 my-2">${match}</ul>`;
    })
    .replace(/(<li class="ml-4 list-decimal[^>]*>.*?<\/li>)(?:\s*<li class="ml-4 list-decimal[^>]*>.*?<\/li>)*/gs, (match) => {
      return `<ol class="space-y-1 my-2">${match}</ol>`;
    });

  return formatted;
};

interface ProductivitySession {
  anchorTask: string;
  startTime: number;
  plannedDuration: number;
  sideQuests: SideQuest[];
  currentState: 'active' | 'paused' | 'completed';
  productivity: {
    focusTime: number;
    distractionTime: number;
    efficiency: number;
  };
}

interface SideQuest {
  id: string;
  description: string;
  startTime: number;
  endTime?: number;
  impact: 'positive' | 'neutral' | 'negative';
  category: string;
}

interface AIMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  context?: any;
  cbtGuidance?: {
    shouldShow: boolean;
    action?: any;
    traceId?: string;
    distortionTypes?: string[];
  };
}

interface SmartSuggestion {
  text: string;
  category: string;
  estimatedDuration: number;
  confidence: number;
  reasoning: string;
  patterns?: string[];
  locationOptimized?: boolean;
  timeOptimized?: boolean;
}

interface EnhancedAIChatProps {
  className?: string;
  initialMode?: 'supportive' | 'encouraging' | 'reflective' | 'problem-solving';
  context?: any;
}

export const EnhancedAIChat: React.FC<EnhancedAIChatProps> = ({
  className = '',
  initialMode = 'supportive',
  context = {}
}) => {
  const { settings, updateSettings, addBubble } = useBubbleStore();
  const { toast } = useToast();
  
  // Core state
  const [currentSession, setCurrentSession] = useState<ProductivitySession | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  
  // AI & Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [currentMode, setCurrentMode] = useState(initialMode);
  
  // Learning & Suggestions
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [productivity, setProductivity] = useState({
    todayScore: 0,
    weekScore: 0,
    streak: 0,
    insights: [] as string[]
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with conversation history and AI greeting
  useEffect(() => {
    const initializeChat = async () => {
      setIsLoadingHistory(true);
      try {
        // Import conversation service dynamically to avoid circular imports
        const { conversationService } = await import('@/services/conversationService');
        
        // Get or create active thread
        const thread = await conversationService.getOrCreateActiveThread();
        setCurrentThreadId(thread.id);

        // Load existing conversation history
        const history = await conversationService.getConversationHistory(thread.id, 20);
        
        if (history.length > 0) {
          // Convert database history to AIMessage format
          const chatMessages: AIMessage[] = history.flatMap(conv => [
            {
              id: `user-${conv.id}`,
              type: 'user' as const,
              content: conv.user_message,
              timestamp: new Date(conv.created_at)
            },
            {
              id: `ai-${conv.id}`,
              type: 'ai' as const,
              content: conv.ai_response,
              timestamp: new Date(conv.created_at),
              context: conv.context
            }
          ]);
          
          setMessages(chatMessages);
        } else {
          // First time user - show welcome message
          const insights = await productivityLearningService.getProductivityInsights();
          setProductivity({
            todayScore: Math.round(Math.random() * 100),
            weekScore: Math.round(Math.random() * 100),
            streak: Math.floor(Math.random() * 10),
            insights: insights.recommendations
          });

          const welcomeMessage: AIMessage = {
            id: crypto.randomUUID(),
            type: 'ai',
            content: `Hey! 🔥 Sparkles here, your productivity companion. I'm here to help you stay focused, celebrate wins, and navigate the beautiful chaos of getting things done. What's on your mind today?`,
            timestamp: new Date()
          };
          setMessages([welcomeMessage]);
        }
      } catch (error) {
        console.error('Failed to initialize chat:', error);
        // Fallback to basic welcome message
        const welcomeMessage: AIMessage = {
          id: crypto.randomUUID(),
          type: 'ai',
          content: `Hey! 🔥 Sparkles here, your productivity companion. What's on your mind today?`,
          timestamp: new Date()
        };
        setMessages([welcomeMessage]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    initializeChat();
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Generate context-aware suggestions when typing
  useEffect(() => {
    if (inputText.length > 3 && !isProcessing) {
      generateSmartSuggestions(inputText);
    } else {
      setSuggestions([]);
    }
  }, [inputText]);

  const generateSmartSuggestions = async (input: string) => {
    setIsAnalyzing(true);
    try {
      const currentContext = await contextPatternService.getCurrentContext();
      const learningData = await productivityLearningService.getSuggestions(input, currentContext);
      
      const smartSuggestions: SmartSuggestion[] = learningData.map(suggestion => ({
        text: suggestion.text,
        category: 'work',
        estimatedDuration: suggestion.estimatedDuration,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        timeOptimized: currentContext.timeOfDay ? true : false,
        locationOptimized: currentContext.location ? true : false
      }));

      setSuggestions(smartSuggestions);
    } catch (error) {
      console.warn('Failed to generate smart suggestions:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const detectIntent = (messageText: string) => {
    const text = messageText.toLowerCase();
    
    // Focus session intent
    if (text.includes('focus') || text.includes('work on') || text.includes('start session')) {
      const durationMatch = text.match(/(\d+)\s*(min|minute|hour)/);
      const duration = durationMatch ? parseInt(durationMatch[1]) * (durationMatch[2].startsWith('hour') ? 60 : 1) : 25;
      return { type: 'start_session', duration, task: messageText };
    }
    
    // Side quest intent
    if (currentSession && (text.includes('side quest') || text.includes('got distracted') || text.includes('switched to'))) {
      return { type: 'side_quest', description: messageText };
    }
    
    // Complete session intent
    if (currentSession && (text.includes('done') || text.includes('finished') || text.includes('complete'))) {
      return { type: 'complete_session' };
    }
    
    // Quick capture intent
    if (text.includes('remind me') || text.includes('add task') || text.includes('note:')) {
      return { type: 'quick_capture', content: messageText };
    }
    
    return { type: 'conversation' };
  };

  const handleAIChat = async (messageText: string) => {
    if (!messageText.trim() || isProcessing) return;

    const userMessage: AIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    try {
      // PROMPT 7: CBT Conversation Pipeline Integration
      const messageId = crypto.randomUUID();
      const userId = (await supabase.auth.getUser()).data.user?.id || 'anonymous';
      
      // PROMPT 7: Main message interception point - analyze through CBT pipeline
      const cbtResult = await cbtConversationIntegration.analyzeMessage({
        messageText,
        messageId,
        userId,
        conversationHistory: messages.slice(-8).map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
          timestamp: msg.timestamp.getTime()
        })),
        currentContext: {
          currentSession,
          productivity,
          currentActivity: currentSession?.anchorTask
        }
      });

      // Detect intent and handle accordingly
      const intent = detectIntent(messageText);
      
      if (intent.type === 'start_session') {
        await startProductivitySession(intent.task, intent.duration);
        return;
      } else if (intent.type === 'side_quest') {
        recordSideQuest(intent.description);
        return;
      } else if (intent.type === 'complete_session') {
        await completeSession();
        return;
      } else if (intent.type === 'quick_capture') {
        await handleQuickCapture(intent.content);
        return;
      }

      // Regular conversation
      const conversationContext = {
        currentSession,
        productivity,
        recentPatterns: await contextPatternService.getRecentPatterns(),
        currentContext: await contextPatternService.getCurrentContext(),
        suggestions: suggestions.slice(0, 3) // Include top suggestions for context
      };

      const conversationHistory = messages.slice(-8).map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      const { data, error } = await supabase.functions.invoke('ai-conversation', {
        body: {
          message: messageText,
          conversationHistory,
          userContext: { ...context, ...conversationContext, sessionStart: intent.type === 'start_session' },
          mode: 'sparkles-productivity-companion',
          personality: 'supportive-intelligent',
          threadId: currentThreadId,
          loadHistory: false // We already loaded history at init
        }
      });

      if (error) throw error;

      const aiMessage: AIMessage = {
        id: crypto.randomUUID(),
        type: 'ai',
        content: data.response,
        timestamp: new Date(),
        context: data.context,
        // PROMPT 7: Attach CBT guidance if available
        cbtGuidance: cbtResult.shouldShowCBT ? {
          shouldShow: true,
          action: cbtResult.cbtAction,
          traceId: cbtResult.traceId,
          distortionTypes: cbtResult.cbtAction?.data?.distortionType ? [cbtResult.cbtAction.data.distortionType] : []
        } : undefined
      };

      setMessages(prev => [...prev, aiMessage]);

      // Speak AI response if voice enabled
      if (voiceEnabled) {
        setIsSpeaking(true);
        try {
          await ttsService.speak(data.response, { 
            context: 'companion',
            tone: 'encouraging'
          });
        } catch (error) {
          console.warn('TTS failed:', error);
        } finally {
          setIsSpeaking(false);
        }
      }

    } catch (error) {
      console.error('AI chat error:', error);
      toast({
        title: "Chat Error",
        description: "Failed to get AI response. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const startProductivitySession = async (anchorTask: string, duration: number) => {
    const currentContext = await contextPatternService.getCurrentContext();
    
    const session: ProductivitySession = {
      anchorTask,
      startTime: Date.now(),
      plannedDuration: duration,
      sideQuests: [],
      currentState: 'active',
      productivity: {
        focusTime: 0,
        distractionTime: 0,
        efficiency: 1.0
      }
    };

    setCurrentSession(session);
    
    // Start appropriate timer
    if (duration >= 25) {
      updateSettings({
        pomodoroTimer: {
          isActive: true,
          timeRemaining: duration * 60,
          duration: duration * 60,
          startTime: Date.now(),
          currentPhase: 'work',
          cycleCount: 0
        }
      });
    } else {
      updateSettings({
        cleanHouseTimer: {
          isActive: true,
          timeRemaining: duration * 60,
          duration: duration * 60,
          startTime: Date.now()
        }
      });
    }

    // AI encouragement
    const encouragementMessage: AIMessage = {
      id: crypto.randomUUID(),
      type: 'ai',
      content: `Perfect! 🎯 Your ${duration}-minute focus session is now active with anchor task: "${anchorTask}". I'll keep an eye on your progress. Remember, side quests are totally normal - just let me know if you switch gears, and I'll help you drift back when you're ready. You've got this!`,
      timestamp: new Date(),
      context: { sessionStart: true, anchorTask }
    };
    
    setMessages(prev => [...prev, encouragementMessage]);
    
    // Record session start for learning
    await contextPatternService.recordSessionStart(anchorTask, duration, currentContext);
    
    toast({
      title: `${duration}-minute focus session started! 🍅`,
      description: `Anchor: ${anchorTask}`,
    });
  };

  const recordSideQuest = (description: string) => {
    if (!currentSession) return;

    const sideQuest: SideQuest = {
      id: crypto.randomUUID(),
      description,
      startTime: Date.now(),
      impact: 'neutral',
      category: 'general'
    };

    setCurrentSession({
      ...currentSession,
      sideQuests: [...currentSession.sideQuests, sideQuest]
    });

    // AI gentle redirect
    const redirectMessage: AIMessage = {
      id: crypto.randomUUID(),
      type: 'ai',
      content: `📝 Side quest logged: "${description}". That's totally normal - our brains love to explore! Whenever you're ready, let's drift back to your anchor: "${currentSession.anchorTask}". No judgment, just gentle momentum forward.`,
      timestamp: new Date(),
      context: { sideQuest: true }
    };
    
    setMessages(prev => [...prev, redirectMessage]);
  };

  const completeSession = async () => {
    if (!currentSession) return;

    const duration = Math.floor((Date.now() - currentSession.startTime) / 1000 / 60);
    const efficiency = Math.min(1, currentSession.plannedDuration / duration);
    
    // Record completion for learning
    await productivityLearningService.recordCompletion({
      task: currentSession.anchorTask,
      plannedDuration: currentSession.plannedDuration,
      actualDuration: duration,
      sideQuests: currentSession.sideQuests.length,
      context: await contextPatternService.getCurrentContext()
    });

    // Add completion bubble
    addBubble({
      id: `session-${Date.now()}`,
      x: Math.random() * 300 + 100,
      y: Math.random() * 300 + 100,
      type: 'Memory',
      content: `✅ Completed: ${currentSession.anchorTask} (${duration}m) - ${currentSession.sideQuests.length} side quests`,
      tags: [
        { id: 'completed', name: 'completed', colorHex: '#10b981' },
        { id: 'ai-coached', name: 'ai-coached', colorHex: '#8b5cf6' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      size: 45
    });

    // AI celebration with data
    const celebrationMessage: AIMessage = {
      id: crypto.randomUUID(),
      type: 'ai',
      content: `🎉 Session complete! You absolutely crushed "${currentSession.anchorTask}" in ${duration} minutes with ${currentSession.sideQuests.length} side quests. Your efficiency: ${Math.round(efficiency * 100)}%. That's the kind of productive chaos I love to see! What's next on your journey?`,
      timestamp: new Date(),
      context: { sessionComplete: true, stats: { duration, efficiency, sideQuests: currentSession.sideQuests.length } }
    };
    
    setMessages(prev => [...prev, celebrationMessage]);
    setCurrentSession(null);
    
    toast({
      title: "Session completed! 🎉",
      description: `${duration}min focused on "${currentSession.anchorTask}"`,
    });
  };

  const handleQuickCapture = async (content: string) => {
    const bubble = {
      id: `quick-${Date.now()}`,
      x: Math.random() * 300 + 100,
      y: Math.random() * 300 + 100,
      type: 'Task' as const,
      content: content.trim(),
      tags: [{ id: 'ai-added', name: 'ai-added', colorHex: '#8b5cf6' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      size: 40
    };

    addBubble(bubble);
    
    // Auto-categorize and learn from the input
    await contextPatternService.recordQuickCapture(content.trim());

    const captureMessage: AIMessage = {
      id: crypto.randomUUID(),
      type: 'ai',
      content: `📝 Captured and added to your bubble canvas! "${content.trim()}" is now ready whenever you need it. Anything else I can help you wrangle today?`,
      timestamp: new Date(),
      context: { quickCapture: true }
    };
    
    setMessages(prev => [...prev, captureMessage]);

    toast({
      title: "Captured! 📝",
      description: "Task added to bubble canvas",
    });
  };

  const handleVoiceInput = async () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }

    try {
      setIsRecording(true);
      const audioBlob = await new Promise<Blob>((resolve, reject) => {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            const mediaRecorder = new MediaRecorder(stream);
            const chunks: BlobPart[] = [];
            
            mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
            mediaRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'audio/webm' });
              stream.getTracks().forEach(track => track.stop());
              resolve(blob);
            };
            
            mediaRecorder.start();
            setTimeout(() => mediaRecorder.state === 'recording' && mediaRecorder.stop(), 10000);
          })
          .catch(reject);
      });

      const transcription = await modalityService.transcribeVoice(audioBlob);
      if (transcription.text) {
        await handleAIChat(transcription.text);
      }
    } catch (error) {
      console.error('Voice input error:', error);
      toast({
        title: "Voice Error",
        description: "Failed to record voice. Please try typing instead.",
        variant: "destructive"
      });
    } finally {
      setIsRecording(false);
    }
  };

  const toggleVoice = () => {
    setVoiceEnabled(!voiceEnabled);
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    }
  };

  const applySuggestion = async (suggestion: SmartSuggestion) => {
    setInputText(suggestion.text);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  // PROMPT 8: CBT engagement handler with feedback learning
  const handleCBTEngagement = async (
    traceId: string, 
    engaged: boolean, 
    response?: string, 
    helpfulness?: number, 
    distortionTypes?: string[]
  ) => {
    try {
      await cbtConversationIntegration.recordCBTEngagement(traceId, engaged, response, helpfulness, distortionTypes);
      
      if (!engaged) {
        // Clear CBT guidance on dismissal by updating the relevant message
        setMessages(prev => prev.map(msg => 
          msg.cbtGuidance?.traceId === traceId 
            ? { ...msg, cbtGuidance: { ...msg.cbtGuidance, shouldShow: false } }
            : msg
        ));
      }
    } catch (error) {
      console.error('[CBT Enhanced Chat] Failed to record engagement:', error);
    }
  };

  const SessionProgress = () => {
    if (!currentSession) return null;

    const elapsed = (Date.now() - currentSession.startTime) / 1000 / 60;
    const progress = Math.min(100, (elapsed / currentSession.plannedDuration) * 100);
    const remaining = Math.max(0, currentSession.plannedDuration - elapsed);

    return (
      <Card className="bg-gradient-to-r from-accent-growth/10 to-accent-joy/10 border-accent-growth/30 mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent-growth" />
              <span className="font-medium">Active Session</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={completeSession} size="sm" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Complete
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium">{currentSession.anchorTask}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {Math.round(remaining)}min remaining
              {currentSession.sideQuests.length > 0 && (
                <>
                  <span className="mx-1">•</span>
                  <span>{currentSession.sideQuests.length} side quests</span>
                </>
              )}
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Session Progress */}
      <SessionProgress />

      {/* Chat Interface */}
      <Card className="flex-1 flex flex-col">
        {/* Header */}
        <CardHeader className="flex-row items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Assistant</CardTitle>
            {currentSession && (
              <Badge variant="secondary" className="bg-accent-growth/20 text-accent-growth">
                Active Session
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleVoice}
            className="text-muted-foreground hover:text-foreground"
          >
            {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex-1 overflow-y-auto space-y-3 p-3">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <CBTConversationWrapper
                  cbtGuidance={message.cbtGuidance}
                  onCBTEngagement={handleCBTEngagement}
                >
                  <div
                    className={`w-full p-4 rounded-xl ${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : message.type === 'system'
                        ? 'bg-muted/50 text-muted-foreground border border-border'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <div 
                      className="text-sm leading-relaxed formatted-ai-response"
                      dangerouslySetInnerHTML={{ 
                        __html: message.type === 'ai' ? formatAIResponse(message.content) : escapeHtml(message.content)
                      }}
                    />
                    <span className="text-xs opacity-60 mt-2 block">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </CBTConversationWrapper>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-muted p-3 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200" />
                  <span className="text-xs text-muted-foreground ml-2">Thinking...</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Smart Suggestions */}
          {suggestions.length > 0 && !isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-2"
            >
              <p className="text-xs text-muted-foreground font-medium">Smart suggestions:</p>
              {suggestions.slice(0, 3).map((suggestion, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => applySuggestion(suggestion)}
                  className="text-left h-auto p-2 justify-start"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Lightbulb className="h-3 w-3 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{suggestion.text}</p>
                      <p className="text-xs text-muted-foreground">
                        ~{suggestion.estimatedDuration}min
                        {suggestion.timeOptimized && <span className="ml-1">🕐</span>}
                        {suggestion.locationOptimized && <span className="ml-1">📍</span>}
                      </p>
                    </div>
                  </div>
                </Button>
              ))}
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input */}
        <div className="p-3 border-t border-border">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Tell me what you want to work on, ask for help, or share what's on your mind..."
              className="flex-1 min-h-[50px] max-h-[120px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAIChat(inputText);
                }
              }}
              disabled={isProcessing || isRecording}
            />
            
            <Button
              onClick={isRecording ? () => setIsRecording(false) : handleVoiceInput}
              variant={isRecording ? "destructive" : "secondary"}
              size="sm"
              disabled={isProcessing}
              className="shrink-0"
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            
            <Button
              onClick={() => handleAIChat(inputText)}
              disabled={!inputText.trim() || isProcessing || isRecording}
              size="sm"
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          
          {isRecording && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted-foreground mt-2 text-center"
            >
              🎤 Recording... Tap microphone to stop
            </motion.p>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 mt-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAIChat("I want to start a 25-minute focus session")}
              className="text-xs"
              disabled={isProcessing || !!currentSession}
            >
              <Timer className="h-3 w-3 mr-1" />
              Quick Focus
            </Button>
            {currentSession && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAIChat("I got distracted by something")}
                className="text-xs"
                disabled={isProcessing}
              >
                <Activity className="h-3 w-3 mr-1" />
                Side Quest
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAIChat("How am I doing with my productivity today?")}
              className="text-xs"
              disabled={isProcessing}
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              Check-in
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};