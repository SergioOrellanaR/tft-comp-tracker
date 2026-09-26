import { TFT_VERSUS_API_URL, CDRAGON_URL, THIRD_PARTY_IMG_URL, TRAIT_BACKGROUND_URL } from './config.js';
import { authHeaders } from './account/session.js';

/**
 * Función genérica para realizar solicitudes a la API de TFT Versus.
 * @param {string} endpoint - La URL del endpoint.
 * @returns {Promise<object>} - Los datos de la respuesta en formato JSON.
 */
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

// Función para llamar a /header
// http://127.0.0.1:5000/api/header/Made in Chile/1604/na
export async function fetchPlayerSummary(playerName, server) {
    const [name, tag] = playerName.split('#');
    if (!name || !tag) {
        throw new Error('Invalid player name format. Expected format: "Name#Tag".');
    }

    const url = `${TFT_VERSUS_API_URL.playerSummary}/${name}/${tag}/${server}`;
    return await fetchFromTFTVersusAPI(url);
}

// Función para llamar a /find
// http://127.0.0.1:5000/api/find/Made in Chile/1604/NyobZoo/NA1/NA
export async function fetchFindGames(playerName, opponentName, server) {

    const [name, tag] = playerName.split('#');
    const [opponent, opponentTag] = opponentName.split('#');
    if (!name || !tag || !opponent || !opponentTag) {
        throw new Error('Invalid player or opponent name format. Expected format: "Name#Tag".');
    }

    const url = `${TFT_VERSUS_API_URL.findGames}/${name}/${tag}/${opponent}/${opponentTag}/${server}`;
    return await fetchFromTFTVersusAPI(url);
}

// Who a game name typed without its tag is, among the signed-in player's own games (VIP):
// { server, players: [{ riot_id, games, last_played }] }, most recent first
export async function fetchOpponents(gameName, server) {
    const url = `${TFT_VERSUS_API_URL.opponents}/${encodeURIComponent(gameName)}/${server}`;
    return await fetchFromTFTVersusAPI(url, await authHeaders());
}

// Everything the versus report shows: every common game (all sets), ranks at the time, seasons
export async function fetchVersus(playerName, opponentName, server) {
    const [name, tag] = playerName.split('#');
    const [opponent, opponentTag] = opponentName.split('#');
    const url = `${TFT_VERSUS_API_URL.versus}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}/${encodeURIComponent(opponent)}/${encodeURIComponent(opponentTag)}/${server}`;
    return await fetchFromTFTVersusAPI(url);
}

// Función para llamar a /stats
// http://127.0.0.1:5000/api/stats/Made in Chile/1604/NyobZoo/NA1/na
export async function fetchDuelStats(playerName, opponentName, server) {
    const [name, tag] = playerName.split('#');
    const [opponent, opponentTag] = opponentName.split('#');
    if (!name || !tag || !opponent || !opponentTag) {
        throw new Error('Invalid player or opponent name format. Expected format: "Name#Tag".');
    }

    const url = `${TFT_VERSUS_API_URL.duel}/${name}/${tag}/${opponent}/${opponentTag}/${server}`;
    return await fetchFromTFTVersusAPI(url);
}

// Función para llamar a /stats
// http://127.0.0.1:5000/api/stats/Made in Chile/1604/NyobZoo/NA1/na
export async function fetchLiveGame(playerName, server) {
    const [name, tag] = playerName.split('#');
    if (!name || !tag) {
        throw new Error('Invalid player name format. Expected format: "Name#Tag".');
    }

    const url = `${TFT_VERSUS_API_URL.liveGame}/${name}/${tag}/${server}`;
    return await fetchFromTFTVersusAPI(url, await authHeaders());
}

// Función para llamar a /common_matches
// http://127.0.0.1:5000/api/common_matches/Made in Chile/1604/NyobZoo/NA1/NA/[PageNumber]
export async function fetchCommonMatches(playerName, opponentName, server, pageNumber = 1) {
    const [name, tag] = playerName.split('#');
    const [opponent, opponentTag] = opponentName.split('#');
    if (!name || !tag || !opponent || !opponentTag) {
        throw new Error('Invalid player or opponent name format. Expected format: "Name#Tag".');
    }

    const url = `${TFT_VERSUS_API_URL.commonMatches}/${name}/${tag}/${opponent}/${opponentTag}/${server}/${pageNumber}`;
    return await fetchFromTFTVersusAPI(url);
}

// Función para llamar a /match
// http://127.0.0.1:5000/api/match/NA1_5268688884
export async function fetchSpecificMatch(matchId) {
    const url = `${TFT_VERSUS_API_URL.specificMatch}/${matchId}`;
    return await fetchFromTFTVersusAPI(url);
}

//DATA DRAGON HANDLER
export function CDragonBaseUrl(path) {
    return path.replace('/lol-game-data/assets/', CDRAGON_URL.base).toLowerCase();
}

export function getProfileIconUrl(playerData) {
    return CDRAGON_URL.profileIcons + '/' + playerData.profile_icon_id + '.jpg';
}

export function getRankIconUrl(playerData) {
    return CDRAGON_URL.rankedIcons + '/' + playerData.rank_info.tier.toLowerCase() + '.png';
}

export function getChampionImageUrl(championId) {
    return THIRD_PARTY_IMG_URL.champions + '/' + championId.toLowerCase() + '.png';
}

export function getItemPNGImageUrl(itemId) {
    return THIRD_PARTY_IMG_URL.pngItems + '/' + itemId.toLowerCase() + '.png';
}

// Items, artifacts, emblems and radiants by apiName (MetaTFT's CDN)
export function getItemWEBPImageUrl(itemId) {
    return THIRD_PARTY_IMG_URL.pngItems + '/' + itemId.toLowerCase() + '.png';
}

export function getAugmentWEBPImageUrl(augmentId) {
    return THIRD_PARTY_IMG_URL.augments + '/' + augmentId.toLowerCase() + '.png';
}

export function getTierImageUrl(tier) {
    return THIRD_PARTY_IMG_URL.tiers + '/' + tier + '.png';
}

export function getMiniRankIconUrl(tier) {
    let separator = "_";
    if (tier.toUpperCase() === 'UNRANKED') {
        separator = '-';
    }
    return CDRAGON_URL.rankedMiniIcons + '/' + tier.toLowerCase() + separator + 'tft.svg';
}

export function getTraitBackgroundUrl(tier_current, tier_total, num_units) {
    if (tier_total === 1 && tier_current === 1) {
        return TRAIT_BACKGROUND_URL.unique;
    }

    switch (tier_current) {
        case 1:
            return TRAIT_BACKGROUND_URL.bronze;
        case 2:
            if (tier_total === 2) {
                return TRAIT_BACKGROUND_URL.gold;
            }
            return TRAIT_BACKGROUND_URL.silver;
        case 3:
            return TRAIT_BACKGROUND_URL.gold;
        case 4:
            if (num_units == null || num_units < 9) {
                return TRAIT_BACKGROUND_URL.gold;
            }
            return TRAIT_BACKGROUND_URL.chromatic;
        default:
            return TRAIT_BACKGROUND_URL.gold;
    }
}

export function getTFTSetImageUrl(set) {
    const manualCovers = {
        "1": 1,
        "2": 2,
        "3": 3,
        "3.5": 4,
        "4": 5,
        "4.5": 6,
        "5": 7,
        "5.5": 8,
        "6": 9,
        "6.5": 10,
        "7": 11,
        "7.5": 12,
        "8": 13,
        "8.5": 14,
        "9": 15
    };

    // Convert to string to support fractional keys like "3.5"
    const key = set.toString();

    let imageNumber;
    if (manualCovers.hasOwnProperty(key)) {
        imageNumber = manualCovers[key];
    } else {
        // Set 10 starts at cover 17
        const setNum = parseFloat(set);
        if (setNum >= 10) {
            imageNumber = setNum + 7;
        } else {
            return null; // No cover found
        }
    }

    return `${THIRD_PARTY_IMG_URL.setCover}${String(imageNumber).padStart(2, "0")}.jpg`;
}