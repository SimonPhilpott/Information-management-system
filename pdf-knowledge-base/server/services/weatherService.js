/**
 * Weather Service for IMS Voice Assistant
 * Integrates with Open-Meteo (free, zero-API-key, global coverage) to retrieve
 * real-time weather conditions, forecasts, and geocoded locations.
 */

// WMO Weather interpretation codes (WW)
const WMO_CODE_MAP = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail"
};

// Default location: Leeds, West Yorkshire, UK (home base of the Yorkshire IMS persona)
const DEFAULT_LOCATION = {
  name: "Leeds",
  region: "West Yorkshire",
  country: "United Kingdom",
  latitude: 53.8008,
  longitude: -1.5491
};

// 10-minute in-memory cache to prevent redundant HTTP requests
const weatherCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function degreesToCompass(degrees) {
  if (degrees === undefined || degrees === null) return "variable";
  const val = Math.floor((degrees / 22.5) + 0.5);
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return directions[val % 16];
}

/**
 * Geocode a location string to latitude/longitude using Open-Meteo Geocoding API
 */
async function geocodeLocation(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return DEFAULT_LOCATION;
  }
  const cleanQuery = query.trim();
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=1&language=en&format=json`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'IMS-Desktop-Voice-Terminal/1.0' } });
    if (!res.ok) {
      console.warn(`[WeatherService] Geocoding returned HTTP ${res.status}, falling back to default.`);
      return DEFAULT_LOCATION;
    }
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const match = data.results[0];
      return {
        name: match.name,
        region: match.admin1 || match.admin2 || '',
        country: match.country || '',
        latitude: match.latitude,
        longitude: match.longitude
      };
    }
    console.warn(`[WeatherService] Geocoding found no results for "${cleanQuery}", using default.`);
    return DEFAULT_LOCATION;
  } catch (err) {
    console.error(`[WeatherService] Geocoding error for "${cleanQuery}":`, err.message);
    return DEFAULT_LOCATION;
  }
}

/**
 * Fetch current weather and forecast
 * @param {Object} options
 * @param {string} [options.location] City/region name. Defaults to Leeds / UK.
 * @param {number} [options.days] Number of forecast days (1-7). Defaults to 2 (today + tomorrow).
 */
export async function getWeather({ location = '', days = 2 } = {}) {
  const forecastDays = Math.min(Math.max(parseInt(days, 10) || 2, 1), 7);
  const resolvedLoc = await geocodeLocation(location);

  const cacheKey = `${resolvedLoc.latitude.toFixed(3)},${resolvedLoc.longitude.toFixed(3)},${forecastDays}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[WeatherService] Returning cached weather for ${resolvedLoc.name}`);
    return cached.data;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${resolvedLoc.latitude}&longitude=${resolvedLoc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=auto&forecast_days=${forecastDays}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'IMS-Desktop-Voice-Terminal/1.0' } });
    if (!res.ok) {
      throw new Error(`Open-Meteo returned HTTP ${res.status}`);
    }
    const data = await res.json();
    const current = data.current || {};
    const daily = data.daily || {};

    const currentWeatherCode = current.weather_code ?? 0;
    const currentCondition = WMO_CODE_MAP[currentWeatherCode] || "Overcast";

    const locationLabel = [resolvedLoc.name, resolvedLoc.region, resolvedLoc.country]
      .filter(Boolean)
      .join(", ");

    const dailyForecast = [];
    if (daily.time && Array.isArray(daily.time)) {
      for (let i = 0; i < daily.time.length; i++) {
        const code = daily.weather_code?.[i] ?? 0;
        dailyForecast.push({
          date: daily.time[i],
          condition: WMO_CODE_MAP[code] || "Fair",
          max_temp_c: Math.round(daily.temperature_2m_max?.[i] ?? 0),
          min_temp_c: Math.round(daily.temperature_2m_min?.[i] ?? 0),
          rain_probability_percent: daily.precipitation_probability_max?.[i] ?? 0,
          rain_total_mm: daily.precipitation_sum?.[i] ?? 0
        });
      }
    }

    const payload = {
      location: locationLabel,
      coordinates: {
        latitude: resolvedLoc.latitude,
        longitude: resolvedLoc.longitude
      },
      current: {
        temperature_c: Math.round(current.temperature_2m ?? 0),
        feels_like_c: Math.round(current.apparent_temperature ?? 0),
        condition: currentCondition,
        precipitation_mm: current.precipitation ?? 0,
        humidity_percent: current.relative_humidity_2m ?? 0,
        wind_speed_kmh: Math.round(current.wind_speed_10m ?? 0),
        wind_direction: degreesToCompass(current.wind_direction_10m),
        is_daylight: Boolean(current.is_day)
      },
      today: dailyForecast[0] || null,
      forecast: dailyForecast
    };

    weatherCache.set(cacheKey, { timestamp: Date.now(), data: payload });
    console.log(`[WeatherService] Weather retrieved for ${locationLabel}: ${payload.current.temperature_c}°C, ${payload.current.condition}`);
    return payload;
  } catch (err) {
    console.error(`[WeatherService] Failed to retrieve weather:`, err.message);
    return {
      location: [resolvedLoc.name, resolvedLoc.country].filter(Boolean).join(", "),
      error: `Could not retrieve live weather at this moment: ${err.message}`,
      fallback: "Assume typical British seasonal weather with scattered cloud or light drizzle."
    };
  }
}

export default { getWeather };
