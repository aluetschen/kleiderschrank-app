// Farblehre-Helfer: Hex-Farbe -> Farbton (Hue), Sättigung, Helligkeit
export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

// Neutral = passt zu fast allem (Schwarz, Weiß, Grau, Beige, Navy, Denim ...)
export function isNeutral(color) {
  if (!color) return true;
  if (typeof color.neutral === 'boolean') return color.neutral;
  const hsl = hexToHsl(color.hex);
  if (!hsl) return true;
  return hsl.s < 0.18 || hsl.l < 0.13 || hsl.l > 0.92;
}

// Abstand zweier Farbtöne auf dem Farbkreis (0–180 Grad)
export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
