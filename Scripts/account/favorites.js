// An account's favorite comps. They sit above Tier S in the sheet and follow the account across devices (feature
// `favorite_comps`: signed in with a Riot ID). The backend keeps one capped row per account, so a change sends the
// whole short list after a pause instead of one request per click.
// A favorite is a key of the set, the comp source and the comp's title: comps are told apart by name, and a comp
// that changes its name just stops matching.
import { authCall, getUser, hasFeature } from './session.js';
import { requireFeature } from './plans.js';

const MAX = 200; // the backend's FAVORITES_MAX safety cap: the oldest go first
const FREE_LIMIT = 3; // without `favorites_unlimited` (PRO)
const SAVE_DELAY_MS = 700;
const keys = []; // oldest first
let saveTimer = null;

export const favoriteKey = (setKey, sourceId, title) => `${setKey}|${sourceId}|${title}`;
export const isFavorite = key => keys.includes(key);

const changed = () => document.dispatchEvent(new CustomEvent('tft:favoriteschange'));

// Star or unstar a comp. A visitor (or an account without a Riot ID) gets the plans page instead.
export function toggleFavorite(key) {
    if (!requireFeature('favorite_comps')) return false;
    const i = keys.indexOf(key);
    if (i >= 0) keys.splice(i, 1);
    else {
        // a Free account's fourth favorite opens the plans page on the unlimited one
        if (keys.length >= FREE_LIMIT && !requireFeature('favorites_unlimited')) return false;
        keys.push(key);
        while (keys.length > MAX) keys.shift();
    }
    changed();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DELAY_MS);
    return true;
}

async function save() {
    saveTimer = null;
    try {
        await authCall('/favorites', { method: 'PUT', body: { comps: [...keys] } });
    } catch (e) {
        import('../mainScreen/shareUrl.js').then(m => m.showNotification(e.status === 402 ? e.message : "Couldn't save your favorites. Try again in a moment.", 5000));
        if (e.status === 402) load(); // back to what the account really has
    }
}

// Signing in loads the account's list; signing out (or losing the feature) clears it. A change still waiting to be
// saved wins over what the server has.
async function load() {
    if (saveTimer) return;
    if (!hasFeature('favorite_comps')) {
        if (keys.length) { keys.length = 0; changed(); }
        return;
    }
    try {
        const data = await authCall('/favorites');
        if (saveTimer) return;
        keys.splice(0, keys.length, ...(data.comps || []));
        changed();
    } catch { /* the sheet just shows no favorites */ }
}

document.addEventListener('tft:userchange', load);
if (getUser()) load();
