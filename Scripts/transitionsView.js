// Transitions tab: early (1-3 cost) → late (4-5 cost) champions that want the same items.
// Reads the same MetaSnapshot set as the tracker: champions (CommunityDragon traits/stats, derived role) with live
// S/A item tiers (MetaTFT), plus components and recipes. Re-renders when the set selector changes.
import { links } from './mainScreen/matrix.js';
import { getCurrentSetData, getSnapshotSets } from './mainScreen/dataLoader.js';
import { getChampionImageUrl, getItemWEBPImageUrl } from './tftVersusHandler.js';

let DATA = null;
let root = null;
let onFilterComps = null; // (champName) => void, provided by the tab controller

const ROLE_ORDER = {
    AD: ['Marksman', 'Caster', 'Fighter', 'Assassin', 'Specialist'],
    AP: ['Caster', 'Marksman', 'Fighter', 'Assassin', 'Specialist'],
};
const CAT_LABEL = { AD: 'Attack damage', AP: 'Ability power', Tank: 'Tank' };
// Fits any unit, so it says nothing about who hands items to whom
const GENERIC_ITEMS = new Set(['DA_ThiefsGloves']);
const TEAM_SIZE_ITEMS = new Set(['DA_TacticiansCrown', 'DA_TacticiansCape', 'DA_TacticiansShield']);
// Core (built in ~3/4 of full builds) ranks above S; all three are "ideal" items
const TIERS = ['core', 'S', 'A'];
const TIER_LABEL = { core: 'Core', S: 'S', A: 'A' };
const ranked = t => TIERS.flatMap(tier => t?.[tier] || []);
// Core and S are the strong picks (what the component picker highlights)
const isTop = tier => tier === 'core' || tier === 'S';
// Champions that switch between AD and AP builds get one entry per build, listed in its group
const ADAPTIVE_TRAIT = 'Adaptor';
const VARIANTS = ['AD', 'AP'];

let activePhase = null;   // null | 'early' | 'late'
let activeItem = null;    // selected item apiName in the global palette
let pickedComps = [];     // up to 3 distinct component apiNames

const $ = sel => root.querySelector(sel);
const $$ = sel => root.querySelectorAll(sel);

// ---------- data ----------
// Shape one MetaSnapshot set into what the view needs
function buildData(set) {
    const itemNames = new Map();
    const addNames = list => (list || []).forEach(it => it?.apiName && itemNames.set(it.apiName, it.name));
    Object.values(set.items || {}).forEach(addNames);
    Object.entries(set.conditions || {}).forEach(([api, cond]) => cond.name && itemNames.set(api, cond.name));
    addNames(set.components);
    addNames(set.recipes);

    const units = (set.champions || [])
        .filter(c => c.role && ranked(c.items).length)
        .map(c => {
            const [damage, roleName = 'Fighter'] = c.role.split(' ');
            return {
                key: c.name, name: c.name, apiName: c.apiName, cost: c.cost, traits: c.traits || [], stats: c.stats || {},
                type: c.role, damageType: damage === 'Magic' ? 'Magic' : 'Attack', roleName,
                tiers: { core: [], ...c.items }, artifacts: c.artifacts, emblems: c.emblems, variants: c.variants,
            };
        });

    // Item class: AD / AP / hybrid, from which damage type rates it S/A (minority >= 25% → hybrid).
    // Tank items: mostly rated by tanks; they stay out of the global palette.
    const owners = new Map();
    units.forEach(c => ranked(c.tiers).forEach(([it]) => {
        if (!owners.has(it)) owners.set(it, { A: 0, M: 0, tank: 0, all: 0 });
        const o = owners.get(it);
        o.all++;
        if (c.roleName === 'Tank') o.tank++;
        else if (!c.traits.includes(ADAPTIVE_TRAIT)) o[c.damageType === 'Magic' ? 'M' : 'A']++;
    }));
    const itemClass = new Map();
    const tankItems = new Set();
    owners.forEach(({ A, M, tank, all }, it) => {
        if (tank / all >= 0.6) tankItems.add(it);
        const minor = A + M ? Math.min(A, M) / (A + M) : 1;
        itemClass.set(it, minor >= 0.25 ? 'HY' : (A > M ? 'AD' : 'AP'));
    });

    // Adaptive champions become one entry per build (AD / AP), each with that build's own tiers.
    // Older snapshots have no `variants`: split the unit's tiers by item class instead.
    const splitTiers = (t, v) => Object.fromEntries(Object.entries(t).map(([k, rows]) =>
        [k, Array.isArray(rows) ? rows.filter(([it]) => [v, 'HY'].includes(itemClass.get(it))) : rows]));
    const champions = units.flatMap(c => {
        if (!c.traits.includes(ADAPTIVE_TRAIT) || c.roleName === 'Tank') return [c];
        const variants = c.variants || { AD: splitTiers(c.tiers, 'AD'), AP: splitTiers(c.tiers, 'AP') };
        const out = VARIANTS.filter(v => ranked(variants[v]).length).map(v => {
            const damageType = v === 'AP' ? 'Magic' : 'Attack';
            return { ...c, key: `${c.name}|${v}`, variant: v, damageType, type: `${damageType} ${c.roleName}`, tiers: { core: [], ...variants[v] } };
        });
        return out.length ? out : [c];
    });
    const byKey = new Map(champions.map(c => [c.key, c]));
    const byName = new Map(champions.map(c => [c.name, c]));

    const transitions = { AD: {}, AP: {}, Tank: { Attack: [], Magic: [] } };
    const push = (cat, role, entry) => (transitions[cat][role] ||= []).push(entry);
    champions.forEach(c => {
        const entry = { key: c.key, name: c.name, cost: c.cost, variant: c.variant };
        if (c.roleName === 'Tank') return transitions.Tank[c.damageType].push(entry);
        push(c.damageType === 'Magic' ? 'AP' : 'AD', c.roleName, entry);
    });

    // component pair → completed item. Team-size items don't count, so Spatula and Frying Pan get no button.
    const buildable = (set.recipes || []).filter(r => !TEAM_SIZE_ITEMS.has(r.apiName));
    const recipes = new Map(buildable.map(r => [[...r.from].sort().join('|'), r.apiName]));
    const components = (set.components || []).map(c => c.apiName)
        .filter(c => buildable.some(r => r.from.includes(c)));

    return {
        set, champions, byKey, byName, itemNames, itemClass, tankItems, transitions, recipes, components,
        patch: set.patch, itemsSource: set.itemsSource, compsSource: set.source,
    };
}

// ---------- entry point ----------
export async function initTransitionsView(container, { filterComps } = {}) {
    if (root) return;
    root = container;
    onFilterComps = filterComps || null;
    root.innerHTML = `
        <div class="tv-toolbar">
            <div class="tv-phase-filter" role="group" aria-label="Phase">
                <button type="button" class="tv-phase-btn" data-phase="early" aria-pressed="false" title="1-3 cost">Early</button>
                <button type="button" class="tv-phase-btn" data-phase="late" aria-pressed="false" title="4-5 cost">Late</button>
            </div>
            <div class="tv-comp-slot"></div>
            <select class="tv-set-select" aria-label="Set" hidden></select>
        </div>
        <div class="tv-transitions-root"><div class="tv-loading" aria-busy="true"></div></div>
        <footer class="tv-foot"></footer>
        <div class="tv-backdrop"></div>
        <aside class="tv-drawer" aria-hidden="true">
            <button class="tv-close-btn" aria-label="Close">✕</button>
            <div class="tv-drawer-content"></div>
        </aside>`;
    initPhaseFilter();
    initDrawer();
    // The summary follows the lobby's set until another one is picked here
    document.addEventListener('tft:setchange', e => loadSet(e.detail));
    $('.tv-set-select').addEventListener('change', e => {
        const set = getSnapshotSets()[e.target.value];
        if (set) loadSet(set);
    });
    const set = getCurrentSetData();
    if (set) loadSet(set);
}

// Live / PBE picker, shown only while more than one set is published
function renderSetSelect(set) {
    const select = $('.tv-set-select');
    const sets = getSnapshotSets();
    const keys = Object.keys(sets);
    select.hidden = keys.length < 2;
    select.innerHTML = keys.map(k => `<option value="${k}">${k.replace(/^SET\s*/i, 'Set ')} · ${sets[k]?.status === 'pbe' ? 'PBE' : 'Live'}</option>`).join('');
    const current = keys.find(k => sets[k] === set);
    if (current) select.value = current;
}

function loadSet(set) {
    if (!root) return;
    closeTransitionsDrawer();
    renderSetSelect(set);
    DATA = buildData(set);
    activeItem = null;
    pickedComps = [];
    if (!DATA.champions.length) {
        $('.tv-comp-slot').innerHTML = '';
        $('.tv-transitions-root').innerHTML = `<div class="tv-loading">No item stats for this set yet.</div>`;
        $('.tv-foot').textContent = '';
        return;
    }
    const src = s => s ? `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>` : '';
    $('.tv-foot').innerHTML = `Items, artifacts and emblems from ${src(DATA.itemsSource)}${DATA.patch ? `, patch ${DATA.patch}` : ''}.`;
    renderTransitions();
}

// ---------- lobby (tracker) awareness ----------
// Champion → colors of lobby players linked in the tracker to a comp that uses it
function lobbyColorsByChamp() {
    const map = new Map();
    links.forEach(({ compo, player }) => {
        compo.querySelectorAll('.unit-icons .unit-icon-wrapper > img').forEach(img => {
            const colors = map.get(img.alt) || new Set();
            colors.add(player.dataset.color);
            map.set(img.alt, colors);
        });
    });
    return map;
}

// Mark chips with the colors of the players already going for that champion
export function refreshLobbyMarks() {
    if (!DATA || !root) return;
    const byChamp = lobbyColorsByChamp();
    $$('.tv-chip:not(.tv-gap-chip)').forEach(chip => {
        chip.querySelector('.tv-lobby')?.remove();
        const colors = byChamp.get(chip.dataset.champ);
        chip.classList.toggle('tv-taken', !!colors);
        if (!colors) return;
        const dots = document.createElement('span');
        dots.className = 'tv-lobby';
        dots.title = `Contested by ${colors.size}`;
        colors.forEach(c => {
            const dot = document.createElement('i');
            dot.style.background = c;
            dots.appendChild(dot);
        });
        chip.querySelector('.tv-chip-head').appendChild(dots);
    });
}

// ---------- helpers ----------
function passesPhase(cost) {
    if (activePhase === 'early') return cost <= 3;
    if (activePhase === 'late') return cost >= 4;
    return true;
}
const itemName = api => DATA.itemNames.get(api) || api;
// Entries are keyed by name, or "name|AD" / "name|AP" for the builds of adaptive champions
const champTiers = key => DATA.byKey.get(key)?.tiers || null;

function portraitImg(name, size) {
    const img = document.createElement('img');
    img.className = 'tv-portrait' + (size ? ' ' + size : '');
    img.src = getChampionImageUrl(DATA.byName.get(name)?.apiName || name);
    img.alt = name;
    img.loading = 'lazy';
    return img;
}

function itemImg(api, size) {
    const img = document.createElement('img');
    img.className = 'tv-item-icon' + (size ? ' ' + size : '');
    img.src = getItemWEBPImageUrl(api);
    img.alt = itemName(api);
    img.title = itemName(api);
    img.loading = 'lazy';
    return img;
}

function costGem(cost) {
    const el = document.createElement('span');
    el.className = 'tv-gem';
    el.style.background = `var(--tv-c${cost})`;
    el.textContent = cost;
    return el;
}

// Item → 'core' | 'S' | 'A' for a champion (entry key)
function saMap(key) {
    const t = champTiers(key), m = new Map();
    TIERS.forEach(tier => (t?.[tier] || []).forEach(r => { if (!m.has(r[0])) m.set(r[0], tier); }));
    return m;
}

// Best core/S/A items of a champion (entry key)
function bestItems(key, size = 3) {
    const t = champTiers(key);
    if (!t) return [];
    return ranked(t).map(r => r[0]).filter(it => !GENERIC_ITEMS.has(it)).slice(0, size);
}

const variantTag = variant => variant ? ` <span class="tv-variant-tag ${variant}">${variant}</span>` : '';

// ---------- chips & rows ----------
function makeChip(entry) {
    const chip = document.createElement('button');
    chip.className = 'tv-chip';
    chip.type = 'button';
    chip.dataset.champ = entry.name;
    chip.dataset.key = entry.key;

    const head = document.createElement('div');
    head.className = 'tv-chip-head';
    head.append(portraitImg(entry.name), costGem(entry.cost));
    const nm = document.createElement('span');
    nm.className = 'tv-name';
    nm.textContent = entry.name;
    head.appendChild(nm);
    if (entry.variant) {
        const v = document.createElement('span');
        v.className = 'tv-variant-tag ' + entry.variant;
        v.textContent = entry.variant;
        head.appendChild(v);
    }
    chip.appendChild(head);

    const shown = bestItems(entry.key);
    const itemsRow = document.createElement('div');
    itemsRow.className = 'tv-chip-items' + (shown.length ? '' : ' empty');
    const core = new Set((champTiers(entry.key)?.core || []).map(r => r[0]));
    shown.forEach(it => {
        const img = itemImg(it);
        img.classList.toggle('is-core', core.has(it));
        itemsRow.appendChild(img);
    });
    if (!shown.length) itemsRow.textContent = '—';
    chip.appendChild(itemsRow);

    chip.addEventListener('click', () => openChampionDrawer(entry.key));
    return chip;
}

function connector(width) {
    const conn = document.createElement('div');
    conn.className = 'tv-connector';
    if (width) conn.style.width = width;
    return conn;
}

// One row per role: chips ordered by cost, with a dashed placeholder for missing costs
function buildRoleRow(role, entries) {
    const row = document.createElement('div');
    row.className = 'tv-role-row';
    const label = document.createElement('div');
    label.className = 'tv-role-label';
    label.textContent = role;
    row.appendChild(label);

    const flow = document.createElement('div');
    flow.className = 'tv-chip-flow';
    const sorted = [...entries].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
    const minC = Math.min(...sorted.map(e => e.cost));
    const maxC = Math.max(...sorted.map(e => e.cost));

    for (let c = minC; c <= maxC; c++) {
        const atCost = sorted.filter(e => e.cost === c);
        if (c > minC) flow.appendChild(connector());
        if (atCost.length === 0) {
            const gap = document.createElement('div');
            gap.className = 'tv-chip tv-gap-chip';
            gap.title = `No ${c}-cost ${role.toLowerCase()}`;
            gap.appendChild(costGem(c));
            flow.appendChild(gap);
        } else {
            atCost.forEach((e, i) => {
                if (i > 0) flow.appendChild(connector('8px'));
                flow.appendChild(makeChip(e));
            });
        }
    }
    row.appendChild(flow);
    return row;
}

// ---------- global item palette ----------
// How many champions have each non-tank, non-generic item in S or A
function itemOwners() {
    const map = new Map();
    DATA.champions.forEach(c => ranked(c.tiers).forEach(([it]) => {
        if (DATA.tankItems.has(it) || GENERIC_ITEMS.has(it)) return;
        map.set(it, (map.get(it) || 0) + 1);
    }));
    return map;
}

function buildItemPalette() {
    const owners = itemOwners();
    const items = [...owners.entries()].sort((a, b) => b[1] - a[1] || itemName(a[0]).localeCompare(itemName(b[0])));
    if (activeItem && !owners.has(activeItem)) activeItem = null;
    const wrap = document.createElement('div');
    wrap.className = 'tv-item-boxes';
    [['AD', 'AD'], ['AP', 'AP'], ['HY', 'Hybrid']].forEach(([cls, label]) => {
        const box = document.createElement('div');
        box.className = 'tv-box';
        box.dataset.cls = cls;
        box.innerHTML = `<div class="tv-d-label">${label}</div>`;
        const pal = document.createElement('div');
        pal.className = 'tv-item-palette';
        items.filter(([api]) => DATA.itemClass.get(api) === cls).forEach(([api, count]) => {
            const btn = document.createElement('button');
            btn.className = 'tv-ip-btn';
            btn.type = 'button';
            btn.dataset.item = api;
            btn.title = `${itemName(api)} (${count})`;
            btn.setAttribute('aria-pressed', String(activeItem === api));
            btn.appendChild(itemImg(api));
            btn.addEventListener('click', () => {
                activeItem = activeItem === api ? null : api;
                if (activeItem) pickedComps = [];
                applyItemHighlight();
            });
            pal.appendChild(btn);
        });
        box.appendChild(pal);
        wrap.appendChild(box);
    });
    return wrap;
}

// ---------- component picker ----------
const recipe = (a, b) => DATA.recipes.get([a, b].sort().join('|')) || null;

function comboItems() {
    const out = [];
    for (let i = 0; i < pickedComps.length; i++)
        for (let j = i + 1; j < pickedComps.length; j++) {
            const it = recipe(pickedComps[i], pickedComps[j]);
            if (it && !out.includes(it)) out.push(it);
        }
    return out;
}

function buildComponentPicker() {
    const row = document.createElement('div');
    row.className = 'tv-comp-row';
    const pal = document.createElement('div');
    pal.className = 'tv-item-palette';
    pal.setAttribute('role', 'group');
    pal.setAttribute('aria-label', 'Components');
    DATA.components.forEach(api => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tv-ip-btn tv-comp-btn';
        btn.dataset.comp = api;
        btn.title = itemName(api);
        btn.appendChild(itemImg(api));
        btn.addEventListener('click', () => {
            if (pickedComps.includes(api)) pickedComps = pickedComps.filter(c => c !== api);
            else if (pickedComps.length < 3) pickedComps.push(api);
            else return;
            activeItem = null;
            applyItemHighlight();
        });
        pal.appendChild(btn);
    });
    row.appendChild(pal);
    row.insertAdjacentHTML('beforeend', `<div class="tv-comp-combos"></div><button type="button" class="tv-comp-clear" aria-label="Clear components" title="Clear" hidden>✕</button>`);
    row.querySelector('.tv-comp-clear').addEventListener('click', () => { pickedComps = []; applyItemHighlight(); });
    return row;
}

function renderComponentState() {
    const combos = $('.tv-comp-combos');
    if (!combos) return;
    $$('.tv-comp-btn').forEach(b => {
        const on = pickedComps.includes(b.dataset.comp);
        b.setAttribute('aria-pressed', String(on));
        b.disabled = !on && pickedComps.length >= 3;
    });
    combos.innerHTML = '';
    comboItems().forEach(it => combos.appendChild(itemImg(it)));
    $('.tv-comp-clear').hidden = !pickedComps.length;
}

// Selected item: highlight champs with it in S/A. Components: highlight champs with any combo item in S.
function applyItemHighlight() {
    $$('.tv-ip-btn:not(.tv-comp-btn)').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.item === activeItem)));
    const combo = activeItem ? [] : comboItems();
    const on = !!activeItem || combo.length > 0;
    $$('.tv-chip:not(.tv-gap-chip)').forEach(c => {
        const m = saMap(c.dataset.key);
        const has = activeItem ? m.has(activeItem) : combo.some(it => isTop(m.get(it)));
        c.classList.toggle('tv-chip-highlight', on && has);
        c.classList.toggle('tv-chip-dim', on && !has);
    });
    renderComponentState();
}

// ---------- main render ----------
function renderTransitions() {
    if (!DATA?.champions.length) return;
    const slot = $('.tv-comp-slot');
    slot.innerHTML = '';
    slot.appendChild(buildComponentPicker());

    const tRoot = $('.tv-transitions-root');
    tRoot.innerHTML = '';
    tRoot.appendChild(buildItemPalette());
    ['AD', 'AP', 'Tank'].forEach(cat => {
        const block = document.createElement('section');
        block.className = 'tv-cat-block';
        block.dataset.cat = cat;
        block.innerHTML = `<h2 class="tv-cat-head">${CAT_LABEL[cat]}</h2>`;

        let rowsAdded = 0;
        const roles = DATA.transitions[cat];
        const order = cat === 'Tank' ? ['Attack', 'Magic'] : ROLE_ORDER[cat].filter(r => roles[r]);
        Object.keys(roles).forEach(r => { if (!order.includes(r)) order.push(r); });
        order.forEach(role => {
            const visible = (roles[role] || []).filter(e => passesPhase(e.cost));
            if (!visible.length) return;
            block.appendChild(buildRoleRow(role, visible));
            rowsAdded++;
        });
        if (rowsAdded > 0) tRoot.appendChild(block);
    });
    applyItemHighlight();
    refreshLobbyMarks();
}

function initPhaseFilter() {
    const btns = $$('.tv-phase-btn');
    btns.forEach(btn => btn.addEventListener('click', () => {
        const phase = btn.dataset.phase;
        activePhase = activePhase === phase ? null : phase;
        btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.phase === activePhase)));
        renderTransitions();
    }));
}

// ---------- transitions between champions ----------
// Top 2 late champs (4-5★) whose S/A items overlap the early champ's 3-item build
function transitionTargets(champ) {
    const myBuild = bestItems(champ.key);
    return DATA.champions
        .filter(c => c.cost >= 4)
        .map(c => {
            const m = saMap(c.key);
            const sharedItems = myBuild.filter(it => m.has(it)).map(it => [it, m.get(it)]);
            const sharedTraits = c.traits.filter(t => champ.traits.includes(t));
            const sCount = sharedItems.filter(x => isTop(x[1])).length;
            return { champ: c, sharedItems, sharedTraits, sCount, games: c.tiers.games || 0 };
        })
        .filter(x => x.sharedItems.length > 0)
        .sort((a, b) => b.sharedItems.length - a.sharedItems.length || b.sCount - a.sCount || b.games - a.games)
        .slice(0, 2);
}

// Inverse: early champs (1-3★) that list this late champ as a target
function transitionSources(lateChamp) {
    return DATA.champions
        .filter(c => c.cost <= 3)
        .map(c => ({ champ: c, hit: transitionTargets(c).find(x => x.champ.key === lateChamp.key) }))
        .filter(x => x.hit)
        .map(({ champ: c, hit }) => ({ champ: c, sharedItems: hit.sharedItems, sharedTraits: hit.sharedTraits, sCount: hit.sCount }))
        .sort((a, b) => b.sharedItems.length - a.sharedItems.length || b.sCount - a.sCount || a.champ.cost - b.champ.cost || a.champ.name.localeCompare(b.champ.name));
}

function synergyRow(c, sharedItems, sharedTraits) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tv-synergy-row';
    row.appendChild(portraitImg(c.name));
    const info = document.createElement('div');
    info.className = 'tv-synergy-info';
    info.insertAdjacentHTML('beforeend', `<span class="tv-synergy-name">${c.name}${variantTag(c.variant)}<span class="tv-synergy-cost tv-num">${c.cost}★</span></span>`);
    if (sharedItems.length) {
        const itemsLine = document.createElement('div');
        itemsLine.className = 'tv-synergy-items';
        sharedItems.forEach(([it, tier]) => {
            const wrap = document.createElement('span');
            wrap.className = 'tv-tier-item';
            wrap.appendChild(itemImg(it, 'sm'));
            wrap.insertAdjacentHTML('beforeend', `<span class="tv-tier-badge tier-${tier}">${TIER_LABEL[tier]}</span>`);
            itemsLine.appendChild(wrap);
        });
        info.appendChild(itemsLine);
    }
    if (sharedTraits.length) {
        info.insertAdjacentHTML('beforeend', `<div class="tv-synergy-reasons">${sharedTraits.map(t => `<span class="tv-reason-tag">${t}</span>`).join('')}</div>`);
    }
    row.appendChild(info);
    row.addEventListener('click', () => openChampionDrawer(c.key));
    return row;
}

function drawerSection(label, rows, emptyText) {
    const sec = document.createElement('div');
    sec.className = 'tv-d-section';
    sec.innerHTML = `<div class="tv-d-label">${label}</div>`;
    if (rows.length) {
        const list = document.createElement('div');
        list.className = 'tv-synergy-list';
        rows.forEach(r => list.appendChild(r));
        sec.appendChild(list);
    } else {
        sec.insertAdjacentHTML('beforeend', `<div class="tv-u-none">${emptyText}</div>`);
    }
    return sec;
}

// ---------- detail drawer ----------
function openChampionDrawer(key) {
    const champ = DATA.byKey.get(key);
    if (!champ) return;
    const type = champ.type;
    const color = champ.roleName === 'Tank' ? 'tank' : type.startsWith('Magic') ? 'ap' : 'ad';
    const content = $('.tv-drawer-content');
    content.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'tv-d-head';
    head.appendChild(portraitImg(champ.name, 'xl'));
    head.insertAdjacentHTML('beforeend', `<div><h3>${champ.name}</h3><div class="tv-drawer-sub">${champ.cost}★ <span style="color:var(--tv-${color})">${type}</span></div></div>`);
    // Adaptive champions: switch between their AD and AP builds
    const builds = champ.variant ? VARIANTS.filter(v => DATA.byKey.has(`${champ.name}|${v}`)) : [];
    if (builds.length) {
        const sw = document.createElement('div');
        sw.className = 'tv-variant-switch';
        sw.setAttribute('role', 'group');
        sw.setAttribute('aria-label', 'Build');
        builds.forEach(v => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tv-variant-tag ' + v;
            b.textContent = v;
            b.setAttribute('aria-pressed', String(v === champ.variant));
            if (v !== champ.variant) b.addEventListener('click', () => openChampionDrawer(`${champ.name}|${v}`));
            sw.appendChild(b);
        });
        head.appendChild(sw);
    }
    content.appendChild(head);

    if (onFilterComps) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tv-action-btn';
        btn.textContent = `Show comps with ${champ.name}`;
        btn.addEventListener('click', () => { closeTransitionsDrawer(); onFilterComps(champ.name); });
        content.appendChild(btn);
    }

    const st = champ.stats;
    const stat = (label, v) => v === undefined ? '' : `<span>${label} ${v}</span>`;
    let html = `<div class="tv-d-section"><div class="tv-ab-stats tv-num">${stat('HP', st.hp)}${stat('AD', st.ad)}${stat('AS', st.as)}${stat('Armor', st.ar)}${stat('MR', st.mr)}${stat('Range', st.range)}</div></div>`;
    html += `<div class="tv-d-section"><div class="tv-trait-pills">${champ.traits.map(t => `<span class="tv-trait-pill">${t}</span>`).join('')}</div></div>`;
    const tiers = champ.tiers;
    // Without live stats (PBE) the tiers come from guide builds: count of builds instead of placement
    const baseNote = tiers.base == null ? '' : `<span class="tv-ab-note tv-num" title="Average placement with any items">avg ${tiers.base.toFixed(2)}</span>`;
    const statCell = (avg, games) => avg == null
        ? `<span class="tv-stat tv-num" title="Guide builds using it">${games} ${games === 1 ? 'build' : 'builds'}</span>`
        : `<span class="tv-stat tv-num" title="Average placement, games">${avg.toFixed(2)} <small>${games.toLocaleString('en')}</small></span>`;
    html += `<div class="tv-d-section"><div class="tv-d-label">Best items ${baseNote}</div>`;
    TIERS.forEach(t => (tiers[t] || []).forEach(([item, avg, games]) => {
        html += `<div class="tv-item-row"><span class="tv-tier-badge tier-${t}">${TIER_LABEL[t]}</span><img class="tv-item-icon" src="${getItemWEBPImageUrl(item)}" alt=""><span class="tv-item-name">${itemName(item)}</span>${statCell(avg, games)}</div>`;
    }));
    html += `</div>`;
    // artifacts and emblems: MetaTFT tiers, each against the champion's others of the same kind
    [['artifacts', 'Artifacts'], ['emblems', 'Emblems']].forEach(([key, label]) => {
        const special = champ[key];
        if (!special || !['S', 'A'].some(t => special[t]?.length)) return;
        html += `<div class="tv-d-section"><div class="tv-d-label">${label}</div>`;
        ['S', 'A'].forEach(t => (special[t] || []).forEach(([item, avg, games]) => {
            html += `<div class="tv-item-row"><span class="tv-tier-badge tier-${t}">${t}</span><img class="tv-item-icon" src="${getItemWEBPImageUrl(item)}" alt=""><span class="tv-item-name">${itemName(item)}</span>${statCell(avg, games)}</div>`;
        }));
        html += `</div>`;
    });
    content.insertAdjacentHTML('beforeend', html);

    if (champ.cost >= 4) {
        const lateMates = [...DATA.byName.values()]
            .filter(c => c.name !== champ.name && c.cost >= 4)
            .map(c => ({ c, shared: c.traits.filter(t => champ.traits.includes(t)) }))
            .filter(x => x.shared.length > 0)
            .sort((a, b) => a.c.cost - b.c.cost || a.c.name.localeCompare(b.c.name));
        content.appendChild(drawerSection('Comes from',
            transitionSources(champ).map(x => synergyRow(x.champ, x.sharedItems, x.sharedTraits)),
            `No 1-3 cost champion hands items to ${champ.name}.`));
        content.appendChild(drawerSection('Shared traits',
            lateMates.map(({ c, shared }) => synergyRow({ ...c, variant: null }, [], shared)),
            'No 4-5 cost champion shares a trait.'));
    } else {
        const myBuild = bestItems(champ.key);
        const sec = drawerSection('Transitions to',
            transitionTargets(champ).map(x => synergyRow(x.champ, x.sharedItems, x.sharedTraits)),
            'No 4-5 cost champion rates these items S or A.');
        if (myBuild.length) {
            const buildLine = document.createElement('div');
            buildLine.className = 'tv-synergy-items tv-build-line';
            myBuild.forEach(it => buildLine.appendChild(itemImg(it, 'sm')));
            sec.querySelector('.tv-d-label').after(buildLine);
        }
        content.appendChild(sec);
    }

    const drawer = $('.tv-drawer');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.scrollTop = 0;
    $('.tv-backdrop').classList.add('open');
    $('.tv-close-btn').focus({ preventScroll: true });
}

export function closeTransitionsDrawer() {
    if (!root) return;
    $('.tv-drawer')?.classList.remove('open');
    $('.tv-drawer')?.setAttribute('aria-hidden', 'true');
    $('.tv-backdrop')?.classList.remove('open');
}

function initDrawer() {
    $('.tv-close-btn').addEventListener('click', closeTransitionsDrawer);
    $('.tv-backdrop').addEventListener('click', closeTransitionsDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTransitionsDrawer(); });
}
