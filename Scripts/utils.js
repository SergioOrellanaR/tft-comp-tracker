// CSV + fetch helpers
export async function fetchCSV(route) {
    const res = await fetch(route);
    return res.text();
}
export function parseCSV(csvText) {
    return csvText
        .split(/\r?\n/)
        .map(line => line.split(',').map(x => x.trim()));
}

// Throttle helper
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

// Contrast helper
export function getContrastYIQ(hex) {
    const r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16),
        yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? 'black' : 'white';
}
