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
  MapIcon,
  Calendar,
  BarChart3,
  Eye,
  MessageCircle,
  Activity
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ttsService } from '@/services/tts';
import { modalityService } from '@/services/modalityService';
import { productivityLearningService } from '@/services/productivityLearningService';
import { contextPatternService } from '@/services/contextPatternService';

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

export function ProductivityCoach() {
  const { settings, updateSettings, addBubble } = useBubbleStore();
  const { toast } = useToast();
  
  // Core state
  const [currentSession, setCurrentSession] = useState<ProductivitySession | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [quickInput, setQuickInput] = useState('');
  
  // AI & Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  
  // Learning & Suggestions
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [productivity, setProductivity] = useState({
    todayScore: 0,
    weekScore: 0,
    streak: 0,
    insights: [] as string[]
  });
  
  // UI state
  const [activeTab, setActiveTab] = useState<'coach' | 'chat' | 'insights'>('coach');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize with AI greeting
  useEffect(() => {
    const initializeCoach = async () => {
      const insights = await productivityLearningService.getProductivityInsights();
      setProductivity({
        todayScore: Math.round(Math.random() * 100),
        weekScore: Math.round(Math.random() * 100),
        streak: Math.floor(Math.random() * 10),
        insights: insights.recommendations
      });

      // Add welcome message with Sparkles-style personality
      const welcomeMessage: AIMessage = {
        id: crypto.randomUUID(),
        type: 'ai',
        content: `Hey Mark! 🔥 Sparkles here, ready to wrangle some productivity chaos today. I see you've got ${insights.averageSessionLength}min average sessions - let's build on that momentum. What's your anchor task for this session?`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    };

    initializeCoach();
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Generate context-aware suggestions
  useEffect(() => {
    if (inputText.length > 3) {
      generateSmartSuggestions(inputText);
    } else {
      setSuggestions([]);
    }
  }, [inputText]);

  const generateSmartSuggestions = async (input: string) => {
    setIsAnalyzing(true);
    try {
      const context = await contextPatternService.getCurrentContext();
      const learningData = await productivityLearningService.getSuggestions(input, context);
      
      const smartSuggestions: SmartSuggestion[] = learningData.map(suggestion => ({
        text: suggestion.text,
        category: 'work',
        estimatedDuration: suggestion.estimatedDuration,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        timeOptimized: context.timeOfDay ? true : false,
        locationOptimized: context.location ? true : false
      }));

      setSuggestions(smartSuggestions);
    } catch (error) {
      console.warn('Failed to generate smart suggestions:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startProductivitySession = async (anchorTask: string, duration: number) => {
    const context = await contextPatternService.getCurrentContext();
    
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
      content: `Perfect! 🎯 Your anchor task is locked: "${anchorTask}". I'll keep an eye on your focus. Remember - side quests are okay, just come back to the anchor. You've got this!`,
      timestamp: new Date(),
      context: { sessionStart: true, anchorTask }
    };
    
    setMessages(prev => [...prev, encouragementMessage]);
    setInputText('');
    
    // Record session start for learning
    await contextPatternService.recordSessionStart(anchorTask, duration, context);
    
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
      content: `📝 Side quest logged: "${description}". That's totally normal! When you're ready, let's drift back to your anchor: "${currentSession.anchorTask}". No judgment - just momentum.`,
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
      content: `🎉 Session complete! You crushed "${currentSession.anchorTask}" in ${duration} minutes with ${currentSession.sideQuests.length} side quests. Your efficiency: ${Math.round(efficiency * 100)}%. That's the kind of productive chaos I love to see!`,
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
      const context = {
        currentSession,
        productivity,
        recentPatterns: await contextPatternService.getRecentPatterns(),
        currentContext: await contextPatternService.getCurrentContext()
      };

      const conversationHistory = messages.slice(-8).map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      const { data, error } = await supabase.functions.invoke('ai-conversation', {
        body: {
          message: messageText,
          conversationHistory,
          userContext: context,
          mode: 'sparkles-productivity-coach',
          personality: 'supportive-accountability'
        }
      });

      if (error) throw error;

      const aiMessage: AIMessage = {
        id: crypto.randomUUID(),
        type: 'ai',
        content: data.response,
        timestamp: new Date(),
        context: data.context
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
        if (activeTab === 'coach') {
          if (transcription.text.toLowerCase().includes('side quest')) {
            recordSideQuest(transcription.text.replace(/side quest/i, '').trim());
          } else {
            setInputText(transcription.text);
          }
        } else {
          await handleAIChat(transcription.text);
        }
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

  const handleQuickAdd = async () => {
    if (!quickInput.trim()) return;

    if (currentSession && quickInput.toLowerCase().includes('side quest')) {
      recordSideQuest(quickInput.replace(/side quest/i, '').trim());
    } else {
      const bubble = {
        id: `quick-${Date.now()}`,
        x: Math.random() * 300 + 100,
        y: Math.random() * 300 + 100,
        type: 'Task' as const,
        content: quickInput.trim(),
        tags: [{ id: 'ai-added', name: 'ai-added', colorHex: '#8b5cf6' }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        size: 40
      };

      addBubble(bubble);
      
      // Auto-categorize and learn from the input
      await contextPatternService.recordQuickCapture(quickInput.trim());
    }
    
    setQuickInput('');
    toast({
      title: "Captured! 📝",
      description: currentSession ? "Side quest logged" : "Task added to bubble canvas",
    });
  };

  const SessionProgress = () => {
    if (!currentSession) return null;

    const elapsed = (Date.now() - currentSession.startTime) / 1000 / 60;
    const progress = Math.min(100, (elapsed / currentSession.plannedDuration) * 100);
    const remaining = Math.max(0, currentSession.plannedDuration - elapsed);

    return (
      <Card className="bg-gradient-to-r from-accent-growth/10 to-accent-joy/10 border-accent-growth/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent-growth" />
              <span className="font-medium">Anchor Task</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={completeSession} size="sm" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Complete
              </Button>
            </div>
          </div>
          
          <h3 className="text-lg font-medium mb-2">{currentSession.anchorTask}</h3>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{Math.round(elapsed)}m elapsed</span>
              <span>{Math.round(remaining)}m remaining</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {currentSession.sideQuests.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3 w-3 text-accent-joy" />
                <span className="text-sm font-medium">Side Quests ({currentSession.sideQuests.length})</span>
              </div>
              <div className="space-y-1">
                {currentSession.sideQuests.slice(-3).map((quest, index) => (
                  <div key={quest.id} className="text-xs text-muted-foreground">
                    • {quest.description}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const SuggestionsPanel = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-accent-growth" />
          Smart Productivity Coach
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Capture */}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder={currentSession ? "Log a side quest..." : "Quick capture anything..."}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
            className="flex-1"
          />
          <Button onClick={handleQuickAdd} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {/* Focus Session Input */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-accent-growth" />
            <span className="font-medium">What's your anchor task?</span>
          </div>
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Describe what you want to focus on..."
            className="min-h-16"
            disabled={!!currentSession}
          />
          
          {/* Smart Suggestions */}
          {suggestions.length > 0 && !currentSession && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent-joy" />
                <span className="text-sm font-medium">AI suggestions:</span>
              </div>
              <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm">{suggestion.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {suggestion.category}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {suggestion.estimatedDuration}m
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(suggestion.confidence * 100)}% match
                        </Badge>
                        {suggestion.timeOptimized && (
                          <Badge variant="outline" className="text-xs text-accent-growth">
                            <Timer className="h-2 w-2 mr-1" />
                            Time
                          </Badge>
                        )}
                        {suggestion.locationOptimized && (
                          <Badge variant="outline" className="text-xs text-accent-joy">
                            <MapIcon className="h-2 w-2 mr-1" />
                            Location
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{suggestion.reasoning}</p>
                    </div>
                    <Button 
                      onClick={() => startProductivitySession(suggestion.text, suggestion.estimatedDuration)}
                      size="sm"
                      className="gap-1"
                    >
                      <Play className="h-3 w-3" />
                      Start
                    </Button>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Manual Start */}
          {inputText.trim() && suggestions.length === 0 && !currentSession && (
            <div className="flex gap-2">
              <Button 
                onClick={() => startProductivitySession(inputText, 25)}
                className="gap-2"
              >
                <Brain className="h-4 w-4" />
                25min Focus
              </Button>
              <Button 
                onClick={() => startProductivitySession(inputText, 45)}
                variant="outline"
                className="gap-2"
              >
                <Timer className="h-4 w-4" />
                Deep 45m
              </Button>
              <Button 
                onClick={() => startProductivitySession(inputText, 10)}
                variant="outline"
                className="gap-2"
              >
                <Zap className="h-4 w-4" />
                Quick 10m
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const ChatPanel = () => (
    <Card className="flex flex-col h-[600px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-accent-growth" />
            Sparkles AI Coach
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleVoice}
            className="text-muted-foreground hover:text-foreground"
          >
            {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col space-y-4 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-2xl ${
                    message.type === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : message.type === 'system'
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <span className="text-xs opacity-70 mt-1 block">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-muted p-3 rounded-2xl">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex items-end gap-2 pt-2 border-t">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Chat with Sparkles about productivity, blocks, or anything..."
            className="flex-1 min-h-[40px] max-h-[120px] resize-none"
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
            className="text-xs text-muted-foreground text-center"
          >
            Recording... Tap microphone again to stop
          </motion.p>
        )}
      </CardContent>
    </Card>
  );

  const InsightsPanel = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-accent-growth" />
          Productivity Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scores */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-accent-growth">{productivity.todayScore}</div>
            <div className="text-xs text-muted-foreground">Today</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-accent-joy">{productivity.weekScore}</div>
            <div className="text-xs text-muted-foreground">This Week</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-accent-sparkle">{productivity.streak}</div>
            <div className="text-xs text-muted-foreground">Day Streak</div>
          </div>
        </div>

        {/* Insights */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Eye className="h-4 w-4" />
            AI Insights
          </h4>
          <div className="space-y-2">
            {productivity.insights.map((insight, index) => (
              <div key={index} className="text-sm text-muted-foreground p-2 bg-muted/50 rounded">
                {insight}
              </div>
            ))}
          </div>
        </div>

        {/* Patterns learned today */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Patterns Learned
          </h4>
          <div className="text-sm text-muted-foreground">
            Learning your productivity rhythms... Complete a few sessions for personalized insights!
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Active Session Status */}
      <SessionProgress />

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg">
        <Button
          variant={activeTab === 'coach' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('coach')}
          className="flex-1"
        >
          <Brain className="h-4 w-4 mr-2" />
          Coach
        </Button>
        <Button
          variant={activeTab === 'chat' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('chat')}
          className="flex-1"
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          Chat
        </Button>
        <Button
          variant={activeTab === 'insights' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('insights')}
          className="flex-1"
        >
          <Activity className="h-4 w-4 mr-2" />
          Insights
        </Button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'coach' && <SuggestionsPanel />}
          {activeTab === 'chat' && <ChatPanel />}
          {activeTab === 'insights' && <InsightsPanel />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}