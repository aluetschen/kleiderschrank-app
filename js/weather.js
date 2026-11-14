// Wetter über Open-Meteo (kostenlos, ohne Schlüssel). Wird 1 Stunde zwischengespeichert.
import { db } from './db.js';

const CACHE_MS = 60 * 60 * 1000;

export async function getForecast(loc) {
  if (!loc) return null;
  const key = `wx2:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`; // wx2 = mit Stundenwerten
  const cached = await db.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.days;
  try {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${loc.lat}&longitude=${loc.lon}`
      + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_speed_10m_max'
      + '&hourly=temperature_2m,wind_speed_10m,precipitation_probability'
      + '&timezone=auto&forecast_days=16';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Wetter HTTP ' + res.status);
    const j = await res.json();
    const days = {};
    j.daily.time.forEach((d, i) => {
      days[d] = {
        tmax: j.daily.temperature_2m_max[i],
        tmin: j.daily.temperature_2m_min[i],
        rain: j.daily.precipitation_probability_max[i] ?? 0,
        code: j.daily.weather_code[i],
        wind: j.daily.wind_speed_10m_max?.[i] ?? null,
        hours: [],
      };
    });
    // Stundenwerte (für den Sport-Modus) den Tagen zuordnen
    (j.hourly?.time || []).forEach((t, i) => {
      const day = days[t.slice(0, 10)];
      if (day) day.hours.push({ h: +t.slice(11, 13), temp: j.hourly.temperature_2m[i], wind: j.hourly.wind_speed_10m[i], rain: j.hourly.precipitation_probability[i] ?? 0 });
    });
    await db.set(key, { at: Date.now(), days });
    return days;
  } catch (e) {
    console.warn(e);
    return cached ? cached.days : null; // offline: alte Daten sind besser als keine
  }
}

export async function searchPlace(name) {
  const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=5&language=de&name=' + encodeURIComponent(name));
  if (!res.ok) throw new Error('Ortssuche fehlgeschlagen');
  const j = await res.json();
  return (j.results || []).map((r) => ({
    name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
    lat: r.latitude, lon: r.longitude,
  }));
}

// WMO-Wettercodes -> Symbol
export function weatherIcon(code) {
  if (code == null) return '·';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
  if (code <= 77 || code === 85 || code === 86) return '🌨️';
  return '⛈️';
}
