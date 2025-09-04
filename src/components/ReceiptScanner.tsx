import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Receipt, Scan, AlertCircle, CheckCircle, Edit3 } from 'lucide-react';
import { receiptOCRService } from '@/services/receiptOCRService';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { isFeatureEnabled } from '@/config/flags';
import { Bubble, FinanceMetadata } from '@/types/bubble';

interface ReceiptScannerProps {
  bubble: Bubble;
  onUpdate?: (updatedBubble: Bubble) => void;
  className?: string;
}

const DEBUG = localStorage.getItem('DEBUG') === 'true';

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  bubble,
  onUpdate,
  className
}) => {
  const { updateBubble } = useBubbleStore();
  const { toast } = useToast();
  
  const [isScanning, setIsScanning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [financeData, setFinanceData] = useState<FinanceMetadata>(
    bubble.metadata?.finance || {}
  );
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    confidence?: number;
    error?: string;
  } | null>(null);

  const isReceiptProcessed = Boolean(bubble.metadata?.finance?.receiptProcessed);
  const hasFinanceData = Boolean(
    bubble.metadata?.finance?.merchant || 
    bubble.metadata?.finance?.total ||
    bubble.metadata?.finance?.date
  );

  // Check if receipt scanning is available
  const isOCRAvailable = receiptOCRService.isAvailable();
  const isFeatureActive = isFeatureEnabled('receiptsOCR');

  const handleScanReceipt = async () => {
    if (!bubble.imageUri || !isFeatureActive || !isOCRAvailable) return;
    
    setIsScanning(true);
    setScanResult(null);
    
    try {
      if (DEBUG) {
        console.log('🧾 Starting receipt scan for bubble:', bubble.id);
      }
      
      // Extract text using on-device OCR
      const ocrResult = await receiptOCRService.extractText(bubble.imageUri);
      
      if (!ocrResult.success) {
        setScanResult({
          success: false,
          error: ocrResult.error || 'OCR failed'
        });
        return;
      }
      
      if (DEBUG) {
        console.log('📝 OCR text extracted:', ocrResult.text);
      }
      
      // Parse receipt data
      const receiptData = receiptOCRService.parseReceiptData(ocrResult.text || '');
      
      if (DEBUG) {
        console.log('💰 Parsed receipt data:', receiptData);
      }
      
      // Update finance metadata
      const newFinanceData: FinanceMetadata = {
        merchant: receiptData.merchant,
        total: receiptData.total,
        date: receiptData.date,
        currency: receiptData.currency,
        receiptProcessed: true
      };
      
      setFinanceData(newFinanceData);
      setScanResult({
        success: true,
        confidence: receiptData.confidence
      });
      
      // Auto-save if confidence is high
      if (receiptData.confidence > 0.7) {
        await saveFinanceData(newFinanceData, true);
      }
      
      toast({
        title: "Receipt Scanned",
        description: `Extracted data with ${Math.round(receiptData.confidence * 100)}% confidence`,
      });
      
    } catch (error) {
      console.error('Receipt scanning failed:', error);
      setScanResult({
        success: false,
        error: error instanceof Error ? error.message : 'Scan failed'
      });
      
      toast({
        title: "Scan Failed",
        description: "Could not process receipt image",
        variant: "destructive"
      });
    } finally {
      setIsScanning(false);
    }
  };

  const saveFinanceData = async (data: FinanceMetadata, autoTag: boolean = false) => {
    try {
      const updatedBubble: Bubble = {
        ...bubble,
        metadata: {
          ...bubble.metadata,
          finance: data
        }
      };
      
      // Auto-tag with receipt and finance tags if not already present
      if (autoTag) {
        const existingTagNames = bubble.tags.map(tag => tag.name.toLowerCase());
        const newTags = [...bubble.tags];
        
        if (!existingTagNames.includes('receipt')) {
          newTags.push({
            id: crypto.randomUUID(),
            name: 'receipt',
            emoji: '🧾'
          });
        }
        
        if (!existingTagNames.includes('finance')) {
          newTags.push({
            id: crypto.randomUUID(),
            name: 'finance',
            emoji: '💰'
          });
        }
        
        updatedBubble.tags = newTags;
      }
      
      await updateBubble(updatedBubble);
      onUpdate?.(updatedBubble);
      
      if (DEBUG) {
        console.log('💾 Finance data saved:', data);
      }
      
    } catch (error) {
      console.error('Failed to save finance data:', error);
      toast({
        title: "Save Failed",
        description: "Could not save receipt data",
        variant: "destructive"
      });
    }
  };

  const handleEditSave = async () => {
    await saveFinanceData(financeData, !hasFinanceData);
    setIsEditing(false);
    
    toast({
      title: "Receipt Updated",
      description: "Finance data saved successfully"
    });
  };

  const handleFieldChange = (field: keyof FinanceMetadata, value: string | number) => {
    setFinanceData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Don't render if feature is disabled or no image
  if (!isFeatureActive || !bubble.imageUri) {
    return null;
  }

  return (
    <Card className={`border-accent/20 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Receipt className="h-4 w-4" />
          Receipt Scanner
          {isReceiptProcessed && (
            <Badge variant="secondary" className="text-xs">
              Processed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* OCR Status */}
        {!isOCRAvailable && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">
              {receiptOCRService.getUnavailableMessage()}
            </div>
          </div>
        )}
        
        {/* Scan Button */}
        {isOCRAvailable && (
          <Button
            onClick={handleScanReceipt}
            disabled={isScanning || isReceiptProcessed}
            className="w-full flex items-center gap-2"
            variant={hasFinanceData ? "outline" : "default"}
          >
            {isScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Scan className="h-4 w-4" />
            )}
            {isScanning ? 'Scanning...' : 'Scan for Receipt Details'}
          </Button>
        )}
        
        {/* Scan Result */}
        {scanResult && (
          <div className={`flex items-center gap-2 p-2 rounded-lg ${
            scanResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-300' : 'bg-red-500/10 text-red-700 dark:text-red-300'
          }`}>
            {scanResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <span className="text-xs">
              {scanResult.success 
                ? `Scan successful (${Math.round((scanResult.confidence || 0) * 100)}% confidence)` 
                : `Scan failed: ${scanResult.error}`
              }
            </span>
          </div>
        )}
        
        {/* Finance Data Display/Edit */}
        {(hasFinanceData || isEditing) && (
          <div className="space-y-3 border-t border-border/50 pt-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Finance Details</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                className="h-6 w-6 p-0"
              >
                <Edit3 className="h-3 w-3" />
              </Button>
            </div>
            
            {isEditing ? (
              <div className="space-y-2">
                <div>
                  <Label htmlFor="merchant" className="text-xs">Merchant</Label>
                  <Input
                    id="merchant"
                    value={financeData.merchant || ''}
                    onChange={(e) => handleFieldChange('merchant', e.target.value)}
                    className="h-8 text-xs"
                    placeholder="Store name"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="total" className="text-xs">Total</Label>
                    <Input
                      id="total"
                      type="number"
                      step="0.01"
                      value={financeData.total || ''}
                      onChange={(e) => handleFieldChange('total', parseFloat(e.target.value) || 0)}
                      className="h-8 text-xs"
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="currency" className="text-xs">Currency</Label>
                    <Input
                      id="currency"
                      value={financeData.currency || 'USD'}
                      onChange={(e) => handleFieldChange('currency', e.target.value)}
                      className="h-8 text-xs"
                      placeholder="USD"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="date" className="text-xs">Date</Label>
                  <Input
                    id="date"
                    value={financeData.date || ''}
                    onChange={(e) => handleFieldChange('date', e.target.value)}
                    className="h-8 text-xs"
                    placeholder="MM/DD/YYYY"
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleEditSave}
                    size="sm"
                    className="flex-1 h-7 text-xs"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => setIsEditing(false)}
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-xs">
                {financeData.merchant && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Merchant:</span>
                    <span>{financeData.merchant}</span>
                  </div>
                )}
                
                {financeData.total && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total:</span>
                    <span>{financeData.currency || 'USD'} {financeData.total.toFixed(2)}</span>
                  </div>
                )}
                
                {financeData.date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date:</span>
                    <span>{financeData.date}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Debug Info */}
        {DEBUG && (
          <div className="text-xs text-muted-foreground border-t border-border/50 pt-2">
            <div>OCR Available: {isOCRAvailable ? 'Yes' : 'No'}</div>
            <div>Feature Enabled: {isFeatureActive ? 'Yes' : 'No'}</div>
            <div>Has Image: {bubble.imageUri ? 'Yes' : 'No'}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};