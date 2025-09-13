import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Calendar, Mail, Undo2 } from 'lucide-react';

export default function DevAutoWrite() {
  const [undoStack, setUndoStack] = useState([
    { id: '1', action: 'Calendar event created', timestamp: Date.now() - 300000 },
    { id: '2', action: 'Email draft saved', timestamp: Date.now() - 180000 }
  ]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Auto-Write System</h1>
          <p className="text-muted-foreground">
            Confidence gates, decision traces, and undo functionality
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Confidence Gates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div data-testid="confidence-gate" className="space-y-3">
                <div className="flex justify-between items-center">
                  <span>Gate Status:</span>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div>📊 Suggest: &lt;60% confidence</div>
                  <div>📝 Draft: 60-85% confidence</div>
                  <div>✅ Auto-write: &gt;85% + green conditions</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Undo2 className="h-5 w-5" />
                Undo Stack
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div data-testid="undo-stack" className="space-y-2">
                {undoStack.map(item => (
                  <div key={item.id} className="flex justify-between items-center text-sm">
                    <span>{item.action}</span>
                    <Button variant="ghost" size="sm">
                      Undo
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Integration Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">Calendar Integration</span>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div>✅ Green conditions enforced</div>
                  <div>✅ Self-owned calendars only</div>
                  <div>✅ 14-day horizon limit</div>
                  <div>✅ Idempotent event creation</div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span className="font-medium">Email Integration</span>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div>✅ Draft-only mode</div>
                  <div>✅ Never auto-send</div>
                  <div>✅ Review & Send required</div>
                  <div>✅ Decision traces attached</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}