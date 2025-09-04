import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Receipt, Scan, Upload, TestTube, Camera } from 'lucide-react';
import { ReceiptScanner } from '@/components/ReceiptScanner';
import { receiptOCRService } from '@/services/receiptOCRService';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled, toggleFeatureFlag } from '@/config/flags';
import { Bubble } from '@/types/bubble';
import { DevPerformanceMonitor } from '@/components/DevPerformanceMonitor';

const DEBUG = localStorage.getItem('DEBUG') === 'true';

// Sample receipt images (base64 encoded small samples)
const SAMPLE_RECEIPTS = [
  {
    id: 'grocery',
    name: 'Grocery Store Receipt',
    description: 'Typical supermarket receipt with items and total',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', // Placeholder
    expectedData: {
      merchant: 'Fresh Market',
      total: 42.85,
      date: '12/15/2024',
      currency: 'USD'
    }
  },
  {
    id: 'restaurant', 
    name: 'Restaurant Receipt',
    description: 'Dinner receipt with tip and tax',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', // Placeholder
    expectedData: {
      merchant: 'Italian Bistro',
      total: 78.50,
      date: '12/14/2024',
      currency: 'USD'
    }
  },
  {
    id: 'gas',
    name: 'Gas Station Receipt',
    description: 'Fuel purchase receipt',
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', // Placeholder
    expectedData: {
      merchant: 'Shell Station',
      total: 35.20,
      date: '12/13/2024',
      currency: 'USD'
    }
  }
];

export const DevReceipts: React.FC = () => {
  const { toast } = useToast();
  
  const [selectedReceipt, setSelectedReceipt] = useState<typeof SAMPLE_RECEIPTS[0] | null>(null);
  const [testBubble, setTestBubble] = useState<Bubble | null>(null);
  const [ocrStatus, setOcrStatus] = useState<{
    isRunning: boolean;
    progress: number;
    result?: any;
  }>({ isRunning: false, progress: 0 });
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  };

  const isOCRAvailable = receiptOCRService.isAvailable();
  const isFeatureActive = isFeatureEnabled('receiptsOCR');

  const testOCRWithSample = async (sample: typeof SAMPLE_RECEIPTS[0]) => {
    setOcrStatus({ isRunning: true, progress: 0 });
    setSelectedReceipt(sample);
    
    try {
      addLog(`🧾 Testing OCR with ${sample.name}`);
      setOcrStatus(prev => ({ ...prev, progress: 25 }));
      
      // Simulate OCR processing (since we have placeholder images)
      await new Promise(resolve => setTimeout(resolve, 1000));
      setOcrStatus(prev => ({ ...prev, progress: 50 }));
      
      // Mock OCR result based on sample data
      const mockText = `
${sample.expectedData.merchant}
Date: ${sample.expectedData.date}
Total: $${sample.expectedData.total}
Thank you for your business!
      `.trim();
      
      setOcrStatus(prev => ({ ...prev, progress: 75 }));
      
      // Parse the mock data
      const parsedData = receiptOCRService.parseReceiptData(mockText);
      
      setOcrStatus({
        isRunning: false,
        progress: 100,
        result: {
          mockText,
          parsedData,
          expected: sample.expectedData
        }
      });
      
      addLog(`✅ OCR completed: ${parsedData.merchant}, $${parsedData.total}`);
      addLog(`🎯 Confidence: ${Math.round(parsedData.confidence * 100)}%`);
      
      // Create test bubble
      const bubble: Bubble = {
        id: crypto.randomUUID(),
        type: 'Memory',
        content: `Receipt from ${sample.expectedData.merchant}`,
        imageUri: sample.image,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        x: 0,
        y: 0,
        size: 0.8,
        tags: [],
        metadata: {
          finance: {
            merchant: parsedData.merchant,
            total: parsedData.total,
            date: parsedData.date,
            currency: parsedData.currency,
            receiptProcessed: true
          }
        }
      };
      
      setTestBubble(bubble);
      
      toast({
        title: "OCR Test Complete",
        description: `Processed ${sample.name} successfully`,
      });
      
    } catch (error) {
      console.error('OCR test failed:', error);
      setOcrStatus({ isRunning: false, progress: 0 });
      addLog(`❌ OCR test failed: ${error.message}`);
      
      toast({
        title: "OCR Test Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file",
        variant: "destructive"
      });
      return;
    }
    
    setOcrStatus({ isRunning: true, progress: 0 });
    
    try {
      addLog(`📷 Processing uploaded image: ${file.name}`);
      
      const result = await receiptOCRService.extractText(file);
      
      if (result.success && result.text) {
        const parsedData = receiptOCRService.parseReceiptData(result.text);
        
        setOcrStatus({
          isRunning: false,
          progress: 100,
          result: {
            rawText: result.text,
            parsedData,
            confidence: result.confidence
          }
        });
        
        addLog(`✅ Real OCR completed: ${parsedData.merchant || 'Unknown'}, $${parsedData.total || 0}`);
        
      } else {
        throw new Error(result.error || 'OCR failed');
      }
      
    } catch (error) {
      console.error('File OCR failed:', error);
      setOcrStatus({ isRunning: false, progress: 0 });
      addLog(`❌ File OCR failed: ${error.message}`);
    }
    
    // Clear file input
    event.target.value = '';
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      {/* Performance Monitor */}
      <DevPerformanceMonitor show={true} acceptanceCriteria={{ targetFPS: 55, memoryThreshold: 300, maxFrameDrops: 5 }} />
      
      <div className="flex items-center gap-3 mb-6">
        <TestTube className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Receipt OCR Development</h1>
        <Badge variant="secondary">
          Receipts
        </Badge>
      </div>

      {/* Feature Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Feature Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">receiptsOCR Flag</span>
            <Button
              variant={isFeatureActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                toggleFeatureFlag('receiptsOCR', !isFeatureActive);
                addLog(`🔧 receiptsOCR flag: ${!isFeatureActive ? 'ON' : 'OFF'}`);
              }}
            >
              {isFeatureActive ? 'ON' : 'OFF'}
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm">On-device OCR Available</span>
            <Badge variant={isOCRAvailable ? 'default' : 'secondary'}>
              {isOCRAvailable ? 'Available' : 'Unavailable'}
            </Badge>
          </div>
          
          {!isOCRAvailable && (
            <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
              {receiptOCRService.getUnavailableMessage()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sample Receipt Testing */}
      <Card>
        <CardHeader>
          <CardTitle>Sample Receipt Testing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SAMPLE_RECEIPTS.map((sample) => (
              <Card key={sample.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    <h3 className="font-medium text-sm">{sample.name}</h3>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">{sample.description}</p>
                  
                  <div className="text-xs space-y-1">
                    <div>Expected: {sample.expectedData.merchant}</div>
                    <div>Total: ${sample.expectedData.total}</div>
                    <div>Date: {sample.expectedData.date}</div>
                  </div>
                  
                  <Button
                    onClick={() => testOCRWithSample(sample)}
                    disabled={ocrStatus.isRunning || !isFeatureActive}
                    size="sm"
                    className="w-full"
                  >
                    <Scan className="h-3 w-3 mr-1" />
                    Test OCR
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Real Image Upload */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center gap-4">
              <label htmlFor="receipt-upload" className="cursor-pointer">
                <Button asChild disabled={!isFeatureActive || !isOCRAvailable}>
                  <span className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload Real Receipt
                  </span>
                </Button>
                <input
                  id="receipt-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              
              <span className="text-xs text-muted-foreground">
                Upload your own receipt image for real OCR testing
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OCR Progress */}
      {ocrStatus.isRunning && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Processing Receipt...</span>
                <span>{ocrStatus.progress}%</span>
              </div>
              <Progress value={ocrStatus.progress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* OCR Results */}
      {ocrStatus.result && (
        <Card>
          <CardHeader>
            <CardTitle>OCR Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Parsed Data</h4>
                <div className="bg-muted/30 p-3 rounded-lg text-xs space-y-1">
                  <div>Merchant: {ocrStatus.result.parsedData.merchant || 'None'}</div>
                  <div>Total: ${ocrStatus.result.parsedData.total || 0}</div>
                  <div>Date: {ocrStatus.result.parsedData.date || 'None'}</div>
                  <div>Currency: {ocrStatus.result.parsedData.currency}</div>
                  <div>Confidence: {Math.round(ocrStatus.result.parsedData.confidence * 100)}%</div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium text-sm mb-2">Raw OCR Text</h4>
                <div className="bg-muted/30 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {ocrStatus.result.rawText || ocrStatus.result.mockText || 'No text extracted'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Receipt Scanner Component Demo */}
      {testBubble && (
        <Card>
          <CardHeader>
            <CardTitle>Receipt Scanner Component</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceiptScanner
              bubble={testBubble}
              onUpdate={(updated) => {
                setTestBubble(updated);
                addLog(`💾 Test bubble updated with finance data`);
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Debug Logs */}
      {DEBUG && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Debug Logs
              <Button variant="outline" size="sm" onClick={clearLogs}>
                Clear
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs max-h-64 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">No logs yet...</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};