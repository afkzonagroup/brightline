import type { ClickableInfo, DialogInfo, PageSnapshot, StyleInfo, ToggleInfo } from '../../src/browser/snapshot.js';

export const style = (over: Partial<StyleInfo> = {}): StyleInfo => ({
  color: 'rgb(255, 255, 255)',
  backgroundColor: 'rgb(26, 86, 181)',
  effectiveBackground: 'rgb(26, 86, 181)',
  parentBackground: 'rgb(255, 255, 255)',
  fontSizePx: 16,
  fontWeight: 400,
  borderWidthPx: 0,
  borderColor: 'rgb(0, 0, 0)',
  textDecoration: 'none',
  opacity: 1,
  ...over,
});

export const LINK_STYLE: Partial<StyleInfo> = {
  color: 'rgb(51, 51, 51)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  effectiveBackground: 'rgb(255, 255, 255)',
};

export const clickable = (text: string, over: Partial<ClickableInfo> = {}): ClickableInfo => ({
  selector: `#${text.replace(/\W+/g, '-')}`,
  text,
  tag: 'button',
  role: '',
  rect: { x: 0, y: 0, width: 160, height: 44 },
  style: style(),
  visible: true,
  dialog: 0,
  ...over,
});

export const toggle = (label: string, over: Partial<ToggleInfo> = {}): ToggleInfo => ({
  selector: '#t',
  kind: 'checkbox',
  checked: true,
  disabled: false,
  required: false,
  label,
  visible: true,
  dialog: -1,
  ...over,
});

export const dialog = (text: string, consent = false, index = 0): DialogInfo => ({ index, selector: `#d${String(index)}`, text, consent });

export const snapshot = (over: Partial<PageSnapshot> = {}): PageSnapshot => ({
  url: 'https://shop.example/',
  title: 'Shop',
  lang: 'en',
  dialogs: [],
  clickables: [],
  toggles: [],
  textBlocks: [],
  priceSignals: [],
  truncated: false,
  ...over,
});
