// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Data collected from a rendered page. Detectors work on these plain objects,
 * so they are pure and testable without a browser.
 */

/** Element box in CSS pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Computed style values used by the asymmetric-choice detector. */
export interface StyleInfo {
  /** Text colour as returned by getComputedStyle. */
  readonly color: string;
  /** Own background colour. */
  readonly backgroundColor: string;
  /** First non-transparent background colour of the element or an ancestor. */
  readonly effectiveBackground: string;
  /** Background behind the element (first non-transparent ancestor background). */
  readonly parentBackground: string;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  readonly borderWidthPx: number;
  readonly borderColor: string;
  readonly textDecoration: string;
  readonly opacity: number;
}

/** A checkbox, radio button or switch. */
export interface ToggleInfo {
  readonly selector: string;
  readonly kind: 'checkbox' | 'radio' | 'switch';
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly required: boolean;
  readonly label: string;
  readonly visible: boolean;
  /** Index into `dialogs`, or -1. */
  readonly dialog: number;
}

/** A button or link. */
export interface ClickableInfo {
  readonly selector: string;
  readonly text: string;
  readonly tag: string;
  readonly role: string;
  readonly rect: Rect;
  readonly style: StyleInfo;
  readonly visible: boolean;
  /** Index into `dialogs`, or -1. */
  readonly dialog: number;
}

/** A dialog, banner or overlay. */
export interface DialogInfo {
  readonly index: number;
  readonly selector: string;
  readonly text: string;
  /** True if the text is about cookies, consent or personal data. */
  readonly consent: boolean;
}

/** A short block of visible text (up to 600 characters). */
export interface TextBlock {
  readonly selector: string;
  readonly text: string;
}

/** Price-related element with the text of the surrounding product container. */
export interface PriceSignal {
  readonly kind: 'strikethrough' | 'percent';
  readonly selector: string;
  readonly text: string;
  readonly containerSelector: string;
  readonly containerText: string;
}

/** Everything collected from one page state. */
export interface PageSnapshot {
  readonly url: string;
  readonly title: string;
  readonly lang: string;
  readonly dialogs: readonly DialogInfo[];
  readonly clickables: readonly ClickableInfo[];
  readonly toggles: readonly ToggleInfo[];
  readonly textBlocks: readonly TextBlock[];
  readonly priceSignals: readonly PriceSignal[];
  /** True if a collection cap was hit. */
  readonly truncated: boolean;
}

/** One countdown reading. */
export interface TimerReading {
  readonly selector: string;
  readonly text: string;
  /** Remaining seconds shown. */
  readonly seconds: number;
}
