import { CONFIG } from './config.js';

let API_KEY;

async function initializeApiKey() {
    if (!CONFIG.netlify) {
        try {
            // Intenta importar la clave desde keys.js (solo en desarrollo)
            const { API_KEY: localApiKey } = await import('./keys.js');
            API_KEY = localApiKey;
        } catch (error) {
            console.error('API_KEY is not defined. Please set it in your environment or keys.js.');
        }
    }
    else {
        console.log('Netlify mode detected. API_KEY will be fetched from Netlify functions.');
    }
}

// Variables globales
let selected = null;
const links = [];
let unitImageMap = {};
let unitCostMap = {};
let items = [];
let units = [];

const compsContainer = document.getElementById('compos');
const playersContainer = document.getElementById('players');
const canvas = document.getElementById('lineCanvas');
const ctx = canvas.getContext('2d');
const csvInput = document.getElementById('csvInput');

// Utilidades generales
const fetchCSV = async (route) => {
    const response = await fetch(route);
    return response.text();
};

const parseCSV = (csvText) => {
    return csvText.split(/\r?\n/).map(line => line.split(',').map(x => x.trim()));
};

const createElement = (tag, options = {}) => {
    const element = document.createElement(tag);
    Object.assign(element, options);
    return element;
};

const clearElement = (element) => {
    element.innerHTML = '';
};

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
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    drawLines();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

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
    const btn = document.getElementById('toggleDoubleUp');
    const active = document.body.classList.toggle('double-up');
    btn.textContent = `Double Up: ${active ? 'ON' : 'OFF'}`;
    resetPlayers();
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
}

function getDefaultNames(isDoubleUp) {
    return isDoubleUp
        ? ['Team 1 - A', 'Team 1 - B', 'Team 2 - A', 'Team 2 - B', 'Team 3 - A', 'Team 3 - B', 'Team 4 - A', 'Team 4 - B']
        : ['Player A', 'Player B', 'Player C', 'Player D', 'Player E', 'Player F', 'Player G'];
}

function getTeamIcon(index) {
    const teamIndex = Math.floor(index / 2);
    return CONFIG.iconOptions[teamIndex % CONFIG.iconOptions.length];
}

function createTeamContainer(player1, player2, icon, index) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.border = `1px solid ${icon.color}`;
    container.style.borderRadius = '12px';
    container.style.padding = '8px';
    container.style.marginBottom = '16px';
    container.style.background = 'rgba(255, 255, 255, 0.05)';
    container.style.backdropFilter = 'blur(6px)';
    container.style.border = `1px solid ${icon.color}`;
    const iconCircle = createTeamIcon(icon, player1, player2, container);
    container.append(player1, iconCircle, player2);
    return container;
}

function createTeamIcon(icon, player1, player2, container) {
    let currentIndex = 0;

    const circle = document.createElement('div');
    Object.assign(circle.style, {
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        backgroundColor: '#1c1c2b',
        border: `2px solid ${icon.color}`,
        cursor: 'pointer',
        margin: '4px 0',
    });
    circle.className = 'icon-circle';
    circle.textContent = icon.emoji;
    circle.title = icon.name;

    circle.onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex + 1) % CONFIG.iconOptions.length;
        const newIcon = CONFIG.iconOptions[currentIndex];
        updateIconColor(circle, newIcon, player1, player2, container);
    };

    return circle;
}

function updateIconColor(circle, icon, player1, player2, container) {
    [player1, player2].forEach(p => {
        p.dataset.color = icon.color;
        p.style.borderLeft = `10px solid ${icon.color}`;
    });
    circle.textContent = icon.emoji;
    circle.title = icon.name;
    circle.style.border = `2px solid ${icon.color}`;
    container.style.border = `1px solid ${icon.color}`;
    drawLines();
}

function createPlayerDiv(name, index, isDoubleUp) {
    const div = document.createElement('div');
    div.className = 'item player';
    div.style.background = 'rgba(255, 255, 255, 0.04)';
    div.style.backdropFilter = 'blur(6px)';
    div.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    div.style.borderRadius = '10px';
    div.style.padding = '6px 10px';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.marginBottom = '8px';

    const span = createEditableSpan(name);
    const editIcon = createEditIcon(span);

    const color = getPlayerColor(index, isDoubleUp);
    div.dataset.color = color;
    div.style.borderLeft = `10px solid ${color}`;

    span.style.flex = '1';
    div.append(span, editIcon);
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
    span.textContent = name;

    span.ondblclick = () => {
        const input = document.createElement('input');
        const original = span.textContent;

        Object.assign(input, {
            type: 'text',
            value: '',
            maxLength: 20,
        });
        Object.assign(input.style, {
            width: '100%',
            border: '1px solid #444',
            backgroundColor: 'transparent',
            color: '#fff',
            fontSize: '0.75rem',
            borderRadius: '4px',
            padding: '2px 6px',
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
                const nextSpan = next?.querySelector('span');
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
    icon.style.marginLeft = '6px';
    icon.style.cursor = 'pointer';
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

    // Redibujar las líneas
    drawLines();

    // Opcional: Ocultar el mensaje después de 5 segundos
    setTimeout(() => {
        messageContainer.style.display = 'none';
        drawLines(); // Redibujar las líneas nuevamente si el mensaje desaparece
    }, 3000);
}

async function fetchApi(url, isNetlify, callId) {
    console.log('fetchApi', url, isNetlify, callId);
    if (isNetlify) {
        const response = await fetch("/.netlify/functions/riot-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            handleApiError(response, callId);
            return null;
        }

        return response.json();
    } else {
        const response = await fetch(`${url}?api_key=${API_KEY}`);

        if (!response.ok) {
            handleApiError(response, callId);
            return null;
        }

        return response.json();
    }
}

function handleApiError(response, callId) {
    if (response.status === 404) {
        if (callId === 'getPuuid') {
            showMessage('Player not found');
        } else if (callId === 'spectator') {
            showMessage('The player is not currently in a game.');            
        }
    } else {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }
}

const searchPlayer = async () => {
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

    try {
        const isNetlify = CONFIG.netlify;

        // Fetch PUUID
        const accountUrl = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${playerName}/${tag}`;
        const accountData = await fetchApi(accountUrl, isNetlify, 'fetchPuuid');
        if (!accountData) return;

        const playerPuuid = accountData.puuid;

        // Fetch spectator data
        const spectatorUrl = `https://${serverCode}.api.riotgames.com/lol/spectator/tft/v5/active-games/by-puuid/${playerPuuid}`;
        const spectatorData = await fetchApi(spectatorUrl, isNetlify, 'spectator');
        if (!spectatorData) return;

        // Handle spectator data
        handleSpectatorData(spectatorData, playerPuuid);

    } catch (error) {
        console.error('Failed to fetch data:', error);
        showMessage('Failed to fetch data.');
    }
};

function handleSpectatorData(spectatorData, playerPuuid) {
    const isDoubleUp = spectatorData.gameQueueConfigId === 1160;
    // Change Double Up mode based on gameQueueConfigId
    if (isDoubleUp) {
        if (!document.body.classList.contains('double-up')) {
            toggleDoubleUpMode(); // Activate Double Up
        }
    } else {
        if (document.body.classList.contains('double-up')) {
            toggleDoubleUpMode(); // Deactivate Double Up
        }
    }

    // Log participant Riot IDs
    const participants = spectatorData.participants
        .filter(participants => {
            if (isDoubleUp) {
                return true;
            }
            return participants.puuid !== playerPuuid;
        });

    // Update player names
    updatePlayerNames(participants);
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed');
    await initializeApiKey();
    preloadPlayers();
    const serverSelector = document.getElementById('serverSelector');
    const serverRegionMap = CONFIG.serverRegionMap;

    // Llenar el selector con las opciones de serverRegionMap
    Object.keys(serverRegionMap).forEach(region => {
        const option = document.createElement('option');
        option.value = region;
        option.textContent = region;
        serverSelector.appendChild(option);
    });

    // Agregar funcionalidad al botón de búsqueda
    document.getElementById('searchPlayerButton').addEventListener('click', searchPlayer);

    // Ejecutar búsqueda al presionar Enter en el campo de texto
    document.getElementById('playerNameInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Evitar que el formulario se envíe si está dentro de uno
            searchPlayer();
        }
    });
});

document.getElementById('left').addEventListener('scroll', drawLines);
document.getElementById('right').addEventListener('scroll', drawLines);
window.addEventListener('scroll', drawLines);

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
    const allLinkedPlayers = new Set(links.map(link => link.player));
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
        const playerName = getPlayerId(player);
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
                cell.style.position = 'relative'; // Necesario para posicionar el contador

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

                    // Crear el contador
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
        const playerId = getPlayerId(link.player);
        counts[playerId] = (counts[playerId] || 0) + 1;
    });
    return counts;
}

function updateLineStyles(playerLinkCounts) {
    links.forEach(link => {
        const playerId = getPlayerId(link.player);
        const count = playerLinkCounts[playerId];

        if (count > 1) {
            link.dashed = true;
            link.manualDashed = true;
            previousMultilines[playerId] = true;
        } else {
            if (previousMultilines[playerId]) {
                link.manualDashed = false;
            }

            if (typeof link.manualDashed === 'boolean') {
                link.dashed = link.manualDashed;
            } else {
                link.dashed = false;
                delete link.manualDashed;
            }

            previousMultilines[playerId] = false;
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
        const gradient = colorArray.map((color, i) => `${color} ${i * part}%, ${color} ${(i + 1) * part}%`).join(', ');

        compo.style.position = 'relative';
        const bar = compo.querySelector('.color-bar') || compo.appendChild(document.createElement('div'));
        bar.className = 'color-bar';
        Object.assign(bar.style, {
            position: 'absolute',
            top: '0', right: '0',
            width: '6px', height: '100%',
            borderRadius: '0 6px 6px 0',
            background: `linear-gradient(to bottom, ${gradient})`
        });
    });
}

function getPlayerId(playerElement) {
    return playerElement.querySelector('span')?.innerText || playerElement.innerText;
}

function getCenter(el) {
    const rect = el.getBoundingClientRect();
    const container = canvas.getBoundingClientRect();
    const isPlayer = el.classList.contains('player');
    return {
        x: isPlayer ? rect.left - container.left : rect.right - container.left,
        y: rect.top + rect.height / 2 - container.top
    };
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

// Restablecer jugadores y enlaces
const resetPlayers = () => {
    clearElement(playersContainer);
    links.length = 0;

    // Restablecer botones de ítems
    document.querySelectorAll('.core-item-button').forEach(button => {
        button.classList.remove('active');
        button.style.filter = 'grayscale(100%)';
    });

    // Actualizar todos los contenedores de ítems
    document.querySelectorAll('.items-container').forEach(container => {
        const unitsInComp = Array.from(container.closest('.item.compo').querySelectorAll('.unit-icons img'))
            .map(img => img.alt);
        updateItemsContainer(container, unitsInComp);
    });

    drawLines();
    preloadPlayers();
};

function loadCSVData(csvText) {
    const lines = csvText.split(/\r?\n/);
    compsContainer.innerHTML = '';
    const tiers = { S: [], A: [], B: [], C: [] };

    lines.forEach((line, index) => {
        if (index === 0 || !line.trim()) return; // Saltar la cabecera o líneas vacías
        const [comp, tier, estilo, unit1, unit2, unit3] = line.split(',').map(x => x.trim());
        if (tiers[tier]) {
            const div = document.createElement('div');
            div.className = 'item compo';
            div.dataset.id = 'compo-' + index;

            const unitIcons = document.createElement('div');
            unitIcons.className = 'unit-icons';
            const unitsInComp = [unit1, unit2, unit3];
            unitsInComp.forEach(unit => {
                if (unit && unitImageMap[unit]) {
                    const img = document.createElement('img');
                    img.src = `${unitImageMap[unit]}?w=30`;
                    img.alt = unit;
                    unitIcons.appendChild(img);
                }
            });

            const compInfo = document.createElement('div');
            compInfo.className = 'comp-info';
            const compName = document.createElement('span');
            compName.textContent = comp;
            compName.style.fontSize = '0.9rem';
            compName.style.opacity = '0.75';
            compName.style.color = 'white';

            compInfo.appendChild(compName);

            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'items-container';
            const styleContainer = document.createElement('div');
            styleContainer.className = 'comp-style';
            const compStyle = document.createElement('span');
            compStyle.textContent = estilo;
            compStyle.style.opacity = '0.5';
            compStyle.style.fontSize = '0.9em';
            styleContainer.appendChild(compStyle);

            div.appendChild(unitIcons);
            div.appendChild(compInfo);
            div.appendChild(itemsContainer);
            div.appendChild(styleContainer);
            div.onclick = () => select(div, 'compo');
            tiers[tier].push({ name: comp, element: div }); // Guardar el nombre y el elemento
        }
    });

    // Ordenar y renderizar las composiciones
    ['S', 'A', 'B', 'C'].forEach(t => {
        if (tiers[t].length > 0) {
            // Ordenar por nombre alfabéticamente
            tiers[t].sort((a, b) => a.name.localeCompare(b.name));

            const header = document.createElement('div');
            header.className = 'tier-header';
            header.textContent = `Tier ${t}`;
            header.style.color = CONFIG.tierColors[t];
            compsContainer.appendChild(header);

            // Agregar los elementos ordenados
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

function distanceToSegment(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function createCoreItemsButtons() {
    const container = document.createElement('div');
    container.id = 'coreItemsContainer';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.marginTop = '16px';

    const maxRows = 2;
    const itemsPerRow = Math.ceil(CONFIG.coreItems.length / maxRows);
    let currentRow;

    CONFIG.coreItems.forEach((item, index) => {
        const itemData = items.find(i => i.Item === item);
        if (itemData) {
            if (index % itemsPerRow === 0) {
                currentRow = document.createElement('div');
                currentRow.style.display = 'flex';
                currentRow.style.gap = '8px';
                currentRow.style.justifyContent = 'center';
                container.appendChild(currentRow);
            }

            const button = document.createElement('button');
            button.className = 'core-item-button';
            button.style.backgroundImage = `url(${itemData.Url})`;
            button.style.backgroundSize = 'contain';
            button.style.backgroundRepeat = 'no-repeat';
            button.style.backgroundPosition = 'center';
            button.style.width = '40px';
            button.style.height = '40px';
            button.style.border = 'none';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
            button.style.filter = 'grayscale(100%)';
            button.title = itemData.Item;

            button.onclick = () => {
                const isActive = button.classList.toggle('active');
                button.style.filter = isActive ? 'none' : 'grayscale(100%)';

                document.querySelectorAll('.items-container').forEach(container => {
                    const unitsInComp = Array.from(container.closest('.item.compo').querySelectorAll('.unit-icons img'))
                        .map(img => img.alt);
                    updateItemsContainer(container, unitsInComp);
                });
            };

            currentRow.appendChild(button);
        }
    });

    compsContainer.appendChild(container);
}

const updateItemsContainer = (itemsContainer, unitsInComp) => {
    itemsContainer.innerHTML = '';

    const activeItems = Array.from(document.querySelectorAll('.core-item-button.active'))
        .map(button => button.title);

    const itemToChampionsMap = {}; // Mapa para asociar ítems con los campeones que los usan

    // Recorremos los campeones en la composición
    unitsInComp.forEach(unit => {
        const unitData = units.find(u => u.Unit === unit);
        if (unitData) {
            [unitData.Item1, unitData.Item2, unitData.Item3].forEach(item => {
                if (item && activeItems.includes(item)) {
                    if (!itemToChampionsMap[item]) {
                        itemToChampionsMap[item] = [];
                    }
                    itemToChampionsMap[item].push(unit); // Asociar el ítem con el campeón
                }
            });
        }
    });

    const displayedItems = new Set(); // Para evitar ítems duplicados

    // Crear las imágenes de los ítems
    Object.entries(itemToChampionsMap).forEach(([item, champions]) => {
        if (!displayedItems.has(item)) {
            const itemData = items.find(i => i.Item === item);
            if (itemData) {
                const img = document.createElement('img');
                img.src = itemData.Url;
                img.alt = item;
                img.title = `${item} (Used by: ${champions.join(', ')})`; // Mostrar todos los campeones que usan el ítem
                img.style.width = '20px';
                img.style.height = '20px';
                img.style.borderRadius = '4px';
                img.style.objectFit = 'cover';
                itemsContainer.appendChild(img);
                displayedItems.add(item); // Marcar el ítem como mostrado
            }
        }
    });
};

if (typeof itemsContainer !== 'undefined' && itemsContainer) {
    const updateItemsContainerFn = () => updateItemsContainer(itemsContainer, unitsInComp);
    itemsContainer.dataset.updateFn = updateItemsContainerFn.name;
    updateItemsContainerFn();
}

function updatePlayerNames(participants) {
    const playerElements = document.querySelectorAll('.item.player');

    participants.forEach((participant, index) => {
        if (playerElements[index]) {
            const playerNameElement = playerElements[index].querySelector('span');
            if (playerNameElement) {
                playerNameElement.textContent = participant.riotId;
            }
        }
    });
}

window.toggleDoubleUpMode = toggleDoubleUpMode;
window.resetPlayers = resetPlayers;
