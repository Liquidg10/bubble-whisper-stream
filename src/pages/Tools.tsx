import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  DollarSign, 
  ShoppingCart, 
  FileText, 
  BarChart3, 
  Home,
  Wrench,
  Timer,
  Calendar,
  MoreHorizontal
} from 'lucide-react';

// Import tool components
import { MergedGroceryHelper } from '@/components/tools/MergedGroceryHelper';
import { DocumentScanner } from '@/components/DocumentScanner';
import { MonthlyReviewCard } from '@/components/MonthlyReviewCard';
import { CleanHouseCues } from '@/components/tools/CleanHouseCues';
import { PomodoroTimer } from '@/components/PomodoroTimer';
import { FinanceBudgetTools } from '@/components/tools/FinanceBudgetTools';
import { TaskInputInterface } from '@/components/TaskInputInterface';

export default function Tools() {
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Life Tools</h1>
        <p className="text-muted-foreground">
          Practical tools to help manage your daily life with empathy and intelligence
        </p>
      </div>

      <Tabs defaultValue="ai-assistant" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="ai-assistant" className="gap-2">
            <Wrench className="h-4 w-4" />
            AI Assistant
          </TabsTrigger>
          <TabsTrigger value="pomodoro" className="gap-2">
            <Timer className="h-4 w-4" />
            Pomodoro
          </TabsTrigger>
          <TabsTrigger value="clean" className="gap-2">
            <Home className="h-4 w-4" />
            Clean House
          </TabsTrigger>
          <TabsTrigger value="grocery" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Grocery
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Finance
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-2">
            <Calendar className="h-4 w-4" />
            Review
          </TabsTrigger>
          <TabsTrigger value="more" className="gap-2">
            <MoreHorizontal className="h-4 w-4" />
            More
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="ai-assistant">
            <TaskInputInterface />
          </TabsContent>

          <TabsContent value="pomodoro">
            <PomodoroTimer />
          </TabsContent>

          <TabsContent value="clean">
            <CleanHouseCues />
          </TabsContent>

          <TabsContent value="grocery" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-green-600" />
                  Smart Grocery Management
                </CardTitle>
                <CardDescription>
                  AI-powered grocery lists with intelligent suggestions and location reminders
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MergedGroceryHelper />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="finance" className="space-y-4">
            <FinanceBudgetTools />
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Document & Receipt Scanner
                </CardTitle>
                <CardDescription>
                  Scan and extract text from documents, receipts, and other important papers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentScanner />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="review" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                  Monthly Personal Review
                </CardTitle>
                <CardDescription>
                  Reflect on patterns, insights, and personal growth with gentle self-assessment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MonthlyReviewCard />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="more" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Additional Tools Coming Soon</CardTitle>
                <CardDescription>
                  We're working on more helpful life management tools based on your feedback
                </CardDescription>
              </CardHeader>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>More tools and integrations are being developed to support your daily life</p>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}