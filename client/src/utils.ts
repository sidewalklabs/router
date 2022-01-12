import {sprintf} from 'sprintf-js';
import * as _ from 'underscore';

/** Inverse of parseTime() */
export function formatTime(secs: number): string {
  const hours = Math.floor(secs / 3600);
  secs %= 3600;
  const minutes = Math.floor(secs / 60);
  secs %= 60;

  return sprintf('%2d:%02d:%02d', hours, minutes, secs);
}

/** Return the subset of obj which differs from the defaults according to _.isEqual(). */
export function withoutDefaults<T>(obj: T, defaults: T): Partial<T> {
  const out = {} as Partial<T>;
  for (const k in obj) {
    const v = obj[k];
    if (!_.isEqual(v, defaults[k])) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Issue a GET request with a JSON-encoded object in the query string.
 * Does not enforce relative path and allows passing a json payload.
 */
export async function getPromise<T>(url: string, payload?: any): Promise<T> {
  if (payload) {
    url += '?' + encodeURIComponent(JSON.stringify(payload));
  }
  const response = await fetch(url, {
    credentials: 'same-origin',
    method: 'GET',
  });

  if (!response.ok) {
    return Promise.reject(response.json());
  }

  return response.json();
}

/**
 * Issue an XHR and return a promise for the JSON that it returns.
 * Enforces a relative path (requires acces to window) and allows
 * you to specify the method used.
 */
export async function ajaxPromise<T>(path: string, method?: string): Promise<T> {
  method = method || 'GET';
  const request = new Request(fixRelativePath(path, window.location.pathname), {
    credentials: 'same-origin', // Include cookies, e.g. for oauth.
    method,
  });
  const response = await fetch(request);
  if (!response.ok) {
    // Note: this assumes that bad responses still return JSON data.
    const data = await response.json();
    return Promise.reject(data);
  }
  return response.json();
}

/** Fix a relative path to be appropriate for the current URL. */
export function fixRelativePath(path: string, locationPath: string): string {
  if (!path.length || path.charAt(0) === '/') {
    return path;
  } else if (locationPath.match(/view\/[0-9]+$/)) {
    // View URLs are one level deep.
    return '../' + path;
  } else {
    return path;
  }
}

export function reversed<T>(list: T[]): T[] {
  const len = list.length;
  return list.map((value, i) => list[len - 1 - i]);
}

/** This is identical to _.zip(a, b), only better typed. */
export function zip<A, B>(a: A[], b: B[]): Array<[A, B]> {
  return _.zip(a, b) as Array<[A, B]>;
}

/**
 * Do the two objects have the same keys and values?
 * This checks for equality using '==='. It does not do a deep comparison of values.
 */
export function shallowEqual<T>(a: T, b: T) {
  if (!!a !== !!b) return false; // they need to be either both be null or non-null.
  for (const k in a) {
    if (a[k] !== b[k]) {
      return false;
    }
  }
  for (const k in b) {
    if (!(k in a)) {
      return false;
    }
  }
  return true;
}
