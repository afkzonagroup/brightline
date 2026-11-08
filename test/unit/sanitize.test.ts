import { describe, expect, it } from 'vitest';
import { isPlainCssSelector, sanitizeLinks, sanitizeSnapshot, sanitizeTimerTexts } from '../../src/browser/sanitize.js';

const caps = { maxClickables: 2, maxToggles: 2, maxTextBlocks: 2, maxPriceSignals: 2 };

describe('sanitizing data read from a hostile page', () => {
  it('survives wrong types entirely', () => {
    for (const raw of [null, undefined, 42, 'x', [], { dialogs: 'x', clickables: {}, toggles: [null, 5] }]) {
      const s = sanitizeSnapshot(raw, caps);
      expect(Array.isArray(s.clickables)).toBe(true);
      expect(typeof s.url).toBe('string');
    }
  });

  it('caps strings and arrays and marks truncation', () => {
    const big = 'x'.repeat(1_000_000);
    const s = sanitizeSnapshot(
      {
        url: big,
        title: big,
        textBlocks: [{ selector: 'p', text: big }, { selector: 'p', text: 'a' }, { selector: 'p', text: 'b' }],
        clickables: [{ selector: 'a', text: big, rect: { x: Number.NaN, width: -5 }, style: { opacity: 7, fontSizePx: 1e9 } }],
      },
      caps,
    );
    expect(s.url.length).toBe(2048);
    expect(s.textBlocks).toHaveLength(2);
    expect(s.textBlocks[0]?.text.length).toBe(600);
    expect(s.truncated).toBe(true);
    expect(s.clickables[0]?.rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(s.clickables[0]?.style.opacity).toBe(1);
    expect(s.clickables[0]?.style.fontSizePx).toBe(1000);
  });

  it('keeps dialog indexes in range and drops unsafe selectors', () => {
    const s = sanitizeSnapshot(
      {
        dialogs: [{ selector: '#d', text: 't', consent: 'yes' }],
        toggles: [
          { selector: 'internal:control=enter-frame', kind: 'evil', checked: 1, dialog: 7 },
          { selector: 'a >> b', checked: true, dialog: 0 },
        ],
      },
      caps,
    );
    expect(s.dialogs[0]?.consent).toBe(false);
    expect(s.toggles[0]).toMatchObject({ selector: '', kind: 'checkbox', checked: false, dialog: -1 });
    expect(s.toggles[1]).toMatchObject({ selector: '', checked: true, dialog: 0 });
  });

  it('plain CSS selectors only', () => {
    expect(isPlainCssSelector('html > body > p:nth-of-type(2)')).toBe(true);
    expect(isPlainCssSelector('#a\\:b')).toBe(true);
    for (const bad of ['', 'xpath=//a', 'text=x', 'a >> b', 'a\nb', 'x'.repeat(601)]) expect(isPlainCssSelector(bad)).toBe(false);
  });

  it('timers and links', () => {
    expect(sanitizeTimerTexts([{ selector: '#t', text: '00:10' }, 'bad', { text: 5 }], 2)).toEqual([
      { selector: '#t', text: '00:10' },
      { selector: '', text: '' },
    ]);
    expect(sanitizeLinks(['https://a.example/', 'javascript:alert(1)', 5, `https://a.example/${'x'.repeat(3000)}`], 10)).toEqual(['https://a.example/']);
    expect(sanitizeLinks('nope', 10)).toEqual([]);
  });
});
