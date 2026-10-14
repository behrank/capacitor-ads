/**
 * A tiny readable store. It follows the Svelte store contract, so `$store` works
 * in Svelte; elsewhere call `subscribe` or `get()`.
 */
export interface Readable<T> {
    subscribe(run: (value: T) => void): () => void;
    get(): T;
}
export declare function valueStore<T>(initial: T): Readable<T> & {
    set(value: T): void;
};
