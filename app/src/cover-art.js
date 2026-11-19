export const POST_SIZES = {
  square: { width: 1080, height: 1080, name: "SQUARE / 1080 × 1080" },
  portrait: { width: 1080, height: 1350, name: "PORTRAIT / 1080 × 1350" },
  landscape: { width: 1920, height: 1080, name: "WIDESCREEN / 1920 × 1080" },
};

export const PANEL_NAMES = ["THE HEADLINER", "CITY LIGHTS", "AFTER HOURS", "THE GETAWAY"];

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function createPanelFrames() {
  return Array.from({ length: 4 }, () => ({ photoId: null, zoom: 1, panX: 0, panY: 0 }));
}

function rectangle(x, y, width, height) {
  return { x, y, width, height };
}

/** The four hard-edged collage panels, composed separately for every post ratio. */
export function getPanelLayout(width, height) {
  const box = (x, y, w, h) => rectangle(x * width, y * height, w * width, h * height);
  if (width / height > 1.45) {
    return [
      box(0.035, 0.095, 0.625, 0.565),
      box(0.675, 0.095, 0.29, 0.272),
      box(0.675, 0.383, 0.29, 0.277),
      box(0.035, 0.676, 0.93, 0.273),
    ];
  }
  if (height > width) {
    return [
      box(0.04, 0.072, 0.92, 0.545),
      box(0.04, 0.632, 0.445, 0.185),
      box(0.515, 0.632, 0.445, 0.185),
      box(0.04, 0.832, 0.92, 0.104),
    ];
  }
  return [
    box(0.04, 0.09, 0.92, 0.565),
    box(0.04, 0.671, 0.293, 0.226),
    box(0.3535, 0.671, 0.293, 0.226),
    box(0.667, 0.671, 0.293, 0.226),
  ];
}

export function findPanelAt(width, height, x, y) {
  return getPanelLayout(width, height).findIndex((panel) =>
    x >= panel.x && x <= panel.x + panel.width && y >= panel.y && y <= panel.y + panel.height);
}

function roundedRectangle(context, panel, radius) {
  const r = Math.min(radius, panel.width / 8, panel.height / 8);
  const { x, y, width, height } = panel;
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

let grainPatternSource;

function makeGrainSource() {
  if (grainPatternSource) return grainPatternSource;
  const source = document.createElement("canvas");
  source.width = source.height = 128;
  const context = source.getContext("2d");
  const pixels = context.createImageData(128, 128);
  let seed = 4101986;
  for (let index = 0; index < pixels.data.length; index += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 90 + (seed % 110);
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  grainPatternSource = source;
  return source;
}

function drawMissingPhoto(context, panel, index) {
  const gradient = context.createLinearGradient(panel.x, panel.y, panel.x + panel.width, panel.y + panel.height);
  gradient.addColorStop(0, index % 2 ? "#204e73" : "#833d75");
  gradient.addColorStop(0.55, "#ee718b");
  gradient.addColorStop(1, "#ffc285");
  context.fillStyle = gradient;
  context.fillRect(panel.x, panel.y, panel.width, panel.height);
  context.fillStyle = "#2b214cbb";
  context.beginPath();
  context.arc(panel.x + panel.width * 0.72, panel.y + panel.height * 0.31, panel.height * 0.19, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#17172b";
  context.fillRect(panel.x, panel.y + panel.height * 0.76, panel.width, panel.height * 0.24);
}

function photoForFrame(state, frame) {
  return state.photos.find((photo) => photo.id === frame.photoId) ?? state.photos[0] ?? null;
}

function drawPhotoInPanel(context, photo, panel, frame) {
  if (!photo?.image) {
    drawMissingPhoto(context, panel, 0);
    return;
  }
  const image = photo.image;
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.max(panel.width / imageWidth, panel.height / imageHeight) * clamp(frame.zoom, 1, 3.5);
  const drawnWidth = imageWidth * scale;
  const drawnHeight = imageHeight * scale;
  const spareX = Math.max(0, drawnWidth - panel.width);
  const spareY = Math.max(0, drawnHeight - panel.height);
  const panX = clamp(frame.panX, -0.5, 0.5) * spareX;
  const panY = clamp(frame.panY, -0.5, 0.5) * spareY;
  const x = panel.x + (panel.width - drawnWidth) / 2 + panX;
  const y = panel.y + (panel.height - drawnHeight) / 2 + panY;
  context.filter = "saturate(1.15) contrast(1.08)";
  context.drawImage(image, x, y, drawnWidth, drawnHeight);
  context.filter = "none";
}

function drawPanelBadge(context, panel, index, width) {
  const fontSize = clamp(width * 0.0095, 10, 19);
  const label = `${String(index + 1).padStart(2, "0")}  ${PANEL_NAMES[index]}`;
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  const badgeWidth = context.measureText(label).width + fontSize * 1.8;
  const badgeHeight = fontSize * 2.25;
  const x = panel.x + fontSize * 0.85;
  const y = panel.y + fontSize * 0.85;
  context.fillStyle = "#211538d9";
  context.fillRect(x, y, badgeWidth, badgeHeight);
  context.fillStyle = "#71efdf";
  context.fillRect(x, y, fontSize * 0.3, badgeHeight);
  context.fillStyle = "#fff4e4";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(label, x + fontSize * 0.8, y + badgeHeight * 0.53);
}

function drawCollagePanel(context, state, panel, frame, index, showSelection) {
  context.save();
  context.shadowColor = "#22133666";
  context.shadowBlur = panel.width * 0.012;
  context.shadowOffsetY = panel.width * 0.005;
  roundedRectangle(context, panel, panel.width * 0.006);
  context.fillStyle = "#fff5df";
  context.fill();
  context.restore();

  context.save();
  roundedRectangle(context, panel, panel.width * 0.006);
  context.clip();
  drawPhotoInPanel(context, photoForFrame(state, frame), panel, frame);
  const sunset = context.createLinearGradient(panel.x, panel.y, panel.x + panel.width * 0.65, panel.y + panel.height);
  sunset.addColorStop(0, "rgba(255, 87, 150, 0.06)");
  sunset.addColorStop(0.6, "rgba(255, 98, 140, 0.12)");
  sunset.addColorStop(1, "rgba(27, 29, 74, 0.28)");
  context.fillStyle = sunset;
  context.fillRect(panel.x, panel.y, panel.width, panel.height);

  const vignette = context.createRadialGradient(
    panel.x + panel.width * 0.5, panel.y + panel.height * 0.42, panel.height * 0.12,
    panel.x + panel.width * 0.5, panel.y + panel.height * 0.5, panel.width * 0.72,
  );
  vignette.addColorStop(0, "rgba(17, 13, 41, 0)");
  vignette.addColorStop(1, "rgba(17, 13, 41, 0.25)");
  context.fillStyle = vignette;
  context.fillRect(panel.x, panel.y, panel.width, panel.height);
  context.restore();

  context.save();
  roundedRectangle(context, panel, panel.width * 0.006);
  context.strokeStyle = showSelection ? "#72eee0" : "#fff4df";
  context.lineWidth = showSelection ? Math.max(4, panel.width * 0.007) : Math.max(3, panel.width * 0.004);
  context.stroke();
  drawPanelBadge(context, panel, index, context.canvas.width);
  context.restore();
}

function fittedFontSize(context, text, maximumWidth, preferred, minimum = 16) {
  let size = preferred;
  const safeText = text.trim() || " ";
  while (size > minimum) {
    context.font = `${size}px Anton, Impact, sans-serif`;
    if (context.measureText(safeText).width <= maximumWidth) break;
    size -= Math.max(1, preferred * 0.012);
  }
  return size;
}

function displayTitleLine(context, text, options) {
  const clean = text.trim().toUpperCase();
  if (!clean) return;
  const { x, baseline, maximumWidth, preferredSize, canvasWidth } = options;
  const size = fittedFontSize(context, clean, maximumWidth * 0.92, preferredSize);
  context.save();
  context.translate(x, baseline);
  context.transform(1, 0, -0.115, 1, 0, 0);
  context.font = `${size}px Anton, Impact, sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.lineJoin = "round";
  context.shadowColor = "#251037aa";
  context.shadowBlur = 0;
  context.shadowOffsetX = canvasWidth * 0.006;
  context.shadowOffsetY = canvasWidth * 0.008;
  context.strokeStyle = "#2a1245";
  context.lineWidth = Math.max(8, size * 0.13);
  context.strokeText(clean, 0, 0);
  context.shadowColor = "transparent";
  context.strokeStyle = "#fff0d5";
  context.lineWidth = Math.max(2, size * 0.035);
  context.strokeText(clean, 0, 0);
  const ink = context.createLinearGradient(0, -size, 0, size * 0.1);
  ink.addColorStop(0, "#fff2ac");
  ink.addColorStop(0.32, "#ffc087");
  ink.addColorStop(0.68, "#ff718e");
  ink.addColorStop(1, "#fa359b");
  context.fillStyle = ink;
  context.fillText(clean, 0, 0);
  context.strokeStyle = "rgba(255,255,224,0.42)";
  context.lineWidth = Math.max(1, size * 0.009);
  context.strokeText(clean, 0, -size * 0.012);
  context.restore();
}

function titleComposition(width, height) {
  if (width / height > 1.45) {
    return {
      first: { x: width * 0.052, baseline: height * 0.584, maximumWidth: width * 0.48, preferredSize: height * 0.225 },
      second: { x: width * 0.063, baseline: height * 0.87, maximumWidth: width * 0.63, preferredSize: height * 0.27 },
      tag: rectangle(width * 0.716, height * 0.82, width * 0.235, height * 0.089),
    };
  }
  if (height > width) {
    return {
      first: { x: width * 0.065, baseline: height * 0.488, maximumWidth: width * 0.78, preferredSize: width * 0.25 },
      second: { x: width * 0.065, baseline: height * 0.649, maximumWidth: width * 0.87, preferredSize: width * 0.265 },
      tag: rectangle(width * 0.18, height * 0.883, width * 0.64, height * 0.047),
    };
  }
  return {
    first: { x: width * 0.065, baseline: height * 0.471, maximumWidth: width * 0.64, preferredSize: width * 0.22 },
    second: { x: width * 0.065, baseline: height * 0.661, maximumWidth: width * 0.87, preferredSize: width * 0.25 },
    tag: rectangle(width * 0.26, height * 0.846, width * 0.68, height * 0.073),
  };
}

function drawHeader(context, width, height) {
  const size = clamp(width * 0.011, 12, 22);
  const y = height * 0.049;
  context.fillStyle = "#351846";
  context.font = `800 ${size}px Arial, sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText("NEON DISTRICT  /  AN ORIGINAL COVER STORY", width * 0.037, y);
  context.textAlign = "right";
  context.fillStyle = "#b83479";
  context.fillText("COASTAL EDITION  •  ND–086", width * 0.963, y);
  context.fillStyle = "#f04f94";
  context.save();
  context.translate(width * 0.018, y);
  context.rotate(Math.PI / 4);
  context.fillRect(-size * 0.38, -size * 0.38, size * 0.76, size * 0.76);
  context.restore();
}

function drawTagline(context, tagline, tag, width) {
  const clean = (tagline.trim() || "OWN THE NIGHT").toUpperCase();
  context.save();
  context.transform(1, 0, -0.09, 1, 0, 0);
  const skewShift = tag.y * 0.09;
  context.fillStyle = "#f54691";
  context.fillRect(tag.x + skewShift + width * 0.004, tag.y + width * 0.005, tag.width, tag.height);
  context.fillStyle = "#28133f";
  context.fillRect(tag.x + skewShift, tag.y, tag.width, tag.height);
  const size = fittedFontSize(context, clean, tag.width * 0.84, tag.height * 0.37, 11);
  context.font = `${size}px Anton, Impact, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff2d9";
  context.fillText(clean, tag.x + skewShift + tag.width / 2, tag.y + tag.height * 0.52);
  context.restore();
}

function drawPrintDetails(context, width, height) {
  const pattern = context.createPattern(makeGrainSource(), "repeat");
  context.save();
  context.globalCompositeOperation = "soft-light";
  context.globalAlpha = 0.105;
  context.fillStyle = pattern;
  context.fillRect(0, 0, width, height);
  context.restore();

  const dotSize = clamp(width * 0.0021, 2, 5);
  context.fillStyle = "#bb367660";
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 13; column++) {
      context.beginPath();
      context.arc(width * 0.8 + column * dotSize * 3.1, height * 0.974 + row * dotSize * 2.6, dotSize * 0.55, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.font = `700 ${clamp(width * 0.007, 8, 14)}px Arial, sans-serif`;
  context.fillStyle = "#5b315d";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText("MADE AFTER MIDNIGHT  /  25.7617° N, 80.1918° W", width * 0.038, height * 0.982);
}

/** Paints the entire print-resolution cover; the same routine drives preview and PNG export. */
export function renderCover(canvas, state, { showSelection = false } = {}) {
  const dimensions = POST_SIZES[state.size];
  if (!dimensions) throw new Error(`Unknown post size: ${state.size}`);
  if (canvas.width !== dimensions.width) canvas.width = dimensions.width;
  if (canvas.height !== dimensions.height) canvas.height = dimensions.height;
  const context = canvas.getContext("2d", { alpha: false });
  const { width, height } = canvas;
  const paper = context.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, "#fff5dc");
  paper.addColorStop(0.52, "#ffe6d2");
  paper.addColorStop(1, "#ffd0c5");
  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
  drawHeader(context, width, height);

  const panels = getPanelLayout(width, height);
  panels.forEach((panel, index) => {
    drawCollagePanel(context, state, panel, state.frames[index], index, showSelection && index === state.activePanel);
  });

  context.save();
  context.globalAlpha = 0.06;
  context.fillStyle = "#ff3d91";
  context.fillRect(0, 0, width, height);
  context.restore();
  drawPrintDetails(context, width, height);

  const title = titleComposition(width, height);
  const titleOptions = { ...title.first, canvasWidth: width };
  displayTitleLine(context, state.titleTop, titleOptions);
  displayTitleLine(context, state.titleBottom, { ...title.second, canvasWidth: width });
  drawTagline(context, state.tagline, title.tag, width);
  return canvas;
}
