import { TFT_VERSUS_API_URL, CDRAGON_URL, THIRD_PARTY_IMG_URL } from './config.js';
import { authHeaders } from './account/session.js';

// Every TFT Versus API call. Errors come back as { detail, status, retryAfter } rather than thrown.
async function fetchFromTFTVersusAPI(endpoint, headers = {}) {
    try {
        // A plain GET (no Content-Type header) skips the CORS preflight: one round trip less per call
        // (routes behind a plan add the Authorization header, and with it a preflight)
        const response = await fetch(endpoint, { headers });

        if (!response.ok) {
            // Error bodies aren't always JSON (e.g. an HTML 502 from the proxy while the backend restarts)
            const data = await response.json().catch(() => ({ detail: `Server error (${response.status})` }));
            // Surface the real HTTP status alongside the error body (e.g. { detail: "..." })
            // so callers can distinguish "not found" from "rate limited", etc.; on a 429, how many
            // seconds Riot asked to wait (the backend already retried what it could)
            const retryAfter = Number(response.headers.get('Retry-After')) || null;
            return { ...data, status: response.status, retryAfter };
        }

        return await response.json();
    } catch (error) {
        console.error(`Failed to fetch data from ${endpoint}:`, error);
        throw error;
    }
}

// One visit per browser and day, on the live site only: the backend keeps just the day and the country.
// A POST without body or headers skips the CORS preflight, and nothing is read back.
export function countVisit() {
    if (location.hostname !== 'trackertft.com') return;
    const today = new Date().toISOString().slice(0, 10);
    try {
        if (localStorage.getItem('visitDay') === today) return;
        localStorage.setItem('visitDay', today);
    } catch { /* storage blocked: the backend still counts one per day */ }
    fetch(TFT_VERSUS_API_URL.visit, { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => {});
}

// A Riot ID as two path segments ("Name#TAG" → "Name/TAG"), each escaped
function riotIdPath(riotId) {
    const [name, tag] = riotId.split('#');
    if (!name || !tag) throw new Error('Invalid Riot ID. Expected "Name#Tag".');
    return `${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
}

// A player's card: profile icon, rank
export async function fetchPlayerSummary(playerName, server) {
    return await fetchFromTFTVersusAPI(`${TFT_VERSUS_API_URL.playerSummary}/${riotIdPath(playerName)}/${server}`);
}

// Whether two players shared games (see the backend's "Frontend contract")
export async function fetchFindGames(playerName, opponentName, server) {
    return await fetchFromTFTVersusAPI(`${TFT_VERSUS_API_URL.findGames}/${riotIdPath(playerName)}/${riotIdPath(opponentName)}/${server}`);
}

// Who a game name typed without its tag is (VIP): { server, players: [{ riot_id, games, last_played }] }, players
// the signed-in account has met first (games 0: never played together)
export async function fetchOpponents(gameName, server) {
    const url = `${TFT_VERSUS_API_URL.opponents}/${encodeURIComponent(gameName)}/${server}`;
    return await fetchFromTFTVersusAPI(url, await authHeaders());
}

// Everything the versus report shows: every common game (all sets), ranks at the time, seasons
export async function fetchVersus(playerName, opponentName, server) {
    return await fetchFromTFTVersusAPI(`${TFT_VERSUS_API_URL.versus}/${riotIdPath(playerName)}/${riotIdPath(opponentName)}/${server}`);
}

// The live game of a player (VIP: Riot's spectator API)
export async function fetchLiveGame(playerName, server) {
    return await fetchFromTFTVersusAPI(`${TFT_VERSUS_API_URL.liveGame}/${riotIdPath(playerName)}/${server}`, await authHeaders());
}

// One game's whole lobby, for the versus report
export async function fetchSpecificMatch(matchId) {
    return await fetchFromTFTVersusAPI(`${TFT_VERSUS_API_URL.specificMatch}/${encodeURIComponent(matchId)}`);
}

// ---------- image URLs ----------
export function CDragonBaseUrl(path) {
    return path.replace('/lol-game-data/assets/', CDRAGON_URL.base).toLowerCase();
}

export function getChampionImageUrl(championId) {
    return THIRD_PARTY_IMG_URL.champions + '/' + championId.toLowerCase() + '.png';
}

// Items, artifacts, emblems and radiants by apiName (MetaTFT's CDN)
export function getItemImageUrl(itemId) {
    return THIRD_PARTY_IMG_URL.items + '/' + itemId.toLowerCase() + '.png';
}

export function getAugmentImageUrl(augmentId) {
    return THIRD_PARTY_IMG_URL.augments + '/' + augmentId.toLowerCase() + '.png';
}

export function getMiniRankIconUrl(tier) {
    const separator = tier.toUpperCase() === 'UNRANKED' ? '-' : '_';
    return CDRAGON_URL.rankedMiniIcons + '/' + tier.toLowerCase() + separator + 'tft.svg';
}
