// Copyright 2017 Sidewalk Labs | apache.org/licenses/LICENSE-2.0
/**
 * Shared utility code.
 */

import * as fs from 'fs';
import * as _ from 'lodash';

import { sprintf } from 'sprintf-js';

const HHMMSS_REGEX = /([ 0-9]?\d):(\d\d):(\d\d)/;

/**
 * Convert an 'HH:MM:SS' string to seconds since midnight.
 * Throws on invalid input.
 */
export function parseTime(time: string): number {
  const m = HHMMSS_REGEX.exec(time);
  if (!m) {
    throw new Error(`Invalid time: ${time}`);
  }
  const [, hours, minutes, seconds] = m;
  return Number(seconds) + 60 * (Number(minutes) + 60 * Number(hours));
}

/** Inverse of parseTime() */
export function formatTime(secs: number): string {
  const hours = Math.floor(secs / 3600);
  secs %= 3600;
  const minutes = Math.floor(secs / 60);
  secs %= 60;

  return sprintf('%2d:%02d:%02d', hours, minutes, secs);
}

export const YYYYMMDD_REGEX = /(20\d\d)(\d\d)(\d\d)/;

/** A simple validation of date format YYYYMMDD. */
export function validateDateFormat(date: string) {
  if (!YYYYMMDD_REGEX.exec(date)) {
    throw new Error(`Invalid date: ${date}`);
  }
}

/**
 * @param date: a date string YYYYMMDD
 */
export function dayOfWeek(date: string) {
  const dateParts = date.match(YYYYMMDD_REGEX);
  const [, year, month, day] = dateParts;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.getDay();
}

/** Check whether a file or directory exists. */
export function fileExists(filename: string): boolean {
  try {
    fs.accessSync(filename, fs.constants.F_OK);
  } catch (e) {
    return false;
  }
  return true;
}

/**
 * Helper to group elements by one property and sort by another within the groups.
 * e.g. groupAndSort([{k: 'a', b: 2}, {k: 'a', b: 1}, {k: 'c', b: 3}], 'k', 'b')
 *         --> {'a': [{k: 'a', b: 1}, {k: 'a', b: 2}], 'c': [{k: 'c', b: 3}]}
 */
export function groupAndSort<T>(xs: T[], groupBy: keyof T, sortBy: keyof T): {[key: string]: T[]} {
  const o = _.groupBy(xs, groupBy);
  for (const k in o) {
    o[k] = _.sortBy(o[k], sortBy);
  }
  return o;
}

/**
 * Removes leading indents from a template string without removing all leading whitespace.
 * Taken from tslint.
 */
export function dedent(strings: TemplateStringsArray, ...values: string[]) {
  let fullString = strings.reduce(
      (accumulator, str, i) => accumulator + values[i - 1] + str);

  // match all leading spaces/tabs at the start of each line
  const match = fullString.match(/^[ \t]*(?=\S)/gm);
  if (!match) {
    // e.g. if the string is empty or all whitespace.
    return fullString;
  }

  // find the smallest indent, we don't want to remove all leading whitespace
  const indent = Math.min(...match.map(el => el.length));
  const regexp = new RegExp('^[ \\t]{' + indent + '}', 'gm');
  fullString = indent > 0 ? fullString.replace(regexp, '') : fullString;
  return fullString;
}

/**
 * Find an element which appears in xs at least twice, according to ===.
 * Returns null if there's no such element.
 */
export function findDuplicate<T>(xs: T[]): T {
  const seen = new Set<T>();
  for (const x of xs) {
    if (seen.has(x)) {
      return x;
    }
    seen.add(x);
  }
  return null;
}

/** Like Number(text), but throws on invalid input. */
export function parseNumber(text: string): number {
  const x = Number(text);
  if (isNaN(x)) {
    throw new Error(`'${text}' is not a number.`);
  }
  return x;
}

export function zip<A, B>(as: A[], bs: B[]): Array<[A, B]> {
  return _.zip<any>(as, bs) as any;
}
