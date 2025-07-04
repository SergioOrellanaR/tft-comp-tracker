import { CONFIG } from './config.js';
import { fetchPlayerSummary, fetchFindGames, fetchLiveGame, getMiniRankIconUrl, getItemWEBPImageUrl, getChampionImageUrl, getAugmentWEBPImageUrl } from './tftVersusHandler.js';
import { createLoadingSpinner, openDuelModal } from './components.js';
import { throttle, getContrastYIQ } from './utils.js';

// Multi-select filter for compositions
let selectedFilters = [];
const debounce = (func, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => func.apply(this, args), delay); }; };

// Variables globales
let selected = null;
const links = [];
let unitImageMap = {};
let unitCostMap = {};
let items = [];
let duelsCache = new Map();
let metaSnapshotData = null;

const compsContainer = document.getElementById('compos');
const playersContainer = document.getElementById('players');
const canvas = document.getElementById('lineCanvas');
const ctx = canvas.getContext('2d');
const hideContestedBtn = document.getElementById('hide-contested-comps-btn');
const hideUnselectedBtn = document.getElementById('hide-unselected-comps-btn');

function initCompFilter(metaData) {
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
    input.addEventListener('input', debounce(function() {
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
// Replace loadUnitImages and loadItems functions
const loadMetaSnapshot = async () => {
    try {
        const response = await fetch(CONFIG.routes.metaSnapshot);
        const metaData = await response.json();

        // Extract unit data from compositions
        metaData.comps.forEach(comp => {
            comp.champions.forEach(champion => {
                const unitName = champion.name;
                unitImageMap[unitName] = getChampionImageUrl(champion.apiName);
                unitCostMap[unitName] = champion.cost || 1;
            });
        });

        // Load items data (each section now contains objects with .apiName)
        const allItems = [
            ...metaData.items.default,
            ...metaData.items.artifact,
            ...metaData.items.emblem,
            ...metaData.items.trait
        ];
        items = allItems.map(itemObj => ({
            Item: itemObj.apiName,
            Name: itemObj.name,                          // add human‐readable name
            Url: getItemWEBPImageUrl(itemObj.apiName)
        }));

        metaSnapshotData = metaData;
        return metaData;
    } catch (error) {
        console.error('Error loading MetaSnapshot.json:', error);
        return null;
    }
};

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    drawLines();
}

window.addEventListener('resize', resizeCanvas);

function tryLoadDefaultData() {
    loadMetaSnapshot().then((metaData) => {
        if (metaData) {
            loadCompsFromJSON(metaData);
            createCoreItemsButtons(metaData.items);
            // Initialize multi-select filter for compositions
            initCompFilter(metaData);
        }
    });
}

function toggleDoubleUpMode() {
    const checkbox = document.getElementById('color_mode');
    const active = checkbox.checked;

    // Aplica o remueve el modo double-up
    document.body.classList.toggle('double-up', active);

    // Lógica de reinicio
    links.splice(0, links.length);
    document.getElementById('players').innerHTML = '';
    preloadPlayers();
    drawLines();
}

function enableDragAndDrop(isDoubleUp) {
    const selector = isDoubleUp
        ? '.team-container .item.player'
        : '.item.player';
    const throttledDraw = throttle(drawLines, 50);

    document.querySelectorAll(selector).forEach(player => {
        player.setAttribute('draggable', true);
        player.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', isDoubleUp ? '' : player.dataset.index);
            player.classList.add('dragging');
        });

        if (isDoubleUp) {
            // duo events
            ['dragenter', 'dragover', 'drop', 'dragleave', 'dragend'].forEach(evt => {
                player.addEventListener(evt, e => {
                    e.preventDefault();
                    if (evt === 'dragenter' && !player.classList.contains('dragging'))
                        player.classList.add('drop-target');
                    if (evt === 'dragleave') player.classList.remove('drop-target');
                    if (evt === 'drop') {
                        player.classList.remove('drop-target');
                        const src = document.querySelector('.item.player.dragging');
                        if (src && src !== player) {
                            const c1 = src.closest('.team-container'),
                                c2 = player.closest('.team-container');
                            if (c1 && c2 && c1 !== c2) {
                                const placeholder = document.createElement('div');
                                c2.replaceChild(placeholder, player);
                                c1.replaceChild(player, src);
                                c2.replaceChild(src, placeholder);
                                updateTeamIcons([c1, c2]);
                                updatePlayerColorBars();
                            }
                        }
                    }
                    if (evt === 'dragend') {
                        player.classList.remove('dragging', 'drop-target');
                    }
                    throttledDraw();
                });
            });
        } else {
            // solo events
            ['dragover', 'drop', 'dragend'].forEach(evt => {
                player.addEventListener(evt, e => {
                    if (evt === 'dragover') {
                        e.preventDefault();
                        const dragging = document.querySelector('.dragging');
                        const afterEl = getDragAfterElement(playersContainer, e.clientY);
                        if (!afterEl) playersContainer.appendChild(dragging);
                        else playersContainer.insertBefore(dragging, afterEl);
                    }
                    if (evt === 'drop' || evt === 'dragend') {
                        player.classList.remove('dragging');
                    }
                    throttledDraw();
                });
            });
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.item.player:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function preloadPlayers() {
    const isDoubleUp = document.body.classList.contains('double-up');
    const defaultNames = getDefaultNames(isDoubleUp);

    // Verificar si ya hay jugadores cargados
    if (playersContainer.children.length > 0) return;

    playersContainer.innerHTML = ''; // Limpiar solo si está vacío

    defaultNames.forEach((name, index) => {
        const playerDiv = createPlayerDiv(name, index, isDoubleUp);

        if (isDoubleUp && index % 2 === 1) {
            const previous = playersContainer.lastElementChild;
            playersContainer.removeChild(previous);
            const teamIconData = getTeamIcon(index);
            const teamContainer = createTeamContainer(previous, playerDiv, teamIconData, index);
            playersContainer.appendChild(teamContainer);
        } else {
            playersContainer.appendChild(playerDiv);
        }
    });

    enableDragAndDrop(isDoubleUp);

    updatePlayerColorBars(); // Llama una vez para establecer los color-bars fijos
}

function updateTeamIcons(containers) {
    containers.forEach(container => {
        if (!container.classList.contains('team-container')) return;

        const iconCircle = container.querySelector('.team-icon');
        const teamPlayers = container.querySelectorAll('.item.player');

        if (iconCircle && teamPlayers.length >= 2) {
            updateIconColor(iconCircle, iconCircle._iconConfig, teamPlayers[0], teamPlayers[1], container);
        }
    });
}

function createTeamIcon(icon, player1, player2, container) {
    let currentIndex = 0;

    const circle = document.createElement('div');
    circle.classList.add('team-icon');
    circle._iconConfig = icon;

    setupTeamIcon(circle, icon, player1, player2, container);

    circle.onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex + 1) % CONFIG.iconOptions.length;
        const newIcon = CONFIG.iconOptions[currentIndex];
        circle._iconConfig = newIcon;

        const teamPlayers = container.querySelectorAll('.item.player');
        const [p1, p2] = teamPlayers.length >= 2 ? teamPlayers : [player1, player2];
        updateIconColor(circle, newIcon, p1, p2, container);
    };

    return circle;
}

function setupTeamIcon(circle, icon, player1, player2, container) {
    circle.style.border = `2px solid ${icon.color}`;
    circle.textContent = icon.emoji;
    circle.title = icon.name;
    updateIconColor(circle, icon, player1, player2, container);
}

function updateIconColor(circle, icon, player1, player2, container) {
    [player1, player2].forEach(player => {
        player.dataset.color = icon.color;
        player.style.borderRight = `10px solid ${icon.color}`;
    });

    circle.textContent = icon.emoji;
    circle.title = icon.name;
    circle.style.border = `2px solid ${icon.color}`;
    container.style.border = `1px solid ${icon.color}`;
    drawLines();
}

function getDefaultNames(isDoubleUp) {
    return isDoubleUp
        ? ['Team 1 - A', 'Team 1 - B', 'Team 2 - A', 'Team 2 - B', 'Team 3 - A', 'Team 3 - B', 'Team 4 - A', 'Team 4 - B']
        : ['YOU', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7', 'Player 8'];
}

function getTeamIcon(index) {
    const teamIndex = Math.floor(index / 2);
    return CONFIG.iconOptions[teamIndex % CONFIG.iconOptions.length];
}

function createTeamContainer(player1, player2, icon, index) {
    const container = document.createElement('div');
    container.classList.add('team-container');
    container.style.border = `1px solid ${icon.color}`;
    const iconCircle = createTeamIcon(icon, player1, player2, container);
    container.append(player1, iconCircle, player2);
    return container;
}

function createPlayerDiv(name, index, isDoubleUp) {
    const div = document.createElement('div');
    div.classList.add('item', 'player', 'player-card');

    const span = createEditableSpan(name);
    const editIcon = createEditIcon(span);

    const color = getPlayerColor(index, isDoubleUp);
    div.dataset.color = color;

    div.append(editIcon, span);
    div.onclick = () => select(div, 'player');

    return div;
}

function getPlayerColor(index, isDoubleUp) {
    return isDoubleUp
        ? getTeamIcon(index).color
        : CONFIG.colors[index % CONFIG.colors.length];
}

function createEditableSpan(name) {
    const span = document.createElement('span');
    span.classList.add('player-name');
    span.textContent = name;

    span.ondblclick = () => {
        const input = document.createElement('input');
        input.classList.add('editable-input');
        const original = span.textContent;

        Object.assign(input, {
            type: 'text',
            value: '',
            maxLength: 20,
        });

        input.onblur = () => {
            span.textContent = input.value.trim().substring(0, 20) || original;
            span.style.display = 'inline';
            input.remove();
            drawLines();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                input.blur();
                const allPlayers = Array.from(document.querySelectorAll('.item.player'));
                const currentIndex = allPlayers.findIndex(p => p.contains(span));
                const next = allPlayers[currentIndex + 1];
                const nextSpan = next?.querySelector('.player-name');
                if (nextSpan) nextSpan.dispatchEvent(new Event('dblclick'));
            }
        });

        span.style.display = 'none';
        span.parentElement.insertBefore(input, span);
        input.focus();
    };

    return span;
}

function createEditIcon(span) {
    const icon = document.createElement('span');
    icon.textContent = '✎';
    icon.classList.add('edit-icon');
    icon.onclick = (e) => {
        e.stopPropagation();
        span.ondblclick();
    };
    return icon;
}

tryLoadDefaultData();

function showMessage(message) {
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.textContent = message;
    messageContainer.style.display = 'block';

    drawLines();

    setTimeout(() => {
        messageContainer.style.display = 'none';
        drawLines();
    }, 3000);
}

const resetLoadingState = (spinner, searchButton) => {
    spinner.remove();
    searchButton.disabled = false;
};

const searchPlayer = async () => {
    resetPlayers();
    // Remove any existing container

    const server = document.getElementById('serverSelector').value;
    const playerInput = document.getElementById('playerNameInput').value.trim();

    if (!playerInput) {
        showMessage('Please enter a player name.');
        return;
    }

    let [playerName, tag] = playerInput.split('#');
    const serverCode = CONFIG.serverRegionMap[server];

    if (!tag || tag.trim() === '') {
        tag = serverCode;
    }

    if (!playerName || !tag) {
        showMessage('Please enter a valid Player#Tag format.');
        return;
    }

    if (!serverCode) {
        showMessage('Invalid server selected.');
        return;
    }
    const messageContainer = document.getElementById('messageContainer');
    // Clear any previous content and show the container
    messageContainer.innerHTML = '';
    messageContainer.style.display = 'block';
    // Append spinner so that it uses the same space as error messages
    const spinner = createLoadingSpinner();
    messageContainer.appendChild(spinner);
    const searchButton = document.getElementById('searchPlayerButton');
    searchButton.disabled = true;
    try {
        const playerData = await fetchPlayerSummary(playerInput, server);

        if (!playerData) {
            resetLoadingState(spinner, searchButton);
            return;
        }

        const spectatorData = await fetchLiveGame(playerInput, server);

        if (spectatorData.detail !== undefined) {
            resetLoadingState(spinner, searchButton);
            showMessage(spectatorData.detail);
            return;
        }

        resetLoadingState(spinner, searchButton);
        handleSpectatorData(spectatorData, playerData, server);
    } catch (error) {
        resetLoadingState(spinner, searchButton);
        showMessage('Failed to fetch data');
    }
};

function handleSpectatorData(spectatorData, playerData, server) {
    const isDoubleUp = spectatorData.gameQueueConfigId === 1160;

    const colorModeCheckbox = document.getElementById('color_mode');
    if (colorModeCheckbox) {
        // Only update and call toggleDoubleUpMode if the checkbox value needs to change.
        if (colorModeCheckbox.checked !== isDoubleUp) {
            colorModeCheckbox.checked = isDoubleUp;
            toggleDoubleUpMode();
        }
    }

    const participants = spectatorData.participants;

    updatePlayers(participants);
    updatePlayersDuelButtons(playerData, server);
}

async function updatePlayersDuelButtons(playerData, server) {
    const delayBetweenPlayers = 1000; // delay in milliseconds
    // Remove the edit-icon from each player
    document.querySelectorAll('.item.player .edit-icon').forEach(editIcon => {
        editIcon.remove();
    });

    const players = document.querySelectorAll('.item.player');

    for (let i = 0; i < players.length; i++) {
        const player = players[i];

        // Wait delayBetweenPlayers between players (except before the first)
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenPlayers));
        }

        if (!player.querySelector('.duel-button')) {
            // Get the opponent's name from the player element.
            const player2Name = player.querySelector('.player-name').textContent.trim();

            if (playerData.name === player2Name) {
                player.querySelector('.player-name').textContent = player.querySelector('.player-name').textContent.trim() + " (YOU)";
                player.querySelector('.participant-info-container').classList.add('margin-you');
                continue; // Skip the player if it's the same as the one in the duel button
            }

            player.querySelector('.participant-info-container').classList.add('margin-small');
            // Create a spinner placeholder for the duel button
            const spinner = createLoadingSpinner();
            spinner.classList.add('duel-spinner');
            player.prepend(spinner);

            // Start fetching duel data with a maximum of 10 seconds.
            const duelPromise = fetchFindGames(playerData.name, player2Name, server);
            const timeoutPromise = new Promise(resolve => {
                setTimeout(() => resolve("timeout"), 10000);
            });

            let result;
            try {
                result = await Promise.race([duelPromise, timeoutPromise]);
            } catch (error) {
                result = null;
            }

            // Remove the spinner placeholder once a response is received.
            if (spinner.parentElement) {
                spinner.parentElement.removeChild(spinner);
            }

            // Create the actual duel button.
            const duelButton = document.createElement('button');
            duelButton.className = 'duel-button';
            duelButton.title = 'Vs. History';
            duelButton.innerText = '⚔️';
            player.querySelector('.participant-info-container').classList.add('margin-none');
            processFindGamesResult(result, duelButton, player2Name, player, playerData, server);
            player.prepend(duelButton);
        }
    }
}

function processFindGamesResult(result, duelButton, player2Name, player, playerData, server) {
    if (isTimeoutOrFailedRetrieval(result)) {
        handleTimeoutOrFailedRetrieval(result, duelButton);
    }

    else if (isEmptySuccessAndDB(result)) {
        handleEmptySuccessAndDB(duelButton);
    }
    else {
        handleSuccessfulResult(result, duelButton, player2Name, player, playerData, server);
    }
}

function isTimeoutOrFailedRetrieval(result) {
    return (
        result === "timeout" ||
        !result ||
        (result.FAILED_RETRIEVAL.length > 0 &&
            result.SUCCESSFUL_RETRIEVAL.length === 0 &&
            result.ALREADY_ON_DB.length === 0)
    );
}

function isEmptySuccessAndDB(result) {
    return result.SUCCESSFUL_RETRIEVAL.length === 0 && result.ALREADY_ON_DB.length === 0;
}

function handleTimeoutOrFailedRetrieval(result, duelButton) {
    duelButton.disabled = true;
    duelButton.innerText = '❗';
    if (result && result.status === 429) {
        duelButton.title = 'Too many requests, try again later';
    } else if (!result || result === "timeout") {
        duelButton.title = 'Error retrieving old games data';
    } else {
        duelButton.title = 'Failed to retrieve game data';
    }
    duelButton.style.background = 'none';
    duelButton.addEventListener('mouseenter', () => {
        if (duelButton.disabled) {
            duelButton.style.background = 'none';
        }
    });
    duelButton.addEventListener('mouseleave', () => {
        if (duelButton.disabled) {
            duelButton.style.background = 'none';
        }
    });
}

function handleEmptySuccessAndDB(duelButton) {
    duelButton.disabled = true;
    duelButton.innerHTML = `<img src="https://www.svgrepo.com/show/277711/excalibur.svg" alt="Excalibur Icon" style="width:19.78px;height:17px;">`;
    duelButton.style.filter = 'grayscale(100%)';
    duelButton.title = 'First time playing against this player';
    duelButton.style.background = 'none';
    duelButton.addEventListener('click', (e) => e.preventDefault());
}

function handleSuccessfulResult(result, duelButton, player2Name, player, playerData, server) {
    // Update cache with the duel data.
    const duelData = duelsCache.get(player2Name) || {};
    duelData.findGames = result;
    duelsCache.set(player2Name, duelData);
    // Restore the icon.
    duelButton.innerText = '⚔️';
    duelButton.style.filter = 'none';
    // Attach click event to open duel modal.
    duelButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const existingOverlay = document.getElementById('popupOverlay');
        if (existingOverlay) {
            existingOverlay.parentNode.removeChild(existingOverlay);
        }
        const playerColor = player.getAttribute('data-color');
        openDuelModal(playerData, duelsCache, player2Name, playerColor, server);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    preloadPlayers();
    const serverSelector = document.getElementById('serverSelector');
    const serverRegionMap = CONFIG.serverRegionMap;

    Object.keys(serverRegionMap).forEach(region => {
        const option = document.createElement('option');
        option.value = region;
        option.textContent = region;
        serverSelector.appendChild(option);
    });

    document.getElementById('searchPlayerButton').addEventListener('click', searchPlayer);

    document.getElementById('playerNameInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchPlayer();
        }
    });

    document.getElementById('resetButton')?.addEventListener('click', resetPlayers);

    // In your DOMContentLoaded listener, replace the placeholder with:
    initHoverTooltips();
});

function initHoverTooltips() {
    function setupHoverTooltip(labelSelector, inputSelector, checkedTitle, uncheckedTitle) {
        const label = document.querySelector(labelSelector);
        const input = document.querySelector(inputSelector);
        if (label && input) {
            label.addEventListener('mouseenter', () => {
                label.title = input.checked ? checkedTitle : uncheckedTitle;
            });
        }
    }

    setupHoverTooltip(
        '.hide-contested-comps-btn-label',
        '#hide-contested-comps-btn',
        'Press to show all compositions',
        'Press to show uncontested and linked compositions only'
    );

    setupHoverTooltip(
        '.hide-unselected-comps-btn-label',
        '#hide-unselected-comps-btn',
        'Press to show unlinked compositions',
        'Press to hide unlinked compositions'
    );
}

// Append the following code at the end of the file to call resizeCanvas() 250ms second after full page load.
window.addEventListener('load', () => {
    setTimeout(() => {
        resizeCanvas();
    }, 250);
});

// Replace two ResizeObserver blocks with one
['left', 'players'].forEach(id => {
    const el = document.getElementById(id);
    if (el && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
            id === 'left' ? resizeCanvas() : drawLines();
        }).observe(el);
    }
});

var previousMultilines = {};
function drawLines() {
    clearCanvasAndResetCompos();
    const playerLinkCounts = countLinksPerPlayer();
    updateLineStyles(playerLinkCounts);
    renderAllLines();
    updateCompoColorBars();
    applyChampionFilters();
    updateHeavilyContestedChampionsTable();

    // reapply hide-contested filter on every redraw if active
    const hideBtn = document.getElementById('hide-contested-comps-btn');
    if (hideBtn?.checked) {
        document.querySelectorAll('.item.compo').forEach(compo => {
            const isLinked = links.some(l => l.compo === compo);
            const starIcon = compo.querySelector('.star-icon');
            const isUncontested = starIcon && starIcon.style.visibility !== 'hidden';
            compo.style.display = (isLinked || isUncontested) ? '' : 'none';
            if (isLinked && compo.style.display === 'none') {
                alert('GOLDEN RULE VIOLATION: linked comp hidden!');
            }
        });
    }

    updateTierHeadersVisibility();
}

function updateHeavilyContestedChampionsTable() {
    const container = document.getElementById('infoTableContainer');
    // clear any previous tables/titles
    container.querySelectorAll('.table-container').forEach(table => table.remove());
    container.querySelectorAll('.table-title').forEach(title => title.remove());

    // keep only the contested-champions logic
    const contestedChampions = {};
    const championPlayers = {};

    links.forEach(link => {
        const compo = link.compo;
        const player = link.player;
        const playerName = getPlayerName(player);
        const playerColor = player.dataset.color;
        const unitIcons = compo.querySelectorAll('.unit-icons .unit-icon-wrapper > img');

        unitIcons.forEach(img => {
            const champName = img.alt;
            contestedChampions[champName] = (contestedChampions[champName] || 0) + 1;
            championPlayers[champName] = championPlayers[champName] || [];
            championPlayers[champName].push({ name: playerName, color: playerColor });
        });
    });

    const heavilyContested = Object.keys(contestedChampions)
        .filter(champ => contestedChampions[champ] >= 2);

    if (heavilyContested.length > 0) {
        const heavilyContestedByCost = {};
        heavilyContested.forEach(champ => {
            const cost = unitCostMap[champ] || 0;
            heavilyContestedByCost[cost] = heavilyContestedByCost[cost] || [];
            heavilyContestedByCost[cost].push(champ);
        });

        const heavilyContestedTable = document.createElement('div');
        heavilyContestedTable.classList.add('table-container');
        const heavilyContestedTitle = document.createElement('h3');
        heavilyContestedTitle.classList.add('table-title');
        heavilyContestedTitle.textContent = 'Heavily contested';
        container.appendChild(heavilyContestedTitle);

        Object.keys(heavilyContestedByCost).sort((a, b) => a - b)
            .forEach(cost => {
                const row = document.createElement('div');
                heavilyContestedByCost[cost].forEach(champ => {
                    const cell = document.createElement('div');
                    cell.classList.add(`unit-cost-${cost}`);
                    cell.style.position = 'relative';

                    const img = document.createElement('img');
                    img.src = `${unitImageMap[champ]}?w=40`;
                    img.alt = champ;

                    const players = championPlayers[champ];
                    const gradientColors = players.map((p, i) => {
                        const pct = (i / players.length) * 100;
                        return `${p.color} ${pct}%, ${p.color} ${(i + 1) / players.length * 100}%`;
                    }).join(', ');
                    img.style.border = '4px solid transparent';
                    img.style.borderImage = `linear-gradient(to right, ${gradientColors}) 1`;
                    img.title = players.map(p => p.name).join(', ');

                    const counter = document.createElement('span');
                    counter.className = 'contested-counter';
                    counter.textContent = players.length;
                    cell.appendChild(counter);

                    cell.appendChild(img);
                    row.appendChild(cell);
                });
                heavilyContestedTable.appendChild(row);
            });

        container.appendChild(heavilyContestedTable);
    }
}

function applyChampionFilters() {
    // Build set of champions present on any linked comp
    const selectedChamps = {};
    links.forEach(link => {
        link.compo.querySelectorAll('.unit-icons .unit-icon-wrapper > img').forEach(img => {
            selectedChamps[img.alt] = true;
        });
    });

    // For each comp, hide star if it contains any selected champion
    document.querySelectorAll('.item.compo').forEach(compo => {
        // only grab the champion portraits, ignore item/tooltips
        const unitIcons = compo.querySelectorAll('.unit-icons .unit-icon-wrapper > img');

        const hideStar = Array.from(unitIcons).some(img => selectedChamps[img.alt]);
        const starIcon = compo.querySelector('.star-icon');
        if (starIcon) {
            starIcon.style.visibility = hideStar ? 'hidden' : 'visible';
        }

        // Gray-out any contested champion icon
        unitIcons.forEach(img => {
            img.style.filter = selectedChamps[img.alt]
                ? 'grayscale(100%)'
                : 'none';
        });
    });
}

function clearCanvasAndResetCompos() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.querySelectorAll('.compo').forEach(c => {
        c.style.background = '';
        const oldBar = c.querySelector('.color-bar');
        if (oldBar) oldBar.remove();
    });
}

function countLinksPerPlayer() {
    const counts = {};
    links.forEach(link => {
        const playerName = getPlayerName(link.player);
        counts[playerName] = (counts[playerName] || 0) + 1;
    });
    return counts;
}

function updateLineStyles(playerLinkCounts) {
    links.forEach(link => {
        const playerName = getPlayerName(link.player);
        const count = playerLinkCounts[playerName];

        if (count > 1) {
            link.dashed = true;
            link.manualDashed = true;
            previousMultilines[playerName] = true;
        } else {
            if (previousMultilines[playerName]) {
                link.manualDashed = false;
            }

            if (typeof link.manualDashed === 'boolean') {
                link.dashed = link.manualDashed;
            } else {
                link.dashed = false;
                delete link.manualDashed;
            }

            previousMultilines[playerName] = false;
        }
    });
}

function renderAllLines() {
    links.forEach(link => {
        const start = getCenter(link.compo);
        const end = getCenter(link.player);
        const color = link.player.dataset.color || 'red';

        ctx.beginPath();
        setLineStyle(link.dashed, color);
        ctx.moveTo(start.x, start.y);

        const cp1x = (start.x + end.x) / 2;
        const cp1y = start.y;
        const cp2x = (start.x + end.x) / 2;
        const cp2y = end.y;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
        ctx.stroke();
    });
}

function setLineStyle(dashed, color) {
    if (dashed) {
        ctx.setLineDash([6, 6]);
        ctx.globalAlpha = 0.5;
    } else {
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
}

function updateCompoColorBars() {
    const compoColorMap = {};

    links.forEach(link => {
        const compo = link.compo;
        const color = link.player.dataset.color;
        const id = compo.dataset.id;

        if (!compoColorMap[id]) {
            compoColorMap[id] = { compo, colors: new Set() };
        }
        compoColorMap[id].colors.add(color);
    });

    Object.values(compoColorMap).forEach(({ compo, colors }) => {
        const colorArray = Array.from(colors);
        const part = 100 / colorArray.length;
        const gradient = colorArray
            .map((color, i) => `${color} ${i * part}%, ${color} ${(i + 1) * part}%`)
            .join(', ');

        compo.style.position = 'relative';
        let bar = compo.querySelector('.color-bar');
        if (!bar) {
            bar = document.createElement('div');
            compo.insertBefore(bar, compo.firstChild);
        }
        bar.className = 'color-bar';
        Object.assign(bar.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '6px',
            bottom: '0',
            borderRadius: '6px 0 0 6px',
            background: `linear-gradient(to bottom, ${gradient})`
        });
    });
}

function updatePlayerColorBars() {
    const players = document.querySelectorAll('.item.player');
    players.forEach(player => {
        if (document.body.classList.contains('double-up') && player.closest('.team-container')) {
            // Instead of removing the bar, update the team container's color bar.
            const container = player.closest('.team-container');
            let bar = container.querySelector('.color-bar');
            if (!bar) {
                bar = document.createElement('div');
                container.insertBefore(bar, container.firstChild);
            }
            bar.className = 'color-bar';
            // Use the team container's border color (assumes format: "1px solid <color>")
            const borderColor = container.style.border.split(' ')[2] || player.dataset.color;
            Object.assign(bar.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '6px',
                height: '100%',
                borderRadius: '6px 0 0 6px',
                background: borderColor
            });
        } else {
            // For non double-up or players outside team container, use original behavior.
            player.style.position = 'relative';
            player.style.borderLeft = 'none';
            let bar = player.querySelector('.color-bar');
            if (!bar) {
                bar = document.createElement('div');
                player.appendChild(bar);
            }
            bar.className = 'color-bar';
            Object.assign(bar.style, {
                position: 'absolute',
                top: '0',
                right: '0',
                width: '6px',
                height: '100%',
                borderRadius: '0 6px 6px 0',
                background: player.dataset.color || 'transparent'
            });
        }
    });
}

function getPlayerName(playerElement) {
    return playerElement.querySelector('.player-name')?.textContent.trim() || playerElement.textContent.trim();
}

function getCenter(el) {
    const rect = el.getBoundingClientRect();
    const container = canvas.getBoundingClientRect();
    if (el.classList.contains('player')) {
        return {
            x: rect.right - container.left - 6,
            y: rect.top + rect.height / 2 - container.top
        };
    } else if (el.classList.contains('compo')) {
        return {
            x: rect.left - container.left + 6,
            y: rect.top + rect.height / 2 - container.top
        };
    }
}

function select(el, type) {
    if (selected && selected.el === el && selected.type === type) {
        el.classList.remove('selected');
        selected = null;
        return;
    }

    if (selected && selected.type !== type) {
        const a = type === 'player' ? selected.el : el;
        const b = type === 'player' ? el : selected.el;
        const exists = links.find(link => link.compo === a && link.player === b);
        if (exists) links.splice(links.indexOf(exists), 1);
        else links.push({ compo: a, player: b });
        selected.el.classList.remove('selected');
        selected = null;
        drawLines();
    } else {
        if (selected) selected.el.classList.remove('selected');
        selected = { el, type };
        el.classList.add('selected');
    }
}

const resetPlayers = () => {
    // Clear all canvas links and redraw
    links.splice(0, links.length);
    drawLines();

    // Clear player container and reset player names/icons to defaults
    document.getElementById('players').innerHTML = '';
    preloadPlayers();

    // Reset duelsCache
    duelsCache = new Map();

    // Close any open modal
    const modal = document.getElementById('popupOverlay');
    if (modal) modal.parentNode.removeChild(modal);

    // Set messageContainer display to 'none'
    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) {
        messageContainer.style.display = 'none';
    }

    // Reset all filters and filter UI
    selectedFilters = [];
    // Remove all tag elements
    document.querySelectorAll('.tag-item').forEach(tag => tag.remove());
    // Clear search input and suggestions
    const compSearchInput = document.getElementById('comp-search-input');
    if (compSearchInput) compSearchInput.value = '';
    const compSuggestions = document.getElementById('comp-suggestions');
    if (compSuggestions) {
        compSuggestions.innerHTML = '';
        compSuggestions.style.display = 'none';
    }
    // Show all compositions (reset filter effect)
    document.querySelectorAll('.item.compo').forEach(compEl => {
        compEl.style.display = '';
    });
    // Reset filter checkboxes to default (unchecked)
    hideContestedBtn.checked = false;
    hideUnselectedBtn.checked = false;

    // Show filter buttons and their containers
    [
        document.querySelector('.hide-contested-comps-btn-container'),
        document.querySelector('.hide-unselected-comps-btn-container')
    ].forEach(container => {
        if (container) container.style.display = '';
    });
    [
        document.querySelector('label[for="hide-contested-comps-btn"]'),
        document.querySelector('label[for="hide-unselected-comps-btn"]')
    ].forEach(label => {
        if (label) label.style.display = '';
    });

    // Re‐evaluate tier header visibility
    updateTierHeadersVisibility && updateTierHeadersVisibility();
};

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
        const img = document.createElement('img');
        img.src = getItemWEBPImageUrl(mainItem.apiName);
        img.alt = mainItem.apiName;
        // lookup human‐readable Name or fallback to apiName
        img.title = (items.find(i => i.Item === mainItem.apiName)?.Name) || mainItem.apiName;
        container.appendChild(img);
    }
    return container;
}

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

// Refactorización de loadCSVData utilizando la función auxiliar
function loadCompsFromJSON(metaData) {
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
            header.textContent = `TIER ${t}`;
            header.style.backgroundColor = CONFIG.tierColors[t];
            header.style.color = getContrastYIQ(CONFIG.tierColors[t]);
            compsContainer.appendChild(header);

            tiers[t].forEach(({ element }) => compsContainer.appendChild(element));
        }
    });
}

// Add helper to hide empty tier-headers
function updateTierHeadersVisibility() {
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

canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const clickX = e.offsetX;
    const clickY = e.offsetY;

    for (let i = 0; i < links.length; i++) {
        const start = getCenter(links[i].compo);
        const end = getCenter(links[i].player);

        const cp1x = (start.x + end.x) / 2;
        const cp1y = start.y;
        const cp2x = (start.x + end.x) / 2;
        const cp2y = end.y;

        const path = new Path2D();
        path.moveTo(start.x, start.y);
        path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);

        ctx.lineWidth = 15;
        if (ctx.isPointInStroke(path, clickX, clickY)) {
            links[i].manualDashed = !(links[i].manualDashed ?? links[i].dashed);
            drawLines();
            return;
        }
    }
});

canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    for (let i = 0; i < links.length; i++) {
        const start = getCenter(links[i].compo);
        const end = getCenter(links[i].player);

        const cp1x = (start.x + end.x) / 2;
        const cp1y = start.y;
        const cp2x = (start.x + end.x) / 2;
        const cp2y = end.y;

        const path = new Path2D();
        path.moveTo(start.x, start.y);
        path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);

        ctx.lineWidth = 15;
        if (ctx.isPointInStroke(path, clickX, clickY)) {
            links.splice(i, 1);
            drawLines();
            return;
        }
    }
});

function createCoreItemsButtons(metaItems) {
    const container = document.createElement('div');
    container.id = 'coreItemsContainer';

    Object.entries(metaItems).forEach(([section, sectionItems]) => {
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
            // use the object’s apiName
            btn.style.backgroundImage = `url(${getItemWEBPImageUrl(itemObj.apiName)})`;
            btn.dataset.item = itemObj.apiName;
            btn.onclick = () => {
                const active = btn.classList.toggle('active');
                document.querySelectorAll('.items-container').forEach(ctn => {
                    const units = Array.from(
                        ctn.closest('.item.compo').querySelectorAll('.unit-icons img')
                    ).map(img => img.alt);
                    updateItemsContainer(ctn);
                });
            };
            sectionDiv.appendChild(btn);
        });

        container.appendChild(sectionDiv);
    });

    compsContainer.appendChild(container);
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

function createAndInsertPlayerRankDiv(participant) {
    const rankDiv = document.createElement('div');
    rankDiv.classList.add('mini-rank-div');

    const miniRankSvg = getMiniRankIconUrl(participant.tier);
    const miniRankImg = document.createElement('img');
    miniRankImg.src = miniRankSvg;
    miniRankImg.classList.add('mini-rank-img');
    miniRankImg.title = participant.tier;

    let rank = '';
    if (participant.tier !== 'CHALLENGER' && participant.tier !== 'MASTER' && participant.tier !== 'GRANDMASTER' && participant.tier !== 'UNRANKED') {
        rank = participant.rank + ' - ';
    }
    else if (participant.tier === 'UNRANKED') {
        rank = 'Unranked';
    }

    const rankText = document.createElement('span');
    rankText.textContent = rank;
    rankText.classList.add('mini-rank-text');

    const lpText = document.createElement('span');
    if (participant.tier !== null && participant.tier !== 'UNRANKED') {
        lpText.textContent = participant.league_points + ' LP';
    }
    lpText.classList.add('mini-rank-text');

    rankDiv.append(miniRankImg, rankText, lpText);

    return rankDiv;
}
function updatePlayers(participants) {
    const playerElements = document.querySelectorAll('.item.player');

    participants.forEach((participant, index) => {
        if (playerElements[index]) {
            const playerNameElement = playerElements[index].querySelector('span.player-name');
            if (playerNameElement) {
                // Create a new container for the player's name and rank information
                const participantInfoContainer = document.createElement('div');
                participantInfoContainer.classList.add('participant-info-container');
                participantInfoContainer.style.marginLeft = '28px';

                // Set the player's name and move it into the container
                playerNameElement.textContent = participant.riotId;
                participantInfoContainer.appendChild(playerNameElement);

                // Create the mini rank div and add it to the container
                const miniRankDiv = createAndInsertPlayerRankDiv(participant);
                participantInfoContainer.appendChild(miniRankDiv);

                // Insert the container right before the div with class "color-bar"
                const playerEl = playerElements[index];
                const colorBar = playerEl.querySelector('.color-bar');
                if (colorBar) {
                    playerEl.insertBefore(participantInfoContainer, colorBar);
                } else {
                    playerEl.appendChild(participantInfoContainer);
                }

                duelsCache.set(participant.riotId, initializeDuelCacheObject(participant.riotId));
            }
        }
    });
}

function createCompToggle(button, otherButton, visibilityFn) {
    button?.addEventListener('change', function () {
        if (this.checked && otherButton.checked) otherButton.checked = false;
        document.querySelectorAll('.item.compo').forEach(compo => {
            const isLinked = links.some(l => l.compo === compo);
            const visible = visibilityFn(this.checked, isLinked, compo);
            compo.style.display = visible ? '' : 'none';
            if (isLinked && !visible) {
                alert('GOLDEN RULE VIOLATION: linked comp hidden!');
            }
        });
        updateTierHeadersVisibility();
        drawLines();
    });
}

createCompToggle(
    hideContestedBtn,
    hideUnselectedBtn,
    (checked, isLinked, compo) => {
        const starIcon = compo.querySelector('.star-icon');
        const isUncontested = starIcon && starIcon.style.visibility !== 'hidden';
        return checked ? (isLinked || isUncontested) : true;
    }
);

createCompToggle(
    hideUnselectedBtn,
    hideContestedBtn,
    (checked, isLinked) => isLinked || !checked
);

function initializeDuelCacheObject(riotId) {
    return {
        riotId,
        header: null,
        stats: null,
        commonMatches: null,
        findGames: null,
    };
}

// New code for suggestion navigation
const compSearchInput = document.getElementById('comp-search-input');
const compSuggestions = document.getElementById('comp-suggestions');

let compSuggestionIndex = -1;

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

window.toggleDoubleUpMode = toggleDoubleUpMode;
window.resetPlayers = resetPlayers;

