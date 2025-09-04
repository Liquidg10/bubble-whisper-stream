import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  GitMerge, 
  Check, 
  X, 
  ArrowLeft, 
  ArrowRight,
  Shield,
  AlertTriangle,
  Clock,
  User
} from 'lucide-react';

interface ConflictData {
  id: string;
  localVersion: {
    content: string;
    timestamp: Date;
    device: string;
    tags: string[];
  };
  remoteVersion: {
    content: string;
    timestamp: Date;
    device: string;
    tags: string[];
  };
  autoResolveAttempted: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export const DevSyncDiff: React.FC = () => {
  const [currentConflict, setCurrentConflict] = useState(0);
  const [customResolution, setCustomResolution] = useState('');
  const [safeModeEnabled, setSafeModeEnabled] = useState(true);

  const conflicts: ConflictData[] = [
    {
      id: 'conflict-1',
      localVersion: {
        content: 'Pick up Pepper from school at 3:30 PM. Don\'t forget her backpack and water bottle.',
        timestamp: new Date(Date.now() - 300000), // 5 mins ago
        device: 'iPhone',
        tags: ['Family', 'Pepper', 'School']
      },
      remoteVersion: {
        content: 'Pick up Pepper from school at 3:30 PM. Remember to bring snacks for the car ride home.',
        timestamp: new Date(Date.now() - 180000), // 3 mins ago
        device: 'MacBook',
        tags: ['Family', 'Pepper', 'School', 'Snacks']
      },
      autoResolveAttempted: true,
      riskLevel: 'medium'
    },
    {
      id: 'conflict-2',
      localVersion: {
        content: 'Meeting with Sarah about project timeline - moved to Tuesday',
        timestamp: new Date(Date.now() - 600000), // 10 mins ago
        device: 'iPhone',
        tags: ['Work', 'Meeting']
      },
      remoteVersion: {
        content: 'Meeting with Sarah about project timeline - cancelled, will reschedule',
        timestamp: new Date(Date.now() - 240000), // 4 mins ago
        device: 'iPad',
        tags: ['Work', 'Meeting', 'Cancelled']
      },
      autoResolveAttempted: false,
      riskLevel: 'high'
    }
  ];

  const conflict = conflicts[currentConflict];

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTimeDiff = (timestamp: Date) => {
    const diff = Date.now() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minutes ago`;
  };

  const renderVersionCard = (version: any, type: 'local' | 'remote', isSelected?: boolean) => {
    const bgColor = type === 'local' ? 'bg-blue-50 dark:bg-blue-950/20' : 'bg-green-50 dark:bg-green-950/20';
    const borderColor = isSelected ? 'border-primary' : 'border-border';
    
    return (
      <Card className={`${bgColor} ${borderColor} border-2`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={`${type === 'local' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-green-100 dark:bg-green-900'} text-gray-900 dark:text-gray-100 font-medium`}>
              {type === 'local' ? 'Local' : 'Remote'} Version
            </Badge>
            <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
              <User className="h-3 w-3" />
              {version.device}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <Clock className="h-3 w-3" />
            {getTimeDiff(version.timestamp)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="p-3 bg-card rounded border border-border">
              <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{version.content}</p>
            </div>
            
            {version.tags.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tags:</div>
                <div className="flex flex-wrap gap-1">
                  {version.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDiffAnalysis = () => {
    const local = conflict.localVersion;
    const remote = conflict.remoteVersion;
    
    // Simple diff analysis
    const localWords = local.content.split(' ');
    const remoteWords = remote.content.split(' ');
    
    const onlyInLocal = localWords.filter(word => !remoteWords.includes(word));
    const onlyInRemote = remoteWords.filter(word => !localWords.includes(word));
    
    return (
      <Card className="bg-gray-50 dark:bg-gray-900/20">
        <CardHeader>
          <CardTitle className="text-sm text-gray-900 dark:text-gray-100 font-medium">Change Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {onlyInLocal.length > 0 && (
            <div>
              <div className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">Only in Local:</div>
              <div className="text-sm bg-blue-100 dark:bg-blue-900/30 p-2 rounded text-blue-900 dark:text-blue-100 font-medium">
                {onlyInLocal.join(' ')}
              </div>
            </div>
          )}
          
          {onlyInRemote.length > 0 && (
            <div>
              <div className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">Only in Remote:</div>
              <div className="text-sm bg-green-100 dark:bg-green-900/30 p-2 rounded text-green-900 dark:text-green-100 font-medium">
                {onlyInRemote.join(' ')}
              </div>
            </div>
          )}
          
          <div className="pt-2 border-t">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              AI Suggestion:
            </div>
            <div className="text-sm bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded text-yellow-900 dark:text-yellow-100 font-medium">
              Merge both versions: Keep the scheduling info from local and add the snack reminder from remote.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const handleResolution = (type: 'local' | 'remote' | 'custom' | 'ai') => {
    console.log(`Resolving conflict ${conflict.id} with ${type} version`);
    
    // Move to next conflict or finish
    if (currentConflict < conflicts.length - 1) {
      setCurrentConflict(currentConflict + 1);
      setCustomResolution('');
    } else {
      alert('All conflicts resolved!');
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Safe-Mode Sync - Conflict Resolution</h1>
        <div className="flex items-center gap-4">
          <Button
            variant={safeModeEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => setSafeModeEnabled(!safeModeEnabled)}
          >
            <Shield className="h-4 w-4 mr-2" />
            Safe Mode
          </Button>
          <Badge variant="outline">
            {currentConflict + 1} of {conflicts.length}
          </Badge>
        </div>
      </div>

      {/* Conflict Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GitMerge className="h-5 w-5" />
              <div>
                <h3 className="font-medium">Sync Conflict Detected</h3>
                <p className="text-sm text-muted-foreground">
                  Changes made on different devices need to be merged
                </p>
              </div>
            </div>
            <Badge className={getRiskColor(conflict.riskLevel)}>
              {conflict.riskLevel.toUpperCase()} RISK
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {conflict.autoResolveAttempted 
                ? "Auto-resolution was attempted but requires manual review due to significant differences."
                : "This conflict requires manual resolution due to high complexity."
              }
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Version Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderVersionCard(conflict.localVersion, 'local')}
        {renderVersionCard(conflict.remoteVersion, 'remote')}
      </div>

      {/* Diff Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {renderDiffAnalysis()}
        </div>
        
        {/* Custom Resolution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Custom Resolution</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={customResolution}
              onChange={(e) => setCustomResolution(e.target.value)}
              placeholder="Write your own merged version here..."
              className="mb-3"
              rows={6}
            />
            <Button 
              size="sm" 
              onClick={() => handleResolution('custom')}
              disabled={!customResolution.trim()}
              className="w-full"
            >
              Apply Custom Resolution
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Resolution Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Resolution Options</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant="outline"
              onClick={() => handleResolution('local')}
              className="bg-blue-50 hover:bg-blue-100 text-blue-900 dark:text-blue-100 font-medium"
            >
              <Check className="h-4 w-4 mr-2" />
              Keep Local
            </Button>
            
            <Button
              variant="outline"
              onClick={() => handleResolution('remote')}
              className="bg-green-50 hover:bg-green-100 text-green-900 dark:text-green-100 font-medium"
            >
              <Check className="h-4 w-4 mr-2" />
              Keep Remote
            </Button>
            
            <Button
              variant="outline"
              onClick={() => handleResolution('ai')}
              className="bg-yellow-50 hover:bg-yellow-100 text-yellow-900 dark:text-yellow-100 font-medium"
            >
              <GitMerge className="h-4 w-4 mr-2" />
              AI Merge
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                if (currentConflict > 0) {
                  setCurrentConflict(currentConflict - 1);
                }
              }}
              disabled={currentConflict === 0}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Progress: {currentConflict + 1} / {conflicts.length} conflicts resolved</span>
            <div className="flex items-center gap-4">
              <span>Safe Mode: {safeModeEnabled ? 'Enabled' : 'Disabled'}</span>
              <Button variant="ghost" size="sm">
                <X className="h-4 w-4 mr-2" />
                Skip All (Dangerous)
              </Button>
            </div>
          </div>
          
          <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentConflict + 1) / conflicts.length) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};