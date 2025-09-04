// On-device OCR Service using browser APIs
// Fully opt-in with graceful fallbacks

// Type declarations for experimental APIs
declare global {
  interface Window {
    TextDetector?: any;
  }
  const TextDetector: any;
}

interface OCRResult {
  success: boolean;
  text?: string;
  confidence?: number;
  error?: string;
}

interface ReceiptData {
  merchant?: string;
  total?: number;
  date?: string;
  currency?: string;
  confidence: number;
  rawText: string;
}

class ReceiptOCRService {
  private static instance: ReceiptOCRService;
  
  static getInstance(): ReceiptOCRService {
    if (!ReceiptOCRService.instance) {
      ReceiptOCRService.instance = new ReceiptOCRService();
    }
    return ReceiptOCRService.instance;
  }

  /**
   * Check if on-device OCR is available
   */
  isAvailable(): boolean {
    // Check for modern browser OCR capabilities
    return (
      'createImageBitmap' in window &&
      'OffscreenCanvas' in window &&
      typeof window.TextDetector !== 'undefined' ||
      this.hasModernVisionAPI()
    );
  }

  private hasModernVisionAPI(): boolean {
    // Check for experimental vision APIs
    return 'ml' in navigator || 'textDetection' in navigator;
  }

  /**
   * Extract text from image using on-device OCR
   */
  async extractText(imageFile: File | string): Promise<OCRResult> {
    try {
      // Try modern TextDetector API first
      if (typeof window.TextDetector !== 'undefined') {
        return await this.useTextDetectorAPI(imageFile);
      }
      
      // Try experimental navigator.ml API
      if ('ml' in navigator) {
        return await this.useMLAPI(imageFile);
      }
      
      // Fallback: return stub message
      return {
        success: false,
        error: 'On-device OCR not available. Consider using cloud OCR service.'
      };
      
    } catch (error) {
      console.error('OCR extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OCR failed'
      };
    }
  }

  private async useTextDetectorAPI(imageFile: File | string): Promise<OCRResult> {
    try {
      const detector = new window.TextDetector();
      
      // Convert to image element
      const img = await this.loadImage(imageFile);
      
      // Detect text
      const textBlocks = await detector.detect(img);
      
      if (!textBlocks || textBlocks.length === 0) {
        return {
          success: false,
          error: 'No text detected in image'
        };
      }
      
      // Combine all detected text
      const text = textBlocks
        .map((block: any) => block.rawValue || block.text)
        .join('\n')
        .trim();
      
      // Calculate confidence (mock implementation)
      const confidence = textBlocks.length > 0 ? 0.8 : 0.0;
      
      return {
        success: true,
        text,
        confidence
      };
      
    } catch (error) {
      throw new Error(`TextDetector API failed: ${error.message}`);
    }
  }

  private async useMLAPI(imageFile: File | string): Promise<OCRResult> {
    try {
      const ml = (navigator as any).ml;
      
      if (!ml || !ml.createTextDetector) {
        throw new Error('ML API not available');
      }
      
      const detector = await ml.createTextDetector();
      const img = await this.loadImage(imageFile);
      
      const results = await detector.detect(img);
      
      if (!results || results.length === 0) {
        return {
          success: false,
          error: 'No text detected'
        };
      }
      
      const text = results.map((r: any) => r.text).join('\n');
      
      return {
        success: true,
        text,
        confidence: 0.75
      };
      
    } catch (error) {
      throw new Error(`ML API failed: ${error.message}`);
    }
  }

  private async loadImage(imageSource: File | string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => resolve(img);
      img.onerror = reject;
      
      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else {
        const url = URL.createObjectURL(imageSource);
        img.src = url;
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
      }
    });
  }

  /**
   * Parse receipt data from extracted text
   */
  parseReceiptData(text: string): ReceiptData {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    
    let merchant = '';
    let total = 0;
    let date = '';
    let currency = 'USD';
    
    // Merchant detection (usually first meaningful line)
    const merchantLine = lines.find(line => 
      line.length > 3 && 
      !line.match(/^\d+/) && 
      !line.toLowerCase().includes('receipt') &&
      !line.toLowerCase().includes('total') &&
      !line.toLowerCase().includes('tax')
    );
    
    if (merchantLine) {
      merchant = merchantLine.replace(/[^\w\s&-]/g, '').trim();
    }
    
    // Total detection
    const totalRegex = /(?:total|amount|sum)[\s:]*\$?(\d+\.?\d*)/i;
    const moneyRegex = /\$(\d+\.?\d*)/g;
    
    for (const line of lines) {
      const totalMatch = line.match(totalRegex);
      if (totalMatch) {
        total = parseFloat(totalMatch[1]);
        break;
      }
    }
    
    // If no explicit total, find largest money amount
    if (total === 0) {
      let amounts: number[] = [];
      for (const line of lines) {
        const matches = [...line.matchAll(moneyRegex)];
        amounts = amounts.concat(matches.map(m => parseFloat(m[1])));
      }
      
      if (amounts.length > 0) {
        total = Math.max(...amounts);
      }
    }
    
    // Date detection
    const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;
    const dateText = lines.find(line => dateRegex.test(line));
    
    if (dateText) {
      const dateMatch = dateText.match(dateRegex);
      if (dateMatch) {
        date = dateMatch[0];
      }
    }
    
    // Currency detection
    if (text.includes('€')) currency = 'EUR';
    else if (text.includes('£')) currency = 'GBP';
    else if (text.includes('¥')) currency = 'JPY';
    
    const confidence = (merchant ? 0.3 : 0) + (total > 0 ? 0.4 : 0) + (date ? 0.3 : 0);
    
    return {
      merchant: merchant || undefined,
      total: total > 0 ? total : undefined,
      date: date || undefined,
      currency,
      confidence,
      rawText: text
    };
  }

  /**
   * Get stub message for unavailable OCR
   */
  getUnavailableMessage(): string {
    return 'On-device OCR not available in this browser. Consider using a cloud OCR service or updating your browser.';
  }
}

export const receiptOCRService = ReceiptOCRService.getInstance();