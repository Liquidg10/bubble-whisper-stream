import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { DollarSign, Calendar, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

interface Transaction {
  id: string;
  amount: number;
  merchant: string;
  date: string;
  category: string;
  account: string;
}

interface RecurringPattern {
  id: string;
  merchant: string;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  averageAmount: number;
  variance: number;
  confidence: number;
  nextExpected: string;
  transactions: Transaction[];
  category: string;
}

interface PatternAnalysis {
  patterns: RecurringPattern[];
  totalRecurring: number;
  monthlyTotal: number;
  anomalies: Array<{
    type: 'amount_variance' | 'timing_shift' | 'missing_payment' | 'duplicate';
    description: string;
    patternId: string;
  }>;
}

const SAMPLE_TRANSACTIONS: Transaction[] = [
  // Netflix - Monthly
  { id: '1', amount: -14.99, merchant: 'Netflix', date: '2024-01-15', category: 'Entertainment', account: 'Checking' },
  { id: '2', amount: -14.99, merchant: 'Netflix', date: '2024-02-15', category: 'Entertainment', account: 'Checking' },
  { id: '3', amount: -15.99, merchant: 'Netflix', date: '2024-03-15', category: 'Entertainment', account: 'Checking' }, // Price increase
  
  // Spotify - Monthly
  { id: '4', amount: -9.99, merchant: 'Spotify', date: '2024-01-10', category: 'Entertainment', account: 'Credit Card' },
  { id: '5', amount: -9.99, merchant: 'Spotify', date: '2024-02-10', category: 'Entertainment', account: 'Credit Card' },
  { id: '6', amount: -9.99, merchant: 'Spotify', date: '2024-03-12', category: 'Entertainment', account: 'Credit Card' }, // Late payment
  
  // Rent - Monthly
  { id: '7', amount: -1500, merchant: 'Apartment Complex', date: '2024-01-01', category: 'Housing', account: 'Checking' },
  { id: '8', amount: -1500, merchant: 'Apartment Complex', date: '2024-02-01', category: 'Housing', account: 'Checking' },
  { id: '9', amount: -1500, merchant: 'Apartment Complex', date: '2024-03-01', category: 'Housing', account: 'Checking' },
  
  // Grocery - Weekly (varying amounts)
  { id: '10', amount: -87.43, merchant: 'Whole Foods', date: '2024-01-07', category: 'Groceries', account: 'Credit Card' },
  { id: '11', amount: -92.15, merchant: 'Whole Foods', date: '2024-01-14', category: 'Groceries', account: 'Credit Card' },
  { id: '12', amount: -78.92, merchant: 'Whole Foods', date: '2024-01-21', category: 'Groceries', account: 'Credit Card' },
  { id: '13', amount: -95.67, merchant: 'Whole Foods', date: '2024-01-28', category: 'Groceries', account: 'Credit Card' },
  
  // Insurance - Quarterly
  { id: '14', amount: -450, merchant: 'Auto Insurance Co', date: '2024-01-01', category: 'Insurance', account: 'Checking' },
  { id: '15', amount: -450, merchant: 'Auto Insurance Co', date: '2024-04-01', category: 'Insurance', account: 'Checking' },
  
  // Salary - Biweekly (income)
  { id: '16', amount: 2500, merchant: 'Employer Inc', date: '2024-01-05', category: 'Income', account: 'Checking' },
  { id: '17', amount: 2500, merchant: 'Employer Inc', date: '2024-01-19', category: 'Income', account: 'Checking' },
  { id: '18', amount: 2500, merchant: 'Employer Inc', date: '2024-02-02', category: 'Income', account: 'Checking' },
  { id: '19', amount: 2500, merchant: 'Employer Inc', date: '2024-02-16', category: 'Income', account: 'Checking' },
];

export default function DevPlaidRecur() {
  const [transactions, setTransactions] = useState<Transaction[]>(SAMPLE_TRANSACTIONS);
  const [analysis, setAnalysis] = useState<PatternAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [minConfidence, setMinConfidence] = useState(0.7);
  const [selectedPattern, setSelectedPattern] = useState<string>('');

  const analyzePatterns = async () => {
    setIsAnalyzing(true);
    
    try {
      // Simulate analysis delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Group transactions by merchant
      const merchantGroups = transactions.reduce((groups, transaction) => {
        const key = transaction.merchant;
        if (!groups[key]) groups[key] = [];
        groups[key].push(transaction);
        return groups;
      }, {} as Record<string, Transaction[]>);

      // Detect patterns
      const patterns: RecurringPattern[] = [];
      let patternId = 1;

      Object.entries(merchantGroups).forEach(([merchant, merchantTransactions]) => {
        if (merchantTransactions.length >= 2) {
          const sortedTxns = merchantTransactions.sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );

          // Calculate frequency and variance
          const intervals = [];
          for (let i = 1; i < sortedTxns.length; i++) {
            const days = Math.round(
              (new Date(sortedTxns[i].date).getTime() - new Date(sortedTxns[i-1].date).getTime()) 
              / (1000 * 60 * 60 * 24)
            );
            intervals.push(days);
          }

          const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
          const frequency = determineFrequency(avgInterval);
          
          const amounts = sortedTxns.map(t => Math.abs(t.amount));
          const avgAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
          const variance = calculateVariance(amounts, avgAmount);
          
          const confidence = calculateConfidence(intervals, amounts, sortedTxns.length);
          
          if (confidence >= minConfidence) {
            patterns.push({
              id: String(patternId++),
              merchant,
              frequency,
              averageAmount: avgAmount,
              variance,
              confidence,
              nextExpected: calculateNextExpected(sortedTxns[sortedTxns.length - 1].date, frequency),
              transactions: sortedTxns,
              category: sortedTxns[0].category
            });
          }
        }
      });

      // Detect anomalies
      const anomalies = detectAnomalies(patterns);

      const mockAnalysis: PatternAnalysis = {
        patterns,
        totalRecurring: patterns.length,
        monthlyTotal: patterns.reduce((sum, pattern) => {
          const monthlyAmount = convertToMonthly(pattern.averageAmount, pattern.frequency);
          return sum + monthlyAmount;
        }, 0),
        anomalies
      };

      setAnalysis(mockAnalysis);
    } catch (error) {
      console.error('Pattern analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const determineFrequency = (avgInterval: number): RecurringPattern['frequency'] => {
    if (avgInterval <= 10) return 'weekly';
    if (avgInterval <= 17) return 'biweekly';
    if (avgInterval <= 35) return 'monthly';
    if (avgInterval <= 100) return 'quarterly';
    return 'yearly';
  };

  const calculateVariance = (amounts: number[], average: number): number => {
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - average, 2), 0) / amounts.length;
    return Math.sqrt(variance);
  };

  const calculateConfidence = (intervals: number[], amounts: number[], transactionCount: number): number => {
    if (transactionCount < 2) return 0;
    
    // Base confidence on transaction count
    let confidence = Math.min(transactionCount / 6, 1) * 0.5;
    
    // Add confidence based on interval consistency
    if (intervals.length > 0) {
      const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      const intervalVariance = calculateVariance(intervals, avgInterval);
      const intervalConsistency = Math.max(0, 1 - (intervalVariance / avgInterval));
      confidence += intervalConsistency * 0.3;
    }
    
    // Add confidence based on amount consistency
    const avgAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const amountVariance = calculateVariance(amounts, avgAmount);
    const amountConsistency = Math.max(0, 1 - (amountVariance / avgAmount));
    confidence += amountConsistency * 0.2;
    
    return Math.min(confidence, 1);
  };

  const calculateNextExpected = (lastDate: string, frequency: RecurringPattern['frequency']): string => {
    const date = new Date(lastDate);
    switch (frequency) {
      case 'weekly': date.setDate(date.getDate() + 7); break;
      case 'biweekly': date.setDate(date.getDate() + 14); break;
      case 'monthly': date.setMonth(date.getMonth() + 1); break;
      case 'quarterly': date.setMonth(date.getMonth() + 3); break;
      case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
    }
    return date.toISOString().split('T')[0];
  };

  const convertToMonthly = (amount: number, frequency: RecurringPattern['frequency']): number => {
    switch (frequency) {
      case 'weekly': return amount * 4.33;
      case 'biweekly': return amount * 2.17;
      case 'monthly': return amount;
      case 'quarterly': return amount / 3;
      case 'yearly': return amount / 12;
      default: return amount;
    }
  };

  const detectAnomalies = (patterns: RecurringPattern[]): PatternAnalysis['anomalies'] => {
    const anomalies: PatternAnalysis['anomalies'] = [];
    
    patterns.forEach(pattern => {
      // Check for amount variance
      if (pattern.variance > pattern.averageAmount * 0.2) {
        anomalies.push({
          type: 'amount_variance',
          description: `${pattern.merchant} shows high amount variance (±${pattern.variance.toFixed(2)})`,
          patternId: pattern.id
        });
      }

      // Check for timing shifts
      const lastTxn = pattern.transactions[pattern.transactions.length - 1];
      const expectedDate = new Date(pattern.nextExpected);
      const actualDiff = Math.abs(new Date().getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (actualDiff > 7) {
        anomalies.push({
          type: 'timing_shift',
          description: `${pattern.merchant} payment timing has shifted by ${actualDiff.toFixed(0)} days`,
          patternId: pattern.id
        });
      }
    });

    return anomalies;
  };

  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case 'weekly': return 'bg-green-100 text-green-800';
      case 'biweekly': return 'bg-blue-100 text-blue-800';
      case 'monthly': return 'bg-purple-100 text-purple-800';
      case 'quarterly': return 'bg-orange-100 text-orange-800';
      case 'yearly': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <DollarSign className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Plaid Recurring Patterns</h1>
        <Badge variant="outline">QA Playground</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Analysis Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="min-confidence">Minimum Confidence</Label>
              <Input
                id="min-confidence"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={minConfidence}
                onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              />
            </div>

            <div>
              <Label>Transaction Data</Label>
              <p className="text-sm text-muted-foreground mb-2">
                {transactions.length} transactions loaded
              </p>
              <Button variant="outline" size="sm" className="w-full">
                Load Custom Data
              </Button>
            </div>

            <Button 
              onClick={analyzePatterns}
              disabled={isAnalyzing}
              className="w-full"
            >
              {isAnalyzing ? (
                <>
                  <TrendingUp className="h-4 w-4 mr-2 animate-pulse" />
                  Analyzing...
                </>
              ) : (
                'Analyze Patterns'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Analysis Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {analysis ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">{analysis.totalRecurring}</p>
                    <p className="text-sm text-muted-foreground">Patterns</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">
                      ${Math.abs(analysis.monthlyTotal).toFixed(0)}
                    </p>
                    <p className="text-sm text-muted-foreground">Monthly</p>
                  </div>
                </div>
                
                {analysis.anomalies.length > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-yellow-600">{analysis.anomalies.length}</p>
                    <p className="text-sm text-muted-foreground">Anomalies</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Run analysis to see results
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pattern Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Pattern Detail</CardTitle>
          </CardHeader>
          <CardContent>
            {analysis && analysis.patterns.length > 0 ? (
              <div className="space-y-4">
                <Select value={selectedPattern} onValueChange={setSelectedPattern}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a pattern" />
                  </SelectTrigger>
                  <SelectContent>
                    {analysis.patterns.map(pattern => (
                      <SelectItem key={pattern.id} value={pattern.id}>
                        {pattern.merchant} ({pattern.frequency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedPattern && (() => {
                  const pattern = analysis.patterns.find(p => p.id === selectedPattern);
                  return pattern ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{pattern.merchant}</h4>
                        <Badge className={getFrequencyColor(pattern.frequency)}>
                          {pattern.frequency}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Average Amount:</span>
                          <span className="font-medium">${pattern.averageAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Variance:</span>
                          <span className="font-medium">±${pattern.variance.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Confidence:</span>
                          <span className={`font-medium ${getConfidenceColor(pattern.confidence)}`}>
                            {(pattern.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Next Expected:</span>
                          <span className="font-medium">{pattern.nextExpected}</span>
                        </div>
                      </div>

                      <div className="mt-3">
                        <Label className="text-xs">Confidence Score</Label>
                        <Progress value={pattern.confidence * 100} className="h-2 mt-1" />
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Select a pattern to view details
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Patterns List */}
      {analysis && analysis.patterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detected Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analysis.patterns.map(pattern => (
                <div key={pattern.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium">{pattern.merchant}</h4>
                      <Badge className={getFrequencyColor(pattern.frequency)}>
                        {pattern.frequency}
                      </Badge>
                      <Badge variant="outline">
                        {pattern.transactions.length} txns
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span>${pattern.averageAmount.toFixed(2)} avg</span>
                      <span>±${pattern.variance.toFixed(2)}</span>
                      <span className={getConfidenceColor(pattern.confidence)}>
                        {(pattern.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Next:</p>
                    <p className="text-sm font-medium">{pattern.nextExpected}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Anomalies */}
      {analysis && analysis.anomalies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Detected Anomalies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analysis.anomalies.map((anomaly, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{anomaly.description}</p>
                    <Badge variant="outline" className="text-xs mt-1">
                      {anomaly.type.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}