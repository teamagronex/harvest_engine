/**
 * HarvestEngine Auth & Profile Service
 * Implements client-side phone validation, PIN lookup, and OTP session workflow
 */

export interface FarmerProfile {
  id: string;
  name: string;
  phone: string;
  is_active: boolean;
  address?: {
    id: string;
    pin_code: string;
    village: string;
    district: string;
    state: string;
    latitude: number;
    longitude: number;
    confirmed: boolean;
  };
  alert_preferences?: {
    heat_alerts: boolean;
    heavy_rain_alerts: boolean;
    irrigation_advisories: boolean;
    sms_enabled: boolean;
    preferred_language: string;
  };
}

export function validateIndianMobile(phone: string): { valid: boolean; normalized?: string; error?: string } {
  if (!phone) {
    return { valid: false, error: 'Mobile number is required.' };
  }
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  let normalized = cleaned;
  if (normalized.startsWith('+91')) {
    normalized = normalized.slice(3);
  } else if (normalized.startsWith('91') && normalized.length === 12) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('0') && normalized.length === 11) {
    normalized = normalized.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return {
      valid: false,
      error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
    };
  }
  return { valid: true, normalized };
}

export function validateIndiaCoordinates(lat: number, lon: number): { valid: boolean; error?: string } {
  if (lat < 6.0 || lat > 38.0) {
    return {
      valid: false,
      error: `Latitude ${lat.toFixed(4)}°N is outside India's geographic bounds (6.0°N to 38.0°N).`,
    };
  }
  if (lon < 68.0 || lon > 98.0) {
    return {
      valid: false,
      error: `Longitude ${lon.toFixed(4)}°E is outside India's geographic bounds (68.0°E to 98.0°E).`,
    };
  }
  return { valid: true };
}

// Common sample Indian PIN code data for instant feedback & demo resolution
export const SAMPLE_PIN_DATA: Record<string, { village: string; district: string; state: string; lat: number; lon: number }> = {
  '768028': { village: 'Barpali', district: 'Bargarh', state: 'Odisha', lat: 21.1983, lon: 83.5852 },
  '141001': { village: 'Ludhiana Central', district: 'Ludhiana', state: 'Punjab', lat: 30.9010, lon: 75.8573 },
  '411001': { village: 'Pune Cantt', district: 'Pune', state: 'Maharashtra', lat: 18.5204, lon: 73.8567 },
  '500001': { village: 'Hyderabad GPO', district: 'Hyderabad', state: 'Telangana', lat: 17.3850, lon: 78.4867 },
  '600001': { village: 'Chennai GPO', district: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lon: 80.2707 },
  '800001': { village: 'Patna GPO', district: 'Patna', state: 'Bihar', lat: 25.5941, lon: 85.1376 },
  '302001': { village: 'Jaipur GPO', district: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lon: 75.7873 },
  '226001': { village: 'Lucknow GPO', district: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
  '380001': { village: 'Ahmedabad GPO', district: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lon: 72.5714 },
  '560001': { village: 'Bangalore GPO', district: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lon: 77.5946 },
};
