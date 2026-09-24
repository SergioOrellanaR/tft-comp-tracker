// Side panel: pick components, items, artifacts or emblems and get the comps that want them.
// Components toggle (up to 3, like the set summary); items, artifacts, emblems and radiants toggle and can be
// dragged onto a player. Matching comp rows show the matched items and the rest of the sheet fades back.
import { getItemWEBPImageUrl, getChampionImageUrl } from '../tftVersusHandler.js';
import { initCompFit, fit, itemName } from './compFit.js';

export const ITEM_DRAG_TYPE = 'application/x-tft-item';

const root = document.getElementById('itemPicker');
const compsContainer = document.getElementById('compos');

const TABS = [
    { key: 'components', label: 'Components' },
    { key: 'items', label: 'Items' },
    { key: 'artifacts', label: 'Artifacts' },
    { key: 'emblems', label: 'Emblems' },
    { key: 'radiants', label: 'Radiants' },
];
// Built from team-size components only; they say nothing about a comp
// Matched by the end of the apiName: the prefix changes every set (DA_, TFT_Item_...)
const TEAM_SIZE_ITEMS = /(TacticiansCrown|TacticiansCape|TacticiansShield)$/;
export const STATE_RANK = { open: 0, shared: 1, linked: 2, crowded: 3 };
export const TIER_RANK = { S: 0, A: 1, B: 2, C: 3, X: 4 };
// A recipe with only one of its components picked still hints at the comps that build it
const PARTIAL_RECIPE_WEIGHT = 0.35;
const MAX_COMPONENTS = 3;
const SUGGESTIONS = 6;

let set = null;
let tab = 'components';
const pickedComponents = new Set();
const picked = new Set();     // items, artifacts, emblems
let componentKeys = [];
let recipes = [];             // [{ apiName, from: [a, b] }]
let usage = new Map();        // item → comps using it

export function initItemPicker(setData) {
    set = setData;
    initCompFit(set);
    pickedComponents.clear();
    picked.clear();
    recipes = (set.recipes || []).filter(r => !TEAM_SIZE_ITEMS.test(r.apiName) && r.from?.length === 2);
    // one button per component (older snapshots list the generic copies too)
    const seenNames = new Set();
    componentKeys = (set.components || []).filter(c => recipes.some(r => r.from.includes(c.apiName)))
        .filter(c => !seenNames.has(c.name) && seenNames.add(c.name)).map(c => c.apiName);
    usage = new Map();
    (set.comps || []).forEach(comp => new Set([...(comp.champions || []), ...(comp.altBuilds || [])]
        .flatMap(ch => [...(ch.items || []), ...(ch.artifacts || [])])).forEach(it => usage.set(it, (usage.get(it) || 0) + 1)));
    // artifacts, emblems and radiants: how many comps TFT Flow lists for them
    Object.entries(set.conditions || {}).forEach(([api, cond]) => usage.set(api, cond.comps.length));
    render();
}

// Toggle an item from outside (item tags in the comp filter)
export function setPickerItem(apiName, on) {
    if (!set || on === picked.has(apiName)) return;
    on ? picked.add(apiName) : picked.delete(apiName);
    render();
}

const isActive = () => pickedComponents.size > 0 || picked.size > 0;

function tabItems(key) {
    const byUse = list => (list || []).map(it => it.apiName)
        .sort((a, b) => (usage.get(b) || 0) - (usage.get(a) || 0) || itemName(a).localeCompare(itemName(b)));
    if (key === 'components') return componentKeys;
    if (key === 'items') return byUse(set.items?.default);
    if (key === 'artifacts') return byUse(set.items?.artifact);
    if (key === 'radiants') return byUse(set.items?.radiant);
    return byUse(set.items?.emblem);
}

// item → weight: picked items count fully; picked components count through the recipes they
// complete together (1) or only half cover (PARTIAL_RECIPE_WEIGHT)
function wantedItems() {
    const wanted = new Map();
    picked.forEach(p => wanted.set(p, 1));
    if (pickedComponents.size) {
        recipes.forEach(r => {
            const [a, b] = r.from;
            const full = a !== b && pickedComponents.has(a) && pickedComponents.has(b);
            const partial = pickedComponents.has(a) || pickedComponents.has(b);
            const w = full ? 1 : partial ? PARTIAL_RECIPE_WEIGHT : 0;
            if (w > (wanted.get(r.apiName) || 0)) wanted.set(r.apiName, w);
        });
    }
    return wanted;
}

// Score of a comp for a set of wanted items; also used for the players' item boxes
export function scoreComp(comp, wanted) {
    let score = 0;
    const matched = [];
    wanted.forEach((w, it) => {
        const { weight, holder } = fit(it, comp);
        if (!weight) return;
        score += weight * w;
        matched.push({ item: it, weight: weight * w, full: w >= 1, holder });
    });
    matched.sort((a, b) => b.weight - a.weight);
    return { score, matched, strong: matched.some(m => m.full) };
}

function iconButton(api, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.title = itemName(api);
    b.innerHTML = `<img src="${getItemWEBPImageUrl(api)}" alt="${itemName(api)}" draggable="false">`;
    return b;
}

function render() {
    if (!set) return;
    const wanted = wantedItems();
    root.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'card-head';
    const tabs = document.createElement('div');
    tabs.className = 'picker-tabs';
    tabs.setAttribute('role', 'tablist');
    TABS.forEach(({ key, label }) => {
        const n = key === 'components' ? pickedComponents.size : tabItems(key).filter(it => picked.has(it)).length;
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(tab === key));
        b.innerHTML = `${label}${n ? `<span class="n">${n}</span>` : ''}`;
        b.addEventListener('click', () => { tab = key; render(); });
        tabs.appendChild(b);
    });
    head.appendChild(tabs);
    if (isActive()) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'icon-btn sm';
        clear.title = 'Clear';
        clear.setAttribute('aria-label', 'Clear picks');
        clear.textContent = '×';
        clear.addEventListener('click', () => { pickedComponents.clear(); picked.clear(); render(); });
        head.appendChild(clear);
    }
    root.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'picker-grid';
    const isComponents = tab === 'components';
    tabItems(tab).forEach(api => {
        const b = iconButton(api, 'pick');
        const on = isComponents ? pickedComponents.has(api) : picked.has(api);
        b.setAttribute('aria-pressed', String(on));
        if (isComponents) {
            b.disabled = !on && pickedComponents.size >= MAX_COMPONENTS;
            b.addEventListener('click', () => {
                on ? pickedComponents.delete(api) : pickedComponents.add(api);
                render();
            });
        } else {
            // drag onto a player to put it in their item box
            b.draggable = true;
            b.addEventListener('dragstart', e => {
                e.dataTransfer.setData(ITEM_DRAG_TYPE, JSON.stringify({ api }));
                e.dataTransfer.effectAllowed = 'copy';
                document.body.classList.add('dragging-item');
            });
            b.addEventListener('dragend', () => document.body.classList.remove('dragging-item'));
            b.addEventListener('click', () => {
                on ? picked.delete(api) : picked.add(api);
                render();
            });
        }
        grid.appendChild(b);
    });
    root.appendChild(grid);

    // what the picked components complete together
    const built = [...wanted].filter(([it, w]) => w === 1 && !picked.has(it)).map(([it]) => it);
    if (isComponents && pickedComponents.size > 1) {
        const row = document.createElement('div');
        row.className = 'picker-bench';
        row.innerHTML = [...pickedComponents].map(c => `<img src="${getItemWEBPImageUrl(c)}" alt="${itemName(c)}" title="${itemName(c)}">`).join('')
            + `<span class="picker-built">${built.map(it => `<img src="${getItemWEBPImageUrl(it)}" alt="${itemName(it)}" title="${itemName(it)}">`).join('')}</span>`;
        root.appendChild(row);
    }

    const results = (set.comps || []).map((comp, index) => ({ comp, index, ...scoreComp(comp, wanted) }));
    // with any full match, partial ones stay in the background
    const anyStrong = results.some(r => r.strong);
    results.forEach(r => { r.hit = anyStrong ? r.strong : r.score > 0; });
    paintRows(results, wanted.size > 0);
    if (wanted.size) renderSuggestions(results);
}

function paintRows(results, active) {
    compsContainer.classList.toggle('picking', active);
    results.forEach(({ index, hit, matched }) => {
        const row = compsContainer.querySelector(`.item.compo[data-id="compo-${index}"]`);
        if (!row) return;
        row.classList.toggle('suggested', active && hit);
        const box = row.querySelector('.items-container');
        box.innerHTML = '';
        if (!active || !hit) return;
        matched.slice(0, 4).forEach(m => box.insertAdjacentHTML('beforeend',
            `<img src="${getItemWEBPImageUrl(m.item)}" alt="${itemName(m.item)}" title="${itemName(m.item)}${m.holder ? ` → ${m.holder.name}` : ''}"${m.full ? '' : ' class="partial"'}>`));
    });
}

export const compState = index => compsContainer.querySelector(`.item.compo[data-id="compo-${index}"]`)?.dataset.state || 'open';

// comp rows for a ranked list (picker suggestions and player potentials)
export function suggestionButton({ comp, index, matched }, { holders = false } = {}) {
    const st = compState(index);
    const a = document.createElement('button');
    a.type = 'button';
    a.className = 'suggested-comp';
    const items = holders
        ? matched.slice(0, 3).map(m => `<span class="holder-pair" title="${itemName(m.item)}${m.holder ? ` → ${m.holder.name}` : ''}"><img src="${getItemWEBPImageUrl(m.item)}" alt="">${m.holder ? `<i>›</i><img class="holder-unit" src="${getChampionImageUrl(m.holder.apiName)}?w=40" alt="${m.holder.name}">` : ''}</span>`).join('')
        : matched.slice(0, 3).map(m => `<img src="${getItemWEBPImageUrl(m.item)}" alt=""${m.full ? '' : ' class="partial"'}>`).join('');
    a.innerHTML = `<span class="tier-badge t-${comp.tier}">${comp.tier}</span>
        <span class="sc-name"><b>${comp.title}</b><small>${comp.style || ''}</small></span>
        <span class="sc-items">${items}</span>
        <span class="sc-state s-${st}" title="${st === 'shared' ? 'Carries taken' : st[0].toUpperCase() + st.slice(1)}"></span>`;
    a.addEventListener('click', () => focusRow(index));
    return a;
}

export function rankResults(results) {
    return results.sort((a, b) => b.score - a.score || STATE_RANK[compState(a.index)] - STATE_RANK[compState(b.index)]
        || (TIER_RANK[a.comp.tier] ?? 9) - (TIER_RANK[b.comp.tier] ?? 9));
}

function renderSuggestions(results) {
    const top = rankResults(results.filter(r => r.hit)).slice(0, SUGGESTIONS);
    const list = document.createElement('div');
    list.className = 'suggested-list';
    if (!top.length) list.innerHTML = '<p class="empty">No comp builds these.</p>';
    top.forEach(r => list.appendChild(suggestionButton(r)));
    root.appendChild(list);
}

// Bring a comp row into view and flash it
export function focusRow(index) {
    const row = compsContainer.querySelector(`.item.compo[data-id="compo-${index}"]`);
    if (!row) return;
    row.hidden = false;
    row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
}

// Comp states change with every link, and they order the suggestions
document.addEventListener('tft:linkschange', () => { if (isActive()) render(); });
