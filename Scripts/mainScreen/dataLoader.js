import { initCompFilter } from './compSearchBar.js';
import { linkPlayersToCompsFromQuery, getQueryParams } from './shareUrl.js';
import { CONFIG } from '../config.js';
import { getChampionImageUrl, getItemWEBPImageUrl, getAugmentWEBPImageUrl } from '../tftVersusHandler.js';
import { resetPlayers } from './players.js';
import { renderLinks } from './matrix.js';
import { initItemPicker } from './itemPicker.js';

export let unitImageMap = {};
export let unitCostMap = {};
export let items = [];
// Data variables
export let metaSnapshotData = null;
let currentSetData = null;

// Data of the set picked in the set selector; the transitions tab reads the same data as the tracker
export const getCurrentSetData = () => currentSetData;

const compsContainer = document.getElementById('compos');
const _originalLoadCompsFromJSON = loadCompsFromJSON;

const loadMetaSnapshot = async () => {
    try {
        // Add caching for the meta snapshot
        // Versioned: bump when the format changes (v4: TFT Flow comps and item conditions)
        const cacheKey = 'metaSnapshot:v4';
        const cached = sessionStorage.getItem(cacheKey);
        
        if (cached) {
            try {
                const snapshot = JSON.parse(cached);
                processSnapshotData(snapshot);
                return snapshot;
            } catch (e) {
                sessionStorage.removeItem(cacheKey);
            }
        }

        const response = await fetch(CONFIG.routes.metaSnapshot);
        const snapshot = await response.json();
        
        // Cache the response
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify(snapshot));
        } catch (e) {
            console.warn('Could not cache meta snapshot:', e);
        }
        
        processSnapshotData(snapshot);
        return snapshot;
    } catch (error) {
        console.error('Error loading MetaSnapshot.json:', error);
        return null;
    }
};

// Fill unitImageMap/unitCostMap (mutated in place, other modules hold references) from the given sets.
// Champion names repeat across sets with different apiNames/costs, so later sets overwrite earlier ones.
function buildUnitMaps(setsData) {
    Object.keys(unitImageMap).forEach(k => delete unitImageMap[k]);
    Object.keys(unitCostMap).forEach(k => delete unitCostMap[k]);
    setsData.forEach(setData => {
        (setData.champions || []).forEach(champion => {
            unitImageMap[champion.name] = getChampionImageUrl(champion.apiName);
            unitCostMap[champion.name] = champion.cost || 1;
        });
        (setData.comps || []).forEach(comp => {
            (comp.champions || []).forEach(champion => {
                const unitName = champion.name;
                unitImageMap[unitName] = getChampionImageUrl(champion.apiName);
                unitCostMap[unitName] = champion.cost || 1;
            });
        });
    });
}

// Extract function to process snapshot data
function processSnapshotData(snapshot) {
    // Extract unit data from all set compositions
    buildUnitMaps(Object.values(snapshot));
    // Load unique items data across all sets
    let allItems = [];
    Object.values(snapshot).forEach(setData => {
        const it = setData.items || {};
        allItems.push(...(it.default || []), ...(it.artifact || []), ...(it.emblem || []), ...(it.radiant || []), ...(it.trait || []));
    });
    // Deduplicate items by apiName
    const unique = new Map();
    allItems.forEach(itemObj => {
        if (itemObj.apiName && !unique.has(itemObj.apiName)) {
            unique.set(itemObj.apiName, itemObj);
        }
    });
    items = Array.from(unique.values()).map(itemObj => ({
        Item: itemObj.apiName,
        Name: itemObj.name,
        Url: getItemWEBPImageUrl(itemObj.apiName)
    }));
    metaSnapshotData = snapshot;
}

export function tryLoadDefaultData() {
    loadMetaSnapshot().then((metaData) => {
        if (metaData) {
            // Populate set selector dropdown
            const setSelector = document.getElementById('setSelector');
            if (setSelector) {
                const keys = Object.keys(metaData);
                setSelector.innerHTML = '';
                keys.forEach(setKey => {
                    const option = document.createElement('option');
                    option.value = setKey;
                    // A set still on the PBE sits next to the live one until it launches
                    option.textContent = metaData[setKey]?.status === 'pbe' ? `${setKey} PBE` : setKey;
                    setSelector.appendChild(option);
                });
                // select set from URL param or last as default
                const params = getQueryParams();
                const liveKeys = keys.filter(k => metaData[k]?.status !== 'pbe');
                const defaultSet = params.set && keys.includes(params.set) ? params.set : (liveKeys.at(-1) || keys.at(-1));
                setSelector.value = defaultSet;
                // Nothing to choose outside a PBE cycle
                setSelector.closest('.set-selector')?.toggleAttribute('hidden', keys.length < 2);
                
                let isInitialLoad = true;
                // Reload compositions on set change
                setSelector.addEventListener('change', () => {
                    const selected = setSelector.value;
                    const setData = metaData[selected];
                    if (setData) {
                        // Only reset player panels when user changes set after initial load
                        // to preserve URL parameter player names on initial load
                        if (!isInitialLoad) {
                            resetPlayers();
                            // Clear composition URL parameters when changing sets
                            // since comp indexes are set-specific
                            const url = new URL(window.location);
                            for (let i = 1; i <= 8; i++) {
                                url.searchParams.delete(`Player${i}Comps`);
                                url.searchParams.delete(`Player${i}Items`);
                            }
                            // Update URL without reloading page
                            window.history.replaceState({}, '', url);
                        }
                        
                        // unit images/costs must match the selected set, not the newest one
                        buildUnitMaps([setData]);
                        // update global items for suggestions to this set only
                        const sec = setData.items || {};
                        const arr = [...(sec.default||[]), ...(sec.artifact||[]), ...(sec.emblem||[]), ...(sec.radiant||[]), ...(sec.trait||[])];
                        items = arr.map(it => ({ Item: it.apiName, Name: it.name, Url: getItemWEBPImageUrl(it.apiName) }));
                        // reload compositions and filter
                        loadCompsFromJSON(setData);
                        initCompFilter(setData);
                        initItemPicker(setData);
                        updatePatchLabel(selected, setData);
                        currentSetData = setData;
                        document.dispatchEvent(new CustomEvent('tft:setchange', { detail: setData }));
                        
                        // Only link players to comps from query on initial load
                        if (isInitialLoad) {
                            linkPlayersToCompsFromQuery();
                            isInitialLoad = false;
                        }
                    }
                });
                // Immediately dispatch change to load default or URL set
                setSelector.dispatchEvent(new Event('change'));
            }
        }
    });
}

export function loadCompsFromJSON(metaData) {
    // Update global snapshot to current set so tooltips and icons reference correct data
    metaSnapshotData = metaData;
    compsContainer.innerHTML = '';
    const tiers = { S: [], A: [], B: [], C: [], X: [] };
    const itemName = api => items.find(i => i.Item === api)?.Name || api;

    metaData.comps.forEach((comp, index) => {
        if (!tiers[comp.tier]) return;
        const compoElement = createCompoElement(comp, index);
        // Tags for filtering: champions, their items and artifacts (alt builds too), key item and style
        const tags = [
            ...comp.champions.map(ch => ch.name),
            ...[...comp.champions, ...(comp.altBuilds || [])].flatMap(ch => [...(ch.items || []), ...(ch.artifacts || [])].map(itemName)),
            ...(comp.mainItem?.apiName ? [itemName(comp.mainItem.apiName)] : []),
            ...(comp.style ? [comp.style] : []),
        ];
        compoElement.dataset.tags = tags.join('|');
        tiers[comp.tier].push({ name: comp.title, element: compoElement });
    });

    ['S', 'A', 'B', 'C', 'X'].forEach(t => {
        if (!tiers[t].length) return;
        tiers[t].sort((a, b) => a.name.localeCompare(b.name));
        const header = document.createElement('div');
        header.className = 'tier-header';
        header.dataset.tier = t;
        header.innerHTML = `<b class="tier-badge t-${t}">${t}</b><span class="tier-label">${t === 'X' ? 'Situational' : `Tier ${t}`}</span><span class="tier-count"></span>`;
        compsContainer.appendChild(header);
        tiers[t].forEach(({ element }) => compsContainer.appendChild(element));
    });

    addCompsSourceCredit();
}

loadCompsFromJSON = function (metaData) {
    _originalLoadCompsFromJSON(metaData);
    linkPlayersToCompsFromQuery();
    renderLinks();
};

// One matrix row: the comp and one cell per lobby player
function createCompoElement(comp, index) {
    const div = document.createElement('div');
    div.className = 'item compo';
    div.dataset.id = 'compo-' + index;
    div.dataset.tier = comp.tier;

    const cell = document.createElement('div');
    cell.className = 'comp-cell';

    const info = document.createElement('div');
    info.className = 'comp-info';
    const name = document.createElement('span');
    name.className = 'comp-name';
    name.textContent = comp.title;
    // lit while none of its carries is taken by a lobby player
    const star = document.createElement('span');
    star.className = 'star-icon';
    star.title = 'Uncontested';
    star.textContent = '★';
    name.prepend(star);
    const style = document.createElement('small');
    style.className = 'comp-style';
    style.textContent = comp.style || '';
    const keyItem = createKeyItem(comp.mainAugment, comp.mainItem);
    if (keyItem) style.prepend(keyItem);
    info.append(name, style);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'items-container';

    cell.append(info, createUnitIcons(comp), itemsContainer);
    const tb = createTeambuilderButton(comp.url);
    if (tb) cell.appendChild(tb);
    div.appendChild(cell);

    for (let k = 0; k < 8; k++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link-cell';
        b.dataset.slot = k;
        b.setAttribute('aria-label', `Player ${k + 1} plays ${comp.title}`);
        b.setAttribute('aria-pressed', 'false');
        div.appendChild(b);
    }

    return div;
}

function createTeambuilderButton(teambuilderUrl) {
    if (!teambuilderUrl) return null;
    const a = document.createElement('a');
    a.className = 'teambuilder-btn';
    a.href = teambuilderUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = 'Open guide';
    a.setAttribute('aria-label', 'Open guide');
    a.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
    return a;
}

// The comp's key augment or item (emblems, radiants...) next to its style
function createKeyItem(mainAugment, mainItem) {
    const api = mainAugment?.apiName || mainItem?.apiName;
    if (!api) return null;
    const img = document.createElement('img');
    img.className = 'key-item';
    img.src = mainAugment?.apiName ? getAugmentWEBPImageUrl(api) : getItemWEBPImageUrl(api);
    img.alt = '';
    img.title = items.find(i => i.Item === api)?.Name || api;
    return img;
}

// Carries (main champion first, then by cost) with their build under each portrait
function createUnitIcons(comp) {
    const unitIcons = document.createElement('div');
    unitIcons.className = 'unit-icons';
    const main = comp.mainChampion?.name;
    const champs = [...comp.champions].sort((a, b) =>
        (b.name === main) - (a.name === main) || (a.cost ?? 9) - (b.cost ?? 9) || a.name.localeCompare(b.name));
    const setChamps = metaSnapshotData.champions || [];

    champs.forEach(ch => {
        if (!unitImageMap[ch.name]) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'unit-icon-wrapper';
        wrapper.style.setProperty('--cc', `var(--c${ch.cost || unitCostMap[ch.name] || 1})`);
        if (ch.stars >= 3) wrapper.dataset.stars = ch.stars;

        const img = document.createElement('img');
        img.src = `${unitImageMap[ch.name]}?w=64`;
        img.alt = ch.name;
        img.loading = 'lazy';
        const builds = [...(ch.items || []), ...(ch.artifacts || [])].map(api => items.find(i => i.Item === api)?.Name || api);
        img.title = builds.length ? `${ch.name}: ${builds.join(', ')}` : ch.name;
        wrapper.appendChild(img);

        // Core items (built in ~3/4 of the unit's full builds) get a gold ring
        const core = new Set((setChamps.find(c => c.name === ch.name)?.items?.core || []).map(row => row[0]));
        const its = document.createElement('span');
        its.className = 'unit-items';
        (ch.items || []).slice(0, 3).forEach(api => {
            const it = document.createElement('img');
            it.src = getItemWEBPImageUrl(api);
            it.alt = '';
            if (core.has(api)) it.classList.add('is-core');
            its.appendChild(it);
        });
        wrapper.appendChild(its);
        unitIcons.appendChild(wrapper);
    });
    return unitIcons;
}

function updatePatchLabel(setKey, setData) {
    const label = document.getElementById('patchLabel');
    if (!label) return;
    const setName = setKey.replace(/^SET\s*/i, 'Set ');
    label.innerHTML = `${setName}${setData.patch ? ` · <b>${setData.patch}</b>` : ''}`;
}

// Sources under the sheet: comps from TFT Flow, items from MetaTFT
function addCompsSourceCredit() {
    const set = metaSnapshotData;
    const link = src => src?.name && src?.url ? `<a href="${src.url}" target="_blank" rel="noopener">${src.name}</a>` : '';
    const parts = [
        set?.source && `Comps from ${link(set.source)}`,
        set?.itemsSource && `items from ${link(set.itemsSource)}`,
    ].filter(Boolean);
    if (!parts.length) return;
    const creditDiv = document.createElement('div');
    creditDiv.className = 'comps-source-credit';
    creditDiv.innerHTML = parts.join(', ');
    compsContainer.appendChild(creditDiv);
}
