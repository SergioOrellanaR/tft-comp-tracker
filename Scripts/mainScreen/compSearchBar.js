import { items, unitImageMap, unitCostMap } from './dataLoader.js';
import { links, drawLines } from './canvas.js';

const debounce = (func, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => func.apply(this, args), delay); }; };

// Multi-select filter for compositions
export let selectedFilters = [];
let compSuggestionIndex = -1;
export const hideContestedBtn = document.getElementById('hide-contested-comps-btn');
export const hideUnselectedBtn = document.getElementById('hide-unselected-comps-btn');
const compSearchInput = document.getElementById('comp-search-input');
const compSuggestions = document.getElementById('comp-suggestions');

export function initCompFilter(metaData) {
    // Build options map for champs, styles, and items
    // Define category sets
    const styleSet = new Set(metaData.comps.map(c => c.style).filter(Boolean));
    const defaultSet = new Set(metaData.items.default.map(it => it.name));
    const artifactSet = new Set(metaData.items.artifact.map(it => it.name));
    const emblemSet = new Set(metaData.items.emblem.map(it => it.name));
    const traitSet = new Set(metaData.items.trait.map(it => it.name));
    const optionsMap = new Map();
    new Set([
        ...metaData.comps.flatMap(c => c.champions.map(ch => ch.name)),
        ...metaData.comps.map(c => c.style).filter(Boolean),
        ...items.map(it => it.Name)
    ]).forEach(opt => {
        const key = opt.toLowerCase();
        const iconUrl = unitImageMap[opt] || (items.find(i => i.Name === opt) || {}).Url || '';
        // Determine category for each option
        let category = 'unit';
        if (styleSet.has(opt)) category = 'style';
        else if (defaultSet.has(opt)) category = 'item';
        else if (artifactSet.has(opt)) category = 'artifact';
        else if (emblemSet.has(opt)) category = 'emblem';
        else if (traitSet.has(opt)) category = 'trait';
        optionsMap.set(key, { name: opt, iconUrl, category });
    });
    const tagsContainer = document.getElementById('comp-tags-container');
    const input = document.getElementById('comp-search-input');
    const suggestions = document.getElementById('comp-suggestions');

    const clearSuggestions = () => {
        suggestions.innerHTML = '';
        suggestions.style.display = 'none';
    };

    const renderSuggestions = () => {
        const val = input.value.trim().toLowerCase();
        if (!val) return clearSuggestions();
        const frag = document.createDocumentFragment();
        optionsMap.forEach(({ name, iconUrl, category }, key) => {
            // Determine visibility: category keyword filters or prefix match
            let show = false;
            if (['unit', 'champion'].includes(val)) {
                show = category === 'unit' && !selectedFilters.includes(name);
            } else if (['default', 'artifact', 'emblem', 'trait'].includes(val)) {
                show = category === val && !selectedFilters.includes(name);
            } else {
                // Check if any word in the name starts with the search value
                const words = name.toLowerCase().split(' ');
                show = words.some(word => word.startsWith(val)) && !selectedFilters.includes(name);
            }
            if (show) {
                const li = document.createElement('li');

                if (iconUrl) {
                    const img = document.createElement('img');
                    img.src = iconUrl;
                    img.className = 'suggestion-icon';

                    // Add cost-based border class for units
                    if (category === 'unit') {
                        const unitCost = unitCostMap[name] || 1;
                        img.classList.add(`unit-cost-${unitCost}`);
                    }

                    li.appendChild(img);
                }

                // name on the left
                const nameSpan = document.createElement('span');
                nameSpan.textContent = name;
                li.appendChild(nameSpan);

                // category on the right
                const catSpan = document.createElement('span');
                catSpan.id = 'comp-suggestion-category';     // assign an id
                catSpan.textContent = `${category}`;
                li.appendChild(catSpan);

                li.addEventListener('click', () => selectOption(name));
                frag.appendChild(li);
            }
        });
        suggestions.innerHTML = '';
        suggestions.appendChild(frag);
        suggestions.style.display = suggestions.childElementCount ? 'block' : 'none';

        // keep pointer hover in sync with arrow keys
        const suggestionItems = suggestions.querySelectorAll('li');
        suggestionItems.forEach((li, idx) => {
            li.addEventListener('mouseenter', () => {
                // Remove previous highlights
                suggestionItems.forEach(item => item.classList.remove('selected'));
                // Highlight current item
                li.classList.add('selected');
            });
        });
    };

    input.addEventListener('input', debounce(renderSuggestions, 300));

    // --- New: Filter comps by comp-name as you type ---
    input.addEventListener('input', debounce(function () {
        const val = input.value.trim().toLowerCase();
        // Only apply if no tags are selected (so it doesn't interfere with tag filter)
        if (selectedFilters.length === 0) {
            document.querySelectorAll('.item.compo').forEach(compEl => {
                const compNameEl = compEl.querySelector('.comp-name');
                const compName = compNameEl ? compNameEl.textContent.toLowerCase() : '';
                // Show if comp-name contains the input value
                compEl.style.display = (!val || compName.includes(val)) ? '' : 'none';
            });
            updateTierHeadersVisibility && updateTierHeadersVisibility();
        }
    }, 200));
    document.addEventListener('click', e => {
        if (!e.target.closest('#comp-search-div')) clearSuggestions();
    });

    function selectOption(opt) {
        selectedFilters.push(opt);
        const tag = document.createElement('div');
        tag.className = 'tag-item';
        // Add icon inside tag
        const champIcon = unitImageMap[opt];
        const itemObj = items.find(it => it.Name === opt);
        const iconUrl = champIcon || (itemObj && itemObj.Url);
        if (iconUrl) {
            const img = document.createElement('img');
            img.src = iconUrl;
            img.className = 'tag-icon';
            tag.appendChild(img);
        }
        const span = document.createElement('span');
        span.textContent = opt;
        tag.appendChild(span);
        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'tag-remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => removeTag(opt, tag));
        tag.appendChild(removeBtn);
        tagsContainer.appendChild(tag);
        suggestions.innerHTML = '';
        suggestions.style.display = 'none';
        input.value = '';
        input.focus();
        onFilterChange();
        // auto‐activate core‐item button if this tag matches an item name

        if (itemObj) {
            const btn = document.querySelector(`.core-item-button[data-item="${itemObj.Item}"]`);
            if (btn && !btn.classList.contains('active')) {
                btn.classList.add('active');
                document.querySelectorAll('.items-container').forEach(ctn => updateItemsContainer(ctn));
            }
        }
    }
    function removeTag(opt, tagEl) {
        selectedFilters = selectedFilters.filter(f => f !== opt);
        tagEl.remove();
        onFilterChange();
        // auto‐deactivate core‐item button if this tag matches an item name
        const itemObj = items.find(it => it.Name === opt);
        if (itemObj) {
            const btn = document.querySelector(`.core-item-button[data-item="${itemObj.Item}"]`);
            if (btn && btn.classList.contains('active')) {
                btn.classList.remove('active');
                document.querySelectorAll('.items-container').forEach(ctn => updateItemsContainer(ctn));
            }
        }
    }
    function onFilterChange() {
        // detect any tag-item in DOM
        const hasTags = !!document.querySelector('.tag-item');

        // reset inputs and labels
        [hideContestedBtn, hideUnselectedBtn].forEach(btn => {
            if (btn) {
                btn.checked = false;
                const label = document.querySelector(`label[for="${btn.id}"]`);
                (label || btn).style.display = hasTags ? 'none' : '';
            }
        });

        // hide/show entire container elements
        const contestedContainer = document.querySelector('.hide-contested-comps-btn-container');
        const unselectedContainer = document.querySelector('.hide-unselected-comps-btn-container');
        [contestedContainer, unselectedContainer].forEach(c => {
            if (c) c.style.display = hasTags ? 'none' : '';
        });

        filterComps();
    }
    function filterComps() {
        document.querySelectorAll('.item.compo').forEach(compEl => {
            // Always show if comp is linked to a player
            const isLinked = links.some(l => l.compo === compEl);
            const tags = compEl.dataset.tags ? compEl.dataset.tags.split('|') : [];
            // OR logic: show if ANY selected filter is present in tags
            const match = selectedFilters.length === 0 || selectedFilters.some(f => tags.includes(f));
            compEl.style.display = (isLinked || match) ? '' : 'none';
        });
        updateTierHeadersVisibility();
    }
}



// Add helper to hide empty tier-headers
export function updateTierHeadersVisibility() {
    document.querySelectorAll('.tier-header').forEach(header => {
        let sibling = header.nextElementSibling;
        let hasVisibleCompo = false;
        while (sibling && !sibling.classList.contains('tier-header')) {
            if (sibling.classList.contains('item') &&
                sibling.classList.contains('compo') &&
                sibling.style.display !== 'none') {
                hasVisibleCompo = true;
                break;
            }
            sibling = sibling.nextElementSibling;
        }
        header.style.display = hasVisibleCompo ? '' : 'none';
    });
}

export function createCompToggle(button, otherButton, visibilityFn) {
    button?.addEventListener('change', function () {
        if (this.checked && otherButton.checked) otherButton.checked = false;
        document.querySelectorAll('.item.compo').forEach(compo => {
            const isLinked = links.some(l => l.compo === compo);
            const visible = visibilityFn(this.checked, isLinked, compo);
            compo.style.display = visible ? '' : 'none';
        });
        updateTierHeadersVisibility();
        drawLines();
    });
}

// keyboard navigation
compSearchInput.addEventListener('keydown', (e) => {
    const suggestionItems = compSuggestions.querySelectorAll('li');
    if (!suggestionItems.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        compSuggestionIndex = e.key === 'ArrowDown'
            ? (compSuggestionIndex + 1) % suggestionItems.length
            : (compSuggestionIndex - 1 + suggestionItems.length) % suggestionItems.length;
        updateSuggestionHighlight(suggestionItems);
    }
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (compSuggestionIndex >= 0) {
            // trigger the click on the highlighted item
            suggestionItems[compSuggestionIndex].click();
        }
    }
});

function updateSuggestionHighlight(items) {
    items.forEach((li, idx) => {
        console.log(`Highlighting item ${idx}: ${li.textContent}, selected index: ${compSuggestionIndex}`);
        li.classList.toggle('selected', idx === compSuggestionIndex);
    });
}