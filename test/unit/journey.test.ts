import { describe, expect, it } from 'vitest';
import { JOURNEY_LIMITS, JourneyValidationError, checkSelector, parseJourney, validateJourney } from '../../src/journey/schema.js';

const valid = {
  version: 1,
  name: 'checkout',
  startUrl: 'https://shop.example/product/1',
  steps: [
    { action: 'click', selector: '#add-to-cart' },
    { action: 'goto', url: 'https://shop.example/cart' },
    { action: 'fill', selector: 'input[name="email"]', value: 'test@example.com' },
    { action: 'select', selector: '#country', value: 'LT' },
    { action: 'check', selector: '#terms' },
    { action: 'uncheck', selector: '#news' },
    { action: 'waitFor', selector: 'text=Review' },
    { action: 'mark', name: 'review', total: '#total', orderButton: 'role=button[name="Buy now"]', expectTotalChange: false },
  ],
};

const fails = (input: unknown): string => {
  try {
    validateJourney(input);
    return 'valid';
  } catch (error) {
    if (error instanceof JourneyValidationError) return error.path;
    throw error;
  }
};

const withStep = (step: unknown) => ({ ...valid, steps: [step] });

describe('journey schema', () => {
  it('accepts a valid journey and returns a clean copy', () => {
    const j = validateJourney(JSON.parse(JSON.stringify(valid)));
    expect(j.steps).toHaveLength(8);
    expect(j.startUrl).toBe('https://shop.example/product/1');
  });

  it.each([
    [null, ''],
    [[], ''],
    ['x', ''],
    [{ ...valid, extra: true }, '/extra'],
    [{ ...valid, version: 2 }, '/version'],
    [{ ...valid, version: '1' }, '/version'],
    [{ ...valid, name: '' }, '/name'],
    [{ ...valid, name: '<script>' }, '/name'],
    [{ ...valid, name: 'x'.repeat(101) }, '/name'],
    [{ ...valid, startUrl: 'javascript:alert(1)' }, '/startUrl'],
    [{ ...valid, startUrl: 'file:///etc/passwd' }, '/startUrl'],
    [{ ...valid, startUrl: 'https://user:pw@shop.example/' }, '/startUrl'],
    [{ ...valid, startUrl: 'http://localhost/' }, '/startUrl'],
    [{ ...valid, steps: [] }, '/steps'],
    [{ ...valid, steps: {} }, '/steps'],
    [{ ...valid, steps: new Array(JOURNEY_LIMITS.maxSteps + 1).fill({ action: 'click', selector: 'a' }) }, '/steps'],
    [withStep({ action: 'eval', script: 'alert(1)' }), '/steps/0/action'],
    [withStep({ action: 'evaluate', selector: 'a' }), '/steps/0/action'],
    [withStep({ action: 'click' }), '/steps/0/selector'],
    [withStep({ action: 'click', selector: 5 }), '/steps/0/selector'],
    [withStep({ action: 'click', selector: 'a', timeout: 5 }), '/steps/0/timeout'],
    [withStep({ action: 'click', selector: 'x'.repeat(501) }), '/steps/0/selector'],
    [withStep({ action: 'click', selector: 'a\u0000' }), '/steps/0/selector'],
    [withStep({ action: 'click', selector: 'a >> internal:control=enter-frame' }), '/steps/0/selector'],
    [withStep({ action: 'click', selector: 'internal:text="x"' }), '/steps/0/selector'],
    [withStep({ action: 'click', selector: '_react=App' }), '/steps/0/selector'],
    [withStep({ action: 'click', selector: 'js=document.body' }), '/steps/0/selector'],
    [withStep({ action: 'click', selector: ' a' }), '/steps/0/selector'],
    [withStep({ action: 'fill', selector: 'a' }), '/steps/0/value'],
    [withStep({ action: 'fill', selector: 'a', value: 1 }), '/steps/0/value'],
    [withStep({ action: 'fill', selector: 'a', value: 'x'.repeat(1001) }), '/steps/0/value'],
    [withStep({ action: 'fill', selector: 'a', value: 'carriage\rreturn' }), '/steps/0/value'],
    [withStep({ action: 'click', selector: 'a\nb' }), '/steps/0/selector'],
    [withStep({ action: 'goto', url: 'data:text/html,<script>alert(1)</script>' }), '/steps/0/url'],
    [withStep({ action: 'goto', url: 'http://169.254.169.254.nip.io.local/' }), '/steps/0/url'],
    [withStep({ action: 'goto', url: 'https://a.example', selector: 'a' }), '/steps/0/selector'],
    [withStep({ action: 'mark' }), '/steps/0/name'],
    [withStep({ action: 'mark', name: 'a', expectTotalChange: 'yes' }), '/steps/0/expectTotalChange'],
    [withStep({ action: 'mark', name: 'a', total: 'a >> b' }), '/steps/0/total'],
    [withStep({ action: 'mark', name: 'a', orderButton: 'nth=0' }), '/steps/0/orderButton'],
    [{ ...valid, steps: [{ action: 'mark', name: 'a' }, { action: 'mark', name: 'a' }] }, '/steps/1/name'],
    [withStep('click'), '/steps/0'],
    [withStep(['click']), '/steps/0'],
  ])('rejects case %#', (input, path) => {
    expect(fails(input)).toBe(path);
  });

  it('rejects prototype keys and non-plain objects', () => {
    expect(fails(JSON.parse('{"__proto__":{"polluted":true},"version":1}'))).toBe('/__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(fails(withStep(JSON.parse('{"action":"click","selector":"a","constructor":{}}')))).toBe('/steps/0/constructor');
    class Fake {
      version = 1;
    }
    expect(fails(new Fake())).toBe('');
    expect(fails(Object.assign(Object.create({ inherited: 1 }) as object, valid))).toBe('');
  });

  it('allows the documented selector engines', () => {
    for (const s of ['#a', 'button.primary', 'text=Buy', 'role=button[name="Pay"]', 'css=a', 'data-testid=pay', 'id=x', 'xpath=//button', '//button']) {
      expect(checkSelector(s, '/s')).toBe(s);
    }
  });

  it('parseJourney enforces size and JSON', () => {
    expect(() => parseJourney('{')).toThrow(/not valid JSON/);
    expect(() => parseJourney(' '.repeat(JOURNEY_LIMITS.maxBytes + 1))).toThrow(/at most/);
    expect(parseJourney(JSON.stringify(valid)).name).toBe('checkout');
  });
});
