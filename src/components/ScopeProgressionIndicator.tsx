import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  Eye, 
  Edit, 
  Send,
  Calendar,
  Mail,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

interface ScopeProgressionIndicatorProps {
  service: 'calendar' | 'gmail';
  currentScopes: string[];
  targetScopes: string[];
}

const PROGRESSION_LEVELS = {
  calendar: [
    {
      level: 'none',
      title: 'No Access',
      icon: Shield,
      scopes: [],
      description: 'No calendar access',
      color: 'text-gray-400'
    },
    {
      level: 'read',
      title: 'Read Access',
      icon: Eye,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      description: 'View calendar events',
      color: 'text-blue-600'
    },
    {
      level: 'write',
      title: 'Full Access',
      icon: Edit,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'],
      description: 'Create and edit events',
      color: 'text-green-600'
    }
  ],
  gmail: [
    {
      level: 'none',
      title: 'No Access',
      icon: Shield,
      scopes: [],
      description: 'No email access',
      color: 'text-gray-400'
    },
    {
      level: 'minimal',
      title: 'Headers Only',
      icon: Eye,
      scopes: ['https://www.googleapis.com/auth/gmail.metadata'],
      description: 'View email headers and labels',
      color: 'text-blue-400'
    },
    {
      level: 'read',
      title: 'Read Access',
      icon: Eye,
      scopes: ['https://www.googleapis.com/auth/gmail.metadata', 'https://www.googleapis.com/auth/gmail.readonly'],
      description: 'Read email content',
      color: 'text-blue-600'
    },
    {
      level: 'compose',
      title: 'Compose Access',
      icon: Edit,
      scopes: ['https://www.googleapis.com/auth/gmail.metadata', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify'],
      description: 'Create drafts and manage labels',
      color: 'text-orange-600'
    },
    {
      level: 'send',
      title: 'Full Access',
      icon: Send,
      scopes: ['https://www.googleapis.com/auth/gmail.metadata', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'],
      description: 'Send emails on your behalf',
      color: 'text-green-600'
    }
  ]
};

export function ScopeProgressionIndicator({ service, currentScopes, targetScopes }: ScopeProgressionIndicatorProps) {
  const levels = PROGRESSION_LEVELS[service];
  const ServiceIcon = service === 'calendar' ? Calendar : Mail;
  
  // Determine current and target levels
  const getCurrentLevel = (scopes: string[]) => {
    for (let i = levels.length - 1; i >= 0; i--) {
      const level = levels[i];
      if (level.scopes.every(scope => scopes.includes(scope))) {
        return i;
      }
    }
    return 0;
  };
  
  const currentLevel = getCurrentLevel(currentScopes);
  const targetLevel = getCurrentLevel(targetScopes);
  
  // Calculate progression percentage
  const progressPercentage = Math.round((targetLevel / (levels.length - 1)) * 100);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ServiceIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-medium">Permission Progression</h3>
          <p className="text-sm text-muted-foreground">
            Your permission journey for {service === 'calendar' ? 'Calendar' : 'Gmail'}
          </p>
        </div>
      </div>
      
      {/* Progress Bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Current Progress</span>
            <Badge variant="outline">{progressPercentage}% Complete</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={progressPercentage} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Basic</span>
            <span>Advanced</span>
          </div>
        </CardContent>
      </Card>
      
      {/* Permission Levels */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Permission Levels</h4>
        <div className="space-y-2">
          {levels.map((level, index) => {
            const IconComponent = level.icon;
            const isCurrent = index === currentLevel;
            const isTarget = index === targetLevel;
            const isCompleted = index <= currentLevel;
            const willBeCompleted = index <= targetLevel;
            
            return (
              <div 
                key={level.level}
                className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                  isTarget ? 'border-primary bg-primary/5' :
                  isCurrent ? 'border-blue-200 bg-blue-50' :
                  willBeCompleted ? 'border-green-200 bg-green-50' :
                  'border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {willBeCompleted ? (
                    <CheckCircle className={`h-4 w-4 ${isTarget ? 'text-primary' : 'text-green-600'}`} />
                  ) : (
                    <IconComponent className={`h-4 w-4 ${level.color}`} />
                  )}
                  {isTarget && (
                    <ArrowRight className="h-4 w-4 text-primary" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isTarget ? 'text-primary' : ''}`}>
                      {level.title}
                    </span>
                    {isCurrent && (
                      <Badge variant="outline" className="text-xs">
                        Current
                      </Badge>
                    )}
                    {isTarget && (
                      <Badge variant="default" className="text-xs">
                        Target
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {level.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <p className="text-sm">
              <strong>Current:</strong> {levels[currentLevel].title}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>After upgrade:</strong> {levels[targetLevel].title}
            </p>
            {targetLevel > currentLevel && (
              <p className="text-xs text-primary">
                ↑ Moving up {targetLevel - currentLevel} level{targetLevel - currentLevel !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}