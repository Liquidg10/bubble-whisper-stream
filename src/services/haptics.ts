// Haptics service for gentle interaction feedback

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

class HapticsService {
  private isSupported = false;

  constructor() {
    // Check if navigator.vibrate is supported
    this.isSupported = 'vibrate' in navigator;
  }

  private vibrate(pattern: number | number[]): void {
    if (!this.isSupported) return;
    
    try {
      navigator.vibrate(pattern);
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  tap(): void {
    this.vibrate(10);
  }

  doubleTap(): void {
    this.vibrate([10, 50, 10]);
  }

  success(): void {
    this.vibrate([10, 30, 10]);
  }

  warning(): void {
    this.vibrate([20, 50, 20]);
  }

  error(): void {
    this.vibrate([50, 100, 50]);
  }

  gentle(): void {
    this.vibrate(5);
  }

  pulse(): void {
    this.vibrate([100, 100, 100]);
  }

  trigger(type: HapticType): void {
    switch (type) {
      case 'light':
        this.gentle();
        break;
      case 'medium':
        this.tap();
        break;
      case 'heavy':
        this.doubleTap();
        break;
      case 'success':
        this.success();
        break;
      case 'warning':
        this.warning();
        break;
      case 'error':
        this.error();
        break;
      default:
        this.tap();
    }
  }

  isAvailable(): boolean {
    return this.isSupported;
  }
}

export const hapticsService = new HapticsService();