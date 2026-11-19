import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

/** A place to get UV for: either from the phone's location or a city the user picked. */
export type Place = {
  latitude: number;
  longitude: number;
  name: string | null;
  source: 'device' | 'city';
};

const PLACE_KEY = 'mylupus.place';

export async function loadSavedPlace(): Promise<Place | null> {
  try {
    const raw = await AsyncStorage.getItem(PLACE_KEY);
    return raw ? (JSON.parse(raw) as Place) : null;
  } catch {
    return null;
  }
}

export async function savePlace(place: Place): Promise<void> {
  try {
    await AsyncStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // Not fatal: we'll just look it up again next time.
  }
}

/** Rejects with `message` if `promise` takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export class LocationPermissionError extends Error {}

/**
 * Gets the phone's position. UV doesn't change much over a few kilometres, so we ask for
 * the lowest accuracy (Wi-Fi/cell based), which is much faster than waiting for GPS.
 */
export async function getDevicePlace(allowCached: boolean): Promise<Place> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new LocationPermissionError(
      'Location is off for Expo Go. Turn it on in Settings > Privacy & Security > Location Services > Expo Go, or pick a city instead.',
    );
  }

  let coords: { latitude: number; longitude: number } | null = null;
  if (allowCached) {
    const cached = await Location.getLastKnownPositionAsync();
    if (cached) coords = cached.coords;
  }
  if (!coords) {
    const fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }),
      20000,
      "Your phone didn't share a location in time. Try again, or pick a city instead.",
    );
    coords = fresh.coords;
  }

  let name: string | null = null;
  try {
    const [addr] = await withTimeout(Location.reverseGeocodeAsync(coords), 5000, 'timeout');
    name = addr?.city ?? addr?.region ?? null;
  } catch {
    // The place name is a nice-to-have.
  }

  return { latitude: coords.latitude, longitude: coords.longitude, name, source: 'device' };
}

/** Distance between two places in kilometres (haversine). */
export function distanceKm(a: Place, b: Place): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export type CityResult = Place & { label: string };

/** City search via Open-Meteo's free geocoding API. */
export async function searchCities(query: string): Promise<CityResult[]> {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`;
  const res = await withTimeout(fetch(url), 15000, 'City search took too long. Try again.');
  if (!res.ok) throw new Error(`City search returned an error (${res.status}).`);
  const data: {
    results?: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[];
  } = await res.json();
  return (data.results ?? []).map((r) => ({
    latitude: r.latitude,
    longitude: r.longitude,
    name: r.name,
    source: 'city',
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
  }));
}
