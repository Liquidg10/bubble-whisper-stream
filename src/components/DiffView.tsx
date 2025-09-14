/**
 * Diff View Component - Phase 3 End-User Polish
 * Visual diff component for comparing text changes
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitCompare, Plus, Minus, Equal } from 'lucide-react';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber?: number;
}

interface DiffViewProps {
  original: string;
  modified: string;
  title?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export function DiffView({ 
  original, 
  modified, 
  title = "Changes", 
  showLineNumbers = false,
  className 
}: DiffViewProps) {
  const generateDiff = (originalText: string, modifiedText: string): DiffLine[] => {
    const originalLines = originalText.split('\n');
    const modifiedLines = modifiedText.split('\n');
    const diff: DiffLine[] = [];

    // Simple line-by-line diff algorithm
    let originalIndex = 0;
    let modifiedIndex = 0;

    while (originalIndex < originalLines.length || modifiedIndex < modifiedLines.length) {
      const originalLine = originalLines[originalIndex];
      const modifiedLine = modifiedLines[modifiedIndex];

      if (originalIndex >= originalLines.length) {
        // Only modified lines remaining
        diff.push({
          type: 'added',
          content: modifiedLine,
          lineNumber: modifiedIndex + 1
        });
        modifiedIndex++;
      } else if (modifiedIndex >= modifiedLines.length) {
        // Only original lines remaining
        diff.push({
          type: 'removed',
          content: originalLine,
          lineNumber: originalIndex + 1
        });
        originalIndex++;
      } else if (originalLine === modifiedLine) {
        // Lines are the same
        diff.push({
          type: 'unchanged',
          content: originalLine,
          lineNumber: originalIndex + 1
        });
        originalIndex++;
        modifiedIndex++;
      } else {
        // Lines are different - look ahead to see if it's an addition, deletion, or modification
        const nextOriginalMatch = modifiedLines.slice(modifiedIndex).findIndex(line => line === originalLine);
        const nextModifiedMatch = originalLines.slice(originalIndex).findIndex(line => line === modifiedLine);

        if (nextOriginalMatch !== -1 && (nextModifiedMatch === -1 || nextOriginalMatch < nextModifiedMatch)) {
          // This looks like an addition
          diff.push({
            type: 'added',
            content: modifiedLine,
            lineNumber: modifiedIndex + 1
          });
          modifiedIndex++;
        } else if (nextModifiedMatch !== -1) {
          // This looks like a deletion
          diff.push({
            type: 'removed',
            content: originalLine,
            lineNumber: originalIndex + 1
          });
          originalIndex++;
        } else {
          // This is a modification - show both
          diff.push({
            type: 'removed',
            content: originalLine,
            lineNumber: originalIndex + 1
          });
          diff.push({
            type: 'added',
            content: modifiedLine,
            lineNumber: modifiedIndex + 1
          });
          originalIndex++;
          modifiedIndex++;
        }
      }
    }

    return diff;
  };

  const diffLines = generateDiff(original, modified);
  
  const stats = {
    added: diffLines.filter(line => line.type === 'added').length,
    removed: diffLines.filter(line => line.type === 'removed').length,
    unchanged: diffLines.filter(line => line.type === 'unchanged').length
  };

  const getLineIcon = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return <Plus className="h-3 w-3 text-green-600" />;
      case 'removed':
        return <Minus className="h-3 w-3 text-red-600" />;
      case 'unchanged':
        return <Equal className="h-3 w-3 text-gray-400" />;
    }
  };

  const getLineClassName = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return 'bg-green-50 dark:bg-green-950/20 border-l-4 border-green-500';
      case 'removed':
        return 'bg-red-50 dark:bg-red-950/20 border-l-4 border-red-500';
      case 'unchanged':
        return 'bg-gray-50/50 dark:bg-gray-950/20';
    }
  };

  const getTextClassName = (type: DiffLine['type']) => {
    switch (type) {
      case 'added':
        return 'text-green-800 dark:text-green-200';
      case 'removed':
        return 'text-red-800 dark:text-red-200 line-through';
      case 'unchanged':
        return 'text-muted-foreground';
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            {title}
          </div>
          <div className="flex items-center gap-2">
            {stats.added > 0 && (
              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                +{stats.added}
              </Badge>
            )}
            {stats.removed > 0 && (
              <Badge variant="default" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                -{stats.removed}
              </Badge>
            )}
            {stats.unchanged > 0 && (
              <Badge variant="outline" className="text-xs">
                {stats.unchanged} unchanged
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          {diffLines.map((line, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-2 ${getLineClassName(line.type)}`}
            >
              <div className="flex items-center gap-2 flex-shrink-0">
                {getLineIcon(line.type)}
                {showLineNumbers && (
                  <span className="text-xs text-muted-foreground font-mono w-8 text-right">
                    {line.lineNumber}
                  </span>
                )}
              </div>
              <div className={`flex-1 font-mono text-sm ${getTextClassName(line.type)}`}>
                {line.content || <span className="text-muted-foreground italic">(empty line)</span>}
              </div>
            </div>
          ))}
          
          {diffLines.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">
              No differences found
            </div>
          )}
        </div>
        
        {/* Summary */}
        {(stats.added > 0 || stats.removed > 0) && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <div className="text-sm">
              <strong>Summary:</strong>{' '}
              {stats.added > 0 && `${stats.added} lines added`}
              {stats.added > 0 && stats.removed > 0 && ', '}
              {stats.removed > 0 && `${stats.removed} lines removed`}
              {stats.unchanged > 0 && `, ${stats.unchanged} lines unchanged`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}