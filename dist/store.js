export function valueStore(initial) {
    let value = initial;
    const subs = new Set();
    return {
        get: () => value,
        set(next) {
            if (next === value)
                return;
            value = next;
            for (const run of subs)
                run(value);
        },
        subscribe(run) {
            subs.add(run);
            run(value);
            return () => void subs.delete(run);
        },
    };
}
