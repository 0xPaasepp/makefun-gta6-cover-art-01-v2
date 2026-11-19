// Velvet Heat — Cover Studio: the dual render engine.
//
// Two engines, one cover:
//  * INK (face-aware posterize): the photo is posterized to a few flat levels
//    and blended back over the modelled original, so eyes and lips keep their
//    modelling instead of flattening into pink shapes; a halftone dot screen
//    is laid over the shadows for the print-poster look. Stronger than a
//    light tint, gentler than a full comic flatten.
//  * PHOTO (clean photographic grades): Sunset / Neon / Golden / Duotone
//    colour grades plus contrast / saturation / brightness / temperature
//    sliders, applied with canvas filters so the photo stays a photo.
//
// Everything here is plain canvas 2D, no libraries, no network.

export const GRADES = {
  ink:    { label: 'Ink',     desc: 'Posterize + halftone' },
  sunset: { label: 'Sunset',  desc: 'Amber / magenta photo' },
  neon:   { label: 'Neon',    desc: 'Magenta / cyan night' },
  golden: { label: 'Golden',  desc: 'Warm amber, low magenta' },
  duotone:{ label: 'Duotone', desc: 'Violet / cream two-tone' },
};

export const GRADE_NAMES = Object.keys(GRADES);

// Colour-grade filter strings (applied on drawImage through ctx.filter).
// Sliders are folded in by the caller: contrast 0.7..1.5, saturation
// 0.5..1.8, brightness 0.7..1.3, temperature -40..40 (mapped to sepia /
// hue-rotate approximations, since canvas has no white-balance filter).
export function gradeFilter(grade, s) {
  const c = (s.contrast ?? 1).toFixed(3);
  const sat = (s.saturation ?? 1).toFixed(3);
  const b = (s.brightness ?? 1).toFixed(3);
  const t = s.temperature ?? 0; // -40 (cool) .. +40 (warm)
  const warm = t > 0 ? ` sepia(${Math.min(0.45, t / 100).toFixed(3)})` : '';
  const cool = t < 0 ? ` hue-rotate(${Math.max(-18, t / 2.2).toFixed(1)}deg)` : '';
  switch (grade) {
    case 'sunset':  return `contrast(${c}) saturate(${(sat * 1.22).toFixed(3)}) brightness(${b}) sepia(0.16) hue-rotate(-12deg)${warm}${cool}`;
    case 'neon':    return `contrast(${(c * 1.06).toFixed(3)}) saturate(${(sat * 1.35).toFixed(3)}) brightness(${b}) hue-rotate(14deg)${warm}${cool}`;
    case 'golden':  return `contrast(${c}) saturate(${(sat * 1.1).toFixed(3)}) brightness(${(b * 1.05).toFixed(3)}) sepia(0.34) hue-rotate(-8deg)${warm}${cool}`;
    case 'duotone': return `contrast(${(c * 1.1).toFixed(3)}) saturate(0.12) brightness(${b}) sepia(0.55) hue-rotate(-38deg)${warm}${cool}`;
    case 'ink':
    default:        return `contrast(${(c * 1.08).toFixed(3)}) saturate(${(sat * 1.18).toFixed(3)}) brightness(${b})${warm}${cool}`;
  }
}

// Posterize an image's pixels to `levels` flat steps per channel.
function posterizeInto(ctx, w, h, levels) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / step) * step;
    d[i + 1] = Math.round(d[i + 1] / step) * step;
    d[i + 2] = Math.round(d[i + 2] / step) * step;
  }
  ctx.putImageData(img, 0, 0);
}

let halftoneTile = null;
function halftonePattern() {
  if (halftoneTile) return halftoneTile;
  const t = document.createElement('canvas');
  t.width = 9; t.height = 9;
  const c = t.getContext('2d');
  c.fillStyle = '#000';
  c.beginPath(); c.arc(4.5, 4.5, 2.1, 0, Math.PI * 2); c.fill();
  halftoneTile = t;
  return t;
}

// Ink treatment, applied in place on a canvas holding the panel photo.
// strength 0..1: posterized layer opacity over the modelled original.
// At 0.78 the poster wins the look while eyes/lips keep their modelling.
export function inkify(canvas, strength = 0.78, halftone = true) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const poster = document.createElement('canvas');
  poster.width = w; poster.height = h;
  const pc = poster.getContext('2d');
  // Work at a capped resolution so the posterize pass stays fast, but
  // high enough that big panels don't go blotchy when upscaled.
  const cap = 720;
  const sw = Math.min(w, cap), sh = Math.round((h * sw) / w);
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sc = small.getContext('2d');
  sc.drawImage(canvas, 0, 0, sw, sh);
  posterizeInto(sc, sw, sh, 6);
  pc.imageSmoothingEnabled = false;
  pc.drawImage(small, 0, 0, w, h);
  // Blend the flat poster back over the modelled original.
  ctx.globalAlpha = strength;
  ctx.drawImage(poster, 0, 0);
  ctx.globalAlpha = 1;
  if (halftone) {
    const pat = ctx.createPattern(halftonePattern(), 'repeat');
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // A faint magenta wash unifies the panel with the cover palette.
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ff2e88';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// One shared noise tile for the grain toggle.
let noiseTile = null;
export function grainPattern() {
  if (noiseTile) return noiseTile;
  const t = document.createElement('canvas');
  t.width = 140; t.height = 140;
  const c = t.getContext('2d');
  const img = c.createImageData(140, 140);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.floor(Math.random() * 90);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  noiseTile = t;
  return t;
}
