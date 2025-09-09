/**
 * Joy Contextual Intelligence Service
 * Combines calendar, email, and location data to generate contextual joy moments and photo nudges
 */

import { locationService, LocationContext } from './locationService';
import { conversationJoyService } from './conversationJoyService';
import { gmailIntentClassifier } from './gmailIntentClassifier';
import { storageService } from './storage';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';

export interface JoyMoment {
  id: string;
  title: string;
  description: string;
  source: 'calendar' | 'email' | 'location' | 'conversation';
  confidence: number;
  context: {
    location?: LocationContext;
    calendarEvent?: any;
    emailContext?: any;
    timing: 'current' | 'upcoming' | 'past';
  };
  joyType: 'celebration' | 'milestone' | 'experience' | 'memory' | 'accomplishment';
  photoNudge?: {
    message: string;
    priority: 'low' | 'medium' | 'high';
    expiresAt: number;
  };
  createdAt: number;
  favorited?: boolean;
  archived?: boolean;
}

export interface ContextualNudge {
  id: string;
  type: 'photo' | 'reflection' | 'celebration';
  message: string;
  triggerContext: {
    location?: boolean;
    calendar?: boolean;
    email?: boolean;
    safety?: boolean;
  };
  safetyCheck: {
    inVehicle: boolean;
    quietHours: boolean;
    locationSafe: boolean;
  };
  priority: 'low' | 'medium' | 'high';
  expiresAt: number;
  dismissible: boolean;
}

export interface JoyPattern {
  pattern: string;
  keywords: string[];
  locations: string[];
  timePatterns: string[];
  confidence: number;
}

class JoyContextualService {
  private static instance: JoyContextualService;
  private storagePrefix = 'joy_contextual_';
  private activeNudges = new Map<string, ContextualNudge>();
  private nudgeFrequency = new Map<string, number>();
  private lastNudgeTime = new Map<string, number>();
  private joyPatterns: JoyPattern[] = [];

  // Joy-specific event patterns
  private joyEventPatterns = [
    { keywords: ['recital', 'performance', 'concert'], type: 'celebration', priority: 'high' },
    { keywords: ['graduation', 'birthday', 'anniversary'], type: 'milestone', priority: 'high' },
    { keywords: ['vacation', 'trip', 'beach', 'sunset'], type: 'experience', priority: 'medium' },
    { keywords: ['achievement', 'promotion', 'award'], type: 'accomplishment', priority: 'high' },
    { keywords: ['family', 'reunion', 'gathering'], type: 'memory', priority: 'medium' },
    { keywords: ['wedding', 'engagement', 'celebration'], type: 'celebration', priority: 'high' },
    { keywords: ['festival', 'party', 'event'], type: 'experience', priority: 'medium' }
  ];

  static getInstance(): JoyContextualService {
    if (!JoyContextualService.instance) {
      JoyContextualService.instance = new JoyContextualService();
    }
    return JoyContextualService.instance;
  }

  constructor() {
    this.initializeService();
  }

  private async initializeService() {
    // Load stored patterns and settings
    await this.loadJoyPatterns();
    
    // Set up location tracking for contextual nudges
    locationService.on('locationUpdate', this.handleLocationUpdate.bind(this));
    locationService.on('placeDetected', this.handlePlaceDetected.bind(this));
  }

  async generateJoyMoments(): Promise<JoyMoment[]> {
    const joyMoments: JoyMoment[] = [];

    // Get calendar-based joy moments
    const calendarMoments = await this.extractCalendarJoyMoments();
    joyMoments.push(...calendarMoments);

    // Get email-based joy moments
    const emailMoments = await this.extractEmailJoyMoments();
    joyMoments.push(...emailMoments);

    // Get location-based joy moments
    const locationMoments = await this.extractLocationJoyMoments();
    joyMoments.push(...locationMoments);

    // Get conversation-based joy moments
    const conversationMoments = await this.extractConversationJoyMoments();
    joyMoments.push(...conversationMoments);

    // Sort by confidence and recency
    return joyMoments.sort((a, b) => {
      const scoreA = a.confidence + (Date.now() - a.createdAt > 86400000 ? -0.1 : 0);
      const scoreB = b.confidence + (Date.now() - b.createdAt > 86400000 ? -0.1 : 0);
      return scoreB - scoreA;
    });
  }

  private async extractCalendarJoyMoments(): Promise<JoyMoment[]> {
    const joyMoments: JoyMoment[] = [];
    
    try {
      // Simulate calendar events (would integrate with actual calendar service)
      const mockCalendarEvents = [
        {
          title: "Pepper's Piano Recital",
          date: new Date(Date.now() + 86400000), // Tomorrow
          location: "Music Academy",
          description: "Annual spring recital performance"
        }
      ];

      for (const event of mockCalendarEvents) {
        const joyPattern = this.detectJoyPattern(event.title + ' ' + event.description);
        
        if (joyPattern.confidence > 0.6) {
          const moment: JoyMoment = {
            id: `cal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: event.title,
            description: `Upcoming event: ${event.description}`,
            source: 'calendar',
            confidence: joyPattern.confidence,
            context: {
              calendarEvent: event,
              timing: this.getEventTiming(event.date)
            },
            joyType: this.getJoyType(joyPattern.pattern),
            photoNudge: this.generatePhotoNudge(event, joyPattern),
            createdAt: Date.now()
          };

          joyMoments.push(moment);
        }
      }
    } catch (error) {
      console.warn('Failed to extract calendar joy moments:', error);
    }

    return joyMoments;
  }

  private async extractEmailJoyMoments(): Promise<JoyMoment[]> {
    const joyMoments: JoyMoment[] = [];
    
    try {
      // Would integrate with actual Gmail service
      const mockEmailIntents = [
        {
          subject: "Ticket Confirmation - Pepper's Recital",
          intent: "event_confirmation",
          confidence: 0.9,
          extractedData: { event: "recital", date: "tomorrow" }
        }
      ];

      for (const email of mockEmailIntents) {
        if (email.intent === 'event_confirmation' || email.intent === 'celebration') {
          const joyPattern = this.detectJoyPattern(email.subject);
          
          if (joyPattern.confidence > 0.5) {
            const moment: JoyMoment = {
              id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              title: `Email: ${email.subject}`,
              description: `Confirmed event detected in email`,
              source: 'email',
              confidence: Math.min(joyPattern.confidence, email.confidence),
              context: {
                emailContext: email,
                timing: 'upcoming'
              },
              joyType: this.getJoyType(joyPattern.pattern),
              createdAt: Date.now()
            };

            joyMoments.push(moment);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract email joy moments:', error);
    }

    return joyMoments;
  }

  private async extractLocationJoyMoments(): Promise<JoyMoment[]> {
    const joyMoments: JoyMoment[] = [];
    const currentLocation = locationService.getLocationContext();
    
    if (!currentLocation?.place) return joyMoments;

    // Check for joy-worthy locations
    const joyLocations = [
      { types: ['amusement_park', 'tourist_attraction'], joy: 'experience' },
      { types: ['beach'], joy: 'experience' },
      { types: ['park', 'recreational'], joy: 'experience' },
      { types: ['restaurant', 'cafe'], joy: 'experience' },
      { types: ['theater', 'concert_hall'], joy: 'celebration' }
    ];

    for (const joyLoc of joyLocations) {
      if (currentLocation.place.types?.some(type => joyLoc.types.includes(type))) {
        const moment: JoyMoment = {
          id: `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: `At ${currentLocation.place.name}`,
          description: `Currently at a joyful location`,
          source: 'location',
          confidence: 0.7,
          context: {
            location: currentLocation,
            timing: 'current'
          },
          joyType: joyLoc.joy as any,
          photoNudge: {
            message: `Perfect moment for a photo at ${currentLocation.place.name}!`,
            priority: this.isGoldenHour() ? 'high' : 'medium',
            expiresAt: Date.now() + 1800000 // 30 minutes
          },
          createdAt: Date.now()
        };

        joyMoments.push(moment);
      }
    }

    return joyMoments;
  }

  private async extractConversationJoyMoments(): Promise<JoyMoment[]> {
    const joyMoments: JoyMoment[] = [];
    
    try {
      const joyfulConversations = await conversationJoyService.getJoyfulConversations(10);
      
      for (const conversation of joyfulConversations) {
        if (conversation.joyScore > 0.7) {
          const moment: JoyMoment = {
            id: `conv_${conversation.id}`,
            title: `Joyful Conversation`,
            description: conversation.userMessage.slice(0, 100) + '...',
            source: 'conversation',
            confidence: conversation.joyScore,
            context: {
              timing: 'past'
            },
            joyType: 'memory',
            createdAt: new Date(conversation.timestamp).getTime()
          };

          joyMoments.push(moment);
        }
      }
    } catch (error) {
      console.warn('Failed to extract conversation joy moments:', error);
    }

    return joyMoments;
  }

  private detectJoyPattern(text: string): JoyPattern {
    const textLower = text.toLowerCase();
    let bestMatch: JoyPattern = {
      pattern: 'default',
      keywords: [],
      locations: [],
      timePatterns: [],
      confidence: 0
    };

    for (const pattern of this.joyEventPatterns) {
      const matchCount = pattern.keywords.filter(keyword => 
        textLower.includes(keyword.toLowerCase())
      ).length;
      
      if (matchCount > 0) {
        const confidence = Math.min(0.9, (matchCount / pattern.keywords.length) + 0.3);
        
        if (confidence > bestMatch.confidence) {
          bestMatch = {
            pattern: pattern.type,
            keywords: pattern.keywords.filter(k => textLower.includes(k.toLowerCase())),
            locations: [],
            timePatterns: [],
            confidence
          };
        }
      }
    }

    return bestMatch;
  }

  private getJoyType(pattern: string): 'celebration' | 'milestone' | 'experience' | 'memory' | 'accomplishment' {
    const typeMap: Record<string, any> = {
      celebration: 'celebration',
      milestone: 'milestone',
      experience: 'experience',
      accomplishment: 'accomplishment',
      memory: 'memory'
    };
    
    return typeMap[pattern] || 'memory';
  }

  private getEventTiming(eventDate: Date): 'current' | 'upcoming' | 'past' {
    const now = Date.now();
    const eventTime = eventDate.getTime();
    const timeDiff = eventTime - now;
    
    if (Math.abs(timeDiff) < 3600000) return 'current'; // Within 1 hour
    if (timeDiff > 0) return 'upcoming';
    return 'past';
  }

  private generatePhotoNudge(event: any, pattern: JoyPattern): JoyMoment['photoNudge'] {
    const messages = [
      `Capture this moment at ${event.title}!`,
      `Perfect photo opportunity at ${event.location}`,
      `Don't forget to photograph this special moment`,
      `This looks like a memory worth capturing`
    ];

    return {
      message: messages[Math.floor(Math.random() * messages.length)],
      priority: pattern.confidence > 0.8 ? 'high' : 'medium',
      expiresAt: Date.now() + 7200000 // 2 hours
    };
  }

  private isGoldenHour(): boolean {
    const now = new Date();
    const hour = now.getHours();
    // Golden hour is roughly 6-8 AM and 5-7 PM
    return (hour >= 6 && hour <= 8) || (hour >= 17 && hour <= 19);
  }

  // Nudge Management
  async generateContextualNudge(joyMoment: JoyMoment): Promise<ContextualNudge | null> {
    // Safety checks first
    const safetyCheck = await this.performSafetyCheck();
    
    if (!safetyCheck.locationSafe || safetyCheck.inVehicle || safetyCheck.quietHours) {
      return null;
    }

    // Check nudge frequency limits
    const nudgeKey = `${joyMoment.source}_${joyMoment.joyType}`;
    if (!this.shouldShowNudge(nudgeKey)) {
      return null;
    }

    const nudge: ContextualNudge = {
      id: `nudge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: joyMoment.photoNudge ? 'photo' : 'reflection',
      message: joyMoment.photoNudge?.message || `Reflect on this joy moment: ${joyMoment.title}`,
      triggerContext: {
        location: joyMoment.source === 'location',
        calendar: joyMoment.source === 'calendar',
        email: joyMoment.source === 'email'
      },
      safetyCheck,
      priority: joyMoment.photoNudge?.priority || 'medium',
      expiresAt: joyMoment.photoNudge?.expiresAt || Date.now() + 3600000,
      dismissible: true
    };

    this.activeNudges.set(nudge.id, nudge);
    this.updateNudgeFrequency(nudgeKey);
    
    return nudge;
  }

  private async performSafetyCheck(): Promise<ContextualNudge['safetyCheck']> {
    const location = locationService.getLocationContext();
    
    return {
      inVehicle: await this.detectVehicleMovement(),
      quietHours: this.isQuietHours(),
      locationSafe: this.isLocationSafe(location)
    };
  }

  private async detectVehicleMovement(): Promise<boolean> {
    // Simple movement detection - in a real implementation this would be more sophisticated
    try {
      if (navigator.geolocation) {
        return new Promise((resolve) => {
          let positions: GeolocationPosition[] = [];
          
          const watchId = navigator.geolocation.watchPosition(
            (position) => {
              positions.push(position);
              
              if (positions.length >= 3) {
                navigator.geolocation.clearWatch(watchId);
                
                // Calculate speed between positions
                const speeds = positions.slice(1).map((pos, i) => {
                  const prev = positions[i];
                  const distance = this.calculateDistance(
                    { lat: prev.coords.latitude, lng: prev.coords.longitude },
                    { lat: pos.coords.latitude, lng: pos.coords.longitude }
                  );
                  const timeMs = pos.timestamp - prev.timestamp;
                  return (distance / timeMs) * 3600000; // km/h
                });
                
                const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
                resolve(avgSpeed > 10); // Consider moving if > 10 km/h
              }
            },
            () => resolve(false),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
          );
          
          // Timeout fallback
          setTimeout(() => {
            navigator.geolocation.clearWatch(watchId);
            resolve(false);
          }, 5000);
        });
      }
    } catch (error) {
      console.warn('Vehicle detection failed:', error);
    }
    
    return false;
  }

  private calculateDistance(pos1: { lat: number; lng: number }, pos2: { lat: number; lng: number }): number {
    const R = 6371; // Earth's radius in km
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private isQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    
    // Default quiet hours: 10 PM to 7 AM
    const quietStart = 22;
    const quietEnd = 7;
    
    return hour >= quietStart || hour <= quietEnd;
  }

  private isLocationSafe(location: LocationContext | null): boolean {
    if (!location?.place) return true;
    
    // Avoid nudging in potentially unsafe locations
    const unsafeTypes = ['hospital', 'cemetery', 'police', 'fire_station'];
    return !location.place.types?.some(type => unsafeTypes.includes(type));
  }

  private shouldShowNudge(nudgeKey: string): boolean {
    const lastNudge = this.lastNudgeTime.get(nudgeKey) || 0;
    const frequency = this.nudgeFrequency.get(nudgeKey) || 0;
    const now = Date.now();
    
    // Minimum time between nudges increases with frequency
    const minInterval = Math.min(3600000 * Math.pow(2, frequency), 86400000); // Max 24 hours
    
    return now - lastNudge > minInterval;
  }

  private updateNudgeFrequency(nudgeKey: string) {
    const current = this.nudgeFrequency.get(nudgeKey) || 0;
    this.nudgeFrequency.set(nudgeKey, current + 1);
    this.lastNudgeTime.set(nudgeKey, Date.now());
  }

  // Event handlers
  private async handleLocationUpdate(context: LocationContext) {
    const joyMoments = await this.extractLocationJoyMoments();
    
    for (const moment of joyMoments) {
      const nudge = await this.generateContextualNudge(moment);
      if (nudge) {
        this.emitNudge(nudge);
      }
    }
  }

  private async handlePlaceDetected(place: any) {
    // Generate contextual joy moments when arriving at special places
    const joyMoments = await this.extractLocationJoyMoments();
    
    for (const moment of joyMoments) {
      if (moment.context.location?.place?.place_id === place.place_id) {
        const nudge = await this.generateContextualNudge(moment);
        if (nudge) {
          this.emitNudge(nudge);
        }
      }
    }
  }

  private emitNudge(nudge: ContextualNudge) {
    // Create a joy chip bubble in the store
    const { addBubble } = useBubbleStore.getState();
    
    addBubble({
      id: nudge.id,
      type: 'ReminderNote',
      content: nudge.message,
      tags: [
        { id: `tag_${Date.now()}_1`, name: 'joy-nudge', colorHex: '#ff6b9d' },
        { id: `tag_${Date.now()}_2`, name: `priority-${nudge.priority}`, colorHex: '#4ade80' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: Math.random() * 800,
      y: Math.random() * 600,
      size: 0.7,
      metadata: {
        joy: {
          nudgeType: nudge.type,
          priority: nudge.priority,
          expiresAt: nudge.expiresAt,
          triggerContext: nudge.triggerContext
        }
      }
    } as Bubble);
  }

  // User actions
  async favoriteJoyMoment(momentId: string): Promise<void> {
    try {
      const stored = localStorage.getItem(`${this.storagePrefix}moments`);
      const moments: JoyMoment[] = stored ? JSON.parse(stored) : [];
      
      const momentIndex = moments.findIndex(m => m.id === momentId);
      if (momentIndex !== -1) {
        moments[momentIndex].favorited = true;
        localStorage.setItem(`${this.storagePrefix}moments`, JSON.stringify(moments));
      }
    } catch (error) {
      console.warn('Failed to favorite joy moment:', error);
    }
  }

  async archiveJoyMoment(momentId: string): Promise<void> {
    try {
      const stored = localStorage.getItem(`${this.storagePrefix}moments`);
      const moments: JoyMoment[] = stored ? JSON.parse(stored) : [];
      
      const momentIndex = moments.findIndex(m => m.id === momentId);
      if (momentIndex !== -1) {
        moments[momentIndex].archived = true;
        localStorage.setItem(`${this.storagePrefix}moments`, JSON.stringify(moments));
      }
    } catch (error) {
      console.warn('Failed to archive joy moment:', error);
    }
  }

  async dismissNudge(nudgeId: string): Promise<void> {
    const nudge = this.activeNudges.get(nudgeId);
    if (nudge) {
      this.activeNudges.delete(nudgeId);
      
      // Record dismissal for fatigue model
      const dismissalKey = `${nudge.type}_${nudge.priority}`;
      this.updateNudgeFrequency(dismissalKey);
    }
  }

  private async loadJoyPatterns() {
    try {
      const stored = localStorage.getItem(`${this.storagePrefix}patterns`);
      this.joyPatterns = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load joy patterns:', error);
      this.joyPatterns = [];
    }
  }

  // Public getters
  getActiveNudges(): ContextualNudge[] {
    return Array.from(this.activeNudges.values());
  }

  async getJoyMoments(): Promise<JoyMoment[]> {
    return this.generateJoyMoments();
  }
}

export const joyContextualService = JoyContextualService.getInstance();