import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle, Circle } from 'lucide-react';

interface ScopeLevel {
  name: string;
  description: string;
  scopes: string[];
  unlocks: string[];
}

interface ScopeProgressionIndicatorProps {
  service: 'calendar' | 'gmail';
  currentScopes: string[];
  targetScopes: string[];
}

const SCOPE_LEVELS = {
  calendar: [
    {
      name: 'No Access',
      description: 'Not connected',
      scopes: [],
      unlocks: []
    },
    {
      name: 'Read-Only',
      description: 'View calendar events',
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      unlocks: ['View events', 'Create reminders', 'Check availability']
    },
    {
      name: 'Event Creation',
      description: 'Create and edit events',
      scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'],
      unlocks: ['Create events', 'Edit events', 'Task-to-event conversion']
    }
  ],
  gmail: [
    {
      name: 'No Access',
      description: 'Not connected',
      scopes: [],
      unlocks: []
    },
    {
      name: 'Headers Only',
      description: 'Email metadata only',
      scopes: ['https://www.googleapis.com/auth/gmail.metadata'],
      unlocks: ['Email organization', 'Label management', 'Filter emails']
    },
    {
      name: 'Read Access',
      description: 'Read email content',
      scopes: ['https://www.googleapis.com/auth/gmail.metadata', 'https://www.googleapis.com/auth/gmail.readonly'],
      unlocks: ['Email search', 'Content analysis', 'Create tasks from emails']
    },
    {
      name: 'Draft Access',
      description: 'Create and edit drafts',
      scopes: ['https://www.googleapis.com/auth/gmail.metadata', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify'],
      unlocks: ['Create drafts', 'Edit drafts', 'Save email templates']
    },
    {
      name: 'Send Access',
      description: 'Send emails',
      scopes: ['https://www.googleapis.com/auth/gmail.metadata', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'],
      unlocks: ['Send emails', 'Automated responses', 'Email scheduling']
    }
  ]
} as const;

export function ScopeProgressionIndicator({ service, currentScopes, targetScopes }: ScopeProgressionIndicatorProps) {
  const levels = SCOPE_LEVELS[service];
  
  const getCurrentLevel = (scopes: string[]) => {
    return levels.reduce((current, level, index) => {
      const hasAllScopes = level.scopes.every(scope => scopes.includes(scope));
      return hasAllScopes ? index : current;
    }, 0);
  };
  
  const currentLevel = getCurrentLevel(currentScopes);
  const targetLevel = getCurrentLevel(targetScopes);
  
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">Permission Progression:</div>
      
      {/* Visual progression ladder */}
      <div className="space-y-2">
        {levels.map((level, index) => {
          const isCurrent = index === currentLevel;
          const isTarget = index === targetLevel;
          const isCompleted = index < currentLevel;
          const isUpgrading = index > currentLevel && index <= targetLevel;
          
          let status: 'completed' | 'current' | 'target' | 'upgrading' | 'future';
          if (isCompleted) status = 'completed';
          else if (isCurrent) status = 'current';
          else if (isTarget) status = 'target';
          else if (isUpgrading) status = 'upgrading';
          else status = 'future';
          
          const statusStyles = {
            completed: 'bg-green-50 border-green-200 text-green-800',
            current: 'bg-blue-50 border-blue-200 text-blue-800',
            target: 'bg-orange-50 border-orange-200 text-orange-800',
            upgrading: 'bg-yellow-50 border-yellow-200 text-yellow-800',
            future: 'bg-gray-50 border-gray-200 text-gray-600'
          };
          
          return (
            <div key={index} className="relative">
              {/* Connection line */}
              {index < levels.length - 1 && (
                <div className="absolute left-4 top-8 w-0.5 h-6 bg-border" />
              )}
              
              <div className={`flex items-start gap-3 p-3 border rounded-lg ${statusStyles[status]}`}>
                <div className="mt-0.5">
                  {status === 'completed' ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Circle className={`h-4 w-4 ${status === 'current' || status === 'target' ? 'fill-current' : ''}`} />
                  )}
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{level.name}</span>
                    {status === 'current' && (
                      <Badge variant="secondary" className="text-xs">Current</Badge>
                    )}
                    {status === 'target' && (
                      <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">Upgrading to</Badge>
                    )}
                  </div>
                  
                  <p className="text-xs opacity-80">{level.description}</p>
                  
                  {level.unlocks.length > 0 && (
                    <div className="text-xs opacity-70">
                      <strong>Unlocks:</strong> {level.unlocks.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Summary */}
      {targetLevel > currentLevel && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <ArrowRight className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-800">
            Upgrading from <strong>{levels[currentLevel].name}</strong> to <strong>{levels[targetLevel].name}</strong>
          </span>
        </div>
      )}
    </div>
  );
}