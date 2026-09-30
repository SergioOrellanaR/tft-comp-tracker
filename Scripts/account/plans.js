// Roles and what each one gets. The backend decides (plans.py: FEATURE_ROLE, sent to the page by /api/auth/config and,
// per user, as `features` in /me); this file only holds the wording and the gate the site's features go through.
// Roles: visitor (not signed in) → free (signed in, Riot ID linked) → premium (sold as PRO) → vip (granted by hand).
import { getUser, hasFeature } from './session.js';

export const ROLES = ['visitor', 'free', 'premium', 'vip'];
export const ROLE_LABEL = { visitor: 'Visitor', free: 'Free', premium: 'PRO', vip: 'VIP' };
export const ROLE_TAGLINE = {
    visitor: 'No account needed',
    free: 'A free account with your Riot ID',
    premium: 'Coming soon',
    vip: 'By invitation only',
};

// What a visitor already has: nothing here is gated
export const OPEN_FEATURES = [
    ['Scout sheet', 'Link each player to the comps they play and spot the contested carries.'],
    ['Filters and item picker', 'Find comps by champion, item or style, and what your items fit.'],
    ['Share links and set summary', "Send a lobby as a link and browse the set's champions and items."],
];

// Gated features, in the order the plans page lists them. The role comes from the backend; `role` here is only the
// fallback while /config hasn't answered (or is unreachable).
export const FEATURES = {
    comp_sources: { label: 'Comp sources', text: 'Switch between MetaTFT, TFT Flow, Tactics Tools and TFT Academy comps.', role: 'free' },
    player_items: { label: 'Player items', text: 'Drop items on a player to see the comps they fit.', role: 'free' },
    versus_glance: { label: 'Versus glance', text: 'Your record against a player: your last 10 games and the averages.', role: 'free' },
    player_profile: { label: 'Player profiles', text: 'Your rank under your name, plus the avatar and rank of any Riot ID you type.', role: 'premium' },
    versus_report: { label: 'Versus report', text: 'Every set and every game together, with both final boards.', role: 'premium' },
    versus_lobby: { label: 'Game lobbies', text: 'Open any shared game to see the whole lobby.', role: 'premium' },
    comp_stats: { label: 'Comp stat card', text: "A comp's placement spread, 1st to 8th, on hover.", role: 'premium' },
    sort_by_rank: { label: 'Sort by rank', text: 'Order the lobby from the highest rank to the lowest.', role: 'premium' },
    live_game: { label: 'Live game lookup', text: "Load a player's live lobby by name.", role: 'vip' },
    name_lookup: { label: 'Name lookup', text: 'Find a Riot ID from the name you see in game.', role: 'vip' },
};

// The signed-in user's role, or 'visitor'
export const roleOf = user => (user ? user.plan || 'free' : 'visitor');
export const currentRole = () => roleOf(getUser());

// The gate: true when the feature is available; otherwise it opens the plans page on that feature (or the Riot ID
// step while the account still has to link one) and returns false.
export function requireFeature(feature) {
    if (hasFeature(feature)) return true;
    import('./dialog.js').then(m => (getUser()?.needs_riot_link ? m.openAccountDialog('riot') : m.openPlans(feature)));
    return false;
}
