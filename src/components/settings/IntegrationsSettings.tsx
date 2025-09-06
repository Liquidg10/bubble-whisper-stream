import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar,
  Mail,
  ExternalLink
} from 'lucide-react';
import { CalendarIntegrationPlugin } from '@/plugins/CalendarIntegrationPlugin';
import { EmailIntegrationPlugin } from '@/plugins/EmailIntegrationPlugin';

export function IntegrationsSettings() {
  return (
    <div className="space-y-6">
      {/* Calendar Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendar Integration
          </CardTitle>
          <CardDescription>
            Connect your calendar to sync events and reminders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CalendarIntegrationPlugin />
        </CardContent>
      </Card>

      {/* Email Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Integration
          </CardTitle>
          <CardDescription>
            Connect your email to capture important messages and tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailIntegrationPlugin />
        </CardContent>
      </Card>

      {/* Life Tools Notice */}
      <Alert>
        <ExternalLink className="h-4 w-4" />
        <AlertDescription>
          <strong>Looking for life management tools?</strong> Banking, Grocery Helper, Document Scanner, and Monthly Review have moved to the <strong>Tools</strong> section in the bottom navigation for easier access.
        </AlertDescription>
      </Alert>
    </div>
  );
}