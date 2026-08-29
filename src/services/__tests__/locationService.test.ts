import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('locationService Google Maps loading', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(window, 'google');
    document
      .querySelectorAll('script[data-bubble-google-maps]')
      .forEach((script) => script.remove());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(window, 'google');
  });

  it('does not make a Maps request at module startup when no key is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    const appendChild = vi.spyOn(document.head, 'appendChild');

    const { locationService } = await import('../locationService');

    expect(appendChild).not.toHaveBeenCalled();
    await expect(locationService.findNearbyPlaces({ lat: 21.3, lng: -157.8 })).resolves.toEqual([]);
    expect(appendChild).not.toHaveBeenCalled();
  });

  it('loads Maps once, on demand, when a configured place lookup needs it', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'configured-test-key');
    const nearbySearch = vi.fn(
      (_request: unknown, callback: (results: unknown[], status: string) => void) => {
        callback([], 'OK');
      },
    );
    const appendChild = vi
      .spyOn(document.head, 'appendChild')
      .mockImplementation((node) => {
        const script = node as HTMLScriptElement;
        Object.defineProperty(window, 'google', {
          configurable: true,
          value: {
            maps: {
              LatLng: class LatLng {},
              Map: class Map {},
              places: {
                PlacesService: class PlacesService {
                  nearbySearch = nearbySearch;
                },
                PlacesServiceStatus: { OK: 'OK' },
              },
            },
          },
        });
        queueMicrotask(() => script.onload?.call(script, new Event('load')));
        return node;
      });

    const { locationService } = await import('../locationService');
    expect(appendChild).not.toHaveBeenCalled();

    await expect(locationService.findNearbyPlaces({ lat: 21.3, lng: -157.8 })).resolves.toEqual([]);

    expect(appendChild).toHaveBeenCalledOnce();
    const script = appendChild.mock.calls[0][0] as HTMLScriptElement;
    const scriptUrl = new URL(script.src);
    expect(scriptUrl.origin).toBe('https://maps.googleapis.com');
    expect(scriptUrl.pathname).toBe('/maps/api/js');
    expect(scriptUrl.searchParams.get('key')).toBe('configured-test-key');
    expect(scriptUrl.searchParams.get('libraries')).toBe('places');
    expect(scriptUrl.searchParams.get('auth_referrer_policy')).toBe('origin');
    expect(script.referrerPolicy).toBe('strict-origin');
    expect(nearbySearch).toHaveBeenCalledOnce();
  });
});
