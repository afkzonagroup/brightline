import { describe, expect, it } from 'vitest';
import { asymmetryReasons, choiceRole, detectAsymmetricChoice, measure } from '../../src/detectors/asymmetric.js';
import { detectClaims, findClaims } from '../../src/detectors/claims.js';
import { assessDeclineLabel, detectConfirmshaming } from '../../src/detectors/confirmshaming.js';
import { detectCountdownReset, excessSeconds, isTickingDown, parseTimerSeconds } from '../../src/detectors/countdown.js';
import { detectHiddenCosts, parseAmount, type TotalCheckpoint } from '../../src/detectors/hidden-costs.js';
import { DETECTORS, runPageDetectors } from '../../src/detectors/index.js';
import { assessOrderButtonLabel, detectOrderButton } from '../../src/detectors/order-button.js';
import { classifyPreselected, detectPreselected, mentionsNonZeroAmount } from '../../src/detectors/preselected.js';
import { countAmounts, detectPriceReduction, isDiscountPercent, statesPriorPrice } from '../../src/detectors/price-reduction.js';
import { OFFICIAL_ORDER_BUTTON_LABELS } from '../../src/legal/order-button-labels.js';
import { PROVISIONS } from '../../src/legal/provisions.js';
import type { DraftFinding } from '../../src/types.js';
import { LINK_STYLE, clickable, dialog, snapshot, style, toggle } from '../helpers/snapshot.js';

/** Every finding must be phrased as a possible issue, never as a verdict. */
function expectNeutral(findings: readonly DraftFinding[]): void {
  for (const f of findings) {
    expect(f.explanation.toLowerCase()).not.toMatch(/\billegal\b|\bunlawful\b|\bviolat|\bbreach/);
    expect(f.provisions.length).toBeGreaterThan(0);
    for (const p of f.provisions) expect(PROVISIONS[p]).toBeDefined();
    if (f.detector !== 'order-button-label' || f.confidence !== 'low') expect(f.explanation).toMatch(/possible issue/);
  }
}

describe('countdown', () => {
  it.each([
    ['Offer ends in 00:14:59', 899],
    ['14:59', 899],
    ['1d 02:00:00', 93_600],
    ['2 days 3 hours 4 minutes 5 seconds', 2 * 86_400 + 3 * 3600 + 4 * 60 + 5],
    ['14m 05s', 845],
    ['02h 14m 05s', 2 * 3600 + 14 * 60 + 5],
  ])('parses %s', (text, seconds) => {
    expect(parseTimerSeconds(text)).toBe(seconds);
  });
  it.each(['no time here', '12:75', '5 minutes', 'Total €12.99'])('does not parse %s', (text) => {
    expect(parseTimerSeconds(text)).toBeNull();
  });

  it('recognises ticking and computes excess', () => {
    expect(isTickingDown({ seconds: 900, atMs: 0 }, { seconds: 898, atMs: 1500 })).toBe(true);
    expect(isTickingDown({ seconds: 900, atMs: 0 }, { seconds: 900, atMs: 1500 })).toBe(false);
    expect(isTickingDown({ seconds: 900, atMs: 0 }, { seconds: 800, atMs: 1500 })).toBe(false);
    expect(excessSeconds({ seconds: 900, atMs: 0 }, { seconds: 900, atMs: 10_000 })).toBe(10);
  });

  const base = { selector: '#t', text: '00:15:00', first: { seconds: 900, atMs: 0 }, tick: { seconds: 898, atMs: 1500 } };

  it('high confidence when the timer restarts on reload', () => {
    const f = detectCountdownReset([{ ...base, reload: { seconds: 900, atMs: 8000 }, fresh: { seconds: 900, atMs: 9000 } }]);
    expect(f).toHaveLength(1);
    expect(f[0]?.confidence).toBe('high');
    expect(f[0]?.provisions[0]).toBe('ucpd-annex-i-7');
    expectNeutral(f);
  });
  it('low confidence when it restarts only in a fresh session (a real cart or seat hold does that too)', () => {
    const f = detectCountdownReset([{ ...base, reload: { seconds: 892, atMs: 8000 }, fresh: { seconds: 900, atMs: 9000 } }]);
    expect(f[0]?.confidence).toBe('low');
    expect(f[0]?.explanation).toMatch(/per visitor/);
  });
  it('no finding for a genuine deadline or a timer that does not tick', () => {
    expect(detectCountdownReset([{ ...base, reload: { seconds: 892, atMs: 8000 }, fresh: { seconds: 891, atMs: 9000 } }])).toEqual([]);
    expect(detectCountdownReset([{ ...base, tick: { seconds: 900, atMs: 1500 }, reload: { seconds: 900, atMs: 8000 } }])).toEqual([]);
    expect(detectCountdownReset([{ ...base }])).toEqual([]);
  });
});

describe('pre-selected options', () => {
  it('classifies paid extras and consent', () => {
    expect(classifyPreselected('Add travel insurance (+€9.99)', 'checkbox', false)).toEqual({ paid: 'high', consent: null });
    expect(classifyPreselected('Priority boarding', 'checkbox', false)).toEqual({ paid: 'medium', consent: null });
    expect(classifyPreselected('Send me the newsletter', 'checkbox', false)).toEqual({ paid: null, consent: 'high' });
    expect(classifyPreselected('Personalised content', 'switch', false)).toEqual({ paid: null, consent: 'medium' });
    expect(classifyPreselected('Personalised content', 'switch', true)).toEqual({ paid: null, consent: 'high' });
    expect(classifyPreselected('Add gift box +€2', 'checkbox', false).paid).toBe('medium');
    expect(classifyPreselected('Versicherung hinzufügen 9,99 €', 'checkbox', false).paid).toBe('high');
  });
  it('weak cues need an amount; contact-only consent is low', () => {
    expect(classifyPreselected('Save my details for express checkout', 'checkbox', false)).toEqual({ paid: null, consent: null });
    expect(classifyPreselected('I have read the data protection notice', 'checkbox', false)).toEqual({ paid: null, consent: null });
    expect(classifyPreselected('Express delivery (+€6.90)', 'checkbox', false).paid).toBe('high');
    expect(classifyPreselected('Premium support +€4/month', 'checkbox', false).paid).toBe('medium');
    expect(classifyPreselected('Add a tip of €2', 'checkbox', false).paid).toBe('medium');
    expect(classifyPreselected('Send me order updates by SMS', 'checkbox', false)).toEqual({ paid: null, consent: 'low' });
    expect(classifyPreselected('Send me order updates by SMS', 'checkbox', true).consent).toBe('high');
    expect(classifyPreselected('Express shipping €9.99', 'radio', false)).toEqual({ paid: 'medium', consent: null });
  });
  it('does not flag benign defaults', () => {
    for (const label of ['Remember me', 'Strictly necessary', 'Billing address same as delivery', 'Standard shipping €4.99', '', 'I am over 18']) {
      expect(classifyPreselected(label, 'checkbox', false)).toEqual({ paid: null, consent: null });
    }
    expect(classifyPreselected('Express shipping', 'radio', false)).toEqual({ paid: null, consent: null });
    expect(classifyPreselected('Newsletter', 'radio', false).consent).toBeNull();
  });
  it('detects only checked, enabled, visible toggles', () => {
    const s = snapshot({
      toggles: [
        toggle('Add travel insurance (+€9.99)'),
        toggle('Add travel insurance (+€9.99)', { checked: false }),
        toggle('Add travel insurance (+€9.99)', { disabled: true }),
        toggle('Add travel insurance (+€9.99)', { visible: false }),
        toggle('Newsletter and special offers'),
      ],
    });
    const f = detectPreselected(s);
    expect(f.map((x) => x.provisions[0])).toEqual(['crd-art-22', 'gdpr-art-4-11']);
    expectNeutral(f);
  });
  it('recognises non-zero amounts', () => {
    expect(mentionsNonZeroAmount('+€0.00')).toBe(false);
    expect(mentionsNonZeroAmount('+ 3 zł')).toBe(true);
    expect(mentionsNonZeroAmount('no price')).toBe(false);
  });
});

describe('confirmshaming', () => {
  it.each([
    ['No thanks, I prefer to pay full price', 'medium'],
    ["No, I don't want to save money", 'medium'],
    ['I’d rather pay full price', 'medium'],
    ["I'll stay uninformed", 'medium'],
    ['Nein, ich zahle lieber den vollen Preis', 'medium'],
    ['No, I like boring emails', 'medium'],
    ['Nope, losing is my thing', 'low'],
  ])('flags %s', (label, confidence) => {
    expect(assessDeclineLabel(label)?.confidence).toBe(confidence);
  });
  it.each(['No thanks', 'Not now', 'Decline', 'Reject all', 'Maybe later', 'Continue shopping', 'Yes, save 10%', 'Get the deal', "I'm in, give me the discount", ''])(
    'does not flag %s',
    (label) => {
      expect(assessDeclineLabel(label)).toBeNull();
    },
  );
  it('marks translations and consent context', () => {
    const s = snapshot({
      dialogs: [dialog('We use cookies', true)],
      clickables: [clickable('Nein, ich zahle lieber den vollen Preis'), clickable('No, I prefer to pay full price', { visible: false })],
    });
    const f = detectConfirmshaming(s);
    expect(f).toHaveLength(1);
    expect(f[0]?.evidence.details.phraseSource).toBe('translation');
    expect(f[0]?.provisions).toContain('gdpr-art-4-11');
    expectNeutral(f);
  });
});

describe('asymmetric choice', () => {
  it('classifies roles', () => {
    expect(choiceRole('Accept all')).toBe('accept');
    expect(choiceRole('Reject all')).toBe('decline');
    expect(choiceRole('No thanks, I prefer to pay full price')).toBe('decline');
    expect(choiceRole('Manage preferences')).toBe('settings');
    expect(choiceRole('Read our policy')).toBeNull();
    expect(choiceRole('Alle akzeptieren')).toBe('accept');
    // Refusing optional cookies can start with an accepting verb.
    expect(choiceRole('Allow necessary cookies only')).toBe('decline');
    expect(choiceRole('Accept only essential cookies')).toBe('decline');
    expect(choiceRole('Use necessary cookies only')).toBe('decline');
    expect(choiceRole('Nur notwendige Cookies akzeptieren')).toBe('decline');
    expect(choiceRole('Continuer sans accepter')).toBe('decline');
    expect(choiceRole('Leisti tik būtinus')).toBe('decline');
  });

  it('a banner whose refuse option is "Allow necessary only" is compared, not reported as missing a refuse option', () => {
    const s = snapshot({ dialogs: [dialog('We use cookies', true)], clickables: [clickable('Allow all cookies'), clickable('Allow necessary cookies only')] });
    expect(detectAsymmetricChoice(s)).toEqual([]);
  });

  it('consent findings do not cite DSA Art. 25 (excluded by Art. 25(2)); other dialogs are capped at medium', () => {
    const strong = { rect: { x: 0, y: 0, width: 300, height: 56 }, style: style({ fontSizePx: 20 }) };
    const weak = { rect: { x: 0, y: 0, width: 40, height: 14 }, style: style({ ...LINK_STYLE, color: 'rgb(200, 200, 200)', fontSizePx: 11 }) };
    const consent = detectAsymmetricChoice(snapshot({ dialogs: [dialog('cookies', true)], clickables: [clickable('Accept all', strong), clickable('reject', weak)] }));
    expect(consent[0]?.provisions).toEqual(['gdpr-art-4-11', 'gdpr-art-7']);
    expect(consent[0]?.explanation).not.toContain('DSA');
    const promo = detectAsymmetricChoice(snapshot({ dialogs: [dialog('Get 10% off')], clickables: [clickable('Subscribe', strong), clickable('No thanks', weak)] }));
    expect(promo[0]?.confidence).toBe('medium');
    expect(promo[0]?.provisions).toEqual(['ucpd-art-5', 'dsa-art-25']);
    const shamingInConsent = detectConfirmshaming(snapshot({ dialogs: [dialog('cookies', true)], clickables: [clickable('No, I prefer to pay full price')] }));
    expect(shamingInConsent[0]?.provisions).not.toContain('dsa-art-25');
  });

  it('measures fill, border and contrast', () => {
    const filled = measure(clickable('Accept'));
    expect(filled.filled).toBe(true);
    const link = measure(clickable('reject', { style: style({ ...LINK_STYLE, color: 'rgb(200, 200, 200)' }) }));
    expect(link.filled).toBe(false);
    expect(link.contrast).toBeLessThan(2);
    const outlined = measure(clickable('Reject', { style: style({ ...LINK_STYLE, borderWidthPx: 2, borderColor: 'rgb(26, 86, 181)' }) }));
    expect(outlined.bordered).toBe(true);
  });

  it('flags a strongly asymmetric consent banner with high confidence', () => {
    const s = snapshot({
      dialogs: [dialog('We use cookies for advertising', true)],
      clickables: [
        clickable('Accept all', { rect: { x: 0, y: 0, width: 300, height: 56 }, style: style({ fontSizePx: 20 }) }),
        clickable('reject', { rect: { x: 0, y: 0, width: 40, height: 14 }, style: style({ ...LINK_STYLE, color: 'rgb(200, 200, 200)', fontSizePx: 11 }) }),
      ],
    });
    const f = detectAsymmetricChoice(s);
    expect(f).toHaveLength(1);
    expect(f[0]?.confidence).toBe('high');
    expect(f[0]?.provisions.slice(0, 2)).toEqual(['gdpr-art-4-11', 'gdpr-art-7']);
    expectNeutral(f);
  });

  it('no finding for balanced choices or bordered secondary buttons', () => {
    const balanced = snapshot({ dialogs: [dialog('cookies', true)], clickables: [clickable('Accept all'), clickable('Reject all')] });
    expect(detectAsymmetricChoice(balanced)).toEqual([]);
    const outlined = snapshot({
      dialogs: [dialog('cookies', true)],
      clickables: [clickable('Accept all'), clickable('Reject all', { style: style({ ...LINK_STYLE, color: 'rgb(26, 86, 181)', borderWidthPx: 2, borderColor: 'rgb(26, 86, 181)' }) })],
    });
    expect(detectAsymmetricChoice(outlined)).toEqual([]);
  });

  it('reports a consent request without any refuse option (low) but not other dialogs', () => {
    const consent = snapshot({ dialogs: [dialog('cookies', true)], clickables: [clickable('Accept all'), clickable('Settings')] });
    const f = detectAsymmetricChoice(consent);
    expect(f[0]?.confidence).toBe('low');
    expect(f[0]?.evidence.details.settingsOption).toBe(true);
    const promo = snapshot({ dialogs: [dialog('Get 10% off')], clickables: [clickable('Subscribe')] });
    expect(detectAsymmetricChoice(promo)).toEqual([]);
  });

  it('ignores controls outside dialogs', () => {
    const s = snapshot({ dialogs: [dialog('cookies', true)], clickables: [clickable('Accept all', { dialog: -1 }), clickable('reject', { dialog: -1 })] });
    expect(detectAsymmetricChoice(s)).toEqual([]);
  });

  it('reason thresholds', () => {
    const a = { area: 300, fontSizePx: 16, contrast: 7, filled: true, bordered: false, opacity: 1 };
    expect(asymmetryReasons(a, { ...a, area: 101 })).toEqual([]);
    expect(asymmetryReasons(a, { ...a, area: 100 })).toEqual(['smaller']);
    expect(asymmetryReasons(a, { ...a, filled: false })).toEqual(['link-styled']);
    expect(asymmetryReasons(a, { ...a, fontSizePx: 11 })).toEqual(['smaller-text']);
    expect(asymmetryReasons(a, { ...a, contrast: 2.5 })).toEqual(['low-contrast']);
    expect(asymmetryReasons(a, { ...a, opacity: 0.4 })).toEqual(['faded']);
    expect(asymmetryReasons(a, { ...a, contrast: null })).toEqual([]);
  });
});

describe('claims to verify', () => {
  it.each([
    ['Only 2 left in stock', 'stock'],
    ['Only 3 rooms left', 'stock'],
    ['5 items left', 'stock'],
    ['Almost sold out!', 'stock'],
    ['In high demand', 'stock'],
    ['12 people are viewing this', 'activity'],
    ['34 customers bought this in the last 24 hours', 'activity'],
    ['Booked 7 times today', 'activity'],
    ['In 4 other carts', 'activity'],
    ['Sale ends today', 'urgency'],
    ['Limited-time offer', 'urgency'],
    ['Hurry!', 'urgency'],
    ['Nur noch 3 Stück verfügbar', 'stock'],
    ['Liko tik 2', 'stock'],
  ])('finds %s', (text, kind) => {
    expect(findClaims(text).map((c) => c.kind)).toContain(kind);
  });
  it.each(['In stock', 'Ships in 2 days', 'Rated 4.5 by 120 customers', 'Only available in blue', 'Free delivery', 'Opening hours 09:00 to 18:00'])(
    'ignores %s',
    (text) => {
      expect(findClaims(text)).toEqual([]);
    },
  );
  it('creates low-confidence findings, deduplicated', () => {
    const f = detectClaims(snapshot({ textBlocks: [{ selector: 'p', text: 'Only 2 left in stock' }, { selector: 'div', text: 'Only 2 left in stock' }] }));
    expect(f).toHaveLength(1);
    expect(f[0]?.confidence).toBe('low');
    expectNeutral(f);
  });
});

describe('price reduction without prior price', () => {
  const signal = (kind: 'strikethrough' | 'percent', text: string, containerText: string, containerSelector = '#p') => ({
    kind,
    selector: '#s',
    text,
    containerSelector,
    containerText,
  });
  it('recognises discount percentages and prior-price statements', () => {
    expect(isDiscountPercent('-30%')).toBe(true);
    expect(isDiscountPercent('30% off')).toBe(true);
    expect(isDiscountPercent('Save 20%')).toBe(true);
    expect(isDiscountPercent('100% wool')).toBe(false);
    expect(isDiscountPercent('VAT 21%')).toBe(false);
    expect(statesPriorPrice('Lowest price in the last 30 days: €59.99')).toBe(true);
    expect(statesPriorPrice('Niedrigster Preis der letzten 30 Tage: 59,99 €')).toBe(true);
    expect(statesPriorPrice('Mažiausia kaina per 30 dienų: 59,99 €')).toBe(true);
    expect(statesPriorPrice('Was €80')).toBe(false);
    // A returns policy is not a prior-price statement.
    expect(statesPriorPrice('€89.00 Free returns within 30 days')).toBe(false);
    expect(statesPriorPrice('30 Tage Rückgaberecht')).toBe(false);
    expect(statesPriorPrice('Lowest price of the 30 days before the reduction: €99')).toBe(true);
  });
  it('a struck price next to a 30-day returns note is still reported', () => {
    const f = detectPriceReduction(snapshot({ priceSignals: [signal('strikethrough', '€120.00', 'Boots €120.00 €89.00 Free returns within 30 days')] }));
    expect(f.map((x) => x.confidence)).toEqual(['low']);
  });
  it('a percentage with a second amount (a reference price written as text) is low, not medium', () => {
    const f = detectPriceReduction(snapshot({ priceSignals: [signal('percent', '-30%', 'Jacket -30% €56.00 was €80.00')] }));
    expect(f.map((x) => x.confidence)).toEqual(['low']);
    expect(f[0]?.evidence.details.otherAmountShown).toBe(true);
    expect(countAmounts('Jacke -30% 49,99 € statt 71,41 €')).toBe(2);
    expect(countAmounts('€49.99 €49.99')).toBe(1);
  });
  it('medium for a percentage without any prior price, low for a bare strikethrough', () => {
    const f = detectPriceReduction(
      snapshot({
        priceSignals: [signal('percent', '-30%', 'Jacket -30% €49.99', '#a'), signal('strikethrough', '€120.00', 'Boots €120.00 €89.00', '#b')],
      }),
    );
    expect(f.map((x) => x.confidence)).toEqual(['medium', 'low']);
    expect(f[0]?.provisions[0]).toBe('pid-art-6a');
    expectNeutral(f);
  });
  it('no finding with a prior-price statement, without money, or for non-discount percentages', () => {
    expect(
      detectPriceReduction(
        snapshot({
          priceSignals: [
            signal('percent', '-30%', 'Jacket -30% €49.99 Lowest price in the last 30 days: €71.41', '#a'),
            signal('percent', 'up to 50% off', 'Summer sale: up to 50% off', '#b'),
            signal('percent', '100% wool', 'Hat €19.99 100% wool', '#c'),
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe('order button', () => {
  it('accepts every official wording', () => {
    expect(OFFICIAL_ORDER_BUTTON_LABELS).toHaveLength(23);
    for (const l of OFFICIAL_ORDER_BUTTON_LABELS) {
      expect(assessOrderButtonLabel(l.text).verdict).toBe('official');
      expect(assessOrderButtonLabel(l.text.toUpperCase()).verdict).toBe('official');
    }
  });
  it.each([
    ['Buy now', 'payment-word'],
    ['Pay €54.99', 'payment-word'],
    ['Place order and pay', 'payment-word'],
    ['Jetzt kaufen', 'payment-word'],
    ['Kostenpflichtig bestellen', 'payment-word'],
    ['Zamawiam i płacę', 'payment-word'],
    ['Ordina e paga', 'payment-word'],
    ['Valider mon achat', 'payment-word'],
    ['Finalizar compra', 'payment-word'],
    ['Bestellen met betaalverplichting', 'payment-word'],
    ['Complete purchase', 'payment-word'],
    ['Continue to payment', 'unclear'],
    ['Confirm order', 'unclear'],
    ['Continue', 'generic'],
    ['Continue →', 'generic'],
    ['Submit', 'generic'],
    ['', 'generic'],
    ['Place order', 'unclear'],
    ['Complete order', 'unclear'],
    ['Bestellen', 'unclear'],
    ['Paypal', 'unclear'],
  ])('%s -> %s', (label, verdict) => {
    expect(assessOrderButtonLabel(label).verdict).toBe(verdict);
  });
  it('creates findings with the right confidence', () => {
    const f = detectOrderButton([
      { markName: 'a', selector: '#a', label: 'Continue', found: true },
      { markName: 'b', selector: '#b', label: 'Place order', found: true },
      { markName: 'c', selector: '#c', label: 'Buy now', found: true },
      { markName: 'd', selector: '#d', label: '', found: false },
    ]);
    expect(f.map((x) => x.confidence)).toEqual(['high', 'medium', 'low']);
    expect(f.every((x) => x.provisions[0] === 'crd-art-8-2-sub2')).toBe(true);
    expectNeutral(f);
  });
});

describe('hidden costs', () => {
  it.each([
    ['€50.00', 50],
    ['Total: 1.234,56 €', 1234.56],
    ['€1,234.56', 1234.56],
    ['1 234,56 zł', 1234.56],
    ['12,99', 12.99],
    ['1234', 1234],
    ['1,234', 1234],
    ['Total (2 items): €45.00', 45],
    ['Total (2 items): 45,00', 45],
    ['CHF 1\'234.50', 1234.5],
  ])('parses %s', (text, value) => {
    expect(parseAmount(text)).toBe(value);
  });
  it('returns null without digits', () => {
    expect(parseAmount('free')).toBeNull();
  });
  const cp = (name: string, total: number | null, actions: string[] = ['click'], expectTotalChange = false): TotalCheckpoint => ({
    markName: name,
    selector: '#total',
    totalText: String(total),
    total,
    actionsSincePrevious: actions,
    expectTotalChange,
  });
  it('medium when only navigation happened, low when the user chose something', () => {
    expect(detectHiddenCosts([cp('cart', 50), cp('review', 54.99)])[0]?.confidence).toBe('medium');
    expect(detectHiddenCosts([cp('cart', 50), cp('review', 54.99, ['select', 'click'])])[0]?.confidence).toBe('low');
  });
  it('no finding when the total stays, drops, is expected to change, or is unknown', () => {
    expect(detectHiddenCosts([cp('a', 50), cp('b', 50), cp('c', 45)])).toEqual([]);
    expect(detectHiddenCosts([cp('a', 50), cp('b', 60, ['click'], true)])).toEqual([]);
    expect(detectHiddenCosts([cp('a', 50), cp('b', null), cp('c', 50)])).toEqual([]);
  });
  it('low when the extra amount was already shown on the earlier step', () => {
    const f = detectHiddenCosts([{ ...cp('cart', 50), amountsShown: [50, 4.99] }, cp('review', 54.99)]);
    expect(f[0]?.confidence).toBe('low');
    expect(f[0]?.evidence.details.amountShownEarlier).toBe(true);
    expect(detectHiddenCosts([{ ...cp('cart', 50), amountsShown: [50, 3.5] }, cp('review', 54.99)])[0]?.confidence).toBe('medium');
  });
  it('compares with the last known total', () => {
    const f = detectHiddenCosts([cp('a', 50), cp('b', null), cp('c', 55)]);
    expect(f[0]?.evidence.details.increase).toBe(5);
    expectNeutral(f);
  });
});

describe('detector registry', () => {
  it('lists every detector with known provisions', () => {
    expect(DETECTORS.map((d) => d.id)).toHaveLength(8);
    for (const d of DETECTORS) for (const p of d.provisions) expect(PROVISIONS[p]).toBeDefined();
  });
  it('runs only enabled page detectors', () => {
    const s = snapshot({ toggles: [toggle('Newsletter')], textBlocks: [{ selector: 'p', text: 'Only 2 left' }] });
    expect(runPageDetectors(s, new Set(['claim-to-verify'])).map((f) => f.detector)).toEqual(['claim-to-verify']);
  });
});
