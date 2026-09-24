// Accounts: talking to /api/auth and holding the signed-in user.
// - The session lives in an HttpOnly cookie the page never sees; `user` is what /me says about it.
// - Other API routes learn who's calling from user.api_token (short-lived), sent by authHeaders().
// - Every change fires `tft:userchange` on document with the user (or null).
import { AUTH_API_URL, CDRAGON_URL } from '../config.js';

let user = null;
let config = null;
let tokenAt = 0;
const TOKEN_REFRESH_MS = 12 * 60 * 1000; // api tokens last 15 minutes

export class AuthError extends Error {
    constructor(status, detail, retryAfter) {
        super(detail);
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

export async function authCall(path, { method = 'GET', body } = {}) {
    let res;
    try {
        res = await fetch(AUTH_API_URL + path, {
            method,
            credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new AuthError(0, "Can't reach TrackerTFT right now. Check your connection and try again.");
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail
            : res.status === 404 ? 'Accounts aren\'t available right now.' : 'Something went wrong. Please try again.';
        throw new AuthError(res.status, detail, res.headers.get('Retry-After'));
    }
    return data;
}

export const getUser = () => user;

export function setUser(next) {
    user = next || null;
    tokenAt = Date.now();
    document.dispatchEvent(new CustomEvent('tft:userchange', { detail: user }));
}

// What the sign-in dialog can offer (email needs a mail server, Google/Riot their credentials)
export async function authConfig() {
    if (!config) {
        config = authCall('/config').catch(() => ({ email: false, google: false, riot: false, unavailable: true }));
    }
    return config;
}

export async function refreshUser() {
    try {
        const data = await authCall('/me');
        setUser(data?.user);
    } catch {
        setUser(null);
    }
    return user;
}

// For API routes that check the plan: { Authorization: 'Bearer …' } when signed in, else {}
export async function authHeaders() {
    if (!user) return {};
    if (Date.now() - tokenAt > TOKEN_REFRESH_MS) await refreshUser();
    return user?.api_token ? { Authorization: `Bearer ${user.api_token}` } : {};
}

export const hasFeature = feature => !!user?.features?.includes(feature);

// The face of an account: its linked Riot profile icon, else its Google picture, else its initial
export function avatarHtml(u, size = 28) {
    const style = `width:${size}px;height:${size}px`;
    if (u?.riot?.verified && u.riot.profile_icon_id != null) {
        return `<span class="acct-avatar" style="${style}"><img src="${CDRAGON_URL.profileIcons}/${u.riot.profile_icon_id}.jpg" alt=""></span>`;
    }
    if (u?.avatar_url) {
        return `<span class="acct-avatar" style="${style}"><img src="${escapeHtml(u.avatar_url)}" alt="" referrerpolicy="no-referrer"></span>`;
    }
    const name = u?.username || '?';
    let hue = 0;
    for (const ch of name) hue = (hue * 31 + ch.codePointAt(0)) % 360;
    return `<span class="acct-avatar initial" style="${style};--hue:${hue};font-size:${Math.round(size * 0.45)}px" aria-hidden="true">${escapeHtml(name[0].toUpperCase())}</span>`;
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
