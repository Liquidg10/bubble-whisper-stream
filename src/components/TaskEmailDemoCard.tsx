/**
 * P12 - Task Email Demo Card
 * Allows testing task email auto-write functionality
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Mail, Send, FileText } from 'lucide-react';
import { taskAwareAutoWriteService } from '@/services/taskAwareAutoWriteService';
import { taskEmailAdapter } from '@/adapters/taskEmailAdapter';
import { createTask } from '@/types/task';
import { toast } from '@/hooks/use-toast';

export function TaskEmailDemoCard() {
  const [taskTitle, setTaskTitle] = useState('');
  const [recipients, setRecipients] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);

  const handleCreateTaskWithEmail = async () => {
    if (!taskTitle.trim() || !recipients.trim()) {
      toast({
        title: "Missing Fields",
        description: "Please provide task title and recipients.",
        variant: "destructive"
      });
      return;
    }

    setIsEvaluating(true);
    try {
      const recipientList = recipients.split(',').map(email => email.trim()).filter(Boolean);
      
      const task = createTask(taskTitle, 'task', {
        description: description || undefined,
        priority: 70,
        view: {
          email: {
            to: recipientList,
            subject: subject || taskTitle,
            accountId: 'demo-account'
          }
        }
      });

      // Add to task store and trigger auto-write evaluation
      await taskAwareAutoWriteService.evaluateTask({ ...task, id: `task_${Date.now()}` });

      toast({
        title: "Task Created & Email Auto-Write Triggered",
        description: `Task "${taskTitle}" created with email context`,
      });

      // Clear form
      setTaskTitle('');
      setRecipients('');
      setSubject('');
      setDescription('');
    } catch (error) {
      console.error('Failed to create task with email:', error);
      toast({
        title: "Error",
        description: "Failed to create task with email context",
        variant: "destructive"
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleTestEmailConditions = () => {
    if (!taskTitle.trim() || !recipients.trim()) {
      toast({
        title: "Missing Fields",
        description: "Please provide task title and recipients to test conditions.",
        variant: "destructive"
      });
      return;
    }

    const recipientList = recipients.split(',').map(email => email.trim()).filter(Boolean);
    
    const testTask = createTask(taskTitle, 'task', {
      description: description || undefined,
      view: {
        email: {
          to: recipientList,
          subject: subject || taskTitle
        }
      }
    });

    const result = taskEmailAdapter.validateGreenConditions({ ...testTask, id: 'test' });
    
    const status = result.isValid ? "✅ Valid" : "❌ Invalid";
    const confidencePercent = Math.round(result.confidence * 100);
    
    toast({
      title: `Email Conditions Test: ${status}`,
      description: result.isValid 
        ? `${confidencePercent}% confidence - Would auto-write`
        : `${confidencePercent}% confidence - Violations: ${result.violations.join(', ')}`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Create Task with Email
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Test email auto-write functionality by creating tasks with email metadata
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Task Title</Label>
            <Input
              id="task-title"
              placeholder="Follow up on project proposal"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="recipients">Recipients (comma-separated)</Label>
            <Input
              id="recipients"
              placeholder="john@example.com, sarah@company.com"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="subject">Email Subject (optional)</Label>
          <Input
            id="subject"
            placeholder="Leave empty to use task title as subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="description">Task Description</Label>
          <Textarea
            id="description"
            placeholder="Detailed description that will become email body..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={handleCreateTaskWithEmail} 
            disabled={isEvaluating}
            className="flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            {isEvaluating ? 'Creating...' : 'Create & Auto-Write'}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={handleTestEmailConditions}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Test Conditions
          </Button>
        </div>
        
        <div className="pt-2 border-t border-border">
          <h4 className="text-sm font-medium mb-2">Email Green Conditions:</h4>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-xs">Valid recipients (25%)</Badge>
            <Badge variant="secondary" className="text-xs">Clear subject (25%)</Badge>
            <Badge variant="secondary" className="text-xs">Sufficient content (20%)</Badge>
            <Badge variant="secondary" className="text-xs">External emails (+10%)</Badge>
            <Badge variant="secondary" className="text-xs">High priority (+10%)</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}