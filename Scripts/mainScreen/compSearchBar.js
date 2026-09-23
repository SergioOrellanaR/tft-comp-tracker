import { items, unitImageMap, unitCostMap } from './dataLoader.js';
import { links } from './matrix.js';
import { setPickerItem } from './itemPicker.js';

const debounce = (func, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => func(...args), delay); }; };

// Multi-select tag filter (OR) plus a free-text comp-name filter while no tag is set
export let selectedFilters = [];
let viewFilter = 'all'; // 'all' | 'open' | 'linked'
let compSuggestionIndex = -1;
const compSearchInput = document.getElementById('comp-search-input');
const compSuggestions = document.getElementById('comp-suggestions');
const tagsContainer = document.getElementById('comp-tags-container');
const sheetCount = document.getElementById('sheetCount');
// Rebuilt on every set change; the input/document listeners below are attached only once
let optionsMap = new Map();
let filterListenersAttached = false;

// Add a champ/item/style tag filter from outside the search box (e.g. the set summary tab)
export function addCompFilter(name) {
    if (selectedFilters.includes(name)) return;
    selectOption(name, { focus: false });
}

// Which comp rows are shown. Linked comps always stay visible.
export function applyCompVisibility() {
    const text = selectedFilters.length ? '' : compSearchInput.value.trim().toLowerCase();
    document.querySelectorAll('#compos .item.compo').forEach(compEl => {
        const isLinked = links.some(l => l.compo === compEl);
        const tags = compEl.dataset.tags ? compEl.dataset.tags.split('|') : [];
        const tagMatch = !selectedFilters.length || selectedFilters.some(f => tags.includes(f));
        const textMatch = !text || compEl.querySelector('.comp-name')?.textContent.toLowerCase().includes(text);
        const viewMatch = viewFilter === 'all' || (viewFilter === 'open' && compEl.dataset.state === 'open');
        compEl.hidden = !(isLinked || (tagMatch && textMatch && viewMatch && viewFilter !== 'linked'));
    });
    updateTierHeadersVisibility();
}

// Tier headers: hidden when empty, with the count of visible comps
export function updateTierHeadersVisibility() {
    let total = 0;
    document.querySelectorAll('#compos .tier-header').forEach(header => {
        let visible = 0;
        for (let el = header.nextElementSibling; el && !el.classList.contains('tier-header'); el = el.nextElementSibling) {
            if (el.classList.contains('compo') && !el.hidden) visible++;
        }
        header.hidden = visible === 0;
        const count = header.querySelector('.tier-count');
        if (count) count.textContent = `${visible} ${visible === 1 ? 'comp' : 'comps'}`;
        total += visible;
    });
    if (sheetCount) {
        const scouted = new Set(links.map(l => l.player)).size;
        const players = document.querySelectorAll('#players .item.player').length;
        sheetCount.textContent = `${total} comps · ${scouted} of ${players} players scouted`;
    }
}

export function resetCompFilters() {
    [...selectedFilters].forEach(opt => removeTag(opt));
    compSearchInput.value = '';
    clearSuggestions();
    setViewFilter('all');
}

function setViewFilter(filter) {
    viewFilter = filter;
    document.querySelectorAll('.view-filter [data-filter]').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    applyCompVisibility();
}

document.querySelectorAll('.view-filter [data-filter]').forEach(btn =>
    btn.addEventListener('click', () => setViewFilter(btn.dataset.filter)));

export function initCompFilter(metaData) {
    const styleSet = new Set(metaData.comps.map(c => c.style).filter(Boolean));
    const sets = {
        item: new Set((metaData.items.default || []).map(it => it.name)),
        artifact: new Set((metaData.items.artifact || []).map(it => it.name)),
        emblem: new Set((metaData.items.emblem || []).map(it => it.name)),
        radiant: new Set((metaData.items.radiant || []).map(it => it.name)),
        trait: new Set((metaData.items.trait || []).map(it => it.name)),
    };
    optionsMap = new Map();
    new Set([
        ...metaData.comps.flatMap(c => c.champions.map(ch => ch.name)),
        ...styleSet,
        ...items.map(it => it.Name)
    ]).forEach(opt => {
        const iconUrl = unitImageMap[opt] || (items.find(i => i.Name === opt) || {}).Url || '';
        let category = styleSet.has(opt) ? 'style' : 'unit';
        Object.entries(sets).forEach(([cat, set]) => { if (category === 'unit' && set.has(opt)) category = cat; });
        optionsMap.set(opt.toLowerCase(), { name: opt, iconUrl, category });
    });

    if (filterListenersAttached) return;
    filterListenersAttached = true;

    compSearchInput.addEventListener('input', debounce(() => {
        renderSuggestions();
        applyCompVisibility();
    }, 150));
    document.addEventListener('click', e => {
        if (!e.target.closest('#comp-search-div')) clearSuggestions();
    });
    // Backspace on an empty box drops the last tag
    compSearchInput.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !compSearchInput.value && selectedFilters.length) removeTag(selectedFilters.at(-1));
    });
}

function clearSuggestions() {
    compSuggestions.innerHTML = '';
    compSuggestions.style.display = 'none';
}

function renderSuggestions() {
    compSuggestionIndex = -1;
    const val = compSearchInput.value.trim().toLowerCase();
    if (!val) return clearSuggestions();
    const frag = document.createDocumentFragment();
    optionsMap.forEach(({ name, iconUrl, category }) => {
        if (selectedFilters.includes(name)) return;
        const show = ['unit', 'champion'].includes(val) ? category === 'unit'
            : ['item', 'artifact', 'emblem', 'radiant', 'trait', 'style'].includes(val) ? category === val
            : name.toLowerCase().split(' ').some(word => word.startsWith(val));
        if (!show) return;
        const li = document.createElement('li');
        if (iconUrl) {
            const img = document.createElement('img');
            img.src = iconUrl;
            img.className = 'suggestion-icon';
            if (category === 'unit') img.style.setProperty('--cc', `var(--c${unitCostMap[name] || 1})`);
            li.appendChild(img);
        }
        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        const catSpan = document.createElement('span');
        catSpan.className = 'suggestion-category';
        catSpan.textContent = category;
        li.append(nameSpan, catSpan);
        li.addEventListener('click', () => selectOption(name));
        li.addEventListener('mouseenter', () => {
            compSuggestions.querySelectorAll('li').forEach(item => item.classList.remove('selected'));
            li.classList.add('selected');
        });
        frag.appendChild(li);
    });
    compSuggestions.innerHTML = '';
    compSuggestions.appendChild(frag);
    compSuggestions.style.display = compSuggestions.childElementCount ? 'block' : 'none';
}

function selectOption(opt, { focus = true } = {}) {
    if (selectedFilters.includes(opt)) return;
    selectedFilters.push(opt);
    const tag = document.createElement('span');
    tag.className = 'tag-item';
    tag.dataset.value = opt;
    const itemObj = items.find(it => it.Name === opt);
    const iconUrl = unitImageMap[opt] || itemObj?.Url;
    if (iconUrl) {
        const img = document.createElement('img');
        img.src = iconUrl;
        img.className = 'tag-icon';
        img.alt = '';
        tag.appendChild(img);
    }
    const span = document.createElement('span');
    span.textContent = opt;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'tag-remove';
    removeBtn.setAttribute('aria-label', `Remove ${opt}`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', e => { e.stopPropagation(); removeTag(opt); });
    tag.append(span, removeBtn);
    tagsContainer.appendChild(tag);
    compSearchInput.value = '';
    clearSuggestions();
    if (focus) compSearchInput.focus();
    // an item tag also shows that item on the rows that use it
    if (itemObj) setPickerItem(itemObj.Item, true);
    applyCompVisibility();
}

function removeTag(opt) {
    selectedFilters = selectedFilters.filter(f => f !== opt);
    tagsContainer.querySelector(`.tag-item[data-value="${CSS.escape(opt)}"]`)?.remove();
    const itemObj = items.find(it => it.Name === opt);
    if (itemObj) setPickerItem(itemObj.Item, false);
    applyCompVisibility();
}

// keyboard navigation
compSearchInput.addEventListener('keydown', (e) => {
    const suggestionItems = compSuggestions.querySelectorAll('li');
    if (e.key === 'Escape') { clearSuggestions(); return; }
    if (!suggestionItems.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        compSuggestionIndex = e.key === 'ArrowDown'
            ? (compSuggestionIndex + 1) % suggestionItems.length
            : (compSuggestionIndex - 1 + suggestionItems.length) % suggestionItems.length;
        suggestionItems.forEach((li, idx) => li.classList.toggle('selected', idx === compSuggestionIndex));
        suggestionItems[compSuggestionIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        (suggestionItems[compSuggestionIndex] || suggestionItems[0]).click();
    }
});
