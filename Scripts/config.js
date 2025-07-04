const TFT_VERSUS_API_BASE_URL = 'https://tft-versus.onrender.com/api';

export const TFT_VERSUS_API_URL = {
    playerSummary: TFT_VERSUS_API_BASE_URL + '/header',
    findGames: TFT_VERSUS_API_BASE_URL + '/find',
    commonMatches: TFT_VERSUS_API_BASE_URL + '/common_matches',
    duel: TFT_VERSUS_API_BASE_URL + '/stats',
    specificMatch: TFT_VERSUS_API_BASE_URL + '/match',
    liveGame: TFT_VERSUS_API_BASE_URL + '/current_game'
}

export const THIRD_PARTY_IMG_URL = {
    champions: 'https://cdn.metatft.com/file/metatft/champions',
    pngItems: 'https://cdn.metatft.com/file/metatft/items',
    webpItems: 'https://assets.tftacademy.com/items',
    tiers: 'https://cdn.metatft.com/file/metatft/tiers',
    setCover: 'https://wiki.leagueoflegends.com/en-us/images/Teamfight_Tactics_Cover_',
    webPaugments: 'https://assets.tftacademy.com/augments'
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
    mainPlayerColor: '#000435',
    colors: ['#ff4c4c', '#4c6aff', '#4cff9a', '#ffffff', '#c74cff', '#ffb703', '#4cffe9', '#a0ff4c'],
    tierColors: {
        S: '#FF7F7F',
        A: '#FFBF7F',
        B: '#FFFF7F',
        C: '#BFFF7F',
        X: '#BF7FFF'  // Add this line for X tier
    },
    routes: {
        metaSnapshot: 'Data/MetaSnapshot.json'
    },
    iconOptions: [
        { name: 'Water', color: '#4cffe9', emoji: '💧' },
        { name: 'Fire', color: '#ff69b4', emoji: '🔥' },
        { name: 'Moon', color: '#c74cff', emoji: '🌙' },
        { name: 'Thunder', color: '#ffee4c', emoji: '⚡' }
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