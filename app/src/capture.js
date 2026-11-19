const CAPTURE_PRESETS = {
  wide: { format: 'wide', titleOne: 'NEON', titleTwo: 'REQUIEM', tagline: 'THE CITY NEVER ASKS TWICE.', theme: 'sunset', grain: 0.22, photos: [0, 1, 2], crops: [[1.08, 0.08, 0], [1.04, -0.12, 0.08], [1.06, 0.12, -0.08]] },
  square: { format: 'square', titleOne: 'VELVET', titleTwo: 'ALIBI', tagline: 'EVERY SECRET HAS A SUNSET.', theme: 'midnight', grain: 0.26, photos: [3, 0, 1], crops: [[1.12, -0.05, 0.06], [1.18, 0.12, 0], [1.08, -0.08, 0.08]] },
  portrait: { format: 'portrait', titleOne: 'LAST', titleTwo: 'CALL', tagline: 'PARADISE CLOSES AT DAWN.', theme: 'poolside', grain: 0.18, photos: [2, 3, 0], crops: [[1.02, 0.08, 0], [1.08, -0.1, 0.05], [1.15, 0.02, 0.06]] },
  editor: { format: 'wide', titleOne: 'NEON', titleTwo: 'REQUIEM', tagline: 'THE CITY NEVER ASKS TWICE.', theme: 'sunset', grain: 0.22, photos: [0, 1, 2], crops: [[1.08, 0.08, 0], [1.04, -0.12, 0.08], [1.06, 0.12, -0.08]] },
};

/** Loads a reproducible editor scene and exposes readiness only after two painted frames. */
export async function prepareCaptureScene(name, state, syncControls, redraw) {
  const preset = CAPTURE_PRESETS[name] ?? CAPTURE_PRESETS.editor;
  Object.assign(state, {
    format: preset.format,
    titleOne: preset.titleOne,
    titleTwo: preset.titleTwo,
    tagline: preset.tagline,
    theme: preset.theme,
    grain: preset.grain,
  });
  preset.photos.forEach((photo, index) => {
    const [zoom, x, y] = preset.crops[index];
    state.slots[index] = { photo, zoom, x, y };
  });
  state.activePanel = 0;
  if (name !== 'editor') document.body.classList.add('capture-cover');
  syncControls();
  redraw();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
