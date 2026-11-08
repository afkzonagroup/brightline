// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Catalogue of the EU provisions Brightline maps findings to.
 *
 * Every entry was checked against the official text on EUR-Lex (consolidated
 * versions where they exist). The `summary` fields paraphrase the provision
 * in neutral words; they are not the legal text. Follow `url` for the text.
 *
 * @packageDocumentation
 */

/** Stable identifiers for provisions used in reports. */
export type ProvisionId =
  | 'ucpd-art-5'
  | 'ucpd-art-6-1'
  | 'ucpd-art-7'
  | 'ucpd-art-8-9'
  | 'ucpd-annex-i-7'
  | 'ucpd-annex-i-18'
  | 'crd-art-6-1-e'
  | 'crd-art-8-2-sub1'
  | 'crd-art-8-2-sub2'
  | 'crd-art-22'
  | 'pid-art-6a'
  | 'dsa-art-25'
  | 'gdpr-art-4-11'
  | 'gdpr-art-7';

/** A provision of EU law with a link to the official text. */
export interface Provision {
  readonly id: ProvisionId;
  /** Short citation, for example "UCPD Annex I, point 7". */
  readonly citation: string;
  /** Full name of the legal act. */
  readonly instrument: string;
  /** EUR-Lex link to the (consolidated, where available) official text, with an article anchor. */
  readonly url: string;
  /** Neutral paraphrase. Not the legal text. */
  readonly summary: string;
  /** Who and what the provision applies to, in plain words. */
  readonly scope: string;
}

const UCPD_URL = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02005L0029-20260927';
const CRD_URL = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02011L0083-20260927';
const PID_URL = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:01998L0006-20220528';
const DSA_URL = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065';
const GDPR_URL = 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679';

const UCPD = 'Directive 2005/29/EC (Unfair Commercial Practices Directive), consolidated text of 27.09.2026';
const CRD = 'Directive 2011/83/EU (Consumer Rights Directive), consolidated text of 27.09.2026';
const PID = 'Directive 98/6/EC (Price Indication Directive), Article 6a as inserted by Directive (EU) 2019/2161';
const DSA = 'Regulation (EU) 2022/2065 (Digital Services Act)';
const GDPR = 'Regulation (EU) 2016/679 (General Data Protection Regulation)';

const UCPD_SCOPE =
  'Business-to-consumer commercial practices. Applies to traders in all Member States through national transposition.';
const CRD_SCOPE = 'Contracts between traders and consumers. Applies through national transposition.';

/** All provisions, keyed by id. */
export const PROVISIONS: Readonly<Record<ProvisionId, Provision>> = Object.freeze({
  'ucpd-art-5': {
    id: 'ucpd-art-5',
    citation: 'UCPD Art. 5(2)',
    instrument: UCPD,
    url: `${UCPD_URL}#art_5`,
    summary:
      'General clause: a practice is unfair if it is contrary to professional diligence and materially distorts, or is likely to materially distort, the economic behaviour of the average consumer.',
    scope: UCPD_SCOPE,
  },
  'ucpd-art-6-1': {
    id: 'ucpd-art-6-1',
    citation: 'UCPD Art. 6(1)',
    instrument: UCPD,
    url: `${UCPD_URL}#art_6`,
    summary:
      'Misleading actions: false information, or presentation that deceives or is likely to deceive the average consumer, for example about the availability of the product (point (b)) or the existence of a specific price advantage (point (d)).',
    scope: UCPD_SCOPE,
  },
  'ucpd-art-7': {
    id: 'ucpd-art-7',
    citation: 'UCPD Art. 7(1), 7(2) and 7(4)(c)',
    instrument: UCPD,
    url: `${UCPD_URL}#art_7`,
    summary:
      'Misleading omissions: hiding material information or giving it in an unclear or untimely way. In an invitation to purchase, the price inclusive of taxes and, where appropriate, all additional freight, delivery or postal charges are material (Art. 7(4)(c)).',
    scope: UCPD_SCOPE,
  },
  'ucpd-art-8-9': {
    id: 'ucpd-art-8-9',
    citation: 'UCPD Art. 8 and 9',
    instrument: UCPD,
    url: `${UCPD_URL}#art_8`,
    summary:
      'Aggressive practices: harassment, coercion or undue influence that significantly impairs, or is likely to significantly impair, the average consumer’s freedom of choice. Article 9 lists the factors to take into account.',
    scope: UCPD_SCOPE,
  },
  'ucpd-annex-i-7': {
    id: 'ucpd-annex-i-7',
    citation: 'UCPD Annex I, point 7',
    instrument: UCPD,
    url: `${UCPD_URL}#anx_I`,
    summary:
      'Blacklisted in all circumstances: falsely stating that a product, or particular terms, will only be available for a very limited time, in order to elicit an immediate decision.',
    scope: UCPD_SCOPE,
  },
  'ucpd-annex-i-18': {
    id: 'ucpd-annex-i-18',
    citation: 'UCPD Annex I, point 18',
    instrument: UCPD,
    url: `${UCPD_URL}#anx_I`,
    summary:
      'Blacklisted in all circumstances: passing on materially inaccurate information on market conditions or on the possibility of finding the product, to induce the consumer to buy at conditions less favourable than normal market conditions.',
    scope: UCPD_SCOPE,
  },
  'crd-art-6-1-e': {
    id: 'crd-art-6-1-e',
    citation: 'CRD Art. 6(1)(e) and 6(6)',
    instrument: CRD,
    url: `${CRD_URL}#art_6`,
    summary:
      'Before a distance contract, the trader must give the total price inclusive of taxes and all additional freight, delivery or postal charges and any other costs. If the trader did not inform the consumer of such charges, the consumer does not bear them (Art. 6(6)).',
    scope: `${CRD_SCOPE} Article 6 covers distance and off-premises contracts.`,
  },
  'crd-art-8-2-sub1': {
    id: 'crd-art-8-2-sub1',
    citation: 'CRD Art. 8(2), first subparagraph',
    instrument: CRD,
    url: `${CRD_URL}#art_8`,
    summary:
      'For an electronic distance contract that obliges the consumer to pay, the trader must show certain information, including the total price under Art. 6(1)(e), clearly and prominently and directly before the consumer places the order.',
    scope: `${CRD_SCOPE} Electronic distance contracts that place the consumer under an obligation to pay.`,
  },
  'crd-art-8-2-sub2': {
    id: 'crd-art-8-2-sub2',
    citation: 'CRD Art. 8(2), second subparagraph',
    instrument: CRD,
    url: `${CRD_URL}#art_8`,
    summary:
      'If placing the order means activating a button, the button must be labelled, easily legibly, only with the words "order with obligation to pay" or a corresponding unambiguous formulation. If not, the consumer is not bound by the contract or order.',
    scope: `${CRD_SCOPE} Electronic distance contracts that place the consumer under an obligation to pay.`,
  },
  'crd-art-22': {
    id: 'crd-art-22',
    citation: 'CRD Art. 22',
    instrument: CRD,
    url: `${CRD_URL}#art_22`,
    summary:
      'The trader must seek the consumer’s express consent to any extra payment beyond the main contractual obligation. Consent inferred from default options the consumer must reject gives the consumer a right to reimbursement.',
    scope: CRD_SCOPE,
  },
  'pid-art-6a': {
    id: 'pid-art-6a',
    citation: 'PID Art. 6a(1) and 6a(2)',
    instrument: PID,
    url: `${PID_URL}#art_6a`,
    summary:
      'Any announcement of a price reduction must indicate the prior price: the lowest price the trader applied during a period of not less than 30 days before the reduction. Member States may set different rules for perishable goods, products on the market for less than 30 days and progressively increased reductions (Art. 6a(3) to (5)).',
    scope:
      'Products (goods) offered by traders to consumers. Applies through national transposition; national options under Art. 6a(3) to (5) differ.',
  },
  'dsa-art-25': {
    id: 'dsa-art-25',
    citation: 'DSA Art. 25',
    instrument: DSA,
    url: `${DSA_URL}#art_25`,
    summary:
      'Providers of online platforms must not design, organise or operate their online interfaces in a way that deceives or manipulates users or materially distorts or impairs their ability to make free and informed decisions. Art. 25(3)(a) names giving more prominence to certain choices.',
    scope:
      'Only providers of online platforms (hosting services that store and disseminate information to the public at the request of a recipient, Art. 3(i)), not every website. Does not apply to practices covered by the UCPD or the GDPR (Art. 25(2)). Micro and small enterprises are excluded, also for 12 months after they lose that status, unless designated very large (Art. 19). Applies from 17 February 2024.',
  },
  'gdpr-art-4-11': {
    id: 'gdpr-art-4-11',
    citation: 'GDPR Art. 4(11)',
    instrument: GDPR,
    url: `${GDPR_URL}#art_4`,
    summary:
      'Consent must be a freely given, specific, informed and unambiguous indication of wishes, by a statement or a clear affirmative action. Recital 32: silence, pre-ticked boxes or inactivity should not constitute consent.',
    scope: 'Processing of personal data based on consent. Relevant only where the pattern concerns consent.',
  },
  'gdpr-art-7': {
    id: 'gdpr-art-7',
    citation: 'GDPR Art. 7',
    instrument: GDPR,
    url: `${GDPR_URL}#art_7`,
    summary:
      'Conditions for consent: the controller must be able to demonstrate consent; a request for consent in a written declaration that also concerns other matters must be clearly distinguishable from them, intelligible and in clear and plain language; withdrawing consent must be as easy as giving it.',
    scope: 'Processing of personal data based on consent. Relevant only where the pattern concerns consent.',
  },
});

/**
 * Look up a provision by id.
 *
 * @example
 * ```ts
 * getProvision('crd-art-22').citation; // 'CRD Art. 22'
 * ```
 */
export function getProvision(id: ProvisionId): Provision {
  return PROVISIONS[id];
}
