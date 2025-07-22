import { unitImageMap, unitCostMap } from './dataLoader.js';
import { updateTierHeadersVisibility } from './compSearchBar.js';

export const links = [];
const canvas = document.getElementById('lineCanvas');
var previousMultilines = {};
const ctx = canvas.getContext('2d');

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

export function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    drawLines();
}

export function drawLines() {
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
        heavilyContestedTitle.textContent = 'Contested units';
        container.appendChild(heavilyContestedTitle);

        Object.keys(heavilyContestedByCost).sort((a, b) => a - b)
            .forEach(cost => {
                const row = document.createElement('div');
                row.classList.add(`table-row-${cost}`);

                // Add a header for each cost group as the first element in the row
                const costHeader = document.createElement('h4');
                costHeader.textContent = `${cost} Costs`;
                row.appendChild(costHeader);

                heavilyContestedByCost[cost].forEach(champ => {
                    const cell = document.createElement('div');
                    cell.classList.add('table-cell');
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
        c.style.borderLeftColor = 'transparent';
        c.style.borderImage = '';
        
        // Remove gradient elements
        const gradientEl = c.querySelector('.border-gradient');
        if (gradientEl) gradientEl.remove();
        
        // Remove old color-bar elements
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

function updateCompoColorBars() {
    const compoColorMap = {};

    // Reset all compos to transparent first
    document.querySelectorAll('.compo').forEach(compo => {
        compo.style.borderLeftColor = 'transparent';
        compo.style.borderImage = '';
        // Remove any existing gradient elements
        const existingGradient = compo.querySelector('.border-gradient');
        if (existingGradient) {
            existingGradient.remove();
        }
    });

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
        
        if (colorArray.length === 1) {
            // Single color - use solid border
            compo.style.borderLeftColor = colorArray[0];
            compo.style.borderImage = '';
        } else if (colorArray.length > 1) {
            // Multiple colors - use positioned element to preserve border-radius
            compo.style.borderLeftColor = 'transparent';
            compo.style.borderImage = '';
            
            // Create gradient element
            const gradientEl = document.createElement('div');
            gradientEl.className = 'border-gradient';
            
            const part = 100 / colorArray.length;
            const gradient = colorArray
                .map((color, i) => `${color} ${i * part}%, ${color} ${(i + 1) * part}%`)
                .join(', ');
            
            // Only set the dynamic gradient background
            gradientEl.style.background = `linear-gradient(to bottom, ${gradient})`;
            
            compo.style.position = 'relative';
            compo.insertBefore(gradientEl, compo.firstChild);
        }
        
        // Remove any existing color-bar elements
        const existingBar = compo.querySelector('.color-bar');
        if (existingBar) {
            existingBar.remove();
        }
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