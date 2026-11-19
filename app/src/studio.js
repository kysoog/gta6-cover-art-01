import { POST_SIZES, PANEL_NAMES, createPanelFrames, findPanelAt, getPanelLayout, renderCover } from "./cover-art.js";

const canvas = document.querySelector("#coverCanvas");
const statusMessage = document.querySelector("#statusMessage");
const zoomControl = document.querySelector("#zoomControl");
const zoomValue = document.querySelector("#zoomValue");
const panelControls = document.querySelector("#panelControls");
const dropZone = document.querySelector("#dropZone");
const query = new URLSearchParams(location.search);
let photoSequence = 0;
let drag = null;

const state = {
  size: "landscape",
  titleTop: "NEON",
  titleBottom: "EMPIRE",
  tagline: "OWN THE NIGHT",
  photos: [],
  frames: createPanelFrames(),
  activePanel: 0,
};

const sampleManifest = [
  { id: "sample-boulevard", name: "Midnight Boulevard", shortName: "Boulevard", url: "./samples/midnight-boulevard.jpg" },
  { id: "sample-pier", name: "Sunset Pier", shortName: "Pier", url: "./samples/sunset-pier.jpg" },
  { id: "sample-drive", name: "Ocean Drive", shortName: "Ocean Drive", url: "./samples/ocean-drive.jpg" },
];

function setStatus(message) {
  statusMessage.textContent = message;
}

function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be decoded. Try JPEG, PNG or WebP."));
    image.src = url;
  });
}

async function addDecodedPhoto({ id, name, shortName, url }) {
  if (state.photos.some((photo) => photo.id === id)) return state.photos.find((photo) => photo.id === id);
  const image = await decodeImage(url);
  const photo = { id, name, shortName: shortName ?? name, url, image };
  state.photos.push(photo);
  if (!state.frames[0].photoId) assignDefaultPhotos();
  return photo;
}

function assignDefaultPhotos() {
  const [boulevard, pier, drive] = state.photos;
  const defaults = [boulevard, pier, drive, drive];
  state.frames.forEach((frame, index) => {
    frame.photoId = (defaults[index] ?? state.photos[0])?.id ?? null;
  });
}

async function loadBundledSamples() {
  await Promise.all(sampleManifest.map((sample) => addDecodedPhoto(sample)));
  assignDefaultPhotos();
}

function refreshArtwork(showSelection = true) {
  renderCover(canvas, state, { showSelection });
}

function updateSelectedPanelUI() {
  panelControls.querySelectorAll(".panel-row").forEach((row, index) => row.classList.toggle("active", index === state.activePanel));
  const frame = state.frames[state.activePanel];
  zoomControl.value = String(frame.zoom);
  zoomValue.value = `${Math.round(frame.zoom * 100)}%`;
  zoomValue.textContent = zoomValue.value;
}

function refreshPanelControls() {
  panelControls.replaceChildren();
  state.frames.forEach((frame, index) => {
    const row = document.createElement("div");
    row.className = "panel-row";
    const picker = document.createElement("button");
    picker.type = "button";
    picker.className = "panel-picker";
    picker.setAttribute("aria-label", `Edit ${PANEL_NAMES[index].toLowerCase()} panel`);
    const photo = state.photos.find((item) => item.id === frame.photoId) ?? state.photos[0];
    const thumbnail = document.createElement("img");
    thumbnail.alt = "";
    if (photo) thumbnail.src = photo.url;
    const label = document.createElement("span");
    const number = document.createElement("b");
    number.textContent = `PANEL ${String(index + 1).padStart(2, "0")}`;
    label.append(number, document.createTextNode(PANEL_NAMES[index]));
    picker.append(thumbnail, label);
    picker.addEventListener("click", () => {
      state.activePanel = index;
      updateSelectedPanelUI();
      refreshArtwork();
    });

    const selector = document.createElement("select");
    selector.setAttribute("aria-label", `Photo for ${PANEL_NAMES[index].toLowerCase()}`);
    for (const item of state.photos) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.shortName;
      selector.append(option);
    }
    selector.value = frame.photoId ?? state.photos[0]?.id ?? "";
    selector.addEventListener("change", () => {
      state.activePanel = index;
      state.frames[index].photoId = selector.value;
      state.frames[index].panX = state.frames[index].panY = 0;
      state.frames[index].zoom = 1;
      refreshPanelControls();
      refreshArtwork();
    });
    row.append(picker, selector);
    panelControls.append(row);
  });
  updateSelectedPanelUI();
}

function syncCaptionFields() {
  for (const key of ["titleTop", "titleBottom", "tagline"]) {
    document.querySelector(`#${key}`).value = state[key];
  }
}

function selectSize(size) {
  if (!POST_SIZES[size]) return;
  state.size = size;
  document.querySelectorAll("[data-size]").forEach((button) => button.classList.toggle("selected", button.dataset.size === size));
  document.querySelector("#formatName").textContent = POST_SIZES[size].name;
  refreshArtwork();
}

async function addLocalFiles(fileList) {
  const files = [...fileList].filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type));
  if (!files.length) {
    setStatus("Choose JPEG, PNG or WebP images.");
    return;
  }
  setStatus(`Framing ${files.length} photo${files.length === 1 ? "" : "s"}…`);
  let loaded = 0;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      const id = `local-${++photoSequence}`;
      const photo = await addDecodedPhoto({ id, name: file.name, shortName: file.name.slice(0, 24), url });
      const frameIndex = (state.activePanel + loaded) % state.frames.length;
      state.frames[frameIndex] = { photoId: photo.id, zoom: 1, panX: 0, panY: 0 };
      loaded++;
    } catch (error) {
      URL.revokeObjectURL(url);
      setStatus(error.message);
    }
  }
  if (loaded) setStatus(`${loaded} local photo${loaded === 1 ? "" : "s"} added. Your files never leave this browser.`);
  refreshPanelControls();
  refreshArtwork();
}

function exportCanvas() {
  const output = document.createElement("canvas");
  renderCover(output, state, { showSelection: false });
  return output;
}

async function exportAsDataURL() {
  return exportCanvas().toDataURL("image/png");
}

function downloadCover() {
  const size = POST_SIZES[state.size];
  setStatus("Rendering your post…");
  exportCanvas().toBlob((blob) => {
    if (!blob) {
      setStatus("PNG export failed. Please try again.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const safeTitle = `${state.titleTop}-${state.titleBottom}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "neon-district";
    anchor.download = `${safeTitle}-${size.width}x${size.height}.png`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    setStatus(`Exported ${size.width} × ${size.height} PNG. Own the feed.`);
  }, "image/png");
}

function selectedPhotoAndPanel() {
  const panel = getPanelLayout(canvas.width, canvas.height)[state.activePanel];
  const frame = state.frames[state.activePanel];
  const photo = state.photos.find((item) => item.id === frame.photoId) ?? state.photos[0];
  return { panel, frame, photo };
}

function changeZoom(nextZoom) {
  const { frame } = selectedPhotoAndPanel();
  frame.zoom = Math.max(1, Math.min(3.5, nextZoom));
  zoomControl.value = String(frame.zoom);
  zoomValue.value = zoomValue.textContent = `${Math.round(frame.zoom * 100)}%`;
  refreshArtwork();
}

function eventToCanvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

canvas.tabIndex = 0;
canvas.addEventListener("pointerdown", (event) => {
  const point = eventToCanvasPoint(event);
  const panelIndex = findPanelAt(canvas.width, canvas.height, point.x, point.y);
  if (panelIndex < 0) return;
  state.activePanel = panelIndex;
  const { panel, frame, photo } = selectedPhotoAndPanel();
  const image = photo?.image;
  if (!image) return;
  const scale = Math.max(panel.width / image.naturalWidth, panel.height / image.naturalHeight) * frame.zoom;
  drag = {
    pointerId: event.pointerId,
    startX: point.x,
    startY: point.y,
    panX: frame.panX,
    panY: frame.panY,
    spareX: Math.max(1, image.naturalWidth * scale - panel.width),
    spareY: Math.max(1, image.naturalHeight * scale - panel.height),
  };
  canvas.setPointerCapture(event.pointerId);
  updateSelectedPanelUI();
  refreshArtwork();
});

canvas.addEventListener("pointermove", (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = eventToCanvasPoint(event);
  const { frame } = selectedPhotoAndPanel();
  frame.panX = Math.max(-0.5, Math.min(0.5, drag.panX + (point.x - drag.startX) / drag.spareX));
  frame.panY = Math.max(-0.5, Math.min(0.5, drag.panY + (point.y - drag.startY) / drag.spareY));
  refreshArtwork();
});

function endDrag(event) {
  if (drag?.pointerId === event.pointerId) drag = null;
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", (event) => {
  const point = eventToCanvasPoint(event);
  const panelIndex = findPanelAt(canvas.width, canvas.height, point.x, point.y);
  if (panelIndex < 0) return;
  event.preventDefault();
  state.activePanel = panelIndex;
  changeZoom(state.frames[panelIndex].zoom * Math.exp(-event.deltaY * 0.0012));
}, { passive: false });
canvas.addEventListener("dblclick", () => {
  Object.assign(state.frames[state.activePanel], { zoom: 1, panX: 0, panY: 0 });
  updateSelectedPanelUI();
  refreshArtwork();
});
canvas.addEventListener("keydown", (event) => {
  const frame = state.frames[state.activePanel];
  const moves = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] };
  if (moves[event.key]) {
    event.preventDefault();
    frame.panX = Math.max(-0.5, Math.min(0.5, frame.panX + moves[event.key][0]));
    frame.panY = Math.max(-0.5, Math.min(0.5, frame.panY + moves[event.key][1]));
    refreshArtwork();
  } else if (event.key === "+" || event.key === "=") changeZoom(frame.zoom + 0.1);
  else if (event.key === "-") changeZoom(frame.zoom - 0.1);
});

for (const key of ["titleTop", "titleBottom", "tagline"]) {
  document.querySelector(`#${key}`).addEventListener("input", (event) => {
    state[key] = event.target.value;
    refreshArtwork();
  });
}
document.querySelectorAll("[data-size]").forEach((button) => button.addEventListener("click", () => selectSize(button.dataset.size)));
document.querySelectorAll("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => {
    const sample = state.photos.find((photo) => photo.id === `sample-${button.dataset.sample.replace("midnight-", "").replace("sunset-", "").replace("ocean-", "")}`)
      ?? state.photos.find((photo) => photo.url.includes(button.dataset.sample));
    if (sample) {
      Object.assign(state.frames[state.activePanel], { photoId: sample.id, zoom: 1, panX: 0, panY: 0 });
      refreshPanelControls();
      refreshArtwork();
      setStatus(`${sample.name} loaded into ${PANEL_NAMES[state.activePanel].toLowerCase()}.`);
    }
  });
});
document.querySelector("#photoInput").addEventListener("change", (event) => addLocalFiles(event.target.files));
for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
}
dropZone.addEventListener("drop", (event) => addLocalFiles(event.dataTransfer.files));
zoomControl.addEventListener("input", () => changeZoom(Number(zoomControl.value)));
document.querySelector("#resetFrame").addEventListener("click", () => {
  Object.assign(state.frames[state.activePanel], { zoom: 1, panX: 0, panY: 0 });
  updateSelectedPanelUI();
  refreshArtwork();
});
document.querySelector("#exportButton").addEventListener("click", downloadCover);

const captureScenes = {
  empire: { titleTop: "NEON", titleBottom: "EMPIRE", tagline: "OWN THE NIGHT", size: "landscape", hero: "sample-boulevard" },
  vice: { titleTop: "VICE", titleBottom: "HEARTS", tagline: "AFTER HOURS, ON OUR TERMS", size: "portrait", hero: "sample-pier" },
  palms: { titleTop: "PALM", titleBottom: "CITY", tagline: "NO SLEEP TILL SUNRISE", size: "square", hero: "sample-drive" },
};

async function setCaptureScene(options = {}) {
  const scene = captureScenes[options.scene] ?? captureScenes.empire;
  state.titleTop = options.titleTop ?? scene.titleTop;
  state.titleBottom = options.titleBottom ?? scene.titleBottom;
  state.tagline = options.tagline ?? scene.tagline;
  state.size = options.size ?? scene.size;
  state.activePanel = 0;
  state.frames = createPanelFrames();
  assignDefaultPhotos();
  Object.assign(state.frames[0], { photoId: scene.hero, zoom: options.zoom ?? 1, panX: options.panX ?? 0, panY: options.panY ?? 0 });
  state.frames[1].photoId = scene.hero === "sample-pier" ? "sample-drive" : "sample-pier";
  state.frames[2].photoId = scene.hero === "sample-boulevard" ? "sample-drive" : "sample-boulevard";
  state.frames[3].photoId = scene.hero === "sample-drive" ? "sample-boulevard" : "sample-drive";
  document.body.classList.toggle("capture-cover", options.mode === "cover");
  syncCaptionFields();
  selectSize(state.size);
  refreshPanelControls();
  refreshArtwork(options.mode !== "cover");
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}

window.__coverStudio = {
  setScene: setCaptureScene,
  exportAsDataURL,
  dimensions: () => ({ ...POST_SIZES[state.size] }),
};

async function boot() {
  window.__shotReady = false;
  await document.fonts.load('100px "Anton"');
  await document.fonts.ready;
  await loadBundledSamples();
  syncCaptionFields();
  refreshPanelControls();
  const capture = query.get("capture");
  if (capture) {
    await setCaptureScene({ mode: capture, scene: query.get("scene") ?? "empire", size: query.get("size") ?? undefined });
  } else {
    selectSize("landscape");
    refreshArtwork();
  }
}

boot().catch((error) => {
  setStatus(error.message);
  throw error;
});
