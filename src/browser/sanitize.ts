// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Re-validation of data read from a scanned page.
 *
 * The collector runs in the page's own JavaScript world, so a hostile page can
 * replace built-ins and return anything: wrong types, huge strings, huge
 * arrays. Everything is checked here, in Node, before detectors see it.
 */

import type { CollectArgs } from './page-scripts.js';
import type { ClickableInfo, DialogInfo, PageSnapshot, PriceSignal, Rect, StyleInfo, TextBlock, ToggleInfo } from './snapshot.js';

const MAX_SELECTOR = 600;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown): boolean => v === true;
const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = num(v, fallback);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);

/**
 * True for a selector produced by the collector: plain CSS with no Playwright
 * engine prefix and no chaining. Used before handing a page-supplied selector
 * back to Playwright.
 */
export function isPlainCssSelector(selector: string): boolean {
  return (
    selector.length > 0 &&
    selector.length <= MAX_SELECTOR &&
    !selector.includes('>>') &&
    // A Playwright engine prefix such as "xpath=" or "internal:control=".
    !/^\s*[a-zA-Z_][\w:+*-]*\s*=/.test(selector) &&
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    !/[\u0000-\u001f\u007f]/.test(selector)
  );
}

const selector = (v: unknown): string => {
  const s = str(v, MAX_SELECTOR);
  return isPlainCssSelector(s) ? s : '';
};

const rect = (v: unknown): Rect => {
  const o = isObj(v) ? v : {};
  return { x: num(o.x), y: num(o.y), width: Math.max(0, num(o.width)), height: Math.max(0, num(o.height)) };
};

const style = (v: unknown): StyleInfo => {
  const o = isObj(v) ? v : {};
  return {
    color: str(o.color, 80),
    backgroundColor: str(o.backgroundColor, 80),
    effectiveBackground: str(o.effectiveBackground, 80),
    parentBackground: str(o.parentBackground, 80),
    fontSizePx: Math.min(1000, Math.max(0, num(o.fontSizePx))),
    fontWeight: Math.min(1000, Math.max(0, num(o.fontWeight, 400))),
    borderWidthPx: Math.min(1000, Math.max(0, num(o.borderWidthPx))),
    borderColor: str(o.borderColor, 80),
    textDecoration: str(o.textDecoration, 80),
    opacity: Math.min(1, Math.max(0, num(o.opacity, 1))),
  };
};

/** Validate and cap a snapshot returned by the page. Pure. */
export function sanitizeSnapshot(raw: unknown, caps: Pick<CollectArgs, 'maxClickables' | 'maxToggles' | 'maxTextBlocks' | 'maxPriceSignals'>): PageSnapshot {
  const o = isObj(raw) ? raw : {};
  const dialogs: DialogInfo[] = list(o.dialogs, 30).map((d, index) => {
    const x = isObj(d) ? d : {};
    return { index, selector: selector(x.selector), text: str(x.text, 1000), consent: bool(x.consent) };
  });
  const dialogIndex = (v: unknown): number => int(v, -1, dialogs.length - 1, -1);
  const clickables: ClickableInfo[] = list(o.clickables, caps.maxClickables).map((c) => {
    const x = isObj(c) ? c : {};
    return {
      selector: selector(x.selector),
      text: str(x.text, 300),
      tag: str(x.tag, 20),
      role: str(x.role, 40),
      rect: rect(x.rect),
      style: style(x.style),
      visible: bool(x.visible),
      dialog: dialogIndex(x.dialog),
    };
  });
  const toggles: ToggleInfo[] = list(o.toggles, caps.maxToggles).map((t) => {
    const x = isObj(t) ? t : {};
    const kind = x.kind === 'radio' || x.kind === 'switch' ? x.kind : 'checkbox';
    return {
      selector: selector(x.selector),
      kind,
      checked: bool(x.checked),
      disabled: bool(x.disabled),
      required: bool(x.required),
      label: str(x.label, 300),
      visible: bool(x.visible),
      dialog: dialogIndex(x.dialog),
    };
  });
  const textBlocks: TextBlock[] = list(o.textBlocks, caps.maxTextBlocks).map((b) => {
    const x = isObj(b) ? b : {};
    return { selector: selector(x.selector), text: str(x.text, 600) };
  });
  const priceSignals: PriceSignal[] = list(o.priceSignals, caps.maxPriceSignals).map((p) => {
    const x = isObj(p) ? p : {};
    return {
      kind: x.kind === 'percent' ? 'percent' : 'strikethrough',
      selector: selector(x.selector),
      text: str(x.text, 120),
      containerSelector: selector(x.containerSelector),
      containerText: str(x.containerText, 1500),
    };
  });
  const truncated =
    bool(o.truncated) ||
    (Array.isArray(o.clickables) && o.clickables.length > caps.maxClickables) ||
    (Array.isArray(o.toggles) && o.toggles.length > caps.maxToggles) ||
    (Array.isArray(o.textBlocks) && o.textBlocks.length > caps.maxTextBlocks) ||
    (Array.isArray(o.priceSignals) && o.priceSignals.length > caps.maxPriceSignals);
  return {
    url: str(o.url, 2048),
    title: str(o.title, 300),
    lang: str(o.lang, 20),
    dialogs,
    clickables,
    toggles,
    textBlocks,
    priceSignals,
    truncated,
  };
}

/** Validate countdown candidates returned by the page. Pure. */
export function sanitizeTimerTexts(raw: unknown, max: number): { selector: string; text: string }[] {
  return list(raw, max).map((r) => {
    const x = isObj(r) ? r : {};
    return { selector: selector(x.selector), text: str(x.text, 120) };
  });
}

/** Validate links returned by the page: http(s) strings only, capped. Pure. */
export function sanitizeLinks(raw: unknown, max: number): string[] {
  return list(raw, max).filter((l): l is string => typeof l === 'string' && l.length <= 2048 && /^https?:/i.test(l));
}
