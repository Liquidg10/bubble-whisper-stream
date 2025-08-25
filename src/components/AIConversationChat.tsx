import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { ttsService } from '@/services/tts';
import { modalityService } from '@/services/modalityService';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  mode?: string;
}

interface AIConversationChatProps {
  className?: string;
  initialMode?: 'supportive' | 'encouraging' | 'reflective' | 'problem-solving';
  context?: any;
}

export const AIConversationChat: React.FC<AIConversationChatProps> = ({
  className = '',
  initialMode = 'supportive',
  context = {}
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentMode, setCurrentMode] = useState(initialMode);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (messageText: string) => {
    if (!messageText.trim() || isProcessing) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      type: 'user',
      content: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    try {
      const conversationHistory = messages.slice(-10).map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      const { data, error } = await supabase.functions.invoke('ai-conversation', {
        body: {
          message: messageText,
          conversationHistory,
          userContext: context,
          mode: currentMode
        }
      });

      if (error) throw error;

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        type: 'ai',
        content: data.response,
        timestamp: new Date(),
        mode: data.mode
      };

      setMessages(prev => [...prev, aiMessage]);

      // Speak the AI response if voice is enabled
      if (voiceEnabled) {
        setIsSpeaking(true);
        try {
          await ttsService.speak(data.response, { 
            context: 'companion',
            tone: 'gentle',
            interrupt: false
          });
        } catch (error) {
          console.warn('TTS failed:', error);
        } finally {
          setIsSpeaking(false);
        }
      }

    } catch (error) {
      console.error('Conversation error:', error);
      toast({
        title: "Conversation Error",
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
      // Use existing voice capture functionality
      const audioBlob = await new Promise<Blob>((resolve, reject) => {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            const mediaRecorder = new MediaRecorder(stream);
            const chunks: BlobPart[] = [];
            
            mediaRecorder.ondataavailable = (event) => {
              chunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'audio/webm' });
              stream.getTracks().forEach(track => track.stop());
              resolve(blob);
            };
            
            mediaRecorder.start();
            
            // Stop after 10 seconds max
            setTimeout(() => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            }, 10000);
            
            // Allow manual stop
            const stopRecording = () => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            };
            
            // Store reference for manual stop
            (window as any).stopCurrentRecording = stopRecording;
          })
          .catch(reject);
      });

      const transcription = await modalityService.transcribeVoice(audioBlob);
      if (transcription.text) {
        await handleSendMessage(transcription.text);
      }
    } catch (error) {
      console.error('Voice input error:', error);
      toast({
        title: "Voice Input Error",
        description: "Failed to record or transcribe voice. Please try typing instead.",
        variant: "destructive"
      });
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if ((window as any).stopCurrentRecording) {
      (window as any).stopCurrentRecording();
    }
  };

  const toggleVoice = () => {
    setVoiceEnabled(!voiceEnabled);
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    }
  };

  const modeColors = {
    supportive: 'bg-gradient-primary',
    encouraging: 'bg-gradient-secondary', 
    reflective: 'bg-gradient-accent',
    'problem-solving': 'bg-gradient-muted'
  };

  return (
    <Card className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground">AI Companion</h3>
          <Badge variant="secondary" className={modeColors[currentMode]}>
            {currentMode}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleVoice}
          className="text-muted-foreground hover:text-foreground"
        >
          {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                className={`max-w-[70%] p-3 rounded-2xl ${
                  message.type === 'user'
                    ? 'bg-primary text-primary-foreground'
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
      <div className="p-4 border-t border-border">
        <div className="flex items-end gap-2">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask me anything or share what's on your mind..."
            className="flex-1 min-h-[40px] max-h-[120px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(inputText);
              }
            }}
            disabled={isProcessing || isRecording}
          />
          
          <Button
            onClick={isRecording ? stopRecording : handleVoiceInput}
            variant={isRecording ? "destructive" : "secondary"}
            size="sm"
            disabled={isProcessing}
            className="shrink-0"
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          
          <Button
            onClick={() => handleSendMessage(inputText)}
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
            className="text-xs text-muted-foreground mt-2 text-center"
          >
            Recording... Tap microphone again to stop
          </motion.p>
        )}
      </div>
    </Card>
  );
};