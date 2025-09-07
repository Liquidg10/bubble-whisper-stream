import { locationService, LocationContext, PlaceResult } from '@/services/locationService';
import { useBubbleStore } from '@/stores/bubbleStore';

interface PhotoPromptContext {
  location?: PlaceResult;
  activity?: string;
  companion?: string;
  mood?: string;
  timeOfDay: string;
}

interface PhotoPrompt {
  id: string;
  message: string;
  context: PhotoPromptContext;
  urgency: 'low' | 'medium' | 'high';
  expiresAt: number;
  type: 'location' | 'activity' | 'moment';
}

class ContextualPhotoService {
  private activePrompts: Map<string, PhotoPrompt> = new Map();
  private lastPromptTime = 0;
  private promptCooldown = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.initializeLocationTracking();
  }

  private initializeLocationTracking() {
    locationService.on('placeDetected', (place) => {
      this.evaluateLocationPrompt(place);
    });

    locationService.on('contextChange', ({ current }) => {
      this.evaluateContextualPrompts(current);
    });
  }

  private evaluateLocationPrompt(place: PlaceResult) {
    const now = Date.now();
    if (now - this.lastPromptTime < this.promptCooldown) {
      return; // Too soon for another prompt
    }

    const context: PhotoPromptContext = {
      location: place,
      timeOfDay: this.getTimeOfDay(),
    };

    let prompt: PhotoPrompt | null = null;

    // Beach detection
    if (this.isBeachLocation(place)) {
      prompt = {
        id: `beach-${now}`,
        message: "You're at the beach! 🏖️ Perfect lighting for a beautiful memory. Want to capture this moment?",
        context,
        urgency: 'medium',
        expiresAt: now + (60 * 60 * 1000), // 1 hour
        type: 'location'
      };
    }

    // Disneyland/Theme park detection
    else if (this.isThemeParkLocation(place)) {
      const companionName = this.detectCompanion(); // Could analyze recent conversations
      prompt = {
        id: `themepark-${now}`,
        message: `You're at ${place.name}! ${companionName ? `Perfect time to capture memories with ${companionName}` : 'Great spot for some magical photos'} ✨`,
        context: { ...context, companion: companionName },
        urgency: 'high',
        expiresAt: now + (2 * 60 * 60 * 1000), // 2 hours
        type: 'location'
      };
    }

    // Restaurant/Special dining
    else if (this.isSpecialDiningLocation(place)) {
      prompt = {
        id: `dining-${now}`,
        message: `${place.name} looks amazing! Food photography moment? 📸`,
        context,
        urgency: 'low',
        expiresAt: now + (30 * 60 * 1000), // 30 minutes
        type: 'location'
      };
    }

    // Scenic viewpoint
    else if (this.isScenicLocation(place)) {
      prompt = {
        id: `scenic-${now}`,
        message: "Beautiful view ahead! This could be a perfect shot for your joy moments 🌅",
        context,
        urgency: 'medium',
        expiresAt: now + (45 * 60 * 1000), // 45 minutes
        type: 'location'
      };
    }

    if (prompt) {
      this.showPhotoPrompt(prompt);
    }
  }

  private evaluateContextualPrompts(context: LocationContext) {
    // Evaluate based on time, mood, activity patterns
    const timeOfDay = this.getTimeOfDay();
    
    // Golden hour photography suggestions
    if (this.isGoldenHour() && context.place) {
      const prompt: PhotoPrompt = {
        id: `goldenhour-${Date.now()}`,
        message: "Golden hour lighting! Perfect time for that magical photo ✨",
        context: { location: context.place, timeOfDay },
        urgency: 'high',
        expiresAt: Date.now() + (20 * 60 * 1000), // 20 minutes
        type: 'moment'
      };
      this.showPhotoPrompt(prompt);
    }
  }

  private async showPhotoPrompt(prompt: PhotoPrompt) {
    this.activePrompts.set(prompt.id, prompt);
    this.lastPromptTime = Date.now();

    // Add to store for UI display
    const { addBubble } = useBubbleStore.getState();
    
    const bubble = {
      id: `photo-prompt-${prompt.id}`,
      type: 'Thought' as const,
      content: prompt.message,
      tags: [
        { id: 'photo-prompt', name: 'photo-prompt', emoji: '📸' },
        { id: 'contextual', name: 'contextual', emoji: '📍' },
        { id: prompt.type, name: prompt.type, emoji: '✨' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: Math.random() * 300 + 50,
      y: Math.random() * 300 + 50,
      size: 0.8,
      metadata: {
        prompt,
        expiresAt: prompt.expiresAt,
        photoPrompt: true
      }
    };

    addBubble(bubble);

    // Auto-expire the prompt
    setTimeout(() => {
      this.expirePrompt(prompt.id);
    }, prompt.expiresAt - Date.now());
  }

  // Photo dump feature
  async initiatePhotoDump() {
    // Use file input to select multiple photos
    const photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.multiple = true;
    
    return new Promise<void>((resolve) => {
      photoInput.onchange = (e) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        if (files.length > 0) {
          const { addBubble } = useBubbleStore.getState();
          
          for (const file of files) {
            const bubble = {
              id: `dump-${Date.now()}-${Math.random()}`,
              type: 'Memory' as const,
              content: 'Photo dump moment',
              tags: [
                { id: 'photo-dump', name: 'photo-dump', emoji: '📱' },
                { id: 'joy', name: 'joy', emoji: '😊' },
                { id: 'batch', name: 'batch', emoji: '📸' }
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              x: Math.random() * 300 + 50,
              y: Math.random() * 300 + 50,
              size: 0.8,
              imageUri: URL.createObjectURL(file),
              metadata: {
                photoDump: true,
                batchImported: true
              }
            };
            
            addBubble(bubble);
          }
        }
        resolve();
      };
      
      photoInput.click();
    });
  }

  private dismissPrompt(promptId: string) {
    this.activePrompts.delete(promptId);
    
    // Remove from UI by deleting the bubble
    const { deleteBubble } = useBubbleStore.getState();
    deleteBubble(`photo-prompt-${promptId}`);
  }

  private expirePrompt(promptId: string) {
    if (this.activePrompts.has(promptId)) {
      this.dismissPrompt(promptId);
    }
  }

  // Location type detection helpers
  private isBeachLocation(place: PlaceResult): boolean {
    const beachTypes = ['beach', 'natural_feature'];
    const beachKeywords = ['beach', 'shore', 'coast', 'ocean', 'sea'];
    
    return beachTypes.some(type => place.types.includes(type)) ||
           beachKeywords.some(keyword => place.name.toLowerCase().includes(keyword));
  }

  private isThemeParkLocation(place: PlaceResult): boolean {
    const parkTypes = ['amusement_park', 'tourist_attraction'];
    const parkKeywords = ['disneyland', 'disney', 'theme park', 'adventure'];
    
    return parkTypes.some(type => place.types.includes(type)) ||
           parkKeywords.some(keyword => place.name.toLowerCase().includes(keyword));
  }

  private isSpecialDiningLocation(place: PlaceResult): boolean {
    const diningTypes = ['restaurant', 'meal_takeaway', 'food'];
    return diningTypes.some(type => place.types.includes(type)) &&
           (place.rating && place.rating > 4.0);
  }

  private isScenicLocation(place: PlaceResult): boolean {
    const scenicTypes = ['park', 'natural_feature', 'point_of_interest', 'tourist_attraction'];
    const scenicKeywords = ['view', 'lookout', 'scenic', 'overlook', 'gardens'];
    
    return scenicTypes.some(type => place.types.includes(type)) ||
           scenicKeywords.some(keyword => place.name.toLowerCase().includes(keyword));
  }

  private detectCompanion(): string | null {
    // This could analyze recent conversations or bubble content
    // For now, hardcode common names that might appear
    const recentConversations = useBubbleStore.getState().bubbles
      .filter(b => b.createdAt > Date.now() - 24 * 60 * 60 * 1000)
      .map(b => b.content?.toLowerCase() || '');

    const companionNames = ['pepper', 'family', 'friend'];
    for (const name of companionNames) {
      if (recentConversations.some(content => content.includes(name))) {
        return name;
      }
    }
    
    return null;
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'early-morning';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 20) return 'evening';
    return 'night';
  }

  private isGoldenHour(): boolean {
    const hour = new Date().getHours();
    // Golden hour: hour after sunrise or hour before sunset (approximate)
    return (hour >= 6 && hour <= 8) || (hour >= 18 && hour <= 20);
  }

  getActivePrompts(): PhotoPrompt[] {
    return Array.from(this.activePrompts.values());
  }
}

export const contextualPhotoService = new ContextualPhotoService();
export type { PhotoPrompt, PhotoPromptContext };