import React, { useState } from 'react';
import { InboxItem } from '@/types/inbox';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Mail, MessageSquare, Calendar, AlertCircle, CheckCircle2, X, Edit3 } from 'lucide-react';
import { format } from 'date-fns';

interface InboxItemCardProps {
  item: InboxItem;
  onCommit: (
    item: InboxItem, 
    finalType: string, 
    finalHorizon?: string, 
    finalTags?: string[]
  ) => void;
  onDiscard: (itemId: string) => void;
}

export function InboxItemCard({ item, onCommit, onDiscard }: InboxItemCardProps) {
  const [isEditing, setIsEditing] = useState(!item.confidence || item.confidence < 0.6);
  const [selectedType, setSelectedType] = useState(item.suggestedType);
  const [selectedHorizon, setSelectedHorizon] = useState(item.suggestedHorizon);
  const [customTags, setCustomTags] = useState(item.suggestedTags.join(', '));

  const sourceIcon = item.source === 'email' ? Mail : MessageSquare;
  const SourceIcon = sourceIcon;

  const confidenceColor = item.confidence >= 0.8 ? 'bg-success/10 text-success' : 
                         item.confidence >= 0.6 ? 'bg-warning/10 text-warning' : 
                         'bg-destructive/10 text-destructive';

  const handleCommit = () => {
    const finalTags = customTags.split(',').map(tag => tag.trim()).filter(Boolean);
    onCommit(item, selectedType, selectedHorizon, finalTags);
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <SourceIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{item.sender}</span>
            <Badge variant="secondary" className="text-xs">
              {format(item.receivedAt, 'MMM d, HH:mm')}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${confidenceColor}`}>
              {item.confidence >= 0.8 ? (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              ) : item.confidence >= 0.6 ? (
                <AlertCircle className="h-3 w-3 mr-1" />
              ) : (
                <AlertCircle className="h-3 w-3 mr-1" />
              )}
              {Math.round(item.confidence * 100)}%
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              className="h-8 w-8 p-0"
            >
              <Edit3 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {item.subject && (
          <h3 className="text-sm font-semibold text-foreground">{item.subject}</h3>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-3">
          {item.snippet}
        </p>

        {isEditing ? (
          <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Type
                </label>
                <Select value={selectedType} onValueChange={(value: any) => setSelectedType(value)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Thought">Thought</SelectItem>
                    <SelectItem value="Task">Task</SelectItem>
                    <SelectItem value="ReminderNote">Reminder</SelectItem>
                    <SelectItem value="Memory">Memory</SelectItem>
                    <SelectItem value="Joy">Joy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Horizon
                </label>
                <Select value={selectedHorizon || 'none'} onValueChange={(value) => 
                  setSelectedHorizon(value === 'none' ? undefined : value as any)
                }>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No horizon</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="thisWeek">This Week</SelectItem>
                    <SelectItem value="thisMonth">This Month</SelectItem>
                    <SelectItem value="someday">Someday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Tags (comma-separated)
              </label>
              <Input
                value={customTags}
                onChange={(e) => setCustomTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
                className="h-8 text-xs"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs">
              {selectedType}
            </Badge>
            {selectedHorizon && (
              <Badge variant="outline" className="text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                {selectedHorizon}
              </Badge>
            )}
            {customTags.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleCommit}
            size="sm"
            className="flex-1"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Add to Bubbles
          </Button>
          <Button
            onClick={() => onDiscard(item.id)}
            variant="outline"
            size="sm"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}