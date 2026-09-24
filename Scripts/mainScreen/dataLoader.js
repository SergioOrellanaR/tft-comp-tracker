import { initCompFilter } from './compSearchBar.js';
import { linkPlayersToCompsFromQuery, getQueryParams, showNotification } from './shareUrl.js';
import { CONFIG } from '../config.js';
import { getChampionImageUrl, getItemWEBPImageUrl, getAugmentWEBPImageUrl } from '../tftVersusHandler.js';
import { resetPlayers } from './players.js';
import { renderLinks, links } from './matrix.js';
import { initItemPicker } from './itemPicker.js';
import { sourceView, initialSource, getSourceId, renderSourceSwitch, sourceLogo } from './compSource.js';
import './compStatCard.js';

export let unitImageMap = {};
export let unitCostMap = {};
export let items = [];
// Data variables
export let metaSnapshotData = null;
let currentSetData = null;
let fullSnapshot = null;

// Data of the set picked in the set selector, with the comps of the chosen source; the transitions tab
// reads the same data as the tracker
export const getCurrentSetData = () => currentSetData;
// Every published set, keyed like the snapshot ("SET 18"); the set summary can browse them on its own
export const getSnapshotSets = () => fullSnapshot || {};

const compsContainer = document.getElementById('compos');
const _originalLoadCompsFromJSON = loadCompsFromJSON;

const loadMetaSnapshot = async () => {
    try {
        // Add caching for the meta snapshot
        // Versioned: bump when the format changes (v5: comp sources)
        const cacheKey = 'metaSnapshot:v5';
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
    fullSnapshot = snapshot;
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
                            clearCompParams({ items: true });
                        }

                        initialSource(setData);
                        renderLobby(selected, setData);
                        document.dispatchEvent(new CustomEvent('tft:setchange', { detail: currentSetData }));
                        
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

// Build the lobby for a set with the chosen comp source
function renderLobby(setKey, setData) {
    const view = sourceView(setData, getSourceId());
    // unit images/costs must match the selected set, not the newest one
    buildUnitMaps([view]);
    // update global items for suggestions to this set only
    const sec = view.items || {};
    const arr = [...(sec.default||[]), ...(sec.artifact||[]), ...(sec.emblem||[]), ...(sec.radiant||[]), ...(sec.trait||[])];
    items = arr.map(it => ({ Item: it.apiName, Name: it.name, Url: getItemWEBPImageUrl(it.apiName) }));
    currentSetData = view;
    loadCompsFromJSON(view);
    initCompFilter(view);
    initItemPicker(view);
    updatePatchLabel(setKey, view);
    renderSourceSwitch(setData, () => {
        // comp indexes belong to a source: its links and the shared ones in the URL go
        links.splice(0, links.length);
        clearCompParams({ items: false });
        renderLobby(setKey, setData);
        document.dispatchEvent(new CustomEvent('tft:sourcechange', { detail: currentSetData }));
    });
}

// Drop the comp links (and, on a set change, the items) a share URL carried; they point at one set/source
function clearCompParams({ items: withItems }) {
    const url = new URL(window.location);
    url.searchParams.delete('source');
    for (let i = 1; i <= 8; i++) {
        url.searchParams.delete(`Player${i}Comps`);
        if (withItems) url.searchParams.delete(`Player${i}Items`);
    }
    // Update URL without reloading page
    window.history.replaceState({}, '', url);
}

export function loadCompsFromJSON(metaData) {
    // Update global snapshot to current set so tooltips and icons reference correct data
    metaSnapshotData = metaData;
    compsContainer.innerHTML = '';
    const tiers = { S: [], A: [], B: [], C: [], D: [], X: [] };
    const itemName = api => items.find(i => i.Item === api)?.Name || api;

    metaData.comps.forEach((comp, index) => {
        if (!tiers[comp.tier]) return;
        const compoElement = createCompoElement(comp, index);
        // Tags for filtering: every unit of the board, the builds (alt builds too), key item and style
        const tags = [
            ...new Set([...comp.champions, ...(comp.board || [])].map(ch => ch.name)),
            ...[...comp.champions, ...(comp.altBuilds || [])].flatMap(ch => [...(ch.build || ch.items || []), ...(ch.artifacts || [])].map(itemName)),
            ...(comp.mainItem?.apiName ? [itemName(comp.mainItem.apiName)] : []),
            ...(comp.style ? [comp.style] : []),
        ];
        compoElement.dataset.tags = tags.join('|');
        tiers[comp.tier].push({ name: comp.title, avg: comp.stats?.avg, element: compoElement });
    });

    ['S', 'A', 'B', 'C', 'D', 'X'].forEach(t => {
        if (!tiers[t].length) return;
        // comps with placement stats keep the source's order (best average first), the rest go by name
        tiers[t].sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0) || a.name.localeCompare(b.name));
        const header = document.createElement('div');
        header.className = 'tier-header';
        header.dataset.tier = t;
        header.innerHTML = `<b class="tier-badge t-${t}">${t}</b><span class="tier-label">${t === 'X' ? 'Situational' : `Tier ${t}`}</span><span class="tier-count"></span>`;
        compsContainer.appendChild(header);
        tiers[t].forEach(({ element }) => compsContainer.appendChild(element));
    });

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
    // placement stats (MetaTFT, Tactics Tools): a compact line, the full card on hover
    if (comp.stats) {
        const stats = document.createElement('small');
        stats.className = 'comp-stats';
        stats.innerHTML = `<b>${comp.stats.avg.toFixed(2)}</b> avg<span class="cs-top4"><i>·</i>${pct(comp.stats.top4)} top 4</span>${comp.stats.play != null ? `<span class="cs-play"><i>·</i>${pct(comp.stats.play, 1)} play</span>` : ''}`;
        info.appendChild(stats);
        info.dataset.stats = index;
    }

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'items-container';

    cell.append(info, createUnitIcons(comp), itemsContainer);
    const planner = createPlannerButton(comp.plannerCode);
    if (planner) cell.appendChild(planner);
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

const pct = (share, digits = 0) => `${(share * 100).toFixed(digits)}%`;

// Copies the comp's board as an in-game Team Planner code (paste it in the client's Team Planner)
function createPlannerButton(code) {
    if (!code) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'teambuilder-btn planner-btn';
    b.title = 'Copy Team Planner code';
    b.setAttribute('aria-label', 'Copy Team Planner code');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
    b.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(code);
            showNotification('Team Planner code copied. Paste it in the Team Planner in game.');
            b.classList.add('copied');
            setTimeout(() => b.classList.remove('copied'), 1200);
        } catch {
            prompt('Team Planner code', code);
        }
    });
    return b;
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
        // Only carries can be contested: the main champion and every itemized unit that isn't a tank
        const role = setChamps.find(c => c.name === ch.name)?.role || '';
        if (ch.name === main || !role.endsWith('Tank')) wrapper.dataset.carry = '';
        wrapper.style.setProperty('--cc', `var(--c${ch.cost || unitCostMap[ch.name] || 1})`);
        if (ch.stars >= 3) wrapper.dataset.stars = ch.stars;

        const img = document.createElement('img');
        img.src = `${unitImageMap[ch.name]}?w=64`;
        img.alt = ch.name;
        img.loading = 'lazy';
        // The source's own build, as the site shows it (items, artifacts, emblems, radiants)
        const build = ch.build || ch.items || [];
        const names = build.map(itemNameOf);
        img.title = names.length ? `${ch.name}: ${names.join(', ')}` : ch.name;
        wrapper.appendChild(img);

        // Core items (built in ~3/4 of the unit's full builds) get a gold ring
        const core = new Set((setChamps.find(c => c.name === ch.name)?.items?.core || []).map(row => row[0]));
        const its = document.createElement('span');
        its.className = 'unit-items';
        build.slice(0, 3).forEach(api => {
            const it = document.createElement('img');
            it.src = getItemWEBPImageUrl(api);
            it.alt = '';
            it.title = itemNameOf(api);
            if (core.has(api)) it.classList.add('is-core');
            its.appendChild(it);
        });
        wrapper.appendChild(its);
        unitIcons.appendChild(wrapper);
    });

    // The rest of the final board, smaller: the comp in full, without competing with the carries
    const carried = new Set(champs.map(ch => ch.name));
    const rest = (comp.board || []).filter(u => !carried.has(u.name) && unitImageMap[u.name]);
    if (rest.length) {
        const group = document.createElement('div');
        group.className = 'board-rest';
        rest.forEach(u => {
            const unit = document.createElement('span');
            unit.className = 'board-unit';
            unit.style.setProperty('--cc', `var(--c${u.cost || unitCostMap[u.name] || 1})`);
            if (u.stars >= 3) unit.dataset.stars = u.stars;
            const img = document.createElement('img');
            img.src = `${unitImageMap[u.name]}?w=48`;
            img.alt = u.name;
            img.title = u.stars >= 3 ? `${u.name} (3★)` : u.name;
            img.loading = 'lazy';
            unit.appendChild(img);
            group.appendChild(unit);
        });
        unitIcons.appendChild(group);
    }
    return unitIcons;
}

const itemNameOf = api => items.find(i => i.Item === api)?.Name || api;

function updatePatchLabel(setKey, setData) {
    const label = document.getElementById('patchLabel');
    if (!label) return;
    const setName = setKey.replace(/^SET\s*/i, 'Set ');
    label.innerHTML = `${setName}${setData.patch ? ` · <b>${setData.patch}</b>` : ''}`;
}
