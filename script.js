const compsContainer = document.getElementById('compos');
const playersContainer = document.getElementById('players');
const canvas = document.getElementById('lineCanvas');
const ctx = canvas.getContext('2d');
const csvInput = document.getElementById('csvInput');
let selected = null;
const links = [];
const colors = ['#ff4c4c', '#4c6aff', '#4cff9a', '#ffa14c', '#c74cff', '#4cffe9', '#ffee4c'];

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    drawLines();
    updateInfoTable();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function tryLoadDefaultCSV() {
    fetch("Comps.csv")
        .then(response => response.text())
        .then(data => loadCSVData(data));
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
    playersContainer.innerHTML = '';

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

// 1. Nombres por defecto
function getDefaultNames(isDoubleUp) {
    return isDoubleUp
        ? ['Team 1 - A', 'Team 1 - B', 'Team 2 - A', 'Team 2 - B', 'Team 3 - A', 'Team 3 - B', 'Team 4 - A', 'Team 4 - B']
        : ['Player A', 'Player B', 'Player C', 'Player D', 'Player E', 'Player F', 'Player G'];
}

// 2. Iconos para equipos
function getTeamIcon(index) {
    const iconOptions = [
        { name: 'Moon', color: '#c74cff', emoji: '🌙' },
        { name: 'Fire', color: '#ff69b4', emoji: '🔥' },
        { name: 'Water', color: '#4cffe9', emoji: '💧' },
        { name: 'Thunder', color: '#ffee4c', emoji: '⚡' }
    ];
    const teamIndex = Math.floor(index / 2);
    return iconOptions[teamIndex % iconOptions.length];
}

// 3. Crear contenedor para doble
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

// 4. Crear ícono central editable
function createTeamIcon(icon, player1, player2, container) {
    let currentIndex = 0;
    const iconOptions = getTeamIcon(0); // Same list as getTeamIcon

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
        currentIndex = (currentIndex + 1) % 4;
        const newIcon = getTeamIcon(currentIndex * 2);
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
    updateInfoTable();
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

// 6. Color asignado a jugador
function getPlayerColor(index, isDoubleUp) {
    return isDoubleUp
        ? getTeamIcon(index).color
        : colors[index % colors.length];
}

// 7. Crear span editable
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
            updateInfoTable();
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

// 8. Crear ícono de edición
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

document.addEventListener('DOMContentLoaded', () => {
    preloadPlayers();
});

var previousMultilines = {};
function drawLines() {
    clearCanvasAndResetCompos();
    const playerLinkCounts = countLinksPerPlayer();
    updateLineStyles(playerLinkCounts);
    renderAllLines();
    updateCompoColorBars();
}

// 1. Limpiar canvas y compos
function clearCanvasAndResetCompos() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.querySelectorAll('.compo').forEach(c => {
        c.style.background = '';
        const oldBar = c.querySelector('.color-bar');
        if (oldBar) oldBar.remove();
    });
}

// 2. Contar links por jugador
function countLinksPerPlayer() {
    const counts = {};
    links.forEach(link => {
        const playerId = getPlayerId(link.player);
        counts[playerId] = (counts[playerId] || 0) + 1;
    });
    return counts;
}

// 3. Determinar líneas múltiples y setear estilo
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

// 4. Dibujar líneas entre compos y jugadores
function renderAllLines() {
    links.forEach(link => {
        const start = getCenter(link.compo);
        const end = getCenter(link.player);
        const color = link.player.dataset.color || 'red';

        ctx.beginPath();
        setLineStyle(link.dashed, color);
        ctx.moveTo(start.x, start.y);

// Punto de control para la curva
const cp1x = (start.x + end.x) / 2;
const cp1y = start.y;
const cp2x = (start.x + end.x) / 2;
const cp2y = end.y;

// Dibuja una curva Bezier con 2 puntos de control (curva suave)
ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, end.x, end.y);
        ctx.stroke();
    });
}

// 5. Configurar estilo de línea (dashed o normal)
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

// 6. Pintar barras de colores en compos
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

// 7. Obtener identificador único del jugador
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

function updateInfoTable() {
    const container = document.getElementById('infoTableContainer');
    container.innerHTML = '';

    const compoMap = buildCompoMap();
    if (compoMap.size === 0) return;

    const table = createInfoTable(compoMap);
    container.appendChild(table);
}

// 1. Agrupar datos de links en Map(style -> Map(comp -> [players]))
function buildCompoMap() {
    const map = new Map();

    links.forEach(link => {
        const compo = link.compo;
        const estilo = compo.querySelectorAll('span')[1]?.innerText || '';
        const compName = compo.querySelector('span')?.innerText || '';
        const playerName = link.player.querySelector('span')?.innerText || link.player.innerText;

        if (!map.has(estilo)) map.set(estilo, new Map());
        const compMap = map.get(estilo);
        if (!compMap.has(compName)) compMap.set(compName, []);
        compMap.get(compName).push(playerName);
    });

    return map;
}

// 2. Crear tabla HTML desde compoMap
function createInfoTable(compoMap) {
    const table = document.createElement('table');
    Object.assign(table.style, {
        width: '100%',
        marginTop: '1rem',
        borderCollapse: 'collapse'
    });

    table.appendChild(createInfoTableHeader());

    const tbody = document.createElement('tbody');
    const sortedStyles = sortCompoMapByStyleNumber(compoMap);

    sortedStyles.forEach(([style, compsMap]) => {
        const comps = Array.from(compsMap.entries());

        comps.forEach(([comp, players], index) => {
            const row = document.createElement('tr');

            // Insert style cell with rowspan
            if (index === 0) {
                const tdStyle = createTableCell(style, comps.length);
                row.appendChild(tdStyle);
            }

            const tdComp = createTableCell(comp);
            const tdPlayers = createPlayerCell(players);

            row.appendChild(tdComp);
            row.appendChild(tdPlayers);
            tbody.appendChild(row);
        });
    });

    table.appendChild(tbody);
    return table;
}

// 3. Crear encabezado de tabla
function createInfoTableHeader() {
    const thead = document.createElement('thead');
    thead.innerHTML = `
    <tr style="background:#333;color:#ffd700">
      <th style="padding:6px;border:1px solid #555">Style</th>
      <th style="padding:6px;border:1px solid #555">Comp</th>
      <th style="padding:6px;border:1px solid #555">Players</th>
    </tr>`;
    return thead;
}

// 4. Crear celda de texto (con rowspan opcional)
function createTableCell(text, rowspan) {
    const td = document.createElement('td');
    td.textContent = text;
    td.style.padding = '6px';
    td.style.border = '1px solid #555';
    if (rowspan) td.rowSpan = rowspan;
    return td;
}

// 5. Crear celda de jugadores (como lista o tabla interna)
function createPlayerCell(players) {
    const td = document.createElement('td');
    td.style.padding = '6px';
    td.style.border = '1px solid #555';

    if (players.length === 1) {
        td.textContent = players[0];
    } else {
        const innerTable = document.createElement('table');
        innerTable.style.width = '100%';
        innerTable.style.borderCollapse = 'collapse';
        players.forEach(p => {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.textContent = p;
            row.appendChild(cell);
            innerTable.appendChild(row);
        });
        td.appendChild(innerTable);
    }

    return td;
}

// 6. Ordenar estilos alfabéticamente por número final
function sortCompoMapByStyleNumber(compoMap) {
    return Array.from(compoMap.entries()).sort(([a], [b]) => {
        const aNum = parseInt(a.match(/\d+$/)?.[0]) || 0;
        const bNum = parseInt(b.match(/\d+$/)?.[0]) || 0;
        return aNum - bNum;
    });
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
        updateInfoTable();
    } else {
        if (selected) selected.el.classList.remove('selected');
        selected = { el, type };
        el.classList.add('selected');
    }
}

function resetPlayers() {
    playersContainer.innerHTML = '';
    links.length = 0;
    drawLines();
    updateInfoTable();
    preloadPlayers();
}
csvInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => loadCSVData(e.target.result);
    reader.readAsText(file);
});

function loadCSVData(csvText) {
    const lines = csvText.split(/\r?\n/);
    compsContainer.innerHTML = '';
    const tiers = { S: [], A: [], B: [], C: [] };
    const tierColors = {
        S: '#ffaa00',
        A: '#00e0ff',
        B: '#c74cff',
        C: '#b30000'
    };

    lines.forEach((line, index) => {
        if (index === 0 || !line.trim()) return;
        const [comp, tier, estilo] = line.split(',').map(x => x.trim());
        if (tiers[tier]) {
            const div = document.createElement('div');
            div.className = 'item compo';
            div.dataset.id = 'compo-' + index;
            div.innerHTML = `<span>${comp}</span><span style="opacity: 0.7; font-size: 0.9em;">${estilo}</span>`;
            div.onclick = () => select(div, 'compo');
            tiers[tier].push(div);
        }
    });

    ['S', 'A', 'B', 'C'].forEach(t => {
        if (tiers[t].length > 0) {
            const header = document.createElement('div');
            header.className = 'tier-header';
            header.textContent = `Tier ${t}`;
            header.style.color = tierColors[t]; // Aquí se aplica el color
            compsContainer.appendChild(header);
            tiers[t].forEach(div => compsContainer.appendChild(div));
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

        ctx.lineWidth = 15; // importante: el grosor que querés considerar como "clickeable"
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
        const dist = distanceToSegment({ x: clickX, y: clickY }, start, end);
        if (dist < 6) {
            links.splice(i, 1);
            drawLines();
            updateInfoTable();
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