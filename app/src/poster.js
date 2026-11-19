const TAU = Math.PI * 2;

export const POST_SIZES = {
  square: { width: 1080, height: 1080, label: '1080 × 1080' },
  portrait: { width: 1080, height: 1350, label: '1080 × 1350' },
  wide: { width: 1920, height: 1080, label: '1920 × 1080' },
};

export const POSTER_THEMES = {
  sunset: { sky: '#ff9a75', wash: '#f74994', shade: '#37245f', footerA: '#f05186', footerB: '#9a346f', ink: '#241936', accent: '#ffd19b' },
  poolside: { sky: '#65e4d5', wash: '#218baf', shade: '#163f6a', footerA: '#147f97', footerB: '#174661', ink: '#102c41', accent: '#a9f3cf' },
  midnight: { sky: '#ee4da9', wash: '#6241a5', shade: '#151b48', footerA: '#5d3189', footerB: '#252254', ink: '#11152f', accent: '#ff89c6' },
};

/** Returns the three editable photo rectangles and typographic footer. */
export function getPosterLayout(width, height, format = 'wide') {
  const margin = Math.round(Math.min(width, height) * 0.037);
  const gap = Math.round(margin * 0.46);
  const footerHeight = Math.round(height * (format === 'portrait' ? 0.224 : 0.225));
  const footer = { x: margin, y: height - margin - footerHeight, w: width - margin * 2, h: footerHeight };
  const panels = [];
  if (format === 'portrait') {
    const upperHeight = Math.round((footer.y - margin - gap) * 0.64);
    const lowerY = margin + upperHeight + gap;
    const lowerHeight = footer.y - lowerY;
    const half = Math.round((width - margin * 2 - gap) / 2);
    panels.push(
      { x: margin, y: margin, w: width - margin * 2, h: upperHeight },
      { x: margin, y: lowerY, w: half, h: lowerHeight },
      { x: margin + half + gap, y: lowerY, w: width - margin * 2 - half - gap, h: lowerHeight },
    );
  } else {
    const heroWidth = Math.round((width - margin * 2 - gap) * (format === 'wide' ? 0.605 : 0.62));
    const rightX = margin + heroWidth + gap;
    const rightWidth = width - margin - rightX;
    const available = footer.y - margin - gap;
    const topHeight = Math.round((available - gap) * 0.495);
    panels.push(
      { x: margin, y: margin, w: heroWidth, h: available },
      { x: rightX, y: margin, w: rightWidth, h: topHeight },
      { x: rightX, y: margin + topHeight + gap, w: rightWidth, h: available - topHeight - gap },
    );
  }
  return { margin, gap, panels, footer };
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile;
function getGrainTile() {
  if (grainTile) return grainTile;
  grainTile = document.createElement('canvas');
  grainTile.width = 128;
  grainTile.height = 128;
  const context = grainTile.getContext('2d');
  const pixels = context.createImageData(128, 128);
  const random = mulberry32(861986);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.floor(random() * 255);
    pixels.data[i] = value;
    pixels.data[i + 1] = value;
    pixels.data[i + 2] = value;
    pixels.data[i + 3] = 115;
  }
  context.putImageData(pixels, 0, 0);
  return grainTile;
}

function roundedClip(context, rect, radius) {
  context.beginPath();
  context.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
  context.clip();
}

function cropMetrics(photo, rect, slot) {
  const base = Math.max(rect.w / photo.naturalWidth, rect.h / photo.naturalHeight);
  const zoom = slot?.zoom ?? 1;
  const scale = base * zoom;
  const drawnWidth = photo.naturalWidth * scale;
  const drawnHeight = photo.naturalHeight * scale;
  const maxX = Math.max(0, (drawnWidth - rect.w) / 2);
  const maxY = Math.max(0, (drawnHeight - rect.h) / 2);
  return {
    scale,
    x: rect.x + (rect.w - drawnWidth) / 2 + (slot?.x ?? 0) * maxX,
    y: rect.y + (rect.h - drawnHeight) / 2 + (slot?.y ?? 0) * maxY,
    w: drawnWidth,
    h: drawnHeight,
  };
}

export function clampCrop(slot, photo, rect) {
  if (!photo || zoomIsOne(slot)) {
    slot.x = Math.max(-1, Math.min(1, slot.x));
    slot.y = Math.max(-1, Math.min(1, slot.y));
    return;
  }
  const base = Math.max(rect.w / photo.naturalWidth, rect.h / photo.naturalHeight);
  const horizontal = (photo.naturalWidth * base * slot.zoom - rect.w) / 2;
  const vertical = (photo.naturalHeight * base * slot.zoom - rect.h) / 2;
  if (horizontal <= 0) slot.x = 0;
  if (vertical <= 0) slot.y = 0;
  slot.x = Math.max(-1, Math.min(1, slot.x));
  slot.y = Math.max(-1, Math.min(1, slot.y));
}

function zoomIsOne(slot) {
  return !slot || slot.zoom <= 1.001;
}

function drawFourPointStar(context, x, y, outer, inner, color, rotation = 0) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.beginPath();
  for (let i = 0; i < 8; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * Math.PI / 4;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.restore();
}

/** Draws one cropped photograph with its own colour wash and print texture. */
export function drawPhotoPanel(context, photo, rect, slot, theme, panelIndex, grainAmount) {
  context.save();
  roundedClip(context, rect, Math.max(1, rect.w * 0.002));
  const backdrop = context.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  backdrop.addColorStop(0, theme.shade);
  backdrop.addColorStop(1, theme.wash);
  context.fillStyle = backdrop;
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (photo) {
    const crop = cropMetrics(photo, rect, slot);
    context.filter = 'saturate(1.12) contrast(1.055)';
    context.drawImage(photo, crop.x, crop.y, crop.w, crop.h);
    context.filter = 'none';
  }
  const sunset = context.createLinearGradient(rect.x, rect.y, rect.x + rect.w * 0.2, rect.y + rect.h);
  sunset.addColorStop(0, `${theme.sky}20`);
  sunset.addColorStop(0.47, 'rgba(255,100,120,0.015)');
  sunset.addColorStop(1, `${theme.shade}78`);
  context.fillStyle = sunset;
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
  context.globalCompositeOperation = 'soft-light';
  const flare = context.createRadialGradient(rect.x + rect.w * 0.72, rect.y + rect.h * 0.12, 0, rect.x + rect.w * 0.72, rect.y + rect.h * 0.12, rect.w * 0.55);
  flare.addColorStop(0, `${theme.accent}88`);
  flare.addColorStop(1, `${theme.sky}00`);
  context.fillStyle = flare;
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
  context.globalCompositeOperation = 'source-over';
  if (grainAmount > 0) {
    context.globalAlpha = grainAmount * 0.2;
    context.globalCompositeOperation = 'overlay';
    context.fillStyle = context.createPattern(getGrainTile(), 'repeat');
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }
  const labelSize = Math.max(9, rect.w * 0.018);
  const labelX = rect.x + rect.w * 0.035;
  const labelY = rect.y + rect.h * 0.055;
  context.font = `${labelSize}px ui-monospace, monospace`;
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillStyle = 'rgba(255,247,226,0.88)';
  context.shadowColor = 'rgba(16,12,35,0.5)';
  context.shadowBlur = labelSize * 0.4;
  context.fillText(['A / THE MAIN EVENT', `B / DETAIL 0${panelIndex}`, `C / SCENE 0${panelIndex}`][panelIndex], labelX, labelY);
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255,247,226,0.72)';
  context.lineWidth = Math.max(1, labelSize * 0.08);
  context.beginPath();
  context.moveTo(labelX, labelY + labelSize * 1.45);
  context.lineTo(labelX + labelSize * 4.3, labelY + labelSize * 1.45);
  context.stroke();
  context.restore();
}

function fitFont(context, text, maximumWidth, startingSize, family = 'Afterhours Block') {
  let size = startingSize;
  do {
    context.font = `400 ${size}px "${family}", Impact, sans-serif`;
    if (context.measureText(text).width <= maximumWidth) break;
    size -= Math.max(1, size * 0.025);
  } while (size > 12);
  return size;
}

function trackedText(context, text, x, y, tracking, align = 'left') {
  const letters = [...text];
  const widths = letters.map(letter => context.measureText(letter).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, letters.length - 1) * tracking;
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  letters.forEach((letter, index) => {
    context.fillText(letter, cursor, y);
    cursor += widths[index] + tracking;
  });
  return total;
}

function wrapTagline(context, text, maxWidth) {
  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawFooter(context, layout, state, theme, width, height) {
  const rect = layout.footer;
  context.save();
  roundedClip(context, rect, Math.max(1, rect.w * 0.0015));
  const background = context.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  background.addColorStop(0, theme.footerA);
  background.addColorStop(1, theme.footerB);
  context.fillStyle = background;
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
  const glow = context.createRadialGradient(rect.x + rect.w * 0.16, rect.y, 0, rect.x + rect.w * 0.16, rect.y, rect.w * 0.5);
  glow.addColorStop(0, 'rgba(255,171,145,0.27)');
  glow.addColorStop(1, 'rgba(255,171,145,0)');
  context.fillStyle = glow;
  context.fillRect(rect.x, rect.y, rect.w, rect.h);

  const titleOne = (state.titleOne || '').trim().toUpperCase() || 'AFTER';
  const titleTwo = (state.titleTwo || '').trim().toUpperCase() || 'HOURS';
  const titleWidth = rect.w * (width / height > 1.3 ? 0.63 : 0.69);
  const titleX = rect.x + rect.w * 0.027;
  const sizeOne = fitFont(context, titleOne, titleWidth, rect.h * 0.38);
  context.font = `400 ${sizeOne}px "Afterhours Block", Impact, sans-serif`;
  const sizeTwo = fitFont(context, titleTwo, titleWidth, rect.h * 0.51);
  const firstY = rect.y + rect.h * 0.37;
  const secondY = rect.y + rect.h * 0.90;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.lineJoin = 'round';
  for (const [text, y, size] of [[titleOne, firstY, sizeOne], [titleTwo, secondY, sizeTwo]]) {
    context.font = `400 ${size}px "Afterhours Block", Impact, sans-serif`;
    context.strokeStyle = theme.ink;
    context.lineWidth = size * 0.075;
    context.strokeText(text, titleX + size * 0.035, y + size * 0.045);
    context.fillStyle = theme.ink;
    context.fillText(text, titleX + size * 0.035, y + size * 0.045);
    const lettering = context.createLinearGradient(0, y - size, 0, y);
    lettering.addColorStop(0, '#fff9e9');
    lettering.addColorStop(1, '#ffd7bc');
    context.fillStyle = lettering;
    context.strokeStyle = '#fff4df';
    context.lineWidth = size * 0.014;
    context.fillText(text, titleX, y);
    context.strokeText(text, titleX, y);
  }

  const rightX = rect.x + rect.w * 0.72;
  const rightWidth = rect.w * 0.235;
  const microSize = Math.max(9, rect.h * 0.052);
  context.font = `${microSize}px ui-monospace, monospace`;
  context.fillStyle = '#ffe9d2';
  trackedText(context, 'AN AFTERHOURS ORIGINAL', rightX, rect.y + rect.h * 0.22, microSize * 0.11);
  context.strokeStyle = 'rgba(255,233,210,0.55)';
  context.lineWidth = Math.max(1, rect.h * 0.005);
  context.beginPath();
  context.moveTo(rightX, rect.y + rect.h * 0.3);
  context.lineTo(rightX + rightWidth, rect.y + rect.h * 0.3);
  context.stroke();
  const tagSize = Math.max(11, rect.h * 0.101);
  context.font = `700 ${tagSize}px Arial, sans-serif`;
  const lines = wrapTagline(context, state.tagline || 'OWN THE NIGHT.', rightWidth);
  lines.forEach((line, index) => context.fillText(line, rightX, rect.y + rect.h * (0.48 + index * 0.14)));
  context.font = `${microSize * 0.85}px ui-monospace, monospace`;
  context.fillStyle = '#f8c6bd';
  trackedText(context, 'PORT SOL  /  25.77° N', rightX, rect.y + rect.h * 0.88, microSize * 0.08);
  drawFourPointStar(context, rect.x + rect.w * 0.675, rect.y + rect.h * 0.26, rect.h * 0.082, rect.h * 0.017, '#ffd6b1', 0.12);
  drawFourPointStar(context, rect.x + rect.w * 0.685, rect.y + rect.h * 0.76, rect.h * 0.045, rect.h * 0.009, 'rgba(255,220,189,0.6)', 0.12);
  context.restore();
}

/** Composes the complete poster at export resolution, synchronously and deterministically. */
export function drawPoster(canvas, state) {
  const context = canvas.getContext('2d', { alpha: false });
  const { width, height } = canvas;
  const theme = POSTER_THEMES[state.theme] ?? POSTER_THEMES.sunset;
  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#f7e8cf';
  context.fillRect(0, 0, width, height);
  const paper = context.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, 'rgba(255,255,246,0.28)');
  paper.addColorStop(1, 'rgba(228,183,155,0.16)');
  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
  const layout = getPosterLayout(width, height, state.format);
  layout.panels.forEach((rect, index) => {
    const slot = state.slots[index];
    drawPhotoPanel(context, state.photos[slot.photo]?.image ?? null, rect, slot, theme, index, state.grain);
  });
  drawFooter(context, layout, state, theme, width, height);
  context.globalAlpha = 0.055;
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = context.createPattern(getGrainTile(), 'repeat');
  context.fillRect(0, 0, width, height);
  context.restore();
  return layout;
}
