/**
 * OAuth Token Encryption Service
 * Handles server-side encryption of OAuth tokens for security
 */

const ENCRYPTION_KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM

class OAuthTokenEncryption {
  private encryptionKey: CryptoKey | null = null;

  /**
   * Initialize encryption key from environment or generate new one
   */
  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    // In production, get this from environment variable
    const keyMaterial = new TextEncoder().encode(
      process.env.OAUTH_ENCRYPTION_KEY || 'default-oauth-encryption-key-change-me-in-production'
    );

    // Derive a proper encryption key
    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial.slice(0, ENCRYPTION_KEY_LENGTH),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );

    this.encryptionKey = key;
    return key;
  }

  /**
   * Encrypt OAuth token
   */
  async encryptToken(plaintext: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Return base64 encoded
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Token encryption failed:', error);
      // In case of encryption failure, return plaintext (fallback)
      return plaintext;
    }
  }

  /**
   * Decrypt OAuth token
   */
  async decryptToken(encryptedData: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();
      
      // Decode from base64
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );

      // Extract IV and encrypted data
      const iv = combined.slice(0, IV_LENGTH);
      const encrypted = combined.slice(IV_LENGTH);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Token decryption failed:', error);
      // In case of decryption failure, assume it's already plaintext
      return encryptedData;
    }
  }

  /**
   * Check if token appears to be encrypted
   */
  isEncrypted(token: string): boolean {
    try {
      // Encrypted tokens are base64 and have specific length characteristics
      return token.length > 100 && /^[A-Za-z0-9+/]+=*$/.test(token);
    } catch {
      return false;
    }
  }
}

export const oauthTokenEncryption = new OAuthTokenEncryption();