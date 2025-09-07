interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  types: string[];
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  rating?: number;
  photos?: Array<{
    photo_reference: string;
  }>;
}

interface LocationContext {
  place?: PlaceResult;
  coordinates: {
    lat: number;
    lng: number;
  };
  accuracy?: number;
  timestamp: number;
}

interface LocationServiceEvents {
  locationUpdate: LocationContext;
  placeDetected: PlaceResult;
  contextChange: {
    previous?: LocationContext;
    current: LocationContext;
  };
}

class LocationService {
  private apiKey: string | null = null;
  private lastKnownLocation: LocationContext | null = null;
  private eventListeners: Map<keyof LocationServiceEvents, Function[]> = new Map();
  private watchId: number | null = null;
  private placesService: any = null; // Use any for now to avoid google types

  constructor() {
    this.initializeGoogleMaps();
  }

  private async initializeGoogleMaps() {
    // Check if Google Maps is already loaded
    if (typeof window !== 'undefined' && (window as any).google?.maps) {
      this.initializePlacesService();
      return;
    }

    // Load Google Maps API
    try {
      await this.loadGoogleMapsScript();
      this.initializePlacesService();
    } catch (error) {
      console.warn('Failed to load Google Maps API:', error);
    }
  }

  private loadGoogleMapsScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window !== 'undefined' && (window as any).google) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.getApiKey()}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Maps script'));
      document.head.appendChild(script);
    });
  }

  private initializePlacesService() {
    if (typeof window !== 'undefined' && (window as any).google?.maps) {
      const map = new (window as any).google.maps.Map(document.createElement('div'));
      this.placesService = new (window as any).google.maps.places.PlacesService(map);
    }
  }

  private getApiKey(): string {
    if (!this.apiKey) {
      // This should be loaded from environment/config
      this.apiKey = 'YOUR_GOOGLE_MAPS_API_KEY'; // This will be replaced by the actual key
    }
    return this.apiKey;
  }

  async requestLocationPermission(): Promise<boolean> {
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported');
      return false;
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (permission.state === 'granted') {
        return true;
      } else if (permission.state === 'prompt') {
        // Try to get location to trigger permission prompt
        await this.getCurrentLocation();
        return true;
      }
      return false;
    } catch (error) {
      console.warn('Permission check failed:', error);
      return false;
    }
  }

  async getCurrentLocation(): Promise<LocationContext | null> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const context: LocationContext = {
            coordinates: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
            accuracy: position.coords.accuracy,
            timestamp: Date.now(),
          };

          this.updateLocationContext(context);
          resolve(context);
        },
        (error) => {
          console.warn('Geolocation error:', error);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        }
      );
    });
  }

  startLocationTracking(): void {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported');
      return;
    }

    if (this.watchId !== null) {
      this.stopLocationTracking();
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const context: LocationContext = {
          coordinates: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        };

        this.updateLocationContext(context);
      },
      (error) => {
        console.warn('Location tracking error:', error);
      },
      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 600000, // 10 minutes
      }
    );
  }

  stopLocationTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  async findNearbyPlaces(
    location: { lat: number; lng: number },
    radius: number = 100,
    types: string[] = ['establishment']
  ): Promise<PlaceResult[]> {
    if (!this.placesService) {
      console.warn('Places service not initialized');
      return [];
    }

    return new Promise((resolve) => {
      const google = (window as any).google;
      if (!this.placesService || !google) {
        resolve([]);
        return;
      }

      const request = {
        location: new google.maps.LatLng(location.lat, location.lng),
        radius,
        types,
      };

      this.placesService.nearbySearch(request, (results: any[], status: any) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          const places: PlaceResult[] = results.map(place => ({
            place_id: place.place_id!,
            name: place.name!,
            formatted_address: place.vicinity || '',
            types: place.types || [],
            geometry: {
              location: {
                lat: place.geometry!.location!.lat(),
                lng: place.geometry!.location!.lng(),
              },
            },
            rating: place.rating,
            photos: place.photos?.map(photo => ({
              photo_reference: photo.getUrl({ maxWidth: 400 }),
            })),
          }));
          resolve(places);
        } else {
          console.warn('Places search failed:', status);
          resolve([]);
        }
      });
    });
  }

  async getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
    if (!this.placesService) {
      console.warn('Places service not initialized');
      return null;
    }

    return new Promise((resolve) => {
      const google = (window as any).google;
      if (!this.placesService || !google) {
        resolve(null);
        return;
      }

      const request = {
        placeId,
        fields: ['place_id', 'name', 'formatted_address', 'types', 'geometry', 'rating', 'photos'],
      };

      this.placesService.getDetails(request, (place: any, status: any) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          const result: PlaceResult = {
            place_id: place.place_id!,
            name: place.name!,
            formatted_address: place.formatted_address!,
            types: place.types || [],
            geometry: {
              location: {
                lat: place.geometry!.location!.lat(),
                lng: place.geometry!.location!.lng(),
              },
            },
            rating: place.rating,
            photos: place.photos?.map(photo => ({
              photo_reference: photo.getUrl({ maxWidth: 400 }),
            })),
          };
          resolve(result);
        } else {
          console.warn('Place details failed:', status);
          resolve(null);
        }
      });
    });
  }

  async detectCurrentPlace(): Promise<PlaceResult | null> {
    try {
      const location = await this.getCurrentLocation();
      if (!location) return null;

      const places = await this.findNearbyPlaces(location.coordinates, 50);
      if (places.length > 0) {
        const detectedPlace = places[0];
        this.emit('placeDetected', detectedPlace);
        return detectedPlace;
      }
      return null;
    } catch (error) {
      console.warn('Place detection failed:', error);
      return null;
    }
  }

  getLocationContext(): LocationContext | null {
    return this.lastKnownLocation;
  }

  isAtLocation(targetLocation: { lat: number; lng: number }, threshold: number = 100): boolean {
    if (!this.lastKnownLocation) return false;

    const distance = this.calculateDistance(
      this.lastKnownLocation.coordinates,
      targetLocation
    );
    return distance <= threshold;
  }

  // Place type utilities
  isAtBeach(): boolean {
    return this.hasPlaceType(['beach', 'amusement_park']) || 
           this.isLocationNamed(['beach', 'shore', 'coast']);
  }

  isAtDisneyland(): boolean {
    return this.hasPlaceType(['amusement_park']) ||
           this.isLocationNamed(['disneyland', 'disney']);
  }

  isAtHome(): boolean {
    return this.hasPlaceType(['home', 'residence']) ||
           this.isLocationNamed(['home']);
  }

  isAtWork(): boolean {
    return this.hasPlaceType(['office', 'workplace']) ||
           this.isLocationNamed(['work', 'office']);
  }

  isAtStore(): boolean {
    return this.hasPlaceType(['store', 'supermarket', 'grocery_or_supermarket', 'shopping_mall']);
  }

  private hasPlaceType(types: string[]): boolean {
    if (!this.lastKnownLocation?.place) return false;
    return types.some(type => this.lastKnownLocation!.place!.types.includes(type));
  }

  private isLocationNamed(keywords: string[]): boolean {
    if (!this.lastKnownLocation?.place) return false;
    const name = this.lastKnownLocation.place.name.toLowerCase();
    return keywords.some(keyword => name.includes(keyword));
  }

  private calculateDistance(
    pos1: { lat: number; lng: number },
    pos2: { lat: number; lng: number }
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (pos1.lat * Math.PI) / 180;
    const φ2 = (pos2.lat * Math.PI) / 180;
    const Δφ = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const Δλ = ((pos2.lng - pos1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private updateLocationContext(context: LocationContext): void {
    const previous = this.lastKnownLocation;
    this.lastKnownLocation = context;

    // Try to detect place if we don't have one
    if (!context.place) {
      this.findNearbyPlaces(context.coordinates, 50)
        .then(places => {
          if (places.length > 0) {
            context.place = places[0];
            this.emit('placeDetected', places[0]);
          }
        })
        .catch(console.warn);
    }

    this.emit('locationUpdate', context);
    this.emit('contextChange', { previous, current: context });
  }

  // Event system
  on<K extends keyof LocationServiceEvents>(
    event: K,
    listener: (data: LocationServiceEvents[K]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  off<K extends keyof LocationServiceEvents>(
    event: K,
    listener: (data: LocationServiceEvents[K]) => void
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit<K extends keyof LocationServiceEvents>(
    event: K,
    data: LocationServiceEvents[K]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  // Cleanup
  destroy(): void {
    this.stopLocationTracking();
    this.eventListeners.clear();
  }
}

export const locationService = new LocationService();
export type { LocationContext, PlaceResult };