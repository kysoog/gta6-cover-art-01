import { POST_SIZES, drawPoster, getPosterLayout, clampCrop } from './poster.js';
import { prepareCaptureScene } from './capture.js';

const SAMPLE_MANIFEST = [
  { name: 'Waterfront muse', url: './samples/hero.jpg' },
  { name: 'Sunset boulevard', url: './samples/boulevard.jpg' },
  { name: 'Starlight motel', url: './samples/motel.jpg' },
  { name: 'Rooftop company', url: './samples/rooftop.jpg' },
];

const state = {
  photos: [],
  slots: [0, 1, 2].map(photo => ({ photo, zoom: 1, x: 0, y: 0 })),
  activePanel: 0,
  format: 'wide',
  theme: 'sunset',
  titleOne: 'NEON',
  titleTwo: 'REQUIEM',
  tagline: 'THE CITY NEVER ASKS TWICE.',
  grain: 0.22,
};

const canvas = document.querySelector('#posterCanvas');
const photoInput = document.querySelector('#photoInput');
const dropZone = document.querySelector('#dropZone');
const titleOne = document.querySelector('#titleOne');
const titleTwo = document.querySelector('#titleTwo');
const tagline = document.querySelector('#tagline');
const zoomRange = document.querySelector('#zoomRange');
const grainRange = document.querySelector('#grainRange');
let activePhoto = 0;
let drag = null;

function loadLocalImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not read image: ${url}`));
    image.src = url;
  });
}

/** Replaces the reel with the four deterministic procedural sample scenes. */
async function loadSamples() {
  const loaded = await Promise.all(SAMPLE_MANIFEST.map(async sample => ({
    ...sample,
    image: await loadLocalImage(sample.url),
  })));
  state.photos = loaded;
  state.slots.forEach((slot, index) => { slot.photo = index % loaded.length; });
  activePhoto = 0;
  buildPhotoReel();
  redrawPoster();
}

function buildPhotoReel() {
  const reel = document.querySelector('#photoReel');
  reel.replaceChildren();
  state.photos.forEach((photo, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `photo-thumb${index === activePhoto ? ' selected' : ''}`;
    button.title = `${photo.name}: place in panel ${String.fromCharCode(65 + state.activePanel)}`;
    const thumbnail = document.createElement('img');
    thumbnail.src = photo.image.src;
    thumbnail.alt = photo.name;
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    button.append(thumbnail, number);
    button.addEventListener('click', () => {
      activePhoto = index;
      state.slots[state.activePanel].photo = index;
      buildPhotoReel();
      redrawPoster();
    });
    reel.append(button);
  });
  document.querySelector('#photoCount').textContent = String(state.photos.length).padStart(2, '0');
}

async function addPhotoFiles(fileList) {
  const files = [...fileList].filter(file => file.type.startsWith('image/'));
  if (!files.length) return;
  try {
    const loaded = await Promise.all(files.map(async file => {
      const url = URL.createObjectURL(file);
      try {
        return { name: file.name, image: await loadLocalImage(url), ownedUrl: url };
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
    }));
    const start = state.photos.length;
    state.photos.push(...loaded);
    state.slots[state.activePanel].photo = start;
    activePhoto = start;
    buildPhotoReel();
    redrawPoster();
    setExportStatus(`${loaded.length} local photo${loaded.length === 1 ? '' : 's'} added.`);
  } catch {
    setExportStatus('That image could not be opened. Try JPG, PNG or WebP.');
  }
}

function redrawPoster() {
  drawPoster(canvas, state);
}

function syncControls() {
  const size = POST_SIZES[state.format];
  canvas.width = size.width;
  canvas.height = size.height;
  titleOne.value = state.titleOne;
  titleTwo.value = state.titleTwo;
  tagline.value = state.tagline;
  zoomRange.value = String(Math.round(state.slots[state.activePanel].zoom * 100));
  grainRange.value = String(Math.round(state.grain * 100));
  document.querySelector('#zoomValue').value = `${zoomRange.value}%`;
  document.querySelector('#grainValue').value = `${grainRange.value}%`;
  document.querySelector('#characterCount').textContent = `${state.tagline.length} / 52`;
  document.querySelector('#stageFormat').textContent = size.label;
  document.querySelector('#exportSize').textContent = size.label;
  document.querySelector('#activePanelLabel').textContent = `EDITING PANEL ${String.fromCharCode(65 + state.activePanel)}`;
  document.querySelectorAll('.panel-tab').forEach(button => button.classList.toggle('selected', Number(button.dataset.panel) === state.activePanel));
  document.querySelectorAll('.grade-chip').forEach(button => button.classList.toggle('selected', button.dataset.theme === state.theme));
  document.querySelectorAll('.format-card').forEach(button => button.classList.toggle('selected', button.dataset.format === state.format));
  redrawPoster();
}

function setExportStatus(message) {
  document.querySelector('#exportStatus').textContent = message;
}

function selectPanel(index) {
  state.activePanel = index;
  const slot = state.slots[index];
  activePhoto = slot.photo;
  zoomRange.value = String(Math.round(slot.zoom * 100));
  document.querySelector('#zoomValue').value = `${zoomRange.value}%`;
  buildPhotoReel();
  syncControls();
}

function setCaptionControlState() {
  state.titleOne = titleOne.value;
  state.titleTwo = titleTwo.value;
  state.tagline = tagline.value;
  document.querySelector('#characterCount').textContent = `${state.tagline.length} / 52`;
  redrawPoster();
}

function exportDataURL() {
  const output = document.createElement('canvas');
  const dimensions = POST_SIZES[state.format];
  output.width = dimensions.width;
  output.height = dimensions.height;
  drawPoster(output, state);
  return output.toDataURL('image/png');
}

function downloadPoster() {
  const dimensions = POST_SIZES[state.format];
  const anchor = document.createElement('a');
  anchor.href = exportDataURL();
  anchor.download = `afterhours-${dimensions.width}x${dimensions.height}.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setExportStatus(`Exported ${anchor.download} · made locally.`);
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

function panelAtPoint(point) {
  const layout = getPosterLayout(canvas.width, canvas.height, state.format);
  return layout.panels.findIndex(rect => point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h);
}

canvas.addEventListener('pointerdown', event => {
  const point = canvasPoint(event);
  const index = panelAtPoint(point);
  if (index < 0) return;
  selectPanel(index);
  drag = { pointer: event.pointerId, point, x: state.slots[index].x, y: state.slots[index].y, panel: index };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  if (!drag || drag.pointer !== event.pointerId) return;
  const point = canvasPoint(event);
  const layout = getPosterLayout(canvas.width, canvas.height, state.format);
  const rect = layout.panels[drag.panel];
  const slot = state.slots[drag.panel];
  slot.x = drag.x + (point.x - drag.point.x) / Math.max(1, rect.w) * 2;
  slot.y = drag.y + (point.y - drag.point.y) / Math.max(1, rect.h) * 2;
  clampCrop(slot, state.photos[slot.photo]?.image, rect);
  redrawPoster();
});

canvas.addEventListener('pointerup', event => {
  if (drag?.pointer === event.pointerId) drag = null;
});
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('wheel', event => {
  const index = panelAtPoint(canvasPoint(event));
  if (index < 0) return;
  event.preventDefault();
  selectPanel(index);
  const slot = state.slots[index];
  slot.zoom = Math.max(1, Math.min(2.6, slot.zoom * Math.exp(-event.deltaY * 0.0014)));
  zoomRange.value = String(Math.round(slot.zoom * 100));
  document.querySelector('#zoomValue').value = `${zoomRange.value}%`;
  clampCrop(slot, state.photos[slot.photo]?.image, getPosterLayout(canvas.width, canvas.height, state.format).panels[index]);
  redrawPoster();
}, { passive: false });

zoomRange.addEventListener('input', () => {
  const slot = state.slots[state.activePanel];
  slot.zoom = Number(zoomRange.value) / 100;
  document.querySelector('#zoomValue').value = `${zoomRange.value}%`;
  clampCrop(slot, state.photos[slot.photo]?.image, getPosterLayout(canvas.width, canvas.height, state.format).panels[state.activePanel]);
  redrawPoster();
});
grainRange.addEventListener('input', () => {
  state.grain = Number(grainRange.value) / 100;
  document.querySelector('#grainValue').value = `${grainRange.value}%`;
  redrawPoster();
});

document.querySelectorAll('.panel-tab').forEach(button => button.addEventListener('click', () => selectPanel(Number(button.dataset.panel))));
document.querySelectorAll('.grade-chip').forEach(button => button.addEventListener('click', () => {
  state.theme = button.dataset.theme;
  syncControls();
}));
document.querySelectorAll('.format-card').forEach(button => button.addEventListener('click', () => {
  state.format = button.dataset.format;
  syncControls();
}));

photoInput.addEventListener('change', () => addPhotoFiles(photoInput.files));
for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, event => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
  });
}
dropZone.addEventListener('drop', event => addPhotoFiles(event.dataTransfer.files));
document.querySelector('#sampleButton').addEventListener('click', loadSamples);
document.querySelector('#centerCrop').addEventListener('click', () => {
  const slot = state.slots[state.activePanel];
  slot.x = 0;
  slot.y = 0;
  redrawPoster();
});
document.querySelector('#fillAll').addEventListener('click', () => {
  state.slots.forEach(slot => { slot.photo = state.slots[state.activePanel].photo; });
  redrawPoster();
});
[titleOne, titleTwo, tagline].forEach(control => control.addEventListener('input', setCaptionControlState));
document.querySelector('#clearCaption').addEventListener('click', () => {
  titleOne.value = '';
  titleTwo.value = '';
  tagline.value = '';
  setCaptionControlState();
  titleOne.focus();
});
document.querySelector('#exportButton').addEventListener('click', downloadPoster);

window.__afterhours = {
  state,
  redraw: redrawPoster,
  exportDataURL,
  loadSamples,
  selectPanel,
};

async function startAfterhours() {
  await document.fonts.load('400 80px "Afterhours Block"');
  await document.fonts.ready;
  await loadSamples();
  const scene = new URLSearchParams(location.search).get('shot');
  if (scene) await prepareCaptureScene(scene, state, syncControls, redrawPoster);
  else {
    syncControls();
    window.__shotReady = true;
  }
}

startAfterhours().catch(error => {
  console.error(error);
  setExportStatus(error.message);
  window.__shotError = error.message;
});
