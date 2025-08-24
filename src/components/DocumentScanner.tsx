import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { FileText, Camera, Upload, Scan, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './ui/use-toast';

interface ScanResult {
  type: string;
  content: string;
  extractedAt: string;
  [key: string]: any;
}

export function DocumentScanner() {
  const [selectedType, setSelectedType] = useState<string>('receipt');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const documentTypes = [
    { value: 'receipt', label: 'Receipt', icon: '🧾' },
    { value: 'bill', label: 'Bill/Invoice', icon: '📄' },
    { value: 'handwritten', label: 'Handwritten Notes', icon: '✍️' },
    { value: 'business-card', label: 'Business Card', icon: '💳' },
    { value: 'document', label: 'General Document', icon: '📋' }
  ];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setPreviewImage(imageData);
      scanDocument(imageData);
    };
    reader.readAsDataURL(file);
  };

  const scanDocument = async (imageData: string) => {
    setIsScanning(true);
    setScanResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('document-scan', {
        body: {
          imageData,
          documentType: selectedType
        }
      });

      if (error) throw error;

      if (data.success) {
        setScanResult(data.data);
        toast({
          title: "Document Scanned Successfully",
          description: `Extracted data from ${selectedType}`,
        });
      } else {
        throw new Error(data.error || 'Scan failed');
      }
    } catch (error) {
      console.error('Document scan error:', error);
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : 'Failed to scan document',
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const clearScan = () => {
    setScanResult(null);
    setPreviewImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Document Scanner
          <Badge variant="secondary">AI-Powered OCR</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Document Type Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Document Type</label>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger>
              <SelectValue placeholder="Select document type" />
            </SelectTrigger>
            <SelectContent>
              {documentTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Upload Section */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
            <Button
              onClick={clearScan}
              variant="outline"
              disabled={!previewImage && !scanResult}
            >
              Clear
            </Button>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Preview Image */}
        {previewImage && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Document Preview</label>
            <div className="relative">
              <img
                src={previewImage}
                alt="Document preview"
                className="w-full max-h-96 object-contain rounded-lg border"
              />
              {isScanning && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                  <div className="flex items-center gap-2">
                    <Scan className="h-5 w-5 animate-pulse text-primary" />
                    <span>Scanning document...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scan Results */}
        {scanResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <label className="text-sm font-medium">Extracted Data</label>
              <Badge variant="outline">{scanResult.type}</Badge>
            </div>
            
            <Card>
              <CardContent className="pt-4">
                <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md overflow-auto">
                  {typeof scanResult.content === 'string' 
                    ? scanResult.content 
                    : JSON.stringify(scanResult, null, 2)
                  }
                </pre>
              </CardContent>
            </Card>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Privacy Notice:</strong> Document scanning is processed securely and data is not stored permanently. Review extracted data for accuracy before use.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}