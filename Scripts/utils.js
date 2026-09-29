// Runs `fn` at most once every `limit` ms, keeping the last call of a burst
export function throttle(fn, limit) {
    let lastFunc, lastRan;
    return function (...args) {
        const ctx = this;
        if (!lastRan) {
            fn.apply(ctx, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if (Date.now() - lastRan >= limit) {
                    fn.apply(ctx, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}
