import { modalityService } from './modalityService';
import { consentService } from './consentService';
import { receiptOCRService } from './receiptOCRService';

export interface VisionAnalysisResult {
  caption: string;
  tags: string[];
  joyScore?: number; // 0-1 scale for Joy candidates
  typeHint?: 'receipt' | 'document' | 'scene' | 'face' | 'food' | 'nature';
  because: string; // Explainability
  confidence: number; // 0-1 scale
}

export interface VisionConsentOptions {
  allowCloud: boolean;
  allowJoyDetection: boolean;
  allowAutoTagging: boolean;
}

class VisionService {
  private static instance: VisionService;
  private consentCache = new Map<string, boolean>();

  static getInstance(): VisionService {
    if (!VisionService.instance) {
      VisionService.instance = new VisionService();
    }
    return VisionService.instance;
  }

  /**
   * Main vision analysis function
   */
  async describeImage(input: File | string): Promise<VisionAnalysisResult> {
    try {
      // Check user consent for cloud analysis
      const hasCloudConsent = await this.checkCloudConsent();
      
      if (!hasCloudConsent) {
        return this.localAnalysis(input);
      }

      // Perform cloud-based analysis
      return this.cloudAnalysis(input);
    } catch (error) {
      console.error('Vision analysis failed:', error);
      return this.fallbackAnalysis();
    }
  }

  /**
   * Check if user has consented to cloud analysis
   */
  private async checkCloudConsent(): Promise<boolean> {
    const cacheKey = 'vision_cloud_consent';
    
    if (this.consentCache.has(cacheKey)) {
      return this.consentCache.get(cacheKey)!;
    }

    const hasConsent = await consentService.hasConsent('vision_cloud_analysis');
    
    if (!hasConsent) {
      // Show consent dialog
      const consent = await this.showConsentDialog();
      if (consent) {
        await consentService.recordConsent('vision_cloud_analysis', {
          purpose: 'Analyzing photos to generate captions and tags',
          dataUsage: 'Image data sent to OpenAI for analysis, not stored',
          retention: 'No data retention by third party'
        });
      }
      this.consentCache.set(cacheKey, consent);
      return consent;
    }

    this.consentCache.set(cacheKey, true);
    return true;
  }

  /**
   * Show consent dialog for cloud analysis
   */
  private async showConsentDialog(): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.innerHTML = `
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4">
            <h3 class="text-lg font-semibold mb-4">Enable Photo Analysis?</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
              To automatically describe your photos and suggest tags, we'll send images to OpenAI for analysis. 
              Your images are not stored by OpenAI.
            </p>
            <div class="flex gap-3 justify-end">
              <button id="vision-deny" class="px-4 py-2 text-gray-600 hover:text-gray-800">
                Not Now
              </button>
              <button id="vision-allow" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Allow Analysis
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      const cleanup = () => document.body.removeChild(dialog);

      dialog.querySelector('#vision-allow')?.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      dialog.querySelector('#vision-deny')?.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });
    });
  }

  /**
   * Cloud-based analysis using OpenAI Vision
   */
  private async cloudAnalysis(input: File | string): Promise<VisionAnalysisResult> {
    let imageData: string;

    if (input instanceof File) {
      imageData = await this.fileToDataURL(input);
    } else {
      imageData = input;
    }

    // Use existing photo analysis service
    const result = await modalityService.analyzePhoto(imageData, 'content');
    
    if (!result.success) {
      throw new Error(result.error || 'Photo analysis failed');
    }

    // Parse the analysis to extract structured data
    const analysis = result.analysis || '';
    const tags = this.extractTags(analysis);
    const typeHint = this.detectTypeHint(analysis);
    const joyScore = this.calculateJoyScore(analysis, tags);

    return {
      caption: analysis,
      tags,
      joyScore,
      typeHint,
      because: result.because || 'Analyzed using AI vision',
      confidence: 0.8 // Cloud analysis is typically high confidence
    };
  }

  /**
   * Local analysis fallback (basic pattern matching)
   */
  private async localAnalysis(input: File | string): Promise<VisionAnalysisResult> {
    // Basic local analysis - limited but privacy-first
    const timestamp = new Date().toLocaleString();
    
    let typeHint: VisionAnalysisResult['typeHint'] = 'scene';
    let tags: string[] = ['photo'];
    
    // Try OCR for text detection
    if (input instanceof File && receiptOCRService.isAvailable()) {
      try {
        const ocrResult = await receiptOCRService.extractText(input);
        if (ocrResult.success && ocrResult.text && ocrResult.text.length > 10) {
          typeHint = 'document';
          tags = ['photo', 'document', 'text'];
        }
      } catch (error) {
        console.log('OCR analysis failed, using basic analysis');
      }
    }

    return {
      caption: `Photo captured on ${timestamp}`,
      tags,
      typeHint,
      because: 'Local analysis - privacy protected',
      confidence: 0.3 // Local analysis has lower confidence
    };
  }

  /**
   * Fallback analysis when everything fails
   */
  private fallbackAnalysis(): VisionAnalysisResult {
    return {
      caption: 'Photo captured',
      tags: ['photo'],
      because: 'Analysis unavailable',
      confidence: 0.1
    };
  }

  /**
   * Extract tags from analysis text
   */
  private extractTags(analysis: string): string[] {
    const text = analysis.toLowerCase();
    const tags: string[] = ['photo'];

    // Common object/scene detection
    const patterns = {
      'food': /\b(food|meal|eating|restaurant|kitchen|cooking|plate|dish)\b/,
      'nature': /\b(tree|flower|garden|park|outdoor|landscape|sky|cloud)\b/,
      'people': /\b(person|people|face|smile|family|friend|group)\b/,
      'receipt': /\b(receipt|bill|payment|total|store|shop|purchase)\b/,
      'document': /\b(document|paper|text|form|letter|note)\b/,
      'pet': /\b(dog|cat|pet|animal)\b/,
      'travel': /\b(travel|vacation|trip|beach|mountain|city)\b/,
      'celebration': /\b(party|birthday|wedding|celebration|gift)\b/,
      'work': /\b(office|computer|meeting|desk|work)\b/,
      'home': /\b(home|house|room|bedroom|living room|kitchen)\b/
    };

    for (const [tag, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        tags.push(tag);
      }
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Detect type hint from analysis
   */
  private detectTypeHint(analysis: string): VisionAnalysisResult['typeHint'] {
    const text = analysis.toLowerCase();
    
    if (/receipt|bill|payment|total/.test(text)) return 'receipt';
    if (/document|paper|text|form/.test(text)) return 'document';
    if (/face|person|people|smile/.test(text)) return 'face';
    if (/food|meal|eating|plate/.test(text)) return 'food';
    if (/nature|tree|flower|landscape/.test(text)) return 'nature';
    
    return 'scene';
  }

  /**
   * Calculate joy score based on content
   */
  private calculateJoyScore(analysis: string, tags: string[]): number {
    const text = analysis.toLowerCase();
    let score = 0;

    // Positive indicators
    const joyKeywords = [
      'smile', 'happy', 'joy', 'celebration', 'party', 'birthday', 'wedding',
      'family', 'friends', 'vacation', 'beautiful', 'sunset', 'flowers',
      'pet', 'cute', 'fun', 'love', 'together', 'achievement', 'success'
    ];

    const joyTags = ['celebration', 'people', 'nature', 'pet', 'travel'];

    // Count joy indicators
    joyKeywords.forEach(keyword => {
      if (text.includes(keyword)) score += 0.1;
    });

    joyTags.forEach(tag => {
      if (tags.includes(tag)) score += 0.15;
    });

    // Bonus for multiple people (likely social moments)
    if (/\b(friends|family|group|together)\b/.test(text)) {
      score += 0.2;
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Convert File to data URL
   */
  private async fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Check if Joy detection is enabled
   */
  async isJoyDetectionEnabled(): Promise<boolean> {
    return await consentService.hasConsent('joy_detection');
  }

  /**
   * Clear consent cache (for testing)
   */
  clearConsentCache(): void {
    this.consentCache.clear();
  }
}

export const visionService = VisionService.getInstance();