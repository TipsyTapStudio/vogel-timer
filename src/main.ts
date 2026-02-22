/**
 * VOGEL-TIMER — main entry point.
 * Full state machine + RAF loop + Timer + Console integration.
 */

import { Renderer, getThemeByName } from './engine/renderer';
import { TimerBridge } from './engine/timer-bridge';
import { createConsole } from './components/console';
import { readParams, writeParams, getShareURL, getDefaults } from './utils/url-params';
import type { FillDirection } from './engine/vogel-engine';
import type { ShapeType } from './engine/shape-draw';

// ── App State ──

type AppState = 'idle' | 'running' | 'paused' | 'completion' | 'completed';

// ── Load persisted params ──

const params = readParams();

const CONFIG = {
  duration: params.t,
  resolution: params.res,
  direction: params.dir as FillDirection,
  shapeType: params.shape as ShapeType,
  dashboardOn: params.dash,
  theme: getThemeByName(params.theme),
};

// ── Core objects ──

const app = document.getElementById('app')!;
const renderer = new Renderer(app);
const timerBridge = new TimerBridge();
const consoleCtrl = createConsole(
  app,
  CONFIG.duration,
  CONFIG.resolution,
  CONFIG.direction,
  CONFIG.shapeType,
  CONFIG.dashboardOn,
  CONFIG.theme.name,
);

let appState: AppState = 'idle';
let elapsedMs = 0;
let remainingMs = 0;
let rafId = 0;

// ── Timer callbacks ──

timerBridge.onTick = (remaining, elapsed) => {
  remainingMs = remaining;
  elapsedMs = elapsed;
};

timerBridge.onDone = () => {
  renderer.instantSnap(CONFIG.duration * 1000);
  startCompletion();
};

// ── State transitions ──

function initRenderer(): void {
  renderer.configure({
    duration: CONFIG.duration,
    resolution: CONFIG.resolution,
    direction: CONFIG.direction,
    shapeType: CONFIG.shapeType,
    dashboardOn: CONFIG.dashboardOn,
    theme: CONFIG.theme,
  });
}

function startTimer(): void {
  if (appState === 'running') return;

  if (appState === 'idle' || appState === 'completed') {
    initRenderer();
    elapsedMs = 0;
    remainingMs = CONFIG.duration * 1000;
    timerBridge.start(CONFIG.duration * 1000);
  } else if (appState === 'paused') {
    timerBridge.resume();
  }

  appState = 'running';
  consoleCtrl.setStatus('running');
  consoleCtrl.setConfigEnabled(false);
  scheduleFrame();
}

function pauseTimer(): void {
  if (appState !== 'running') return;
  timerBridge.pause();
  appState = 'paused';
  consoleCtrl.setStatus('paused');
  cancelAnimationFrame(rafId);
  renderer.drawPaused(elapsedMs);
}

function stopTimer(): void {
  timerBridge.reset();
  cancelAnimationFrame(rafId);

  // Clear completion state if held
  if (appState === 'completed' || appState === 'completion') {
    renderer.clearCompletion();
  }

  appState = 'idle';
  consoleCtrl.setStatus('idle');
  consoleCtrl.setConfigEnabled(true);
  elapsedMs = 0;
  remainingMs = 0;
  initRenderer();
  renderer.drawIdle();
}

/** Reset to idle when settings change during completed state. */
function resetIfCompleted(): void {
  if (appState === 'completed' || appState === 'completion') {
    cancelAnimationFrame(rafId);
    renderer.clearCompletion();
    appState = 'idle';
    consoleCtrl.setStatus('idle');
    consoleCtrl.setConfigEnabled(true);
  }
}

function startCompletion(): void {
  appState = 'completion';
  consoleCtrl.setConfigEnabled(false);
  renderer.startCompletion();
  scheduleFrame();
}

// ── RAF loop ──

function frame(now: number): void {
  if (appState === 'running') {
    renderer.drawFrame(now, elapsedMs, remainingMs);
    rafId = requestAnimationFrame(frame);
  } else if (appState === 'completion') {
    const result = renderer.drawCompletion(now);
    if (result === 'hold') {
      // Flash done — dots stay lit
      appState = 'completed';
      consoleCtrl.setStatus('idle');
      consoleCtrl.setConfigEnabled(true);
      // No more RAF needed — static display
    } else {
      rafId = requestAnimationFrame(frame);
    }
  }
}

function scheduleFrame(): void {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

// ── Persist current config ──

function persistConfig(): void {
  writeParams({
    t: CONFIG.duration,
    res: CONFIG.resolution,
    dir: CONFIG.direction,
    shape: CONFIG.shapeType,
    dash: CONFIG.dashboardOn,
    theme: CONFIG.theme.name.toLowerCase(),
    s: 0,
  });
}

// ── Console callbacks ──

consoleCtrl.onStart = () => startTimer();
consoleCtrl.onPause = () => pauseTimer();
consoleCtrl.onStop = () => stopTimer();

consoleCtrl.onDurationChange = (sec) => {
  CONFIG.duration = sec;
  persistConfig();
  resetIfCompleted();
  if (appState === 'idle') { initRenderer(); renderer.drawIdle(); }
};

consoleCtrl.onResolutionChange = (res) => {
  CONFIG.resolution = res;
  persistConfig();
  resetIfCompleted();
  if (appState === 'idle') { initRenderer(); renderer.drawIdle(); }
};

consoleCtrl.onDirectionChange = (dir) => {
  CONFIG.direction = dir;
  persistConfig();
  resetIfCompleted();
  if (appState === 'idle') { initRenderer(); renderer.drawIdle(); }
};

consoleCtrl.onShapeChange = (shape) => {
  CONFIG.shapeType = shape;
  persistConfig();
  resetIfCompleted();
  if (appState === 'idle') { initRenderer(); renderer.drawIdle(); }
};

consoleCtrl.onDashboardToggle = (on) => {
  CONFIG.dashboardOn = on;
  persistConfig();
  resetIfCompleted();
  if (appState === 'idle') { initRenderer(); renderer.drawIdle(); }
};

consoleCtrl.onThemeChange = (name) => {
  CONFIG.theme = getThemeByName(name);
  consoleCtrl.setAccentColor(CONFIG.theme.grainRGB);
  persistConfig();
  resetIfCompleted();
  if (appState === 'idle') { initRenderer(); renderer.drawIdle(); }
};

consoleCtrl.onShareURL = () => {
  const url = getShareURL({
    t: CONFIG.duration,
    res: CONFIG.resolution,
    dir: CONFIG.direction,
    shape: CONFIG.shapeType,
    dash: CONFIG.dashboardOn,
    theme: CONFIG.theme.name.toLowerCase(),
    s: 0,
  });
  navigator.clipboard.writeText(url);
};

consoleCtrl.onResetDefaults = () => {
  const def = getDefaults();
  CONFIG.duration = def.t;
  CONFIG.resolution = def.res;
  CONFIG.direction = def.dir;
  CONFIG.shapeType = def.shape;
  CONFIG.dashboardOn = def.dash;
  CONFIG.theme = getThemeByName(def.theme);
  persistConfig();
  window.location.reload();
};

// ── Resize ──

let resizeTimer: number | null = null;
window.addEventListener('resize', () => {
  if (resizeTimer !== null) clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderer.handleResize(CONFIG.duration, CONFIG.resolution);
    if (appState === 'idle') renderer.drawIdle();
  }, 150);
});

// ── Visibility API ──

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
  } else {
    if (appState === 'running') {
      renderer.instantSnap(elapsedMs);
      scheduleFrame();
    }
  }
});

// ── Keyboard shortcuts ──

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (appState === 'idle' || appState === 'completed') startTimer();
    else if (appState === 'running') pauseTimer();
    else if (appState === 'paused') startTimer();
  } else if (e.code === 'Escape') {
    e.preventDefault();
    stopTimer();
  }
});

// ── Bootstrap ──

consoleCtrl.setAccentColor(CONFIG.theme.grainRGB);
initRenderer();
renderer.drawIdle();
