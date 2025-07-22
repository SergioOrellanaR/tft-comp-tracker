import { initCompFilter } from './compSearchBar.js';
import { linkPlayersToCompsFromQuery, getQueryParams } from './shareUrl.js';
import { CONFIG } from '../config.js';
import { getContrastYIQ } from '../utils.js';
import { getChampionImageUrl, getItemWEBPImageUrl, getAugmentWEBPImageUrl } from '../tftVersusHandler.js';
import { resetPlayers, select } from './players.js';

export let unitImageMap = {};
export let unitCostMap = {};
export let items = [];
export let metaSnapshotData = null;

const compsContainer = document.getElementById('compos');
const _originalLoadCompsFromJSON = loadCompsFromJSON;

const loadMetaSnapshot = async () => {
    try {
        const response = await fetch(CONFIG.routes.metaSnapshot);
        const snapshot = await response.json();
        // Extract unit data from all set compositions
        Object.values(snapshot).forEach(setData => {
            (setData.comps || []).forEach(comp => {
                (comp.champions || []).forEach(champion => {
                    const unitName = champion.name;
                    unitImageMap[unitName] = getChampionImageUrl(champion.apiName);
                    unitCostMap[unitName] = champion.cost || 1;
                });
            });
        });
        // Load unique items data across all sets
        let allItems = [];
        Object.values(snapshot).forEach(setData => {
            const it = setData.items || {};
            allItems.push(...(it.default || []), ...(it.artifact || []), ...(it.emblem || []), ...(it.trait || []));
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
        return snapshot;
    } catch (error) {
        console.error('Error loading MetaSnapshot.json:', error);
        return null;
    }
};

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
                    option.textContent = setKey;
                    setSelector.appendChild(option);
                });
                // select set from URL param or last as default
                const params = getQueryParams();
                const defaultSet = params.set && keys.includes(params.set) ? params.set : keys[keys.length - 1];
                setSelector.value = defaultSet;
                
                let isInitialLoad = true;
                // Reload compositions on set change
                setSelector.addEventListener('change', () => {
                    const selected = setSelector.value;
                    const setData = metaData[selected];
                    if (setData) {
                        // reset player panels when changing set
                        resetPlayers();
                        
                        // Only clear composition URL parameters when user changes sets
                        // (not during initial load)
                        if (!isInitialLoad) {
                            // Clear composition URL parameters when changing sets
                            // since comp indexes are set-specific
                            const url = new URL(window.location);
                            for (let i = 1; i <= 8; i++) {
                                url.searchParams.delete(`Player${i}Comps`);
                            }
                            // Update URL without reloading page
                            window.history.replaceState({}, '', url);
                        }
                        
                        // update global items for suggestions to this set only
                        const sec = setData.items || {};
                        const arr = [...(sec.default||[]), ...(sec.artifact||[]), ...(sec.emblem||[]), ...(sec.trait||[])];
                        items = arr.map(it => ({ Item: it.apiName, Name: it.name, Url: getItemWEBPImageUrl(it.apiName) }));
                        // reload compositions and filter
                        loadCompsFromJSON(setData);
                        createCoreItemsButtons(setData.items);
                        initCompFilter(setData);
                        
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

    metaData.comps.forEach((comp, index) => {
        const tier = comp.tier;
        if (tiers[tier]) {
            const allChamps = comp.champions
                .map(ch => ch.name);

            // Ensure mainChampion is first
            const mainChamp = comp.mainChampion?.apiName
                ? comp.mainChampion.name
                : allChamps[0];

            // sort others by cost asc, then name
            const otherChamps = allChamps
                .filter(u => u !== mainChamp)
                .sort((a, b) => {
                    const costA = unitCostMap[a] ?? Infinity;
                    const costB = unitCostMap[b] ?? Infinity;
                    if (costA !== costB) return costA - costB;
                    return a.localeCompare(b);
                });

            const sortedUnits = [mainChamp, ...otherChamps];

            const compoElement = createCompoElement({
                comp: comp.title,
                index,
                estilo: comp.style,
                units: sortedUnits,
                teambuilderUrl: comp.url,
                mainAugment: comp.mainAugment || {},
                mainItem: comp.mainItem || {}
            });
            // Store tags for filtering: champions, their items, and style
            const champNames = comp.champions.map(ch => ch.name);
            const champItemNames = comp.champions.flatMap(ch => (ch.items || []).map(itemApi => {
                const it = items.find(i => i.Item === itemApi);
                return it ? it.Name : itemApi;
            }));
            // Include altBuilds items in tags
            const altBuildItemNames = (comp.altBuilds || []).flatMap(ab => (ab.items || []).map(itemApi => {
                const it = items.find(i => i.Item === itemApi);
                return it ? it.Name : itemApi;
            }));
            // Include mainItem in tags
            const mainItemName = comp.mainItem?.apiName
                ? (items.find(i => i.Item === comp.mainItem.apiName)?.Name)
                : null;
            const mainItemTags = mainItemName ? [mainItemName] : [];
            const styleTag = comp.style ? [comp.style] : [];
            const tags = [...champNames, ...champItemNames, ...altBuildItemNames, ...mainItemTags, ...styleTag];
            compoElement.dataset.tags = tags.join('|');
            tiers[tier].push({ name: comp.title, element: compoElement });
        }
    });

    ['S', 'A', 'B', 'C', 'X'].forEach(t => {
        if (tiers[t].length > 0) {
            tiers[t].sort((a, b) => a.name.localeCompare(b.name));

            const header = document.createElement('div');
            header.className = 'tier-header';
            header.textContent = t === 'X' ? 'SITUATIONAL' : `TIER ${t}`;
            header.style.backgroundColor = CONFIG.tierColors[t];
            header.style.color = getContrastYIQ(CONFIG.tierColors[t]);
            compsContainer.appendChild(header);

            tiers[t].forEach(({ element }) => compsContainer.appendChild(element));
        }
    });
}

function createCoreItemsButtons(metaItems) {
    const container = document.createElement('div');
    container.id = 'coreItemsContainer';

    Object.entries(metaItems).forEach(([section, sectionItems]) => {
        // Skip this section if there are no items
        if (!Array.isArray(sectionItems) || sectionItems.length === 0) {
            return;
        }

        // section header/container
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'core-items-section';
        const hdr = document.createElement('h4');
        hdr.textContent = section.charAt(0).toUpperCase() + section.slice(1);
        sectionDiv.appendChild(hdr);

        // buttons for each item in this section
        sectionItems.forEach(itemObj => {
            const btn = document.createElement('button');
            btn.className = 'core-item-button';
            btn.title = itemObj.name;
            btn.style.backgroundImage = `url(${getItemWEBPImageUrl(itemObj.apiName)})`;
            btn.dataset.item = itemObj.apiName;
            btn.onclick = () => {
                btn.classList.toggle('active');
                document.querySelectorAll('.items-container').forEach(ctn => {
                    updateItemsContainer(ctn);
                });
            };
            sectionDiv.appendChild(btn);
        });

        container.appendChild(sectionDiv);
    });

    compsContainer.appendChild(container);
}

loadCompsFromJSON = function (metaData) {
    _originalLoadCompsFromJSON(metaData);
    linkPlayersToCompsFromQuery();
};

function createCompoElement({ comp, index, estilo, units, teambuilderUrl, mainAugment, mainItem }) {
    const div = document.createElement('div');
    div.className = 'item compo';
    div.dataset.id = 'compo-' + index;

    const styleContainer = createStyleContainer(estilo);
    const starContainer = createUncontestedContainer();
    const augmentItemContainer = createAugmentItemContainer(mainAugment, mainItem);

    const compInfo = createCompInfo(comp);
    const itemsContainer = createItemsContainer();
    const unitIcons = createUnitIcons(units, index);
    const tbButtonDiv = createTeambuilderButton(teambuilderUrl);

    div.append(styleContainer, starContainer, augmentItemContainer, compInfo, itemsContainer, unitIcons);
    if (tbButtonDiv) div.appendChild(tbButtonDiv);

    div.onclick = () => select(div, 'compo');
    return div;
}

// Nueva función auxiliar para crear el contenedor de estilo
function createStyleContainer(estilo) {
    const styleContainer = document.createElement('div');
    styleContainer.className = 'comp-style';
    const compStyle = document.createElement('span');
    compStyle.textContent = estilo;
    styleContainer.appendChild(compStyle);
    return styleContainer;
}

// Nueva función auxiliar para crear el contenedor de estrella
function createUncontestedContainer() {
    const starContainer = document.createElement('div');
    starContainer.className = 'comp-star';
    Object.assign(starContainer.style, {

    });

    const starIcon = document.createElement('span');
    starIcon.className = 'star-icon';
    starIcon.textContent = '⭐';
    //starIcon.style.visibility = 'hidden';
    // Show tooltip text on hover
    starIcon.title = 'Uncontested';

    starContainer.appendChild(starIcon);
    return starContainer;
}

// Nueva función auxiliar para crear la info de la composición
function createCompInfo(comp) {
    const compInfo = document.createElement('div');
    compInfo.className = 'comp-info';
    const compName = document.createElement('span');
    compName.className = 'comp-name';
    compName.textContent = comp;
    compInfo.appendChild(compName);
    return compInfo;
}

// Nueva función auxiliar para crear el contenedor de items
function createItemsContainer() {
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'items-container';
    return itemsContainer;
}

// Nueva función auxiliar para crear el botón de teambuilder
function createTeambuilderButton(teambuilderUrl) {
    if (!teambuilderUrl) return null;
    const tbDiv = document.createElement('div');
    tbDiv.className = 'teambuilder-btn-container';
    const tbButton = document.createElement('a');
    tbButton.className = 'teambuilder-btn';
    tbButton.href = teambuilderUrl;
    tbButton.target = '_blank';
    tbButton.title = "Open in teambuilder";
    tbButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="#ffffff" width="15" height="15" viewBox="0 0 24 24">
            <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z"/>
            <path d="M5 5h4V3H5c-1.1 0-2 .9-2 2v4h2V5z"/>
            <path d="M5 19h4v2H5c-1.1 0-2-.9-2-2v-4h2v4z"/>
            <path d="M19 19h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4z"/>
        </svg>`;
    tbButton.addEventListener('click', e => e.stopPropagation());
    tbDiv.appendChild(tbButton);
    return tbDiv;
}

// Refactorización de createCompoElement utilizando las funciones auxiliares
function createAugmentItemContainer(mainAugment, mainItem) {
    const container = document.createElement('div');
    container.className = 'main-augment-item-container';
    if (mainAugment && mainAugment.apiName) {
        const img = document.createElement('img');
        img.src = getAugmentWEBPImageUrl(mainAugment.apiName);
        img.alt = mainAugment.apiName;
        img.title = mainAugment.apiName;    // show augment.apiName on hover
        container.appendChild(img);
    } else if ((!mainAugment || !mainAugment.apiName) && mainItem && mainItem.apiName) {
        // Only add if NOT an emblem
        const emblemApiNames = (metaSnapshotData?.items?.emblem || []).map(e => e.apiName);
        if (!emblemApiNames.includes(mainItem.apiName)) {
            const img = document.createElement('img');
            img.src = getItemWEBPImageUrl(mainItem.apiName);
            img.alt = mainItem.apiName;
            // lookup human‐readable Name or fallback to apiName
            img.title = (items.find(i => i.Item === mainItem.apiName)?.Name) || mainItem.apiName;
            container.appendChild(img);
        }
    }
    return container;
}

const updateItemsContainer = (itemsContainer) => {
    itemsContainer.innerHTML = '';

    const activeItems = Array.from(
        document.querySelectorAll('.core-item-button.active')
    ).map(button => button.dataset.item);

    const compElement = itemsContainer.closest('.item.compo');
    const compIndex = parseInt(compElement.dataset.id.split('-')[1], 10);
    const compData = metaSnapshotData.comps[compIndex];

    const itemToChampionsMap = {};

    // Base itemized champions: use this comp’s champions
    compData.champions.forEach(champion => {
        const champName = champion.name;
        champion.items.forEach(item => {
            if (item && activeItems.includes(item)) {
                if (!itemToChampionsMap[item]) itemToChampionsMap[item] = [];
                itemToChampionsMap[item].push(champName);
            }
        });
    });

    // Include altBuilds champions
    compData.altBuilds.forEach(ab => {
        const champ = ab.name;
        ab.items.forEach(item => {
            if (activeItems.includes(item)) {
                if (!itemToChampionsMap[item]) itemToChampionsMap[item] = [];
                itemToChampionsMap[item].push(champ);
            }
        });
    });
    // Ensure mainItem appears if selected
    if (compData.mainItem && compData.mainItem.apiName && activeItems.includes(compData.mainItem.apiName)) {
        if (!itemToChampionsMap[compData.mainItem.apiName]) itemToChampionsMap[compData.mainItem.apiName] = [];
        itemToChampionsMap[compData.mainItem.apiName].push('Main Item');
    }

    const displayedItems = new Set();

    Object.entries(itemToChampionsMap).forEach(([item, champions]) => {
        if (!displayedItems.has(item)) {
            const itemData = items.find(i => i.Item === item);
            if (itemData) {
                // remove duplicate champion names
                const uniqueChamps = [
                    ...new Set(
                        champions
                            .filter(champ => champ && champ.trim() !== '')
                    )
                ];
                const img = document.createElement('img');
                img.src = itemData.Url;
                img.alt = itemData.Name;
                img.title = `${itemData.Name} (Used by: ${uniqueChamps.join(', ')})`;
                Object.assign(img.style, {
                    width: '22px',
                    height: '22px',
                    borderRadius: '4px',
                    objectFit: 'cover'
                });
                itemsContainer.appendChild(img);
                displayedItems.add(item);
            }
        }
    });
};

// Nueva función auxiliar para crear los iconos de unidades
function createUnitIcons(units, compIndex) {
    const unitIcons = document.createElement('div');
    unitIcons.className = 'unit-icons';
    const champItemsList = metaSnapshotData.comps[compIndex].champions;

    units.forEach(unit => {
        if (!unit || !unitImageMap[unit]) return;

        const img = document.createElement('img');
        img.src = `${unitImageMap[unit]}?w=28`;
        img.alt = unit;

        // wrapper for hover tooltip
        const wrapper = document.createElement('div');
        wrapper.className = 'unit-icon-wrapper';
        wrapper.appendChild(img);

        // build tooltip of item-icons via helper
        const champObj = champItemsList.find(ch => ch.name === unit);
        const itemApiNames = champObj?.items || [];
        if (itemApiNames.length) {
            const tooltip = createUnitTooltip(itemApiNames);
            wrapper.appendChild(tooltip);
            wrapper.addEventListener('mouseenter', () => tooltip.style.display = 'flex');
            wrapper.addEventListener('mouseleave', () => tooltip.style.display = 'none');
        }

        unitIcons.appendChild(wrapper);
    });

    return unitIcons;
}

// Nueva función auxiliar para crear el tooltip de items de una unidad
function createUnitTooltip(itemApiNames) {
    const tooltip = document.createElement('div');
    tooltip.className = 'unit-tooltip';

    itemApiNames.forEach(api => {
        const it = items.find(i => i.Item === api);
        if (it) {
            const ti = document.createElement('img');
            ti.src = it.Url;
            ti.alt = it.Name;
            tooltip.appendChild(ti);
        }
    });

    return tooltip;
}