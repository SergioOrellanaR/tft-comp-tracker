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

// format "YYYY-MM-DD HH:mm:ss" → "DD-MM-YYYY HH:mm"
export function getFormattedDateTime(rawDateTime) {
    const [datePart, timePart] = rawDateTime.split(" ");
    const [year, month, day] = datePart.split("-");
    const [hour, minute] = timePart.split(":");
    return `${day}-${month}-${year} ${hour}:${minute}`;
}

// human-friendly relative time from "YYYY-MM-DD HH:mm:ss"
export function getRelativeTime(rawDateTime) {
    const [datePart, timePart] = rawDateTime.split(" ");
    const [year, month, day] = datePart.split("-");
    const [hour, minute, second] = timePart.split(":");
    const matchDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    const diffMs = Date.now() - matchDate.getTime();
    if (diffMs < 0) return getFormattedDateTime(rawDateTime);
    const secs = diffMs/1000, mins = secs/60, hrs = mins/60, days = hrs/24;
    if (secs < 60) return "Just now";
    if (mins < 60) return `${Math.floor(mins)} ${Math.floor(mins)===1?"minute":"minutes"} ago`;
    if (hrs < 24) return `${Math.floor(hrs)} ${Math.floor(hrs)===1?"hour":"hours"} ago`;
    if (days < 7) return `${Math.floor(days)} ${Math.floor(days)===1?"day":"days"} ago`;
    if (days < 30) return `${Math.floor(days/7)} ${Math.floor(days/7)===1?"week":"weeks"} ago`;
    if (days < 365) return `${Math.floor(days/30)} ${Math.floor(days/30)===1?"month":"months"} ago`;
    return `${Math.floor(days/365)} ${Math.floor(days/365)===1?"year":"years"} ago`;
}

export function convertToUserLocalDateTime(rawDateTime) {
    // helper: get minutes offset for a given IANA timezone at a specific date
    function getOffsetMinutes(date, timeZone) {
        const opts = {
            timeZone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
            timeZoneName: 'short'
        };
        const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(date);
        const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || '';
        const m = /GMT([+-]\d+)/.exec(tzPart);
        const hrs = m ? Number(m[1]) : 0;
        // getTimezoneOffset convention: minutes to ADD to local to get UTC
        return -hrs * 60;
    }

    const [datePart, timePart] = rawDateTime.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);

    // interpret the input as if it were in user's local TZ
    const localParsed = new Date(year, month - 1, day, hour, minute, second);
    const torontoOffset = getOffsetMinutes(localParsed, 'America/Toronto');
    const localOffset = localParsed.getTimezoneOffset();

    // shift the timestamp by the difference (Toronto → user local)
    const correctedTs = localParsed.getTime() + (torontoOffset - localOffset) * 60000;
    const localDate = new Date(correctedTs);

    const Y = localDate.getFullYear();
    const M = String(localDate.getMonth() + 1).padStart(2, '0');
    const D = String(localDate.getDate()).padStart(2, '0');
    const h = String(localDate.getHours()).padStart(2, '0');
    const m = String(localDate.getMinutes()).padStart(2, '0');
    const s = String(localDate.getSeconds()).padStart(2, '0');

    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}
