// Biometric authentication service for Deep privacy layer access
// In a real React Native app, this would use expo-local-authentication

export interface BiometricCapabilities {
  available: boolean;
  enrolled: boolean;
  types: ('fingerprint' | 'facial' | 'passcode')[];
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  warning?: string;
}

class BiometricService {
  private lastAuthTime: number = 0;
  private readonly AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  async getCapabilities(): Promise<BiometricCapabilities> {
    // Mock implementation for web
    // In React Native, this would use expo-local-authentication
    return {
      available: true,
      enrolled: true,
      types: ['passcode'] // Web fallback
    };
  }

  async authenticate(reason: string = 'Access private information'): Promise<BiometricAuthResult> {
    // Check if recently authenticated
    const now = Date.now();
    if (now - this.lastAuthTime < this.AUTH_TIMEOUT) {
      return { success: true };
    }

    try {
      // Mock implementation for web
      // In React Native, this would use expo-local-authentication
      const userConfirmed = window.confirm(
        `${reason}\n\nIn a real app, this would use biometric authentication (fingerprint, Face ID, etc.)`
      );

      if (userConfirmed) {
        this.lastAuthTime = now;
        return { success: true };
      } else {
        return { 
          success: false, 
          error: 'Authentication cancelled by user' 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        error: 'Biometric authentication failed' 
      };
    }
  }

  async requireAuthForDeepLayer(): Promise<boolean> {
    const capabilities = await this.getCapabilities();
    
    if (!capabilities.available || !capabilities.enrolled) {
      // Fallback to passcode or allow access with warning
      const result = await this.authenticate('Access requires authentication for privacy protection');
      return result.success;
    }

    const result = await this.authenticate('Verify your identity to access private information');
    return result.success;
  }

  clearAuthSession(): void {
    this.lastAuthTime = 0;
  }

  isRecentlyAuthenticated(): boolean {
    const now = Date.now();
    return (now - this.lastAuthTime) < this.AUTH_TIMEOUT;
  }
}

export const biometricService = new BiometricService();