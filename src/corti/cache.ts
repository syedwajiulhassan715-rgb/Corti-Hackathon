// S1 Keyed disk cache for Corti responses.
//
// Every response we have ever paid for is on disk, so the demo, the tests and
// the eval all run offline and a call is never made twice. Promoted from the
// V1 validation script, which cached by hand.
//
// No clock (D8): nothing here expires. A cache entry is a recorded fact about
// what the API returned, not a temporary copy of it. Invalidate by changing
// the key or deleting the file, never by age.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export interface DiskCacheOptions {
  /** Directory holding one JSON file per key. Created on first write. */
  readonly dir: string;
}

/** Rejects anything that would escape the cache directory or upset Windows. */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

export class DiskCache {
  readonly #dir: string;

  constructor(options: DiskCacheOptions) {
    this.#dir = options.dir;
  }

  path(key: string): string {
    if (!SAFE_KEY.test(key)) {
      throw new Error(
        `Unsafe cache key ${JSON.stringify(key)}: use [A-Za-z0-9._-] only`,
      );
    }
    return join(this.#dir, `${key}.json`);
  }

  has(key: string): boolean {
    return existsSync(this.path(key));
  }

  /** The cached value, or undefined if this key has never been stored. */
  read<T>(key: string): T | undefined {
    const path = this.path(key);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  }

  write<T>(key: string, value: T): void {
    const path = this.path(key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
  }

  /**
   * Return the cached response for `key` if there is one; otherwise run `call`,
   * store what it returns, and return that.
   *
   * `call` is only ever invoked on a miss. That is the whole contract: a test
   * or an offline demo can pass a `call` that throws, and a warm cache will
   * never reach it.
   */
  async through<T>(key: string, call: () => Promise<T>): Promise<T> {
    const hit = this.read<T>(key);
    if (hit !== undefined) return hit;

    const fresh = await call();
    this.write(key, fresh);
    return fresh;
  }
}
