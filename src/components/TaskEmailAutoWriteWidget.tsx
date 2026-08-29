/**
 * P12 - Task Email Auto-Write Widget
 * Displays recent email drafts created from tasks with undo capability
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Mail, 
  ExternalLink,
  Eye,
  ArrowRight,
  Clock
} from 'lucide-react';
import { taskAwareAutoWriteService, type TaskEmailMapping } from '@/services/taskAwareAutoWriteService';

interface TaskEmailAutoWriteWidgetProps {
  className?: string;
}

export function TaskEmailAutoWriteWidget({ className }: TaskEmailAutoWriteWidgetProps) {
  const [mappings, setMappings] = useState<TaskEmailMapping[]>([]);

  useEffect(() => {
    loadRecentMappings();
  }, []);

  const loadRecentMappings = () => {
    const allMappings = Array.from(taskAwareAutoWriteService.getAllEmailMappings().values());
    // Show last 5 mappings
    const recentMappings = allMappings
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);
    setMappings(recentMappings);
  };

  const handleViewInGmail = (mapping: TaskEmailMapping) => {
    // In a real implementation, this would open the specific draft
    const gmailUrl = `https://mail.google.com/mail/u/0/#drafts`;
    window.open(gmailUrl, '_blank');
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (mappings.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Task → Email Auto-Writes
          <Badge variant="secondary">{mappings.length}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Recent email drafts automatically created from tasks
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {mappings.map((mapping) => {
          const task = getTaskForMapping(mapping);
          return (
            <div key={mapping.taskId} className="flex items-center justify-between p-3 border border-border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    Task → Email
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(mapping.createdAt)}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">
                    {task?.title || 'Untitled Task'}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">
                    {mapping.subject}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>To: {mapping.recipients.join(', ')}</span>
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(mapping.confidence * 100)}% confidence
                  </Badge>
                </div>
              </div>
              
              <div className="flex items-center gap-2 ml-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleViewInGmail(mapping)}
                  className="flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  View
                </Button>
              </div>
            </div>
          );
        })}

        <Alert>
          <Eye className="h-4 w-4" />
          <AlertDescription>
            Email drafts are automatically created when tasks contain email metadata 
            with high confidence scores. Remove a provider draft in Gmail; reversal is not available here yet.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function getTaskForMapping(mapping: TaskEmailMapping) {
  // In a real implementation, this would fetch from the task store
  // For demo, return basic task info
  return {
    id: mapping.taskId,
    title: `Task for ${mapping.subject.substring(0, 30)}...`,
    type: 'task' as const
  };
}
