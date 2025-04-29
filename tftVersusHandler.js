import { TFT_VERSUS_API_URL, CDRAGON_URL, THIRD_PARTY_IMG_URL, TRAIT_BACKGROUND_URL } from './config.js';

/**
 * Función genérica para realizar solicitudes a la API de TFT Versus.
 * @param {string} endpoint - La URL del endpoint.
 * @returns {Promise<object>} - Los datos de la respuesta en formato JSON.
 */
async function fetchFromTFTVersusAPI(endpoint) {
    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Error fetching data from ${endpoint}: ${response.statusText}`);
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
async function fetchSpecificMatch(matchId) {
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

export function getItemImageUrl(itemId) {
    return THIRD_PARTY_IMG_URL.items + '/' + itemId.toLowerCase() + '.png';
}

export function getTierImageUrl(tier) {
    return THIRD_PARTY_IMG_URL.tiers + '/' + tier + '.png';
}

export function getTraitBackgroundUrl(tier_current, tier_total, num_units) {
    if (tier_total === 1 && tier_current === 1) {
        return TRAIT_BACKGROUND_URL.unique;
    }

    switch (tier_current) {
        case 1:
            return TRAIT_BACKGROUND_URL.bronze;
        case 2:
            if(tier_total === 2) {
                return TRAIT_BACKGROUND_URL.gold;
            }
            return TRAIT_BACKGROUND_URL.silver;
        case 3:
            return TRAIT_BACKGROUND_URL.gold;
        case 4:
            if (num_units == null || num_units < 8) {
                return TRAIT_BACKGROUND_URL.gold;
            }
            console.log(num_units);
            return TRAIT_BACKGROUND_URL.chromatic;
        default:
            return TRAIT_BACKGROUND_URL.gold;
    }
}