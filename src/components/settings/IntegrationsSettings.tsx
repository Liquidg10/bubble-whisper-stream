import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar,
  Mail,
  DollarSign,
  Puzzle,
  Brain
} from 'lucide-react';
import { OptionalModules } from '@/components/OptionalModules';
import { CalendarIntegrationPlugin } from '@/plugins/CalendarIntegrationPlugin';
import { EmailIntegrationPlugin } from '@/plugins/EmailIntegrationPlugin';
import { BankingIntegrationPlugin } from '@/plugins/BankingIntegrationPlugin';
import { BudgetEnvelopeManager } from '@/components/BudgetEnvelopeManager';
import { BudgetPaceAlerts } from '@/components/BudgetPaceAlerts';
import { MonthlyReviewCard } from '@/components/MonthlyReviewCard';
import { isFeatureEnabled } from '@/config/flags';

export const IntegrationsSettings: React.FC = () => {
  const [showMonthlyReview, setShowMonthlyReview] = useState(false);

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
            Connect your calendars for automatic event bubbles
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
            Smart email filtering and task creation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailIntegrationPlugin />
        </CardContent>
      </Card>

      {/* Budget Management */}
      {isFeatureEnabled('budget') && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Budget & Finance
              </CardTitle>
              <CardDescription>
                Track spending and manage financial goals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BankingIntegrationPlugin />
            </CardContent>
          </Card>

          <BudgetPaceAlerts />
          <BudgetEnvelopeManager />
        </>
      )}

      {/* Monthly Review */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Monthly Review
          </CardTitle>
          <CardDescription>
            Review your patterns and growth over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => setShowMonthlyReview(true)}
            className="w-full"
          >
            <Brain className="h-4 w-4 mr-2" />
            Review This Month
          </Button>
        </CardContent>
      </Card>

      {/* Optional Modules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Optional Modules
          </CardTitle>
          <CardDescription>
            Enable additional features and capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OptionalModules />
        </CardContent>
      </Card>

      {/* Monthly Review Modal */}
      {showMonthlyReview && (
        <MonthlyReviewCard onClose={() => setShowMonthlyReview(false)} />
      )}
    </div>
  );
};