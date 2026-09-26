// Local development: the backend serves the site itself on :5000 (FRONTEND_DIR), so it's the API too
const LOCAL_BACKEND = location.port === '5000' && ['localhost', '127.0.0.1'].includes(location.hostname);
const TFT_VERSUS_API_BASE_URL = LOCAL_BACKEND ? '/api' : 'https://api.trackertft.com/api';
// Accounts are always same-origin (Netlify proxies /api/auth/* to the backend, see netlify.toml), so the
// session cookie is first-party
export const AUTH_API_URL = '/api/auth';

export const TFT_VERSUS_API_URL = {
    playerSummary: TFT_VERSUS_API_BASE_URL + '/header',
    findGames: TFT_VERSUS_API_BASE_URL + '/find',
    commonMatches: TFT_VERSUS_API_BASE_URL + '/common_matches',
    duel: TFT_VERSUS_API_BASE_URL + '/stats',
    versus: TFT_VERSUS_API_BASE_URL + '/versus',
    specificMatch: TFT_VERSUS_API_BASE_URL + '/match',
    liveGame: TFT_VERSUS_API_BASE_URL + '/current_game',
    opponents: TFT_VERSUS_API_BASE_URL + '/opponents'
}

export const THIRD_PARTY_IMG_URL = {
    champions: 'https://cdn.metatft.com/file/metatft/champions',
    pngItems: 'https://cdn.metatft.com/file/metatft/items',
    tiers: 'https://cdn.metatft.com/file/metatft/tiers',
    setCover: 'https://wiki.leagueoflegends.com/en-us/images/Teamfight_Tactics_Cover_',
    augments: 'https://cdn.metatft.com/file/metatft/augments'
}

export const CDRAGON_URL = {
    base: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/',
    companionData: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/companions.json',
    rankedIcons: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images',
    rankedMiniIcons: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests',
    profileIcons: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons',
    traits: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/tfttraits.json',
}

export const TRAIT_BACKGROUND_URL = {
    bronze: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-tft-team-planner/global/default/images/cteamplanner_activetrait_kbronze.png',
    silver: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-tft-team-planner/global/default/images/cteamplanner_activetrait_ksilver.png',
    gold: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-tft-team-planner/global/default/images/cteamplanner_activetrait_kgold.png',
    chromatic: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-tft-team-planner/global/default/images/cteamplanner_activetrait_kchromatic.png',
    unique: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-tft-team-planner/global/default/images/cteamplanner_activetrait_kunique.png',
}

export const CONFIG = {
    notificationDuration: 3000,
    mainPlayerColor: '#000435',
    // Lobby player colors: distinct hues that stay readable on the light sheet
    colors: ['#E5484D', '#3E63DD', '#30A46C', '#2B2F36', '#8E4EC6', '#F59E0B', '#0EA5B7', '#65A30D'],
    tierColors: {
        S: '#C8372D',
        A: '#D98A12',
        B: '#1E7FD6',
        C: '#6B7380',
        X: '#9AA3AF'
    },
    routes: {
        metaSnapshot: 'Data/MetaSnapshot.json'
    },
    iconOptions: [
        { name: 'Water', color: '#0EA5B7', emoji: '💧' },
        { name: 'Fire', color: '#E5484D', emoji: '🔥' },
        { name: 'Moon', color: '#8E4EC6', emoji: '🌙' },
        { name: 'Thunder', color: '#F59E0B', emoji: '⚡' }
    ],
    serverRegionMap: {
        NA: "NA1",
        BR: "BR1",
        EUNE: "EUN1",
        EUW: "EUW1",
        JP: "JP1",
        KR: "KR",
        LAN: "LA1",
        LAS: "LA2",
        ME: "ME1",
        OCE: "OC1",
        RU: "RU",
        SEA: "SG2",
        TR: "TR1",
        TW: "TW2",
        VN: "VN2"
    }
};