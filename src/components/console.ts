/**
 * console.ts — Glassmorphic settings panel for VOGEL-TIMER.
 *
 * Inherits Tipsy Tap Studio design language from GALTON-TIMER:
 *   - Glassmorphism side drawer (blur 32px, rgba(8,8,12,0.72))
 *   - Auto-hide on-screen controls
 *   - Theme chip strip with LED indicators
 *   - Slider + preset button pattern
 */

import type { ShapeType } from '../engine/shape-draw';
import type { FillDirection } from '../engine/vogel-engine';

// ── Controller interface ──

export interface ConsoleController {
  show(): void;
  hide(): void;
  setTime(remainingMs: number): void;
  setStatus(status: 'ready' | 'running' | 'paused' | 'idle'): void;
  setPaused(paused: boolean): void;
  setThemeName(name: string): void;
  setAccentColor(rgb: [number, number, number]): void;
  setConfigEnabled(enabled: boolean): void;

  // Callbacks
  onDurationChange: ((sec: number) => void) | null;
  onResolutionChange: ((res: number) => void) | null;
  onDirectionChange: ((dir: FillDirection) => void) | null;
  onShapeChange: ((shape: ShapeType) => void) | null;
  onDashboardToggle: ((on: boolean) => void) | null;
  onThemeChange: ((name: string) => void) | null;
  onStart: (() => void) | null;
  onPause: (() => void) | null;
  onStop: (() => void) | null;
  onResetDefaults: (() => void) | null;
  onShareURL: (() => void) | null;
}

// ── CSS ──

const CSS = `
/* ── On-screen controls ── */
.vt-controls {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 12px; z-index: 100;
  transition: opacity 0.3s ease;
}
.vt-controls.hidden { opacity: 0; pointer-events: none; }
.vt-btn {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.04);
  border: 1.5px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.7); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}
.vt-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.25); }
.vt-btn svg { width: 16px; height: 16px; fill: currentColor; }

/* ── Overlay ── */
.vt-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: transparent; display: none;
}
.vt-overlay.open { display: block; }

/* ── Drawer ── */
.vt-drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 300px; max-width: 82vw; z-index: 201;
  background: rgba(8,8,12,0.72);
  border-left: 1px solid rgba(255,255,255,0.05);
  backdrop-filter: blur(32px) saturate(1.4);
  -webkit-backdrop-filter: blur(32px) saturate(1.4);
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
  overflow-y: auto; overflow-x: hidden;
  padding: 24px 20px 40px;
}
.vt-drawer.open { transform: translateX(0); }

/* ── Sections ── */
.vt-section { margin-bottom: 32px; }
.vt-section-title {
  font-size: 10px; font-weight: 700; letter-spacing: 2px;
  color: rgba(255,255,255,0.22); text-transform: uppercase;
  margin-bottom: 16px;
}
.vt-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.vt-label {
  font-size: 11px; color: rgba(255,255,255,0.50);
  min-width: 60px; flex-shrink: 0;
}

/* ── Slider ── */
.vt-slider {
  -webkit-appearance: none; appearance: none;
  flex: 1; height: 2px; background: rgba(255,255,255,0.08);
  border-radius: 1px; outline: none;
}
.vt-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 12px; height: 12px;
  border-radius: 50%; background: rgba(255,255,255,0.40);
  cursor: pointer; transition: background 0.15s;
}
.vt-slider::-webkit-slider-thumb:hover { background: rgba(255,255,255,0.65); }
.vt-value {
  font-size: 11px; color: rgba(255,255,255,0.65);
  min-width: 44px; text-align: right; font-variant-numeric: tabular-nums;
}

/* ── Button strip ── */
.vt-strip { display: flex; gap: 0; width: 100%; }
.vt-chip {
  flex: 1; padding: 6px 0; text-align: center;
  font-size: 10px; letter-spacing: 0.5px;
  color: rgba(255,255,255,0.35); cursor: pointer;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  transition: all 0.15s;
}
.vt-chip:first-child { border-radius: 4px 0 0 4px; }
.vt-chip:last-child  { border-radius: 0 4px 4px 0; }
.vt-chip.active {
  color: rgba(255,255,255,0.85);
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.15);
}

/* ── Theme strip ── */
.vt-theme-strip { display: flex; gap: 0; width: 100%; }
.vt-theme-chip {
  flex: 1; padding: 8px 0; text-align: center; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: transparent; border: 1px solid rgba(255,255,255,0.03);
  transition: all 0.15s;
}
.vt-theme-chip:first-child { border-radius: 4px 0 0 4px; }
.vt-theme-chip:last-child  { border-radius: 0 4px 4px 0; }
.vt-theme-chip .vt-led {
  width: 4px; height: 4px; border-radius: 50%;
  background: var(--tc); opacity: 0.3; transition: all 0.2s;
}
.vt-theme-chip.active { background: color-mix(in srgb, var(--tc) 6%, transparent); }
.vt-theme-chip.active .vt-led {
  opacity: 1; box-shadow: 0 0 4px var(--tc), 0 0 8px color-mix(in srgb, var(--tc) 50%, transparent);
}
.vt-theme-chip span {
  font-size: 9px; letter-spacing: 0.5px;
  color: rgba(255,255,255,0.30);
}
.vt-theme-chip.active span { color: rgba(255,255,255,0.70); }

/* ── Toggle ── */
.vt-toggle {
  position: relative; width: 32px; height: 18px;
  background: rgba(255,255,255,0.08); border-radius: 9px;
  cursor: pointer; transition: background 0.2s;
}
.vt-toggle.on { background: rgba(255,180,100,0.3); }
.vt-toggle::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: rgba(255,255,255,0.5); transition: transform 0.2s;
}
.vt-toggle.on::after { transform: translateX(14px); background: rgba(255,200,120,0.9); }

/* ── Preset buttons ── */
.vt-presets { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
.vt-preset {
  padding: 3px 8px; font-size: 9px; letter-spacing: 0.5px;
  color: rgba(255,255,255,0.30); cursor: pointer;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 3px; transition: all 0.15s;
}
.vt-preset:hover { color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.04); }
.vt-preset.active { color: rgba(255,255,255,0.75); border-color: rgba(255,255,255,0.15); }

/* ── System buttons ── */
.vt-sys-btn {
  width: 100%; padding: 8px; margin-bottom: 8px;
  font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
  color: rgba(255,255,255,0.35); cursor: pointer;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 4px; transition: all 0.15s;
  font-family: inherit;
}
.vt-sys-btn:hover { color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.04); }
`;

// ── LED colors ──
const LED_COLORS: Record<string, string> = {
  nixie:  '#FF8C00',
  system: '#00FF41',
  studio: '#FFFFFF',
  cyber:  '#00D1FF',
};

// ── SVG icons ──
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>';
const ICON_GEAR = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/></svg>';

// ── Format helpers ──

function formatMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseMmSs(str: string): number | null {
  const match = str.match(/^(\d{1,3}):(\d{2})$/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  const n = parseInt(str);
  return isNaN(n) ? null : n;
}

// ── Builder ──

export function createConsole(
  container: HTMLElement,
  initialDuration: number,
  initialResolution: number,
  initialDirection: FillDirection,
  initialShape: ShapeType,
  initialDashboard: boolean,
  initialTheme: string,
): ConsoleController {
  // Inject CSS
  const style = document.createElement('style');
  style.id = 'vt-console-style';
  style.textContent = CSS;
  document.head.appendChild(style);

  // State
  let isPaused = false;
  let currentDuration = initialDuration;
  let drawerOpen = false;

  // ── On-screen controls ──
  const controls = document.createElement('div');
  controls.className = 'vt-controls';

  function makeBtn(icon: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'vt-btn';
    btn.innerHTML = icon;
    btn.title = title;
    return btn;
  }

  const btnStart = makeBtn(ICON_PLAY, 'Start');
  const btnPause = makeBtn(ICON_PAUSE, 'Pause');
  const btnStop = makeBtn(ICON_STOP, 'Stop');
  const btnSettings = makeBtn(ICON_GEAR, 'Settings');

  btnPause.style.display = 'none';
  btnStop.style.display = 'none';

  controls.append(btnStart, btnPause, btnStop, btnSettings);
  container.appendChild(controls);

  // ── Overlay ──
  const overlay = document.createElement('div');
  overlay.className = 'vt-overlay';
  container.appendChild(overlay);

  // ── Drawer ──
  const drawer = document.createElement('div');
  drawer.className = 'vt-drawer';
  container.appendChild(drawer);

  function toggleDrawer(open?: boolean): void {
    drawerOpen = open ?? !drawerOpen;
    drawer.classList.toggle('open', drawerOpen);
    overlay.classList.toggle('open', drawerOpen);
  }

  btnSettings.addEventListener('click', () => toggleDrawer());
  overlay.addEventListener('click', () => toggleDrawer(false));

  // ── TIMER section ──
  const timerSection = document.createElement('div');
  timerSection.className = 'vt-section';
  timerSection.innerHTML = '<div class="vt-section-title">TIMER</div>';

  // Duration slider
  const durRow = document.createElement('div');
  durRow.className = 'vt-row';
  const durLabel = document.createElement('span');
  durLabel.className = 'vt-label';
  durLabel.textContent = 'Duration';
  const durSlider = document.createElement('input');
  durSlider.type = 'range';
  durSlider.className = 'vt-slider';
  durSlider.min = '10';
  durSlider.max = '7200';
  durSlider.step = '10';
  durSlider.value = String(currentDuration);
  const durValue = document.createElement('span');
  durValue.className = 'vt-value';
  durValue.textContent = formatMmSs(currentDuration);
  durRow.append(durLabel, durSlider, durValue);
  timerSection.appendChild(durRow);

  durSlider.addEventListener('input', () => {
    currentDuration = parseInt(durSlider.value);
    durValue.textContent = formatMmSs(currentDuration);
    ctrl.onDurationChange?.(currentDuration);
  });

  // Duration presets
  const durPresets = document.createElement('div');
  durPresets.className = 'vt-presets';
  for (const [label, sec] of [['1m', 60], ['3m', 180], ['5m', 300], ['10m', 600], ['30m', 1800], ['60m', 3600]] as const) {
    const btn = document.createElement('button');
    btn.className = 'vt-preset';
    btn.textContent = label;
    if (sec === currentDuration) btn.classList.add('active');
    btn.addEventListener('click', () => {
      currentDuration = sec;
      durSlider.value = String(sec);
      durValue.textContent = formatMmSs(sec);
      durPresets.querySelectorAll('.vt-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ctrl.onDurationChange?.(sec);
    });
    durPresets.appendChild(btn);
  }
  timerSection.appendChild(durPresets);

  // Resolution strip
  const resRow = document.createElement('div');
  resRow.className = 'vt-row';
  resRow.style.marginTop = '16px';
  const resLabel = document.createElement('span');
  resLabel.className = 'vt-label';
  resLabel.textContent = 'Resolution';
  const resStrip = document.createElement('div');
  resStrip.className = 'vt-strip';
  resStrip.style.flex = '1';
  const resOptions = [0.1, 0.25, 0.5, 1.0];
  for (const res of resOptions) {
    const chip = document.createElement('div');
    chip.className = 'vt-chip';
    chip.textContent = `${res}s`;
    if (res === initialResolution) chip.classList.add('active');
    chip.addEventListener('click', () => {
      resStrip.querySelectorAll('.vt-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ctrl.onResolutionChange?.(res);
    });
    resStrip.appendChild(chip);
  }
  resRow.append(resLabel, resStrip);
  timerSection.appendChild(resRow);

  // Direction strip
  const dirRow = document.createElement('div');
  dirRow.className = 'vt-row';
  dirRow.style.marginTop = '12px';
  const dirLabel = document.createElement('span');
  dirLabel.className = 'vt-label';
  dirLabel.textContent = 'Direction';
  const dirStrip = document.createElement('div');
  dirStrip.className = 'vt-strip';
  dirStrip.style.flex = '1';
  for (const [label, dir] of [['In → Out', 'in-out'], ['Out → In', 'out-in']] as const) {
    const chip = document.createElement('div');
    chip.className = 'vt-chip';
    chip.textContent = label;
    if (dir === initialDirection) chip.classList.add('active');
    chip.addEventListener('click', () => {
      dirStrip.querySelectorAll('.vt-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ctrl.onDirectionChange?.(dir);
    });
    dirStrip.appendChild(chip);
  }
  dirRow.append(dirLabel, dirStrip);
  timerSection.appendChild(dirRow);

  // Dashboard toggle
  const dashRow = document.createElement('div');
  dashRow.className = 'vt-row';
  dashRow.style.marginTop = '12px';
  const dashLabel = document.createElement('span');
  dashLabel.className = 'vt-label';
  dashLabel.textContent = 'Dashboard';
  const dashToggle = document.createElement('div');
  dashToggle.className = 'vt-toggle' + (initialDashboard ? ' on' : '');
  dashRow.append(dashLabel, dashToggle);
  timerSection.appendChild(dashRow);

  dashToggle.addEventListener('click', () => {
    dashToggle.classList.toggle('on');
    ctrl.onDashboardToggle?.(dashToggle.classList.contains('on'));
  });

  drawer.appendChild(timerSection);

  // ── SHAPE section ──
  const shapeSection = document.createElement('div');
  shapeSection.className = 'vt-section';
  shapeSection.innerHTML = '<div class="vt-section-title">SHAPE</div>';

  const shapeStrip = document.createElement('div');
  shapeStrip.className = 'vt-strip';
  for (const [label, shape] of [['Circle', 'circle'], ['Square', 'square'], ['Triangle', 'triangle'], ['Pentagon', 'pentagon']] as const) {
    const chip = document.createElement('div');
    chip.className = 'vt-chip';
    chip.textContent = label;
    if (shape === initialShape) chip.classList.add('active');
    chip.addEventListener('click', () => {
      shapeStrip.querySelectorAll('.vt-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ctrl.onShapeChange?.(shape);
    });
    shapeStrip.appendChild(chip);
  }
  shapeSection.appendChild(shapeStrip);
  drawer.appendChild(shapeSection);

  // ── THEME section ──
  const themeSection = document.createElement('div');
  themeSection.className = 'vt-section';
  themeSection.innerHTML = '<div class="vt-section-title">THEME</div>';

  const themeStrip = document.createElement('div');
  themeStrip.className = 'vt-theme-strip';
  const themeNames = ['nixie', 'system', 'studio', 'cyber'];
  for (const name of themeNames) {
    const chip = document.createElement('div');
    chip.className = 'vt-theme-chip';
    chip.style.setProperty('--tc', LED_COLORS[name]);
    if (name === initialTheme.toLowerCase()) chip.classList.add('active');
    const led = document.createElement('div');
    led.className = 'vt-led';
    const label = document.createElement('span');
    label.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    chip.append(led, label);
    chip.addEventListener('click', () => {
      themeStrip.querySelectorAll('.vt-theme-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ctrl.onThemeChange?.(name);
    });
    themeStrip.appendChild(chip);
  }
  themeSection.appendChild(themeStrip);
  drawer.appendChild(themeSection);

  // ── SYSTEM section ──
  const sysSection = document.createElement('div');
  sysSection.className = 'vt-section';
  sysSection.innerHTML = '<div class="vt-section-title">SYSTEM</div>';

  const shareBtn = document.createElement('button');
  shareBtn.className = 'vt-sys-btn';
  shareBtn.textContent = 'Share URL';
  shareBtn.addEventListener('click', () => {
    ctrl.onShareURL?.();
    shareBtn.textContent = 'Copied!';
    setTimeout(() => { shareBtn.textContent = 'Share URL'; }, 1500);
  });
  sysSection.appendChild(shareBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'vt-sys-btn';
  resetBtn.textContent = 'Reset to Default';
  resetBtn.addEventListener('click', () => ctrl.onResetDefaults?.());
  sysSection.appendChild(resetBtn);

  drawer.appendChild(sysSection);

  // ── Button events ──
  btnStart.addEventListener('click', () => {
    if (isPaused) {
      ctrl.onStart?.();
    } else {
      ctrl.onStart?.();
    }
  });
  btnPause.addEventListener('click', () => ctrl.onPause?.());
  btnStop.addEventListener('click', () => ctrl.onStop?.());

  // ── Auto-hide logic ──
  let hideTimer: number | null = null;

  function showControls(): void {
    controls.classList.remove('hidden');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!drawerOpen) controls.classList.add('hidden');
    }, 5000);
  }

  window.addEventListener('mousemove', showControls);
  window.addEventListener('touchstart', showControls);
  showControls();

  // ── Controller object ──
  const ctrl: ConsoleController = {
    show: showControls,
    hide: () => controls.classList.add('hidden'),

    setTime(_remainingMs: number): void {
      // Time display handled by the 7-segment dashboard
    },

    setStatus(status): void {
      switch (status) {
        case 'ready':
        case 'idle':
          btnStart.style.display = '';
          btnPause.style.display = 'none';
          btnStop.style.display = 'none';
          isPaused = false;
          break;
        case 'running':
          btnStart.style.display = 'none';
          btnPause.style.display = '';
          btnStop.style.display = '';
          isPaused = false;
          break;
        case 'paused':
          btnStart.style.display = '';
          btnPause.style.display = 'none';
          btnStop.style.display = '';
          isPaused = true;
          break;
      }
    },

    setPaused(paused): void {
      isPaused = paused;
      btnStart.style.display = paused ? '' : 'none';
      btnPause.style.display = paused ? 'none' : '';
    },

    setThemeName(name): void {
      const lower = name.toLowerCase();
      themeStrip.querySelectorAll('.vt-theme-chip').forEach(c => {
        const label = c.querySelector('span')?.textContent?.toLowerCase();
        c.classList.toggle('active', label === lower);
      });
    },

    setAccentColor(rgb): void {
      const color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      dashToggle.style.setProperty('--accent', color);
    },

    setConfigEnabled(enabled): void {
      const inputs = drawer.querySelectorAll('input, .vt-chip, .vt-preset, .vt-toggle, .vt-theme-chip');
      inputs.forEach(el => {
        if (enabled) {
          (el as HTMLElement).style.pointerEvents = '';
          (el as HTMLElement).style.opacity = '';
        } else {
          (el as HTMLElement).style.pointerEvents = 'none';
          (el as HTMLElement).style.opacity = '0.4';
        }
      });
    },

    // Callbacks (set externally)
    onDurationChange: null,
    onResolutionChange: null,
    onDirectionChange: null,
    onShapeChange: null,
    onDashboardToggle: null,
    onThemeChange: null,
    onStart: null,
    onPause: null,
    onStop: null,
    onResetDefaults: null,
    onShareURL: null,
  };

  return ctrl;
}
