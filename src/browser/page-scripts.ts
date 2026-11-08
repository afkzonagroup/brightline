// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Functions that run inside the scanned page via `page.evaluate`.
 *
 * They are constant code from this package (never user input), take only
 * plain-data arguments and must be self-contained: no references to module
 * scope, because Playwright serialises the function source. The helpers for
 * the deep walk, rendered text and selectors therefore live inside
 * {@link pageTask}, which runs every collection task.
 *
 * Shadow DOM: the collector reads the document and every open shadow root,
 * within a node budget, a shadow-root budget and a nesting limit. Closed
 * shadow roots cannot be reached from page script and are not read.
 */

import type { PageSnapshot } from './snapshot.js';

/** Bounds of the deep walk (document plus open shadow roots). */
export interface WalkLimits {
  /** Elements visited in total, across the document and all shadow roots. */
  readonly maxNodes: number;
  /** Open shadow roots entered. */
  readonly maxShadowRoots: number;
  /** Nesting depth of shadow roots: a shadow root inside a shadow root is depth 2. */
  readonly maxShadowDepth: number;
}

/** Arguments for the snapshot task. */
export interface CollectArgs extends WalkLimits {
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

/** Arguments for the countdown task. */
export interface TimerArgs extends WalkLimits {
  readonly timerSource: string;
  readonly max: number;
  readonly maxElements: number;
}

/** Arguments for the link task. */
export interface LinkArgs extends WalkLimits {
  readonly max: number;
}

/** A task for {@link pageTask}. */
export type PageTask =
  | { readonly kind: 'snapshot'; readonly args: CollectArgs }
  | { readonly kind: 'timers'; readonly args: TimerArgs }
  | { readonly kind: 'links'; readonly args: LinkArgs }
  | { readonly kind: 'structure'; readonly args: WalkLimits };

/**
 * In-page entry point. `snapshot` returns a {@link PageSnapshot}, `timers` a
 * list of `{ selector, text }`, `links` a list of absolute URLs, `structure` a
 * short string that changes when elements are added, removed or moved (not
 * when only text changes). The caller re-validates whatever comes back, because
 * page scripts share this world.
 */
export function pageTask(task: PageTask): unknown {
  const limits: WalkLimits = task.args;
  const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const cap = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);
  /** Longest ancestor chain followed. The HTML parser nests at most 512 deep. */
  const MAX_UP = 4096;
  /** Nodes one rendered-text read may visit. */
  const TEXT_NODE_BUDGET = 5000;

  // ---- Deep walk ---------------------------------------------------------------
  // One TreeWalker per tree on an explicit stack: no recursion, the stack is at
  // most maxShadowDepth + 1 deep, and every element visited counts against
  // maxNodes. A host is followed by its shadow tree, then by its light children.
  const deep: Element[] = [];
  const hosts: Element[] = [];
  let walkTruncated = false;
  {
    const start = document.body;
    const stack: { walker: TreeWalker; depth: number }[] = [];
    const enter = (el: Element, depth: number): void => {
      const root = el.shadowRoot;
      if (root === null) return;
      if (depth + 1 > limits.maxShadowDepth || hosts.length >= limits.maxShadowRoots) {
        walkTruncated = true;
        return;
      }
      hosts.push(el);
      stack.push({ walker: document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT), depth: depth + 1 });
    };
    stack.push({ walker: document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT), depth: 0 });
    enter(start, 0);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top === undefined) break;
      const next = top.walker.nextNode();
      if (next === null) {
        stack.pop();
        continue;
      }
      if (deep.length >= limits.maxNodes) {
        walkTruncated = true;
        break;
      }
      const el = next as Element;
      deep.push(el);
      enter(el, top.depth);
    }
  }
  const hasShadow = hosts.length > 0;

  if (task.kind === 'structure') {
    // FNV-1a over tag names and child counts, in walk order.
    let h = 0x811c9dc5;
    for (const el of deep) {
      const key = `${el.tagName}/${String(el.childElementCount)};`;
      for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
    }
    return `${String(deep.length)}:${String(h)}`;
  }

  /** Host of the shadow tree that contains `n`, or null in the document. */
  const hostOf = (n: Node): Element | null => {
    const root = n.getRootNode();
    return root.nodeType === 11 && (root as ShadowRoot).host instanceof Element ? (root as ShadowRoot).host : null;
  };
  /** Parent as Playwright's CSS engine sees it: the parent element, or the host for a shadow root's top level. */
  const selectorParent = (el: Element): Element | null => {
    if (el.parentElement !== null) return el.parentElement;
    const parent = el.parentNode;
    return parent !== null && parent.nodeType === 11 && (parent as ShadowRoot).host instanceof Element ? (parent as ShadowRoot).host : null;
  };
  /** Parent in the rendered tree: the slot an element is assigned to, else the selector parent. */
  const flatParent = (el: Element): Element | null => {
    if (hasShadow) {
      const slot = el.assignedSlot;
      if (slot !== null) return slot;
    }
    return selectorParent(el);
  };
  /** True if `b` is `a` or is rendered inside it, across shadow boundaries and slots. */
  const deepContains = (a: Element, b: Element): boolean => {
    if (a.contains(b)) return true;
    if (!hasShadow) return false;
    let n: Element | null = b;
    for (let i = 0; n !== null && i < MAX_UP; i += 1) {
      n = flatParent(n);
      if (n === a) return true;
    }
    return false;
  };

  // Elements whose rendered text differs from their light-DOM text: shadow
  // hosts, slots and everything above them. Only these need the slower read.
  const needsFlat = new Set<Element>();
  const markUp = (el: Element): void => {
    let n: Element | null = el;
    for (let i = 0; n !== null && !needsFlat.has(n) && i < MAX_UP; i += 1) {
      needsFlat.add(n);
      n = selectorParent(n);
    }
  };
  if (hasShadow) {
    for (const host of hosts) markUp(host);
    for (const el of deep) if (el.tagName === 'SLOT') markUp(el);
  }

  /**
   * Rendered text of an element: shadow content in place of light children,
   * slots replaced by the nodes assigned to them, scripts and styles skipped,
   * whitespace collapsed while reading. Stops once longer than `limit`.
   * Returns null when the node budget runs out first.
   */
  const flatText = (root: Element, limit: number): string | null => {
    let out = '';
    let budget = TEXT_NODE_BUDGET;
    const stack: Node[] = [root];
    while (stack.length > 0) {
      if (out.length > limit + 1) return out;
      if (budget <= 0) return null;
      budget -= 1;
      const n = stack.pop();
      if (n === undefined) break;
      if (n.nodeType === 3) {
        const piece = (n.nodeValue ?? '').replace(/\s+/g, ' ');
        out += out.endsWith(' ') && piece.startsWith(' ') ? piece.slice(1) : piece;
        continue;
      }
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      const tag = e.tagName.toUpperCase();
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;
      let kids: ArrayLike<Node>;
      if (e.shadowRoot !== null) kids = e.shadowRoot.childNodes;
      else if (tag === 'SLOT') kids = (e as HTMLSlotElement).assignedNodes({ flatten: true });
      else kids = e.childNodes;
      for (let i = Math.min(kids.length, budget) - 1; i >= 0; i -= 1) {
        const kid = kids[i];
        if (kid !== undefined) stack.push(kid);
      }
    }
    return out;
  };
  /** Text of an element as rendered (its `textContent` when no shadow DOM is involved). */
  const textOf = (el: Element, limit: number): string => (needsFlat.has(el) ? (flatText(el, limit) ?? el.textContent) : el.textContent);
  /** Visible text: `innerText` when no shadow DOM is involved, else the rendered text. */
  const visibleText = (el: Element, limit: number): string =>
    needsFlat.has(el) ? norm(flatText(el, limit) ?? el.textContent) : norm((el as HTMLElement).innerText) || norm(el.textContent);

  // ---- Selectors ---------------------------------------------------------------
  // Plain CSS that Playwright resolves to exactly this element. Playwright's CSS
  // engine pierces open shadow roots and treats the top level of a shadow root
  // as children of the host for ">". Each step is therefore made unique among
  // all such children of its parent (light children and shadow top level
  // together), and an id is used only if it is unique across the document and
  // every walked shadow root. A step that cannot be made unique gives an empty
  // selector rather than one that may point at another element.
  const shadowIds = new Map<string, number>();
  if (hasShadow) {
    for (const el of deep) {
      if (el.id !== '' && hostOf(el) !== null) shadowIds.set(el.id, (shadowIds.get(el.id) ?? 0) + 1);
    }
  }
  const idUnique = new Map<string, boolean>();
  const uniqueId = (id: string): boolean => {
    let unique = idUnique.get(id);
    if (unique === undefined) {
      unique = document.querySelectorAll(`#${CSS.escape(id)}`).length + (shadowIds.get(id) ?? 0) === 1;
      idUnique.set(id, unique);
    }
    return unique;
  };
  // Position of every child among its siblings, computed once per parent, so
  // that a parent with very many children does not make selectors quadratic.
  interface Siblings {
    readonly total: number;
    readonly byTag: Map<string, Element[]>;
    readonly position: Map<Element, { readonly ofType: number; readonly ofAll: number }>;
  }
  const siblingCache = new Map<ParentNode, Siblings>();
  const siblingsOf = (container: Element | ShadowRoot): Siblings => {
    let info = siblingCache.get(container);
    if (info === undefined) {
      const byTag = new Map<string, Element[]>();
      const position = new Map<Element, { ofType: number; ofAll: number }>();
      const children = Array.from(container.children);
      children.forEach((c, index) => {
        const list = byTag.get(c.tagName) ?? [];
        list.push(c);
        byTag.set(c.tagName, list);
        position.set(c, { ofType: list.length, ofAll: index + 1 });
      });
      info = { total: children.length, byTag, position };
      siblingCache.set(container, info);
    }
    return info;
  };
  const stepCache = new Map<Element, string | null>();
  const stepOf = (n: Element): string | null => {
    const cached = stepCache.get(n);
    if (cached !== undefined) return cached;
    const tag = CSS.escape(n.tagName.toLowerCase());
    const container = n.parentNode;
    let step: string | null = tag;
    if (container !== null && container.nodeType !== 9) {
      const mine = siblingsOf(container as Element | ShadowRoot);
      const sameCount = mine.byTag.get(n.tagName)?.length ?? 1;
      const pos = mine.position.get(n) ?? { ofType: 1, ofAll: 1 };
      const nth = `${tag}:nth-of-type(${String(pos.ofType)})`;
      step = sameCount > 1 ? nth : tag;
      const parent = selectorParent(n);
      const shadow = parent?.shadowRoot ?? null;
      if (parent !== null && shadow !== null) {
        // Children of the same host in the other tree compete for this step.
        const rivals = siblingsOf(container === shadow ? parent : shadow).byTag.get(n.tagName) ?? [];
        if (rivals.length > 100) step = null;
        else if (rivals.length > 0) {
          const candidates = [
            nth,
            `${nth}:nth-last-of-type(${String(sameCount - pos.ofType + 1)})`,
            `${tag}:nth-child(${String(pos.ofAll)}):nth-last-child(${String(mine.total - pos.ofAll + 1)})`,
          ];
          for (const attr of Array.from(n.attributes).slice(0, 10)) {
            if (attr.value.length <= 80) candidates.push(`${nth}[${CSS.escape(attr.name)}="${CSS.escape(attr.value)}"]`);
          }
          step = candidates.find((c) => !rivals.some((r) => r.matches(c))) ?? null;
        }
      }
    }
    stepCache.set(n, step);
    return step;
  };
  const cssPath = (el: Element): string => {
    if (el.id !== '' && uniqueId(el.id)) return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    let node: Element | null = el;
    for (let depth = 0; node !== null && depth < 25; depth += 1) {
      if (node.id !== '' && uniqueId(node.id)) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const step = stepOf(node);
      if (step === null) return '';
      parts.unshift(step);
      node = selectorParent(node);
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

  // ---- Links -------------------------------------------------------------------
  if (task.kind === 'links') {
    const out: string[] = [];
    for (const el of deep) {
      if (out.length >= task.args.max) break;
      if (!(el instanceof HTMLAnchorElement) || !el.hasAttribute('href')) continue;
      const href = el.href;
      if (href.startsWith('http:') || href.startsWith('https:')) out.push(href);
    }
    return out;
  }

  // ---- Countdown texts: deepest matches only -------------------------------------
  if (task.kind === 'timers') {
    const re = new RegExp(task.args.timerSource, 'iu');
    const matches = deep.slice(0, task.args.maxElements).filter((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript') return false;
      const text = norm(textOf(el, 120));
      if (text.length === 0 || text.length > 120) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && re.test(text);
    });
    const deepest = matches.filter((el) => !matches.some((m) => m !== el && deepContains(el, m)));
    return deepest.slice(0, task.args.max).map((el) => ({ selector: cssPath(el), text: norm(textOf(el, 120)) }));
  }

  // ---- Snapshot ------------------------------------------------------------------
  const args = task.args;
  const money = new RegExp(args.moneySource, 'iu');
  const moneyGlobal = new RegExp(args.moneySource, 'giu');
  const consentRe = new RegExp(args.consentSource, 'iu');
  const dialogHint = new RegExp(args.dialogHintSource, 'iu');
  let truncated = walkTruncated;

  const alpha = (color: string): number => {
    const m = /rgba?\(([^)]+)\)/.exec(color);
    if (m === null) return color === 'transparent' ? 0 : 1;
    const parts = (m[1] ?? '').split(/[\s,/]+/).filter((p) => p !== '');
    return parts.length >= 4 ? Number(parts[3]) : 1;
  };

  const backgroundOf = (el: Element | null): string => {
    let node = el;
    for (let i = 0; node !== null && i < MAX_UP; i += 1) {
      const bg = getComputedStyle(node).backgroundColor;
      if (alpha(bg) > 0.5) return bg;
      node = flatParent(node);
    }
    return 'rgb(255, 255, 255)';
  };

  const CLICKABLE = 'button,a[href],[role="button"],[role="link"],input[type="submit"],input[type="button"],input[type="reset"],summary';
  const BUTTONISH = 'button,a[href],[role="button"],input[type="submit"],input[type="button"]';
  const TOGGLE = 'input[type="checkbox"],input[type="radio"],[role="switch"],[role="checkbox"]';
  const DIALOG = '[role="dialog"],[role="alertdialog"],dialog[open],[aria-modal="true"]';

  // Dialogs and overlays
  const explicit = deep.filter((el) => el.matches(DIALOG)).filter(isVisible);
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  if (deep.length > args.maxElements) truncated = true;
  const all = deep.slice(0, args.maxElements);
  const clickableEls = deep.filter((el) => el.matches(CLICKABLE));
  const buttonEls = hasShadow ? clickableEls.filter((el) => el.matches(BUTTONISH)) : [];
  const hasButton = (el: Element): boolean =>
    el.querySelector(BUTTONISH) !== null || (needsFlat.has(el) && buttonEls.some((b) => deepContains(el, b)));
  const overlayCandidates = all.filter((el) => {
    const style = getComputedStyle(el);
    const positioned = style.position === 'fixed' || style.position === 'sticky';
    const hinted = dialogHint.test(`${el.id} ${typeof el.className === 'string' ? el.className : ''}`);
    if (!positioned && !hinted) return false;
    if (explicit.some((d) => deepContains(d, el) || deepContains(el, d))) return false;
    if (!isVisible(el)) return false;
    if (!hasButton(el)) return false;
    const rect = el.getBoundingClientRect();
    return positioned ? (rect.width * rect.height) / viewportArea >= 0.02 : true;
  });
  const overlays = overlayCandidates.filter((el) => !overlayCandidates.some((o) => o !== el && deepContains(o, el)));
  const dialogEls = [...explicit, ...overlays].slice(0, 30);
  const dialogs = dialogEls.map((el, index) => {
    const text = cap(norm(textOf(el, 1000)), 1000);
    return { index, selector: cssPath(el), text, consent: consentRe.test(text) };
  });
  const dialogIndex = new Map<Element, number>();
  dialogEls.forEach((el, i) => {
    if (!dialogIndex.has(el)) dialogIndex.set(el, i);
  });
  /** Index of the innermost dialog the element is rendered in, or -1. */
  const dialogIndexOf = (el: Element): number => {
    let n: Element | null = el;
    for (let i = 0; n !== null && i < MAX_UP; i += 1) {
      const hit = dialogIndex.get(n);
      if (hit !== undefined) return hit;
      n = flatParent(n);
    }
    return -1;
  };

  // Clickables
  if (clickableEls.length > args.maxClickables) truncated = true;
  const clickables = clickableEls.slice(0, args.maxClickables).map((el) => {
    const input = el instanceof HTMLInputElement ? el : null;
    const text = cap(norm(input !== null ? input.value : visibleText(el, 300)) || norm(el.getAttribute('aria-label')), 300);
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
        parentBackground: backgroundOf(flatParent(el)),
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

  // Toggles. Labels are looked up in the toggle's own tree, where its ids are
  // scoped. A toggle inside a shadow root with no label there takes the label
  // of its host, as in <label>Insurance <x-check></x-check></label>.
  const rootOf = (el: Element): Document | ShadowRoot => {
    const root = el.getRootNode();
    return root.nodeType === 11 ? (root as ShadowRoot) : document;
  };
  const labelFor = (el: Element): Element | null => (el.id === '' ? null : rootOf(el).querySelector(`label[for="${CSS.escape(el.id)}"]`));
  const ownLabel = (el: Element): string => {
    const aria = norm(el.getAttribute('aria-label'));
    if (aria !== '') return aria;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy !== null && labelledBy !== '') {
      const root = rootOf(el);
      const t = labelledBy
        .split(/\s+/)
        .slice(0, 10)
        .map((id) => {
          const ref = id === '' ? null : root.getElementById(id);
          return ref === null ? '' : norm(textOf(ref, 300));
        })
        .join(' ')
        .trim();
      if (t !== '') return t;
    }
    const forLabel = labelFor(el);
    if (forLabel !== null) return norm(textOf(forLabel, 300));
    const wrapping = el.closest('label');
    if (wrapping !== null) return norm(textOf(wrapping, 300));
    return '';
  };
  const labelText = (el: Element): string => {
    let target: Element | null = el;
    for (let i = 0; target !== null && i <= limits.maxShadowDepth; i += 1) {
      const t = ownLabel(target);
      if (t !== '') return t;
      target = hostOf(target);
    }
    if (!(el instanceof HTMLInputElement)) {
      const own = norm(textOf(el, 300));
      if (own !== '') return own;
    }
    const parent = flatParent(el);
    const parentText = parent === null ? '' : norm(textOf(parent, 300));
    return parentText.length <= 300 ? parentText : '';
  };
  const toggleEls = deep.filter((el) => el.matches(TOGGLE));
  if (toggleEls.length > args.maxToggles) truncated = true;
  const toggles = toggleEls.slice(0, args.maxToggles).map((el) => {
    const input = el instanceof HTMLInputElement ? el : null;
    const kind: 'checkbox' | 'radio' | 'switch' =
      input?.type === 'radio' ? 'radio' : el.getAttribute('role') === 'switch' ? 'switch' : 'checkbox';
    const checked = input !== null ? input.checked : el.getAttribute('aria-checked') === 'true';
    const disabled = input !== null ? input.disabled : el.getAttribute('aria-disabled') === 'true';
    const label = cap(labelText(el), 300);
    const labelEl = el.id !== '' ? labelFor(el) : el.closest('label');
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
    const raw = norm(textOf(el, 600));
    if (raw === '' || raw.length > 600) continue;
    if (!isVisible(el)) continue;
    const text = visibleText(el, 600) || raw;
    textBlocks.push({ selector: cssPath(el), text, el });
  }

  // Price signals
  const containerOf = (el: Element, minMoney: number): Element => {
    let node: Element = el;
    for (let i = 0; i < 6; i += 1) {
      const parent = flatParent(node);
      if (parent === null || parent === document.body) break;
      node = parent;
      const text = norm(textOf(node, 1500));
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
      text: cap(norm(textOf(el, 120)), 120),
      containerSelector: cssPath(container),
      containerText: cap(visibleText(container, 1500), 1500),
    });
  };
  for (const el of all) {
    const text = norm(textOf(el, 60));
    if (text === '' || text.length > 60 || !money.test(text)) continue;
    const tag = el.tagName.toLowerCase();
    const struck = tag === 's' || tag === 'del' || tag === 'strike' || getComputedStyle(el).textDecorationLine.includes('line-through');
    if (!struck || !isVisible(el)) continue;
    const parent = flatParent(el);
    if (parent !== null && priceSignals.some((p) => p.selector === cssPath(parent))) continue;
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

/**
 * In-page, on one element: its label (`mode: 'label'`: the value of an input
 * button, else its text, aria-label or title) or its text (`mode: 'text'`).
 * The text is `innerText`, or the rendered text within a node budget when the
 * element is a shadow host, a slot or contains one. Used for the order button
 * and the total of a journey mark, whose selectors come from the journey file.
 */
export function elementText(el: Element, mode: string): string {
  const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  if (mode === 'label' && el instanceof HTMLInputElement) return norm(el.value) || norm(el.getAttribute('aria-label'));
  const involvesShadow =
    el.shadowRoot !== null ||
    el.tagName === 'SLOT' ||
    el.querySelector('slot') !== null ||
    Array.from(el.querySelectorAll('*'))
      .slice(0, 2000)
      .some((d) => d.shadowRoot !== null);
  let text: string;
  if (!involvesShadow) text = norm((el as HTMLElement).innerText);
  else {
    let out = '';
    let budget = 5000;
    const stack: Node[] = [el];
    while (stack.length > 0 && budget > 0 && out.length <= 1000) {
      budget -= 1;
      const n = stack.pop();
      if (n === undefined) break;
      if (n.nodeType === 3) {
        out += n.nodeValue ?? '';
        continue;
      }
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      const tag = e.tagName.toUpperCase();
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;
      const kids: ArrayLike<Node> =
        e.shadowRoot !== null ? e.shadowRoot.childNodes : tag === 'SLOT' ? (e as HTMLSlotElement).assignedNodes({ flatten: true }) : e.childNodes;
      for (let i = Math.min(kids.length, budget) - 1; i >= 0; i -= 1) {
        const kid = kids[i];
        if (kid !== undefined) stack.push(kid);
      }
    }
    text = norm(out);
  }
  if (mode === 'text') return text;
  return text || norm(el.getAttribute('aria-label')) || norm(el.getAttribute('title'));
}

/** Arguments for {@link waitForQuietDom}. */
export interface QuietArgs extends WalkLimits {
  /** Time without DOM changes that counts as settled. */
  readonly quietMs: number;
  /** Longest wait. */
  readonly maxMs: number;
}

/**
 * In-page: wait until the DOM, including open shadow roots, has had no changes
 * for `quietMs`, or until `maxMs` has passed. Elements added or removed
 * always count; text or attributes of a node that keep changing (a ticking
 * clock) stop counting after three changes, so they do not hold the wait open. Resolves to `{ changed }`: true if an element was added or
 * removed meanwhile (text-only updates do not count). Used after a click and
 * after a client-side route change, so that content revealed by them is
 * collected.
 */
export function waitForQuietDom(args: QuietArgs): Promise<{ changed: boolean }> {
  return new Promise((resolve) => {
    const started = Date.now();
    let last = started;
    let changed = false;
    let observed = 0;
    const changesPerNode = new Map<Node, number>();
    const options: MutationObserverInit = { subtree: true, childList: true, characterData: true, attributes: true };
    const observer = new MutationObserver((records) => {
      for (const record of records.slice(0, 1000)) {
        let structural = false;
        for (const list of [record.addedNodes, record.removedNodes]) {
          for (const n of Array.from(list).slice(0, 100)) {
            if (n.nodeType !== 1) continue;
            structural = true;
            changed = true;
            const root = (n as Element).shadowRoot;
            if (root !== null && observed < args.maxShadowRoots) {
              observed += 1;
              observer.observe(root, options);
            }
          }
        }
        // Text and attribute updates count only the first three times per node.
        const seen = (changesPerNode.get(record.target) ?? 0) + 1;
        if (changesPerNode.size < 10_000) changesPerNode.set(record.target, seen);
        if (structural || seen <= 3) last = Date.now();
      }
    });
    observer.observe(document, options);
    // Existing open shadow roots, found with the same bounded walk as the collector.
    const stack: TreeWalker[] = [document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT)];
    let visited = 0;
    while (stack.length > 0 && visited < args.maxNodes && observed < args.maxShadowRoots) {
      const top = stack[stack.length - 1];
      const next = top === undefined ? null : top.nextNode();
      if (next === null) {
        stack.pop();
        continue;
      }
      visited += 1;
      const root = (next as Element).shadowRoot;
      if (root !== null && stack.length <= args.maxShadowDepth) {
        observed += 1;
        observer.observe(root, options);
        stack.push(document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT));
      }
    }
    const tick = (): void => {
      const now = Date.now();
      if (now - last >= args.quietMs || now - started >= args.maxMs) {
        observer.disconnect();
        resolve({ changed });
        return;
      }
      setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  });
}
