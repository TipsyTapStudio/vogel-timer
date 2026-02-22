/**
 * url-params.ts — URL parameter serialization & localStorage persistence.
 */

import type { ShapeType } from '../engine/shape-draw';
import type { FillDirection } from '../engine/vogel-engine';

export interface VogelParams {
  t: number;          // duration in seconds
  res: number;        // resolution (0.1, 0.25, 0.5, 1.0)
  dir: FillDirection;
  shape: ShapeType;
  dash: boolean;      // dashboard on/off
  theme: string;
  s: number;          // PRNG seed
}

const DEFAULTS: VogelParams = {
  t: 300,
  res: 0.5,
  dir: 'in-out',
  shape: 'circle',
  dash: true,
  theme: 'seed',
  s: 0,
};

const STORAGE_KEY = 'vogel-timer-settings';

/** Read params from URL, then localStorage, then defaults. */
export function readParams(): VogelParams {
  const url = new URLSearchParams(window.location.search);
  const stored = loadStorage();

  return {
    t:     num(url.get('t'))     ?? stored.t     ?? DEFAULTS.t,
    res:   num(url.get('res'))   ?? stored.res   ?? DEFAULTS.res,
    dir:   (url.get('dir') as FillDirection)   ?? stored.dir   ?? DEFAULTS.dir,
    shape: validShape(url.get('shape')) ?? validShape(stored.shape as string) ?? DEFAULTS.shape,
    dash:  bool(url.get('dash')) ?? stored.dash  ?? DEFAULTS.dash,
    theme: url.get('theme')      ?? stored.theme ?? DEFAULTS.theme,
    s:     num(url.get('s'))     ?? stored.s     ?? DEFAULTS.s,
  };
}

/** Write params to URL and localStorage. */
export function writeParams(params: VogelParams): void {
  const url = new URLSearchParams();
  url.set('t', String(params.t));
  url.set('res', String(params.res));
  url.set('dir', params.dir);
  url.set('shape', params.shape);
  url.set('dash', params.dash ? '1' : '0');
  url.set('theme', params.theme);
  if (params.s) url.set('s', String(params.s));

  const newUrl = `${window.location.pathname}?${url.toString()}`;
  window.history.replaceState(null, '', newUrl);

  saveStorage(params);
}

/** Get a shareable URL string. */
export function getShareURL(params: VogelParams): string {
  const url = new URL(window.location.href);
  url.searchParams.set('t', String(params.t));
  url.searchParams.set('res', String(params.res));
  url.searchParams.set('dir', params.dir);
  url.searchParams.set('shape', params.shape);
  url.searchParams.set('dash', params.dash ? '1' : '0');
  url.searchParams.set('theme', params.theme);
  if (params.s) url.searchParams.set('s', String(params.s));
  return url.toString();
}

export function getDefaults(): VogelParams {
  return { ...DEFAULTS };
}

// ── Helpers ──

function num(val: string | null): number | undefined {
  if (val === null) return undefined;
  const n = parseFloat(val);
  return isNaN(n) ? undefined : n;
}

const VALID_SHAPES: Set<string> = new Set(['circle', 'square', 'triangle', 'pentagon']);

function validShape(val: string | null | undefined): ShapeType | undefined {
  if (!val) return undefined;
  return VALID_SHAPES.has(val) ? (val as ShapeType) : undefined;
}

function bool(val: string | null): boolean | undefined {
  if (val === null) return undefined;
  return val === '1' || val === 'true';
}

function loadStorage(): Partial<VogelParams> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStorage(params: VogelParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // Silently fail if storage is full
  }
}
