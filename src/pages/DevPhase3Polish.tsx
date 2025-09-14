/**
 * Dev Phase 3 Polish Page
 * Showcase of End-User Polish components
 */

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UnifiedDraftsFeed } from '@/components/UnifiedDraftsFeed';
import { PersonalEisenhower } from '@/components/PersonalEisenhower';
import { SplitViewComposer } from '@/components/SplitViewComposer';
import { DiffView } from '@/components/DiffView';
import { Sparkles, FileText, Target, Layout, GitCompare } from 'lucide-react';

export function DevPhase3Polish() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-6 w-6" />
            Phase 3: End-User Polish
            <Badge variant="default">Complete</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Unified drafts feed, visual diff, personal Eisenhower matrix, and split view composition framework.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="drafts" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="drafts" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Drafts Feed
          </TabsTrigger>
          <TabsTrigger value="eisenhower" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Eisenhower
          </TabsTrigger>
          <TabsTrigger value="split-view" className="flex items-center gap-2">
            <Layout className="h-4 w-4" />
            Split Views
          </TabsTrigger>
          <TabsTrigger value="diff" className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            Diff View
          </TabsTrigger>
        </TabsList>

        {/* Unified Drafts Feed */}
        <TabsContent value="drafts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Unified Drafts Feed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Consolidates email/calendar drafts with visual diff and one-tap undo.
              </p>
              <UnifiedDraftsFeed />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personal Eisenhower Matrix */}
        <TabsContent value="eisenhower" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personal Eisenhower Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Persistent urgency/importance definitions with customizable criteria.
              </p>
              <PersonalEisenhower />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Split View Composer */}
        <TabsContent value="split-view" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Split View Composer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Side-by-side view composition with real-time invariants and conflict detection.
              </p>
              <SplitViewComposer />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Diff View Demo */}
        <TabsContent value="diff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Visual Diff View</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Visual comparison of text changes with line-by-line highlighting.
              </p>
              <div className="space-y-4">
                <DiffView
                  original={`Hi John,

Following up on our proposal discussion.

Thanks`}
                  modified={`Hi John,

I wanted to follow up on the project proposal we discussed last week. Do you have any feedback or questions?

Best regards,
Your Name`}
                  title="Email Content Changes"
                  showLineNumbers={true}
                />
                
                <DiffView
                  original={`Team standup
Location: Room A
Agenda: Progress updates`}
                  modified={`Daily team standup meeting
Location: Conference Room A
Agenda: Sprint progress, blockers, next steps
Duration: 30 minutes`}
                  title="Calendar Event Changes"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}