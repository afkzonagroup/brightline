// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Declarative user-journey format and its strict validator.
 *
 * A journey is data, never code: a list of steps (goto, click, fill, select,
 * check, uncheck, waitFor, mark). The validator rejects unknown keys, unknown
 * actions, wrong types, over-long strings, control characters and selector
 * engines outside an allow-list. Journey files are never evaluated.
 */

import { BlockedRequestError, checkUrlSyntax } from '../net/guard.js';

/** Navigate to a URL. */
export interface GotoStep {
  readonly action: 'goto';
  readonly url: string;
}
/** Click an element. */
export interface ClickStep {
  readonly action: 'click';
  readonly selector: string;
}
/** Type a value into a field. */
export interface FillStep {
  readonly action: 'fill';
  readonly selector: string;
  readonly value: string;
}
/** Choose an option in a select element by value or label. */
export interface SelectStep {
  readonly action: 'select';
  readonly selector: string;
  readonly value: string;
}
/** Tick or untick a checkbox / radio. */
export interface CheckStep {
  readonly action: 'check' | 'uncheck';
  readonly selector: string;
}
/** Wait until an element is visible. */
export interface WaitForStep {
  readonly action: 'waitFor';
  readonly selector: string;
}
/**
 * Checkpoint: run the page detectors here and record the total price and/or
 * the final order button.
 */
export interface MarkStep {
  readonly action: 'mark';
  readonly name: string;
  /** Selector of the element that shows the total price. */
  readonly total?: string;
  /** Selector of the button that places the order (final checkout step only). It is never clicked. */
  readonly orderButton?: string;
  /** Set when the total is expected to change since the previous mark (for example, the user added an item). */
  readonly expectTotalChange?: boolean;
}

/** One journey step. */
export type JourneyStep = GotoStep | ClickStep | FillStep | SelectStep | CheckStep | WaitForStep | MarkStep;

/** A user journey. */
export interface Journey {
  readonly version: 1;
  readonly name: string;
  readonly startUrl: string;
  readonly steps: readonly JourneyStep[];
}

/** Validation failure with a JSON-pointer-like path. */
export class JourneyValidationError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'JourneyValidationError';
    this.path = path;
  }
}

/** Limits for journey files. */
export const JOURNEY_LIMITS = Object.freeze({
  maxBytes: 64 * 1024,
  maxSteps: 100,
  maxSelectorLength: 500,
  maxValueLength: 1000,
  maxNameLength: 100,
});

const ALLOWED_ENGINES = new Set(['css', 'text', 'role', 'id', 'data-testid', 'xpath']);
// eslint-disable-next-line no-control-regex -- the point of this pattern is to reject control characters
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/u;
/** Values typed into fields may contain tabs and line feeds (textareas), nothing else. */
// eslint-disable-next-line no-control-regex -- the point of this pattern is to reject control characters
const CONTROL_IN_VALUE = /[\u0000-\u0008\u000b-\u001f\u007f\u2028\u2029]/u;
const NAME = /^[\p{L}\p{N} ._()-]+$/u;

type Plain = Record<string, unknown>;

function isPlainObject(value: unknown): value is Plain {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function onlyKeys(obj: Plain, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new JourneyValidationError(`${path}/${key}`, 'unknown property');
  }
}

function str(obj: Plain, key: string, path: string, max: number, required = true): string | undefined {
  const value = obj[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string') throw new JourneyValidationError(`${path}/${key}`, 'must be a string');
  if (value.length === 0) throw new JourneyValidationError(`${path}/${key}`, 'must not be empty');
  if (value.length > max) throw new JourneyValidationError(`${path}/${key}`, `must be at most ${String(max)} characters`);
  if (CONTROL.test(value)) throw new JourneyValidationError(`${path}/${key}`, 'must not contain control characters');
  return value;
}

/** Validate a selector. Exported for tests. */
export function checkSelector(selector: string, path: string): string {
  if (selector.trim() !== selector) throw new JourneyValidationError(path, 'must not start or end with whitespace');
  if (selector.includes('>>')) throw new JourneyValidationError(path, 'selector chaining (>>) is not allowed');
  const engine = /^([a-zA-Z_][\w:+*-]*)\s*=/.exec(selector);
  if (engine !== null && !ALLOWED_ENGINES.has((engine[1] ?? '').toLowerCase())) {
    throw new JourneyValidationError(path, `selector engine "${engine[1] ?? ''}" is not allowed`);
  }
  if (/^(?:internal|_)/i.test(selector)) throw new JourneyValidationError(path, 'internal selector engines are not allowed');
  return selector;
}

function url(value: string, path: string): string {
  try {
    return checkUrlSyntax(value).href;
  } catch (error) {
    throw new JourneyValidationError(path, error instanceof BlockedRequestError ? error.message : 'invalid URL');
  }
}

function validateStep(raw: unknown, path: string, names: Set<string>): JourneyStep {
  if (!isPlainObject(raw)) throw new JourneyValidationError(path, 'must be an object');
  const action = raw.action;
  const L = JOURNEY_LIMITS;
  switch (action) {
    case 'goto': {
      onlyKeys(raw, ['action', 'url'], path);
      return { action, url: url(str(raw, 'url', path, 2048) ?? '', `${path}/url`) };
    }
    case 'click':
    case 'check':
    case 'uncheck':
    case 'waitFor': {
      onlyKeys(raw, ['action', 'selector'], path);
      const selector = checkSelector(str(raw, 'selector', path, L.maxSelectorLength) ?? '', `${path}/selector`);
      return { action, selector };
    }
    case 'fill':
    case 'select': {
      onlyKeys(raw, ['action', 'selector', 'value'], path);
      const selector = checkSelector(str(raw, 'selector', path, L.maxSelectorLength) ?? '', `${path}/selector`);
      const value = raw.value;
      if (typeof value !== 'string') throw new JourneyValidationError(`${path}/value`, 'must be a string');
      if (value.length > L.maxValueLength) throw new JourneyValidationError(`${path}/value`, `must be at most ${String(L.maxValueLength)} characters`);
      if (CONTROL_IN_VALUE.test(value)) throw new JourneyValidationError(`${path}/value`, 'must not contain control characters other than tab and line feed');
      return { action, selector, value };
    }
    case 'mark': {
      onlyKeys(raw, ['action', 'name', 'total', 'orderButton', 'expectTotalChange'], path);
      const name = str(raw, 'name', path, L.maxNameLength) ?? '';
      if (!NAME.test(name)) throw new JourneyValidationError(`${path}/name`, 'may contain only letters, digits, spaces and . _ ( ) -');
      if (names.has(name)) throw new JourneyValidationError(`${path}/name`, 'must be unique');
      names.add(name);
      const total = str(raw, 'total', path, L.maxSelectorLength, false);
      const orderButton = str(raw, 'orderButton', path, L.maxSelectorLength, false);
      const expect = raw.expectTotalChange;
      if (expect !== undefined && typeof expect !== 'boolean') throw new JourneyValidationError(`${path}/expectTotalChange`, 'must be a boolean');
      return {
        action,
        name,
        ...(total !== undefined ? { total: checkSelector(total, `${path}/total`) } : {}),
        ...(orderButton !== undefined ? { orderButton: checkSelector(orderButton, `${path}/orderButton`) } : {}),
        ...(expect !== undefined ? { expectTotalChange: expect } : {}),
      };
    }
    default:
      throw new JourneyValidationError(`${path}/action`, 'must be one of goto, click, fill, select, check, uncheck, waitFor, mark');
  }
}

/**
 * Validate a parsed journey object.
 *
 * @throws JourneyValidationError
 * @example
 * ```ts
 * const journey = validateJourney({
 *   version: 1,
 *   name: 'checkout',
 *   startUrl: 'https://shop.example/product/1',
 *   steps: [{ action: 'click', selector: '#add-to-cart' }, { action: 'mark', name: 'cart', total: '#total' }],
 * });
 * ```
 */
export function validateJourney(input: unknown): Journey {
  if (!isPlainObject(input)) throw new JourneyValidationError('', 'journey must be an object');
  onlyKeys(input, ['$schema', 'version', 'name', 'startUrl', 'steps'], '');
  if (input.$schema !== undefined && typeof input.$schema !== 'string') throw new JourneyValidationError('/$schema', 'must be a string');
  if (input.version !== 1) throw new JourneyValidationError('/version', 'must be 1');
  const name = str(input, 'name', '', JOURNEY_LIMITS.maxNameLength) ?? '';
  if (!NAME.test(name)) throw new JourneyValidationError('/name', 'may contain only letters, digits, spaces and . _ ( ) -');
  const startUrl = url(str(input, 'startUrl', '', 2048) ?? '', '/startUrl');
  const steps = input.steps;
  if (!Array.isArray(steps)) throw new JourneyValidationError('/steps', 'must be an array');
  if (steps.length === 0) throw new JourneyValidationError('/steps', 'must not be empty');
  if (steps.length > JOURNEY_LIMITS.maxSteps) throw new JourneyValidationError('/steps', `must have at most ${String(JOURNEY_LIMITS.maxSteps)} steps`);
  const names = new Set<string>();
  const validated = steps.map((s: unknown, i) => validateStep(s, `/steps/${String(i)}`, names));
  return { version: 1, name, startUrl, steps: validated };
}

/**
 * Parse and validate journey JSON text (size-limited).
 *
 * @throws JourneyValidationError
 */
export function parseJourney(text: string): Journey {
  if (Buffer.byteLength(text, 'utf8') > JOURNEY_LIMITS.maxBytes) {
    throw new JourneyValidationError('', `journey file must be at most ${String(JOURNEY_LIMITS.maxBytes)} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JourneyValidationError('', 'not valid JSON');
  }
  return validateJourney(parsed);
}
