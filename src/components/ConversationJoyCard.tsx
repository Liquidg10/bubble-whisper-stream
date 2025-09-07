import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Heart, Clock, Sparkles } from 'lucide-react';
import { JoyfulConversation } from '@/services/conversationJoyService';

interface ConversationJoyCardProps {
  conversation: JoyfulConversation;
}

export const ConversationJoyCard: React.FC<ConversationJoyCardProps> = ({ conversation }) => {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const { date, time } = formatTimestamp(conversation.timestamp);
  
  const getJoyScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-orange-600 bg-orange-50 border-orange-200';
  };

  const truncateText = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  return (
    <Card className="hover:shadow-md transition-shadow duration-200" role="article">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Conversation Joy</CardTitle>
          </div>
          <Badge 
            variant="outline" 
            className={`text-xs ${getJoyScoreColor(conversation.joyScore)}`}
          >
            <Heart className="h-3 w-3 mr-1" />
            {(conversation.joyScore * 100).toFixed(0)}%
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{date} at {time}</span>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* User Message */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">You said:</div>
          <div className="text-sm text-foreground bg-muted/50 rounded-lg p-2">
            {truncateText(conversation.userMessage)}
          </div>
        </div>

        {/* AI Response */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">AI responded:</div>
          <div className="text-sm text-foreground bg-primary/5 rounded-lg p-2">
            {truncateText(conversation.aiResponse)}
          </div>
        </div>

        {/* Joy Indicators */}
        {conversation.joyIndicators.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Joy indicators:
            </div>
            <div className="flex flex-wrap gap-1">
              {conversation.joyIndicators.slice(0, 6).map((indicator, index) => (
                <Badge key={index} variant="secondary" className="text-xs px-2 py-0.5">
                  {indicator}
                </Badge>
              ))}
              {conversation.joyIndicators.length > 6 && (
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                  +{conversation.joyIndicators.length - 6} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};