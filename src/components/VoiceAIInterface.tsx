import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mic, MessageCircle, Brain, Heart, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { EnhancedAIChat } from './EnhancedAIChat';
import { useBubbleStore } from '@/stores/bubbleStore';

interface VoiceAIInterfaceProps {
  className?: string;
}

export const VoiceAIInterface: React.FC<VoiceAIInterfaceProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [quickMode, setQuickMode] = useState<'supportive' | 'encouraging' | 'reflective' | 'problem-solving'>('supportive');
  const { bubbles } = useBubbleStore();

  // Get context from current bubbles and user state
  const getUserContext = () => {
    const recentBubbles = bubbles.slice(-5).map(b => ({
      type: b.type,
      content: b.content.substring(0, 100),
      mood: b.mood,
      timestamp: b.createdAt
    }));

    return {
      recentBubbles,
      totalBubbles: bubbles.length,
      timeOfDay: new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'
    };
  };

  const quickActions = [
    {
      mode: 'supportive' as const,
      icon: Heart,
      label: 'Check-in',
      description: 'How are you feeling?',
      color: 'text-pink-500'
    },
    {
      mode: 'encouraging' as const,
      icon: Lightbulb,
      label: 'Advice',
      description: 'Need guidance?',
      color: 'text-yellow-500'
    },
    {
      mode: 'reflective' as const,
      icon: Brain,
      label: 'Reflect',
      description: 'Process thoughts',
      color: 'text-purple-500'
    },
    {
      mode: 'problem-solving' as const,
      icon: MessageCircle,
      label: 'Plan',
      description: 'Work through tasks',
      color: 'text-blue-500'
    }
  ];

  return (
    <div className={`w-fit ${className}`}>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <motion.div
            className="w-fit"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              variant="default"
              size="lg"
              className="relative overflow-hidden bg-gradient-primary hover:bg-gradient-primary/90"
            >
              <Mic className="w-5 h-5 mr-2" />
              Talk to AI
              <motion.div
                className="absolute inset-0 bg-white/20"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              />
            </Button>
          </motion.div>
        </DialogTrigger>
        
        <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] flex flex-col p-0">
          <div className="flex flex-col h-full">
            {/* Quick Actions Header */}
            <div className="p-3 border-b border-border">
              <h2 className="text-lg font-semibold mb-3 text-foreground">
                AI Companion
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {quickActions.map((action) => (
                  <Button
                    key={action.mode}
                    variant={quickMode === action.mode ? "default" : "outline"}
                    size="sm"
                    onClick={() => setQuickMode(action.mode)}
                    className="flex flex-col items-center p-3 h-auto"
                  >
                    <action.icon className={`w-4 h-4 mb-1 ${action.color}`} />
                    <span className="text-sm font-medium">{action.label}</span>
                    <span className="text-xs opacity-70">{action.description}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Chat Interface */}
            <div className="flex-1 min-h-0">
              <EnhancedAIChat
                className="h-full"
                initialMode={quickMode}
                context={getUserContext()}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Quick Access */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1 mt-2">
        {quickActions.map((action) => (
          <motion.div
            key={action.mode}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
          >
            <Card 
              className="p-2 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => {
                setQuickMode(action.mode);
                setIsOpen(true);
              }}
            >
              <div className="flex items-center gap-2">
                <action.icon className={`w-3 h-3 ${action.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {action.label}
                  </p>
                  <p className="text-xs text-muted-foreground truncate opacity-60">
                    {action.description}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};