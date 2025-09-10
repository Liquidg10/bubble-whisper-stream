import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Sparkles, MapPin, CheckCircle } from 'lucide-react';
import { userContextService } from '@/services/userContextService';
import { planGenerationService, GeneratedPlan } from '@/services/planGenerationService';
import { PlanImplementationDialog } from './PlanImplementationDialog';
import { PlanEditor } from './PlanEditor';
import { conversationPlanService } from '@/services/conversationPlanService';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  plan?: GeneratedPlan;
  actions?: Array<{
    type: 'implement_plan';
    label: string;
    planId: string;
  }>;
}

export const SmartAIAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hi! I\'m your AI companion. I can help you organize thoughts, process emotions, and create personalized plans. Try asking me to "help plan my morning" or "create a job search strategy"!',
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<GeneratedPlan | null>(null);
  const [showImplementDialog, setShowImplementDialog] = useState(false);
  const [conversationId] = useState(() => crypto.randomUUID());
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new message is added
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const activePlan = conversationPlanService.getActivePlan(conversationId);
      let assistantMessage: Message;

      // Check if user wants to implement the current plan
      if (conversationPlanService.isImplementationRequest(userMessage.content)) {
        if (activePlan) {
          setCurrentPlan(activePlan);
          setShowImplementDialog(true);
          
          assistantMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: 'Perfect! I\'ll help you implement this plan. Please choose how you\'d like to set it up.',
            timestamp: Date.now()
          };
        } else {
          assistantMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: 'I don\'t see a plan to implement. Would you like me to create a new plan for you?',
            timestamp: Date.now()
          };
        }
      }
      // Check if user wants to modify the current plan
      else if (activePlan && conversationPlanService.isPlanModificationRequest(userMessage.content, conversationId)) {
        const modifiedPlan = await conversationPlanService.modifyPlan(conversationId, userMessage.content);
        
        if (modifiedPlan) {
          setCurrentPlan(modifiedPlan);
          
          // Determine if this was a comprehensive revision
          const isComprehensive = userMessage.content.toLowerCase().includes('rethink') || 
                                 userMessage.content.toLowerCase().includes('completely') ||
                                 userMessage.content.toLowerCase().includes('different');
          
          const responseContent = isComprehensive 
            ? 'I\'ve completely rethought your plan based on your feedback. Here\'s the new approach:'
            : 'I\'ve updated your plan based on your request. Here\'s the modified version:';
          
          assistantMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: responseContent,
            timestamp: Date.now(),
            plan: modifiedPlan,
            actions: [{
              type: 'implement_plan',
              label: 'Implement Plan',
              planId: modifiedPlan.id
            }]
          };
        } else {
          assistantMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: 'I had trouble understanding how to modify the plan. Could you try being more specific? For example: "add supplements after hydrate" or "make the morning routine shorter" or "completely rethink this approach".',
            timestamp: Date.now()
          };
        }
      }
      // Check if this looks like a new planning request
      else if (isPlanningRequest(userMessage.content)) {
        const planType = determinePlanType(userMessage.content);
        const plan = await planGenerationService.generatePlan(userMessage.content, planType);
        
        // Set this as the active plan for the conversation
        conversationPlanService.setActivePlan(conversationId, plan);
        setCurrentPlan(plan);
        
        assistantMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `I've created a personalized ${planType} plan for you! This plan has ${plan.steps.length} steps and should take about ${Math.round(plan.totalEstimatedMinutes)} minutes total. You can review and modify any part of it below, or ask me to implement it.`,
          timestamp: Date.now(),
          plan,
          actions: [{
            type: 'implement_plan',
            label: 'Implement Plan',
            planId: plan.id
          }]
        };
      } else {
        // Regular conversation
        const context = await userContextService.getUserContext();
        
        const { data, error } = await supabase.functions.invoke('ai-conversation', {
          body: {
            message: userMessage.content,
            userContext: context,
            conversationHistory: messages.slice(-5)
          }
        });

        if (error) throw error;

        assistantMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response || 'I\'m sorry, I couldn\'t process that right now. Please try again.',
          timestamp: Date.now()
        };
      }

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI conversation error:', error);
      
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'I\'m having trouble connecting right now. You can still use voice commands and the other features!',
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const isPlanningRequest = (content: string): boolean => {
    const planKeywords = ['plan', 'help me', 'schedule', 'organize', 'strategy', 'routine', 'morning', 'day', 'health', 'work'];
    return planKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
  };

  const determinePlanType = (content: string): 'morning' | 'workday' | 'health' | 'project' | 'general' => {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('morning') || lowerContent.includes('wake up')) return 'morning';
    if (lowerContent.includes('work') || lowerContent.includes('job') || lowerContent.includes('career')) return 'workday';
    if (lowerContent.includes('health') || lowerContent.includes('fitness') || lowerContent.includes('supplement')) return 'health';
    if (lowerContent.includes('project') || lowerContent.includes('goal')) return 'project';
    return 'general';
  };

  const handleImplementPlan = (plan: GeneratedPlan) => {
    setCurrentPlan(plan);
    setShowImplementDialog(true);
  };

  const handlePlanUpdate = (updatedPlan: GeneratedPlan) => {
    setCurrentPlan(updatedPlan);
    conversationPlanService.setActivePlan(conversationId, updatedPlan);
    
    // Update the message with the plan
    setMessages(prev => prev.map(msg => 
      msg.plan?.id === updatedPlan.id 
        ? { ...msg, plan: updatedPlan }
        : msg
    ));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full" data-ai-assistant>
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div className={`p-2 rounded-full ${
                message.role === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted'
              }`}>
                {message.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              
              <div className={`flex-1 max-w-[80%] ${
                message.role === 'user' ? 'text-right' : 'text-left'
              }`}>
                 <div className={`p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground ml-auto'
                    : 'bg-muted'
                } max-w-fit ${message.role === 'user' ? 'ml-auto' : 'mr-auto'}`}>
                   <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                   
                    {/* Plan Editor */}
                    {message.plan && (
                      <div className="mt-3">
                        <PlanEditor
                          plan={message.plan}
                          onPlanUpdate={handlePlanUpdate}
                          onImplement={() => handleImplementPlan(message.plan!)}
                          className="border-0 bg-background/50"
                        />
                      </div>
                    )}
                   
                   {/* Action Buttons */}
                   {message.actions && (
                     <div className="mt-3 flex gap-2">
                       {message.actions.map((action, index) => (
                         <Button
                           key={index}
                           variant="outline"
                           size="sm"
                           onClick={() => message.plan && handleImplementPlan(message.plan)}
                           className="text-xs"
                         >
                           <CheckCircle className="h-3 w-3 mr-1" />
                           {action.label}
                         </Button>
                       ))}
                     </div>
                   )}
                 </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-muted">
                <Bot className="h-4 w-4" />
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <div className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 animate-pulse" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            placeholder="Ask me anything, or tell me what's on your mind..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            className="min-h-[60px] resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-[60px] w-[60px]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <PlanImplementationDialog
        plan={currentPlan}
        isOpen={showImplementDialog}
        onClose={() => {
          setShowImplementDialog(false);
          setCurrentPlan(null);
        }}
        onImplemented={() => {
          setShowImplementDialog(false);
          setCurrentPlan(null);
        }}
      />
    </div>
  );
};