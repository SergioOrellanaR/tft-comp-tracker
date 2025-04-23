const TFT_VERSUS_API_BASE_URL = 'http://127.0.0.1:5000/api';

export const TFT_VERSUS_API_URL = {
    playerSummary: TFT_VERSUS_API_BASE_URL+'/header',
    findGames: TFT_VERSUS_API_BASE_URL+'/find',
    commonMatches: TFT_VERSUS_API_BASE_URL+'/common_matches',
    duel: TFT_VERSUS_API_BASE_URL+'/stats',
    specificMatch: TFT_VERSUS_API_BASE_URL+'/match'
}

export const CDRAGON_URL = {
    base: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/',
    companionData: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/companions.json',
    rankedIcons: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images',
    profileIcons: 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons',
}

export const CONFIG = {
    netlify: false,
    mainPlayerColor: '#000435',
    colors: ['#ff4c4c', '#4c6aff', '#4cff9a', '#ffffff', '#c74cff', '#ffb703', '#4cffe9'],
    coreItems: [
        "Guinsoo's Rageblade", "Archangel's Staff", "Blue Buff", "Spear of Shojin",
        "Jeweled Gauntlet", "Infinity Edge", "Nashor's Tooth", "Morellonomicon",
        "Runaan's Hurricane", "Hextech Gunblade", "Bloodthirster", "Edge of Night",
        "Titan's Resolve", "Hand Of Justice"
    ],
    tierColors: {
        S: '#FFD700',
        A: '#00BFFF',
        B: '#7CFC00',
        C: '#FFB347'
    },
    routes: {
        comps: 'Data/Comps.csv',
        items: 'Data/Items.csv',
        units: 'Data/Units.csv'
    },
    iconOptions: [
        { name: 'Water', color: '#4cffe9', emoji: '💧' },
        { name: 'Fire', color: '#ff69b4', emoji: '🔥' },
        { name: 'Moon', color: '#c74cff', emoji: '🌙' },
        { name: 'Thunder', color: '#ffee4c', emoji: '⚡' }
    ],
    serverRegionMap : {
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