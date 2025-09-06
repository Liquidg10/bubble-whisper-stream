import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, 
  Receipt, 
  TrendingUp,
  PiggyBank
} from 'lucide-react';
import { BankingIntegrationPlugin } from '@/plugins/BankingIntegrationPlugin';
import { BudgetPaceAlerts } from '@/components/BudgetPaceAlerts';
import { BudgetEnvelopeManager } from '@/components/BudgetEnvelopeManager';


export function FinanceBudgetTools() {
  return (
    <div className="space-y-6">
      {/* Banking & Finance Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Banking & Finance Integration
            <Badge variant="secondary">Secure</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BankingIntegrationPlugin />
        </CardContent>
      </Card>

      {/* Budget Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-blue-600" />
            Budget Management
            <Badge variant="outline">Smart Tracking</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <BudgetPaceAlerts />
          <BudgetEnvelopeManager />
        </CardContent>
      </Card>

      {/* Receipt Scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-purple-600" />
            Receipt Scanner
            <Badge variant="secondary">AI-Powered</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Receipt scanning is available for individual bubble items in the canvas view</p>
        </CardContent>
      </Card>

      {/* Financial Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-orange-600" />
            Financial Insights
            <Badge variant="outline">Coming Soon</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Personalized financial insights and spending pattern analysis coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}