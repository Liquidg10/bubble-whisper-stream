/**
 * TTS Diagnostic Testing Strategy
 * 
 * This file outlines tests to validate the base64 encoding hypothesis
 * and raise confidence in the fix from 85% to 95%+
 */
import { supabaseConfig } from '@/integrations/supabase/client';

async function requestDiagnosticAudio(payload: Record<string, string>): Promise<Response> {
  try {
    return await fetch(`${supabaseConfig.url}/functions/v1/ai-tts-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseConfig.publishableKey,
        // Validated legacy anonymous keys are JWTs. Modern publishable keys
        // identify the project but are not user JWTs or fresh authorization.
        ...(!supabaseConfig.publishableKey.startsWith('sb_publishable_')
          ? { Authorization: `Bearer ${supabaseConfig.publishableKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Fetch errors can reflect request headers. Never propagate their payload.
    throw new Error('Diagnostic audio request failed.');
  }
}

export interface TTSDiagnosticResult {
  testName: string;
  passed: boolean;
  details: string;
  confidence: number;
}

export class TTSDiagnostic {
  /**
   * Test 1: Current Edge Function Encoding Validation
   * Test the actual encoding method used in the current edge function
   */
  static async testBase64Encoding(): Promise<TTSDiagnosticResult> {
    console.log('🧪 Testing current edge function base64 encoding method...');
    
    // Create test binary data (simulated MP3 header)
    const testBinary = new Uint8Array([
      0xFF, 0xFB, 0x90, 0x00, // MP3 frame header
      0x00, 0x00, 0x00, 0x00,
      0x49, 0x6E, 0x66, 0x6F  // "Info" tag
    ]);

    try {
      // Current edge function method (from line 106-111 in ai-tts-generate)
      let binary = '';
      const len = testBinary.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(testBinary[i]);
      }
      const currentMethodResult = btoa(binary);

      // Test if it decodes correctly
      const decoded = atob(currentMethodResult);
      const decodedBytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        decodedBytes[i] = decoded.charCodeAt(i);
      }

      const integritePassed = decodedBytes.every((byte, i) => byte === testBinary[i]);
      
      return {
        testName: 'Current Base64 Encoding',
        passed: integritePassed,
        details: `Edge function encoding method integrity: ${integritePassed ? 'PASSED' : 'FAILED'} - ${integritePassed ? 'Encoding/decoding preserves binary data' : 'Data corruption detected'}`,
        confidence: integritePassed ? 95 : 85
      };
    } catch (error) {
      return {
        testName: 'Current Base64 Encoding',
        passed: false,
        details: `Encoding test failed: ${error.message}`,
        confidence: 80
      };
    }
  }

  /**
   * Test 2: Audio Element Validation
   * Test if browser can play the generated audio
   */
  static async testAudioPlayability(base64Audio: string): Promise<TTSDiagnosticResult> {
    return new Promise((resolve) => {
      const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
      
      const timeout = setTimeout(() => {
        resolve({
          testName: 'Audio Playability',
          passed: false,
          details: 'Audio load timeout - likely corrupt base64',
          confidence: 90
        });
      }, 5000);

      audio.oncanplaythrough = () => {
        clearTimeout(timeout);
        resolve({
          testName: 'Audio Playability',
          passed: true,
          details: 'Audio loaded successfully',
          confidence: 85
        });
      };

      audio.onerror = (e) => {
        clearTimeout(timeout);
        resolve({
          testName: 'Audio Playability',
          passed: false,
          details: `Audio error: ${audio.error?.message || 'Unknown error'}`,
          confidence: 95
        });
      };

      audio.load();
    });
  }

  /**
   * Test 3: Edge Function Response Validation
   * Test the actual edge function response format
   */
  static async testEdgeFunctionResponse(): Promise<TTSDiagnosticResult> {
    try {
      console.log('Testing edge function deployment and response...');
      
      const response = await requestDiagnosticAudio({
        text: 'Test audio generation for diagnostics.',
        voice: 'alloy',
        tone: 'neutral',
        context: 'diagnostic'
      });

      console.log('Edge function response status:', response.status);
      
      if (!response.ok) {
        return {
          testName: 'Edge Function Response',
          passed: false,
          details: `Function request rejected (HTTP ${response.status}). Diagnostic access or deployment is not verified.`,
          confidence: response.status === 404 ? 98 : 70
        };
      }

      // Try to parse JSON response
      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (parseError) {
        return {
          testName: 'Edge Function Response',
          passed: false,
          details: 'The function returned an invalid diagnostic response.',
          confidence: 85
        };
      }

      const hasAudioContent = data.audioContent && typeof data.audioContent === 'string';
      const isValidBase64Length = hasAudioContent && data.audioContent.length > 100;

      return {
        testName: 'Edge Function Response',
        passed: hasAudioContent && isValidBase64Length,
        details: `Audio content exists: ${hasAudioContent}, Content length: ${data.audioContent?.length || 0}`,
        confidence: (hasAudioContent && isValidBase64Length) ? 95 : 65
      };
    } catch (error) {
      console.error('Edge function diagnostic request failed.');
      return {
        testName: 'Edge Function Response',
        passed: false,
        details: 'Diagnostic request failed. Network access and deployment are not verified.',
        confidence: 80
      };
    }
  }

  /**
   * Test 4: Binary Integrity Check
   * Verify MP3 header integrity after encoding/decoding
   */
  static testBinaryIntegrity(base64Audio: string): TTSDiagnosticResult {
    try {
      const decoded = atob(base64Audio);
      const bytes = new Uint8Array(decoded.length);
      
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }

      // Check for MP3 header (first 2 bytes should be 0xFF 0xFB or similar)
      const hasValidMP3Header = bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0;
      
      return {
        testName: 'Binary Integrity',
        passed: hasValidMP3Header,
        details: `MP3 header: ${bytes[0].toString(16)} ${bytes[1].toString(16)}`,
        confidence: hasValidMP3Header ? 85 : 92
      };
    } catch (error) {
      return {
        testName: 'Binary Integrity',
        passed: false,
        details: `Decoding error: ${error.message}`,
        confidence: 95
      };
    }
  }

  /**
   * Run complete diagnostic suite
   */
  static async runCompleteDiagnostic(): Promise<{
    results: TTSDiagnosticResult[];
    overallConfidence: number;
    recommendation: string;
  }> {
    const results: TTSDiagnosticResult[] = [];

    // Run all tests
    results.push(await this.testBase64Encoding());
    
    // Get sample audio from edge function for further testing
    const edgeFunctionResult = await this.testEdgeFunctionResponse();
    results.push(edgeFunctionResult);

    if (edgeFunctionResult.passed) {
      // Only run audio tests if we have valid base64
      const response = await requestDiagnosticAudio({ text: 'Test', voice: 'alloy' });
      let data;
      try {
        if (!response.ok) throw new Error('Diagnostic sample rejected.');
        data = await response.json();
      } catch {
        throw new Error('Diagnostic audio sample is unavailable.');
      }
      
      if (data.audioContent) {
        results.push(await this.testAudioPlayability(data.audioContent));
        results.push(this.testBinaryIntegrity(data.audioContent));
      }
    }

    // Calculate overall confidence with weighted scoring
    const passedTests = results.filter(r => r.passed);
    const failedTests = results.filter(r => !r.passed);
    
    let overallConfidence: number;
    if (passedTests.length === results.length) {
      // All tests passed - high confidence system is working
      overallConfidence = Math.min(95, passedTests.reduce((sum, r) => sum + r.confidence, 0) / passedTests.length);
    } else if (failedTests.length === 1 && results.length > 2) {
      // Only one test failed - moderate confidence  
      overallConfidence = 70;
    } else {
      // Multiple failures - use average of failed test confidences
      overallConfidence = Math.min(50, failedTests.reduce((sum, r) => sum + r.confidence, 0) / failedTests.length);
    }

    const recommendation = passedTests.length === results.length
      ? 'High confidence: TTS system is functioning correctly'
      : failedTests.length >= 3 
      ? 'High confidence: Multiple system issues detected - investigate base64 encoding and audio format'
      : failedTests.length >= 1
      ? 'Medium confidence: Some issues detected - check specific failed tests'
      : 'System appears healthy';

    return {
      results,
      overallConfidence,
      recommendation
    };
  }
}

/**
 * Quick test runner for console
 */
export const runTTSDiagnostic = async () => {
  console.log('🔍 Running TTS Diagnostic Suite...');
  const diagnostic = await TTSDiagnostic.runCompleteDiagnostic();
  
  console.log('\n📊 Results:');
  diagnostic.results.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.testName}: ${result.details} (${result.confidence}% confidence)`);
  });
  
  console.log(`\n🎯 Overall Confidence: ${diagnostic.overallConfidence}%`);
  console.log(`💡 Recommendation: ${diagnostic.recommendation}`);
  
  return diagnostic;
};
