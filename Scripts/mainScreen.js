import { CONFIG } from './config.js';
import { fetchPlayerSummary, fetchFindGames, fetchLiveGame, getMiniRankIconUrl } from './tftVersusHandler.js';
import { createLoadingSpinner, openDuelModal } from './components.js';
import { fetchCSV, parseCSV, throttle, getContrastYIQ } from './utils.js';

// Variables globales
let selected = null;
const links = [];
let unitImageMap = {};
let unitCostMap = {};
let items = [];
let units = [];
let duelsCache = new Map();

const compsContainer = document.getElementById('compos');
const playersContainer = document.getElementById('players');
const canvas = document.getElementById('lineCanvas');
const ctx = canvas.getContext('2d');

// Cargar datos de Units.csv
const loadUnitImages = async () => {
    const data = await fetchCSV(CONFIG.routes.units);
    const lines = parseCSV(data);

    lines.forEach(([unit, cost, item1, item2, item3, url]) => {
        if (unit && url) {
            unitImageMap[unit] = url;
            unitCostMap[unit] = parseInt(cost, 10);
            units.push({ Unit: unit, Item1: item1, Item2: item2, Item3: item3 });
        }
    });
};

// Cargar datos de Items.csv
const loadItems = async () => {
    const data = await fetchCSV(CONFIG.routes.items);
    items = parseCSV(data).slice(1).map(([Item, Url]) => ({ Item, Url }));
};

function resizeCanvas() {
    //alert('Canvas container width and height: ' + canvas.parentElement.clientWidth + 'x' + canvas.parentElement.clientHeight);
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    drawLines();
}

window.addEventListener('resize', resizeCanvas);

function tryLoadDefaultCSV() {
    Promise.all([loadUnitImages(), loadItems()]).then(() => {
        fetch(CONFIG.routes.comps)
            .then(response => response.text())
            .then(data => {
                loadCSVData(data);
                createCoreItemsButtons();
            });
    });
}

function toggleDoubleUpMode() {
    console.log('Toggling double-up mode');
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

function enableSoloDragAndDrop() {
    const playerElements = document.querySelectorAll('.item.player');
    const throttledDrawLines = throttle(drawLines, 50); // Limitar a 1 llamada cada 50ms

    playerElements.forEach(player => {

        player.setAttribute('draggable', true); // Hacer que los elementos sean arrastrables

        player.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', player.dataset.index); // Guardar el índice del jugador arrastrado
            player.classList.add('dragging'); // Agregar clase para estilos visuales
        });

        player.addEventListener('dragover', (e) => {
            e.preventDefault(); // Permitir el drop
            const dragging = document.querySelector('.dragging');
            const playersContainer = document.getElementById('players');
            const afterElement = getDragAfterElement(playersContainer, e.clientY);

            if (afterElement == null || afterElement.parentNode !== playersContainer) {
                playersContainer.appendChild(dragging);
            } else {
                playersContainer.insertBefore(dragging, afterElement);
            }

            throttledDrawLines(); // Redibujar las líneas con throttling
        });

        player.addEventListener('drop', (e) => {
            e.preventDefault();
            player.classList.remove('dragging'); // Quitar la clase al soltar
            drawLines(); // Redibujar las líneas después de soltar
        });

        player.addEventListener('dragend', () => {
            // Siempre redibujar las líneas al finalizar el arrastre
            const dragging = document.querySelector('.dragging');
            if (dragging) {
                dragging.classList.remove('dragging'); // Quitar la clase si aún está presente
            }
            drawLines(); // Redibujar las líneas
        });
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

    if (isDoubleUp) {
        enableDuoDragAndDrop();
    }
    else {
        enableSoloDragAndDrop();
    }

    updatePlayerColorBars(); // Llama una vez para establecer los color-bars fijos
}

function enableDuoDragAndDrop() {
    const playerElements = document.querySelectorAll('.team-container .item.player');
    const throttledDrawLines = throttle(drawLines, 50);

    playerElements.forEach(player => {
        player.setAttribute('draggable', true);
        addDuoDragEvents(player, throttledDrawLines);
    });
}

function addDuoDragEvents(player, throttledDrawLines) {
    player.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', '');
        player.classList.add('dragging');
    });

    player.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (!player.classList.contains('dragging')) {
            player.classList.add('drop-target');
        }
    });

    player.addEventListener('dragleave', () => {
        player.classList.remove('drop-target');
    });

    player.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    player.addEventListener('drop', (e) => {
        e.preventDefault();
        handlePlayerSwap(player, throttledDrawLines);
    });

    player.addEventListener('dragend', () => {
        player.classList.remove('dragging', 'drop-target');
        throttledDrawLines();
    });
}

function handlePlayerSwap(targetPlayer, throttledDrawLines) {
    targetPlayer.classList.remove('drop-target');
    const draggingPlayer = document.querySelector('.team-container .item.player.dragging');
    
    if (!draggingPlayer || draggingPlayer === targetPlayer) return;

    const sourceContainer = draggingPlayer.closest('.team-container');
    const targetContainer = targetPlayer.closest('.team-container');
    
    if (!sourceContainer || !targetContainer || sourceContainer === targetContainer) return;

    swapPlayers(draggingPlayer, targetPlayer, sourceContainer, targetContainer);
    updateTeamIcons([sourceContainer, targetContainer]);
    updatePlayerColorBars();
    draggingPlayer.classList.remove('dragging');
    throttledDrawLines();
}

function swapPlayers(player1, player2, container1, container2) {
    const placeholder = document.createElement('div');
    container2.replaceChild(placeholder, player2);
    container1.replaceChild(player2, player1);
    container2.replaceChild(player1, placeholder);
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

tryLoadDefaultCSV();

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
        console.log(error);
        showMessage('Failed to fetch data');
    }
};

function handleSpectatorData(spectatorData, playerData, server) {
    const isDoubleUp = spectatorData.gameQueueConfigId === 1160;
    console.log(spectatorData);

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
                player.querySelector('.participant-info-container').style.marginLeft = '28px';
                continue; // Skip the player if it's the same as the one in the duel button
            }

            player.querySelector('.participant-info-container').style.marginLeft = '4px';
            // Create a spinner placeholder for the duel button
            const spinner = createLoadingSpinner();
            spinner.classList.add('duel-spinner');
            player.prepend(spinner);

            // Start fetching duel data with a maximum timeout of 10 seconds.
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
            player.querySelector('.participant-info-container').style.marginLeft = '0px';
            processFindGamesResult(result, duelButton, player2Name, player, playerData, server);
            player.prepend(duelButton);
        }
    }
}

function processFindGamesResult(result, duelButton, player2Name, player, playerData, server) {
    //console.log(result);
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
    console.log('DOM fully loaded and parsed');
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
});

// Append the following code at the end of the file to call resizeCanvas() 250ms second after full page load.
window.addEventListener('load', () => {
    setTimeout(() => {
        resizeCanvas();
    }, 250);
});

// Add ResizeObserver on the "left" element to call resizeCanvas whenever it resizes
const leftElement = document.getElementById('left');
if (leftElement && typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
    });
    resizeObserver.observe(leftElement);
}

// Add ResizeObserver on the "players" element to call drawLines whenever it resizes
const playersElement = document.getElementById('players');
if (playersElement && typeof ResizeObserver !== 'undefined') {
    const playersResizeObserver = new ResizeObserver(() => {
        drawLines();
    });
    playersResizeObserver.observe(playersElement);
}

var previousMultilines = {};
function drawLines() {
    clearCanvasAndResetCompos();
    const playerLinkCounts = countLinksPerPlayer();
    updateLineStyles(playerLinkCounts);
    renderAllLines();
    updateCompoColorBars();
    applyChampionFilters();
    updateUnselectedChampionsTable();
}

function updateUnselectedChampionsTable() {
    const allPlayers = document.querySelectorAll('.item.player');
    const allLinkedComps = new Set(links.map(link => link.compo));
    const container = document.getElementById('infoTableContainer');

    container.querySelectorAll('.table-container').forEach(table => table.remove());
    container.querySelectorAll('.table-title').forEach(title => title.remove());

    const maxPlayers = allPlayers.length;
    if (links.length >= maxPlayers - 2 && links.length > 0) {
        const selectedChampions = new Set();
        allLinkedComps.forEach(compo => {
            const unitIcons = compo.querySelectorAll('.unit-icons img');
            unitIcons.forEach(img => selectedChampions.add(img.alt));
        });

        const allChampionsInComps = new Set();
        document.querySelectorAll('.item.compo .unit-icons img').forEach(img => {
            allChampionsInComps.add(img.alt);
        });

        const unselectedChampions = Array.from(allChampionsInComps)
            .filter(champ => !selectedChampions.has(champ) && unitCostMap[champ] > 1);

        const championsByCost = {};
        unselectedChampions.forEach(champ => {
            const cost = unitCostMap[champ] || 0;
            if (!championsByCost[cost]) {
                championsByCost[cost] = [];
            }
            championsByCost[cost].push(champ);
        });

        const unselectedTable = document.createElement('div');
        unselectedTable.classList.add('table-container');

        const title = document.createElement('h3');
        title.classList.add('table-title');
        title.textContent = 'Uncontested';
        container.appendChild(title);

        Object.keys(championsByCost).sort((a, b) => a - b).forEach(cost => {
            const row = document.createElement('div');
            championsByCost[cost].forEach(champ => {
                const cell = document.createElement('div');
                cell.classList.add(`unit-cost-${cost}`);

                const img = document.createElement('img');
                img.src = `${unitImageMap[champ]}?w=40`;
                img.alt = champ;
                img.title = champ;

                cell.appendChild(img);
                row.appendChild(cell);
            });
            unselectedTable.appendChild(row);
        });

        container.appendChild(unselectedTable);
    }

    const contestedChampions = {};
    const championPlayers = {};

    links.forEach(link => {
        const compo = link.compo;
        const player = link.player;
        const playerName = getPlayerName(player);
        const playerColor = player.dataset.color;
        const unitIcons = compo.querySelectorAll('.unit-icons img');

        unitIcons.forEach(img => {
            const champName = img.alt;
            contestedChampions[champName] = (contestedChampions[champName] || 0) + 1;

            if (!championPlayers[champName]) {
                championPlayers[champName] = [];
            }
            championPlayers[champName].push({ name: playerName, color: playerColor });
        });
    });

    const heavilyContested = Object.keys(contestedChampions)
        .filter(champ => contestedChampions[champ] >= 2);

    if (heavilyContested.length > 0) {
        const heavilyContestedByCost = {};
        heavilyContested.forEach(champ => {
            const cost = unitCostMap[champ] || 0;
            if (!heavilyContestedByCost[cost]) {
                heavilyContestedByCost[cost] = [];
            }
            heavilyContestedByCost[cost].push(champ);
        });

        const heavilyContestedTable = document.createElement('div');
        heavilyContestedTable.classList.add('table-container');

        const heavilyContestedTitle = document.createElement('h3');
        heavilyContestedTitle.classList.add('table-title');
        heavilyContestedTitle.textContent = 'Heavily contested';
        container.appendChild(heavilyContestedTitle);

        Object.keys(heavilyContestedByCost).sort((a, b) => a - b).forEach(cost => {
            const row = document.createElement('div');
            heavilyContestedByCost[cost].forEach(champ => {
                const cell = document.createElement('div');
                cell.classList.add(`unit-cost-${cost}`);
                cell.style.position = 'relative';

                const img = document.createElement('img');
                img.src = `${unitImageMap[champ]}?w=40`;
                img.alt = champ;

                const players = championPlayers[champ];
                if (players.length > 0) {
                    const gradientColors = players.map((player, index) => {
                        const percentage = (index / players.length) * 100;
                        return `${player.color} ${percentage}%, ${player.color} ${(index + 1) / players.length * 100}%`;
                    }).join(', ');

                    img.style.border = '4px solid transparent';
                    img.style.borderImage = `linear-gradient(to right, ${gradientColors}) 1`;

                    const playerNames = players.map(player => player.name).join(', ');
                    img.title = `${playerNames}`;

                    const counter = document.createElement('span');
                    counter.className = 'contested-counter';
                    counter.textContent = players.length;
                    cell.appendChild(counter);
                }

                cell.appendChild(img);
                row.appendChild(cell);
            });
            heavilyContestedTable.appendChild(row);
        });

        container.appendChild(heavilyContestedTable);
    }
}

function applyChampionFilters() {
    const championUsage = {};

    links.forEach(link => {
        const compo = link.compo;
        const unitIcons = compo.querySelectorAll('.unit-icons img');
        unitIcons.forEach(img => {
            const champName = img.alt;
            if (!championUsage[champName]) {
                championUsage[champName] = 0;
            }
            championUsage[champName]++;
        });
    });

    document.querySelectorAll('.item.compo').forEach(compo => {
        const unitIcons = compo.querySelectorAll('.unit-icons img');
        unitIcons.forEach(img => {
            const champName = img.alt;
            if (championUsage[champName] > 0) {
                img.style.filter = 'grayscale(100%)';
            } else {
                img.style.filter = 'none';
            }
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

        const allPlayers = document.querySelectorAll('.item.player');
        const allLinkedPlayers = new Set(links.map(link => link.player));
        if (allPlayers.length === allLinkedPlayers.size) {
            updateUnselectedChampionsTable();
        }
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
};

// Nueva función auxiliar para crear el contenedor de estilo
function createStyleContainer(estilo) {
    const styleContainer = document.createElement('div');
    styleContainer.className = 'comp-style';
    const compStyle = document.createElement('span');
    compStyle.textContent = estilo;
    compStyle.style.opacity = '0.7';
    compStyle.style.fontSize = '0.9em';
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

// Nueva función auxiliar para crear los iconos de unidades
function createUnitIcons(units) {
    const unitIcons = document.createElement('div');
    unitIcons.className = 'unit-icons';
    units.forEach(unit => {
        if (unit && unitImageMap[unit]) {
            const img = document.createElement('img');
            img.src = `${unitImageMap[unit]}?w=28`;
            img.alt = unit;
            unitIcons.appendChild(img);
        }
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
function createCompoElement({ comp, index, estilo, units, teambuilderUrl }) {
    const div = document.createElement('div');
    div.className = 'item compo';
    div.dataset.id = 'compo-' + index;

    const styleContainer = createStyleContainer(estilo);
    const starContainer = createUncontestedContainer();
    const compInfo       = createCompInfo(comp);
    const itemsContainer = createItemsContainer();
    const unitIcons      = createUnitIcons(units);
    const tbButtonDiv    = createTeambuilderButton(teambuilderUrl);

    div.append(styleContainer, starContainer, compInfo, itemsContainer, unitIcons);
    if (tbButtonDiv) div.appendChild(tbButtonDiv);

    div.onclick = () => select(div, 'compo');
    return div;
}

// Refactorización de loadCSVData utilizando la función auxiliar
function loadCSVData(csvText) {
    const lines = csvText.split(/\r?\n/);
    compsContainer.innerHTML = '';
    const tiers = { S: [], A: [], B: [], C: [] };

    lines.forEach((line, index) => {
        if (index === 0 || !line.trim()) return;
        const fields = line.split(',').map(x => x.trim());
        const [comp, tier, estilo, unit1, unit2, unit3] = fields;
        const teambuilderUrl = fields.length >= 7 ? fields[6] : '';
        if (tiers[tier]) {
            // Sort units by cost (using unitCostMap) and then alphabetically.
            const sortedUnits = [unit1, unit2, unit3].sort((a, b) => {
                const costA = unitCostMap[a] ?? Infinity;
                const costB = unitCostMap[b] ?? Infinity;
                const costDiff = costA - costB;
                return costDiff !== 0 ? costDiff : a.localeCompare(b);
            });
            const compoElement = createCompoElement({
                comp,
                index,
                estilo,
                units: sortedUnits,
                teambuilderUrl
            });
            tiers[tier].push({ name: comp, element: compoElement });
        }
    });

    ['S', 'A', 'B', 'C'].forEach(t => {
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

function createCoreItemsButtons() {
    const container = document.createElement('div');
    container.id = 'coreItemsContainer';

    CONFIG.coreItems.forEach((item) => {
        const itemData = items.find(i => i.Item === item);
        if (itemData) {
            const button = document.createElement('button');
            button.className = 'core-item-button';
            button.style.backgroundImage = `url(${itemData.Url})`;
            button.title = itemData.Item;

            button.onclick = () => {
                const isActive = button.classList.toggle('active');
                button.style.filter = isActive ? 'none' : 'grayscale(100%)';

                document.querySelectorAll('.items-container').forEach(container => {
                    const unitsInComp = Array.from(
                        container.closest('.item.compo').querySelectorAll('.unit-icons img')
                    ).map(img => img.alt);
                    updateItemsContainer(container, unitsInComp);
                });
            };

            container.appendChild(button);
        }
    });

    compsContainer.appendChild(container);
}

const updateItemsContainer = (itemsContainer, unitsInComp) => {
    itemsContainer.innerHTML = '';

    const activeItems = Array.from(document.querySelectorAll('.core-item-button.active'))
        .map(button => button.title);

    const itemToChampionsMap = {};

    unitsInComp.forEach(unit => {
        const unitData = units.find(u => u.Unit === unit);
        if (unitData) {
            [unitData.Item1, unitData.Item2, unitData.Item3].forEach(item => {
                if (item && activeItems.includes(item)) {
                    if (!itemToChampionsMap[item]) {
                        itemToChampionsMap[item] = [];
                    }
                    itemToChampionsMap[item].push(unit);
                }
            });
        }
    });

    const displayedItems = new Set();

    Object.entries(itemToChampionsMap).forEach(([item, champions]) => {
        if (!displayedItems.has(item)) {
            const itemData = items.find(i => i.Item === item);
            if (itemData) {
                const img = document.createElement('img');
                img.src = itemData.Url;
                img.alt = item;
                img.title = `${item} (Used by: ${champions.join(', ')})`;
                img.style.width = '20px';
                img.style.height = '20px';
                img.style.borderRadius = '4px';
                img.style.objectFit = 'cover';
                itemsContainer.appendChild(img);
                displayedItems.add(item);
            }
        }
    });
};

if (typeof itemsContainer !== 'undefined' && itemsContainer) {
    const updateItemsContainerFn = () => updateItemsContainer(itemsContainer, unitsInComp);
    itemsContainer.dataset.updateFn = updateItemsContainerFn.name;
    updateItemsContainerFn();
}

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

function initializeDuelCacheObject(riotId) {
    return {
        riotId,
        header: null,
        stats: null,
        commonMatches: null,
        findGames: null,
    };
}

window.toggleDoubleUpMode = toggleDoubleUpMode;
window.resetPlayers = resetPlayers;