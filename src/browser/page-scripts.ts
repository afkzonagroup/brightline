// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Functions that run inside the scanned page via `page.evaluate`.
 *
 * They are constant code from this package (never user input), take only
 * plain-data arguments and must be self-contained: no references to module
 * scope, because Playwright serialises the function source.
 */

import type { PageSnapshot } from './snapshot.js';

/** Arguments for {@link collectSnapshot}. */
export interface CollectArgs {
  readonly moneySource: string;
  readonly consentSource: string;
  readonly dialogHintSource: string;
  readonly maxClickables: number;
  readonly maxToggles: number;
  readonly maxTextBlocks: number;
  readonly maxPriceSignals: number;
  /** Elements examined for overlays, text and prices (very large DOMs are truncated). */
  readonly maxElements: number;
}

/** In-page collector. Returns a {@link PageSnapshot}. */
export function collectSnapshot(args: CollectArgs): PageSnapshot {
  const money = new RegExp(args.moneySource, 'iu');
  const moneyGlobal = new RegExp(args.moneySource, 'giu');
  const consentRe = new RegExp(args.consentSource, 'iu');
  const dialogHint = new RegExp(args.dialogHintSource, 'iu');
  let truncated = false;

  const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const cap = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

  const cssPath = (el: Element): string => {
    if (el.id !== '' && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }
    const parts: string[] = [];
    let node: Element = el;
    for (let depth = 0; depth < 25; depth += 1) {
      const tag = node.tagName.toLowerCase();
      if (node.id !== '' && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const parent: Element | null = node.parentElement;
      if (parent === null) {
        parts.unshift(tag);
        break;
      }
      const current: Element = node;
      const same = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${String(same.indexOf(current) + 1)})` : tag);
      node = parent;
    }
    return parts.join(' > ');
  };

  const isVisible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.05) return false;
    return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  };

  const alpha = (color: string): number => {
    const m = /rgba?\(([^)]+)\)/.exec(color);
    if (m === null) return color === 'transparent' ? 0 : 1;
    const parts = (m[1] ?? '').split(/[\s,/]+/).filter((p) => p !== '');
    return parts.length >= 4 ? Number(parts[3]) : 1;
  };

  const backgroundOf = (el: Element | null): string => {
    let node = el;
    while (node !== null) {
      const bg = getComputedStyle(node).backgroundColor;
      if (alpha(bg) > 0.5) return bg;
      node = node.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };

  // Dialogs and overlays
  const explicit = Array.from(
    document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open],[aria-modal="true"]'),
  ).filter(isVisible);
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const allElements = Array.from(document.body.querySelectorAll('*'));
  if (allElements.length > args.maxElements) truncated = true;
  const all = allElements.slice(0, args.maxElements);
  const overlayCandidates = all.filter((el) => {
    if (explicit.some((d) => d.contains(el) || el.contains(d))) return false;
    const style = getComputedStyle(el);
    const positioned = style.position === 'fixed' || style.position === 'sticky';
    const hinted = dialogHint.test(`${el.id} ${typeof el.className === 'string' ? el.className : ''}`);
    if (!positioned && !hinted) return false;
    if (!isVisible(el)) return false;
    if (el.querySelector('button,a[href],[role="button"],input[type="submit"],input[type="button"]') === null) return false;
    const rect = el.getBoundingClientRect();
    return positioned ? (rect.width * rect.height) / viewportArea >= 0.02 : true;
  });
  const overlays = overlayCandidates.filter((el) => !overlayCandidates.some((o) => o !== el && o.contains(el)));
  const dialogEls = [...explicit, ...overlays].slice(0, 30);
  const dialogs = dialogEls.map((el, index) => {
    const text = cap(norm(el.textContent), 1000);
    return { index, selector: cssPath(el), text, consent: consentRe.test(text) };
  });
  const dialogIndexOf = (el: Element): number => {
    let best = -1;
    let bestDepth = -1;
    dialogEls.forEach((d, i) => {
      if (!d.contains(el)) return;
      let depth = 0;
      let n: Element | null = d;
      while (n !== null) {
        depth += 1;
        n = n.parentElement;
      }
      if (depth > bestDepth) {
        best = i;
        bestDepth = depth;
      }
    });
    return best;
  };

  // Clickables
  const clickableEls = Array.from(
    document.querySelectorAll(
      'button,a[href],[role="button"],[role="link"],input[type="submit"],input[type="button"],input[type="reset"],summary',
    ),
  );
  if (clickableEls.length > args.maxClickables) truncated = true;
  const clickables = clickableEls.slice(0, args.maxClickables).map((el) => {
    const input = el instanceof HTMLInputElement ? el : null;
    const text = cap(norm(input !== null ? input.value : (el as HTMLElement).innerText || el.textContent) || norm(el.getAttribute('aria-label')), 300);
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      selector: cssPath(el),
      text,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') ?? '',
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      style: {
        color: style.color,
        backgroundColor: style.backgroundColor,
        effectiveBackground: backgroundOf(el),
        parentBackground: backgroundOf(el.parentElement),
        fontSizePx: Number.parseFloat(style.fontSize) || 0,
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
        borderWidthPx: style.borderTopStyle === 'none' ? 0 : Number.parseFloat(style.borderTopWidth) || 0,
        borderColor: style.borderTopColor,
        textDecoration: style.textDecorationLine,
        opacity: Number(style.opacity),
      },
      visible: isVisible(el),
      dialog: dialogIndexOf(el),
    };
  });

  // Toggles
  const labelText = (el: Element): string => {
    const aria = norm(el.getAttribute('aria-label'));
    if (aria !== '') return aria;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy !== null && labelledBy !== '') {
      const t = labelledBy
        .split(/\s+/)
        .map((id) => norm(document.getElementById(id)?.textContent))
        .join(' ')
        .trim();
      if (t !== '') return t;
    }
    if (el.id !== '') {
      const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLabel !== null) return norm(forLabel.textContent);
    }
    const wrapping = el.closest('label');
    if (wrapping !== null) return norm(wrapping.textContent);
    if (!(el instanceof HTMLInputElement)) {
      const own = norm(el.textContent);
      if (own !== '') return own;
    }
    const parentText = norm(el.parentElement?.textContent);
    return parentText.length <= 300 ? parentText : '';
  };
  const toggleEls = Array.from(
    document.querySelectorAll('input[type="checkbox"],input[type="radio"],[role="switch"],[role="checkbox"]'),
  );
  if (toggleEls.length > args.maxToggles) truncated = true;
  const toggles = toggleEls.slice(0, args.maxToggles).map((el) => {
    const input = el instanceof HTMLInputElement ? el : null;
    const kind: 'checkbox' | 'radio' | 'switch' =
      input?.type === 'radio' ? 'radio' : el.getAttribute('role') === 'switch' ? 'switch' : 'checkbox';
    const checked = input !== null ? input.checked : el.getAttribute('aria-checked') === 'true';
    const disabled = input !== null ? input.disabled : el.getAttribute('aria-disabled') === 'true';
    const label = cap(labelText(el), 300);
    const labelEl = el.id !== '' ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
    const visible = isVisible(el) || (labelEl !== null && isVisible(labelEl));
    return {
      selector: cssPath(el),
      kind,
      checked,
      disabled,
      required: input?.required ?? el.getAttribute('aria-required') === 'true',
      label,
      visible,
      dialog: dialogIndexOf(el),
    };
  });

  // Text blocks: elements with their own text, short enough to be one statement.
  const textBlocks: { selector: string; text: string; el: Element }[] = [];
  for (const el of all) {
    if (textBlocks.length >= args.maxTextBlocks) {
      truncated = true;
      break;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') continue;
    const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && norm(n.textContent) !== '');
    if (!hasOwnText) continue;
    const raw = norm(el.textContent);
    if (raw === '' || raw.length > 600) continue;
    if (!isVisible(el)) continue;
    const text = norm((el as HTMLElement).innerText) || raw;
    textBlocks.push({ selector: cssPath(el), text, el });
  }

  // Price signals
  const containerOf = (el: Element, minMoney: number): Element => {
    let node: Element = el;
    for (let i = 0; i < 6; i += 1) {
      const parent = node.parentElement;
      if (parent === null || parent === document.body) break;
      node = parent;
      const text = norm(node.textContent);
      if (text.length > 1500) break;
      const count = (text.match(moneyGlobal) ?? []).length;
      if (count >= minMoney) return node;
    }
    return node;
  };
  const priceSignals: PageSnapshot['priceSignals'][number][] = [];
  const pushSignal = (kind: 'strikethrough' | 'percent', el: Element, minMoney: number): void => {
    if (priceSignals.length >= args.maxPriceSignals) {
      truncated = true;
      return;
    }
    const container = containerOf(el, minMoney);
    priceSignals.push({
      kind,
      selector: cssPath(el),
      text: cap(norm(el.textContent), 120),
      containerSelector: cssPath(container),
      containerText: cap(norm((container as HTMLElement).innerText || container.textContent), 1500),
    });
  };
  for (const el of all) {
    const text = norm(el.textContent);
    if (text === '' || text.length > 60 || !money.test(text)) continue;
    const tag = el.tagName.toLowerCase();
    const struck = tag === 's' || tag === 'del' || tag === 'strike' || getComputedStyle(el).textDecorationLine.includes('line-through');
    if (!struck || !isVisible(el)) continue;
    if (el.parentElement !== null && priceSignals.some((p) => p.selector === cssPath(el.parentElement as Element))) continue;
    pushSignal('strikethrough', el, 2);
  }
  for (const block of textBlocks) {
    if (block.text.length <= 40 && /\d\s?%/.test(block.text)) pushSignal('percent', block.el, 1);
  }

  return {
    url: location.href,
    title: cap(norm(document.title), 300),
    lang: cap(norm(document.documentElement.getAttribute('lang')), 20).toLowerCase(),
    dialogs,
    clickables,
    toggles,
    textBlocks: textBlocks.map(({ selector, text }) => ({ selector, text })),
    priceSignals,
    truncated,
  };
}

/** Arguments for {@link collectTimerTexts}. */
export interface TimerArgs {
  readonly timerSource: string;
  readonly max: number;
  readonly maxElements: number;
}

/** In-page: elements whose text looks like a countdown. Deepest matches only. */
export function collectTimerTexts(args: TimerArgs): { selector: string; text: string }[] {
  const re = new RegExp(args.timerSource, 'iu');
  const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const cssPath = (el: Element): string => {
    if (el.id !== '' && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    let node: Element = el;
    for (let depth = 0; depth < 25; depth += 1) {
      const tag = node.tagName.toLowerCase();
      if (node.id !== '' && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const parent: Element | null = node.parentElement;
      if (parent === null) {
        parts.unshift(tag);
        break;
      }
      const current: Element = node;
      const same = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${String(same.indexOf(current) + 1)})` : tag);
      node = parent;
    }
    return parts.join(' > ');
  };
  const matches = Array.from(document.body.querySelectorAll('*')).slice(0, args.maxElements).filter((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript') return false;
    const text = norm(el.textContent);
    if (text.length === 0 || text.length > 120) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && re.test(text);
  });
  const deepest = matches.filter((el) => !matches.some((m) => m !== el && el.contains(m)));
  return deepest.slice(0, args.max).map((el) => ({ selector: cssPath(el), text: norm(el.textContent) }));
}
