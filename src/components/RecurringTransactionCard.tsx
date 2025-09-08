import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Calendar,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { RecurringTransaction, RecurringInsight } from '@/services/recurringTransactionService';

interface RecurringTransactionCardProps {
  recurring: RecurringTransaction;
  insight?: RecurringInsight;
  onCreateReminder?: (recurringId: string) => void;
  onMarkCorrect?: (recurringId: string, isCorrect: boolean) => void;
}

export function RecurringTransactionCard({ 
  recurring, 
  insight,
  onCreateReminder,
  onMarkCorrect
}: RecurringTransactionCardProps) {
  const getFrequencyText = (days: number): string => {
    if (days <= 7) return 'Weekly';
    if (days <= 16) return 'Bi-weekly';
    if (days <= 35) return 'Monthly';
    if (days <= 95) return 'Quarterly';
    return 'Yearly';
  };

  const getStatusColor = (): 'default' | 'destructive' | 'secondary' | 'outline' => {
    if (!insight) return 'default';
    if (insight.daysAway < 0) return 'destructive';
    if (insight.daysAway <= 3) return 'secondary';
    return 'default';
  };

  const getStatusIcon = () => {
    if (!insight) return <Clock className="h-4 w-4" />;
    if (insight.daysAway < 0) return <XCircle className="h-4 w-4 text-destructive" />;
    if (insight.daysAway <= 3) return <AlertTriangle className="h-4 w-4 text-warning" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const confidencePercentage = Math.round(recurring.confidence_score * 100);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            {recurring.normalized_merchant}
          </CardTitle>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge variant={getStatusColor()}>
              {getFrequencyText(recurring.frequency_days)}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Amount and Confidence */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Average Amount</p>
            <p className="text-xl font-bold text-foreground">
              {formatCurrency(recurring.amount_average)}
            </p>
            {recurring.amount_variance > 0 && (
              <p className="text-xs text-muted-foreground">
                ±{formatCurrency(Math.sqrt(recurring.amount_variance))} variance
              </p>
            )}
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Confidence</p>
            <div className="space-y-2">
              <Progress value={confidencePercentage} className="h-2" />
              <p className="text-sm font-medium">{confidencePercentage}%</p>
            </div>
          </div>
        </div>

        {/* Timing Information */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Last payment:</span>
            <span className="font-medium">
              {new Date(recurring.last_transaction_date).toLocaleDateString()}
            </span>
          </div>
          
          {insight && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Next expected:</span>
              <span className="font-medium">
                {insight.daysAway < 0 
                  ? `${Math.abs(insight.daysAway)} days overdue`
                  : insight.daysAway === 0 
                    ? 'Today'
                    : `In ${insight.daysAway} days`
                }
              </span>
            </div>
          )}
        </div>

        {/* Insight Reason */}
        {insight && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Because:</strong> {insight.reason}
            </p>
          </div>
        )}

        {/* Categories */}
        {recurring.category.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recurring.category.slice(0, 3).map((cat, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {cat}
              </Badge>
            ))}
            {recurring.category.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{recurring.category.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          {onCreateReminder && insight && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCreateReminder(recurring.id)}
              className="flex items-center gap-1"
            >
              <Calendar className="h-3 w-3" />
              Add Reminder
            </Button>
          )}
          
          {onMarkCorrect && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onMarkCorrect(recurring.id, true)}
                className="flex items-center gap-1"
              >
                <CheckCircle className="h-3 w-3" />
                Correct
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onMarkCorrect(recurring.id, false)}
                className="flex items-center gap-1"
              >
                <XCircle className="h-3 w-3" />
                Wrong
              </Button>
            </div>
          )}
        </div>

        {/* Occurrence Count */}
        <div className="text-xs text-muted-foreground border-t pt-2">
          Based on {recurring.occurrence_count} transactions • 
          Every ~{recurring.frequency_days} days
        </div>
      </CardContent>
    </Card>
  );
}