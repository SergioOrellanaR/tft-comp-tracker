// How well an item, artifact, emblem or radiant fits a comp, and which of its units should hold it.
// Shared by the item picker (side panel) and the players' item boxes.
//   artifact / emblem / radiant → TFT Flow's curated list for that item (set.conditions): the comps to
//                play with it, each with a tier for that pair (S 1, A 0.8, B 0.6, C 0.4, D 0.25) and
//                the unit that holds it. Comps it doesn't list don't want it.
//   item      → a carry builds it (1), or rates it Core (1) / S (0.8) / A (0.5) in its MetaTFT tiers
// Items no list covers (older snapshots) fall back to the carries' builds, and an emblem to comps
// built around its trait, held by the main (or priciest) carry without the trait.
const CONDITION_WEIGHT = { S: 1, A: 0.8, B: 0.6, C: 0.4, D: 0.25 };

let champs = new Map();       // name → set champion (traits, item tiers)
let champsByApi = new Map();
let emblemTraits = new Map(); // emblem apiName → trait
let kinds = new Map();        // apiName → artifact | emblem | radiant
let names = new Map();        // apiName → display name
let conditions = new Map();   // apiName → Map(comp index → { tier, holder })
let compIndex = new Map();    // comp object → index in set.comps

export function initCompFit(set) {
    champs = new Map((set.champions || []).map(c => [c.name, c]));
    champsByApi = new Map((set.champions || []).map(c => [c.apiName, c]));
    emblemTraits = new Map((set.items?.emblem || []).map(e => [e.apiName, e.name.replace(/\s*Emblem$/i, '')]));
    kinds = new Map();
    [['artifact', 'artifact'], ['emblem', 'emblem'], ['radiant', 'radiant']].forEach(([cat, kind]) =>
        (set.items?.[cat] || []).forEach(it => kinds.set(it.apiName, kind)));
    names = new Map();
    const addNames = list => (list || []).forEach(it => it?.apiName && names.set(it.apiName, it.name));
    Object.values(set.items || {}).forEach(addNames);
    addNames(set.components);
    addNames(set.recipes);
    conditions = new Map();
    Object.entries(set.conditions || {}).forEach(([api, cond]) => {
        kinds.set(api, cond.type);
        if (cond.name) names.set(api, cond.name);
        conditions.set(api, new Map(cond.comps.map(e => [e.comp, e])));
    });
    compIndex = new Map((set.comps || []).map((comp, i) => [comp, i]));
}

export const itemName = api => names.get(api) || api;
export const isEmblem = api => kinds.get(api) === 'emblem' || emblemTraits.has(api);
export const isArtifact = api => kinds.get(api) === 'artifact';
export const isRadiant = api => kinds.get(api) === 'radiant';
// Items worth a holder badge: the ones a comp is steered by, not its normal build
export const isSpecial = api => kinds.has(api) || emblemTraits.has(api);

// The comp's itemized units, main champion first, then by cost (priciest first)
function carriers(comp) {
    const seen = new Map();
    [...(comp.champions || []), ...(comp.altBuilds || [])].forEach(ch => { if (!seen.has(ch.name)) seen.set(ch.name, ch); });
    const main = comp.mainChampion?.name;
    return [...seen.values()].sort((a, b) => (b.name === main) - (a.name === main) || (b.cost || 0) - (a.cost || 0));
}

// Tier weight of an item in a unit's MetaTFT rows ({core, S, A}), 0 if it isn't rated
function tierWeight(tiers, api) {
    if (!tiers) return 0;
    if ((tiers.core || []).some(r => r[0] === api)) return 1;
    if ((tiers.S || []).some(r => r[0] === api)) return 0.8;
    if ((tiers.A || []).some(r => r[0] === api)) return 0.5;
    return 0;
}

function unitOf(comp, api) {
    return carriers(comp).find(ch => ch.apiName === api)
        || (champsByApi.has(api) ? { apiName: api, name: champsByApi.get(api).name, cost: champsByApi.get(api).cost } : null);
}

// { weight, holder, tier } for one item on one comp; holder is a comp unit or null
export function fit(api, comp) {
    const curated = conditions.get(api);
    if (curated) {
        const entry = curated.get(compIndex.get(comp));
        if (!entry) return { weight: 0, holder: null };
        return { weight: CONDITION_WEIGHT[entry.tier] ?? 0.5, holder: entry.holder ? unitOf(comp, entry.holder) : null, tier: entry.tier };
    }
    const units = carriers(comp);
    if (isEmblem(api)) {
        const trait = emblemTraits.get(api);
        const hasTrait = ch => (champs.get(ch.name)?.traits || []).includes(trait);
        const weight = comp.mainItem?.apiName === api ? 1.5
            : comp.title.includes(trait) || units.filter(hasTrait).length >= 2 ? 1 : 0;
        return { weight, holder: weight ? units.find(ch => !hasTrait(ch)) || null : null };
    }
    const special = kinds.has(api);
    let best = { weight: 0, holder: null };
    units.forEach(ch => {
        const own = special ? ch.artifacts : ch.items;
        const w = (own || []).includes(api) ? 1 : special ? 0 : tierWeight(champs.get(ch.name)?.items, api);
        if (w > best.weight) best = { weight: w, holder: ch };
    });
    return best;
}
