/**
 * A tiny readable store. It follows the Svelte store contract, so `$store` works
 * in Svelte; elsewhere call `subscribe` or `get()`.
 */
export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
  get(): T;
}

export function valueStore<T>(initial: T): Readable<T> & { set(value: T): void } {
  let value = initial;
  const subs = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next: T) {
      if (next === value) return;
      value = next;
      for (const run of subs) run(value);
    },
    subscribe(run) {
      subs.add(run);
      run(value);
      return () => void subs.delete(run);
    },
  };
}
