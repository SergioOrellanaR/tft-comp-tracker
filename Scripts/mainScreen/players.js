import { CONFIG } from '../config.js';
import { throttle } from '../utils.js';
import { drawLines, links } from './canvas.js';
import { hideUnselectedBtn, hideContestedBtn, selectedFilters, updateTierHeadersVisibility } from './compSearchBar.js';

// Variables globales
let selected = null;
export let duelsCache = new Map();

export const playersContainer = document.getElementById('players');

export function createPlayerDiv(name, index, isDoubleUp) {
    const div = document.createElement('div');
    div.classList.add('item', 'player', 'player-card');

    const span = createEditableSpan(name);
    const editIcon = createEditIcon(span);

    // Create a fixed-width action container for edit-icon, spinner, duel-button, etc.
    const actionContainer = document.createElement('div');
    actionContainer.classList.add('player-action-container');
    actionContainer.style.width = '32px'; // Adjust as needed for consistent space
    actionContainer.style.display = 'flex';
    actionContainer.style.alignItems = 'center';
    actionContainer.appendChild(editIcon);

    const color = getPlayerColor(index, isDoubleUp);
    div.dataset.color = color;

    div.append(actionContainer, span);
    div.onclick = () => select(div, 'player');

    return div;
}

export function select(el, type) {
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

export function enableDragAndDrop(isDoubleUp) {
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

export function preloadPlayers() {
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

export function getTeamIcon(index) {
    const teamIndex = Math.floor(index / 2);
    return CONFIG.iconOptions[teamIndex % CONFIG.iconOptions.length];
}

export function createTeamContainer(player1, player2, icon, index) {
    const container = document.createElement('div');
    container.classList.add('team-container');
    container.style.border = `1px solid ${icon.color}`;
    const iconCircle = createTeamIcon(icon, player1, player2, container);
    container.append(player1, iconCircle, player2);
    return container;
}

export const resetPlayers = () => {
    // Clear all canvas links and redraw
    links.splice(0, links.length);
    drawLines();

    // Clear player container and reset player names/icons to defaults
    document.getElementById('players').innerHTML = '';
    preloadPlayers();

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
    selectedFilters.splice(0, selectedFilters.length);
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

export function updatePlayerColorBars() {
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

export function getDefaultNames(isDoubleUp) {
    return isDoubleUp
        ? ['Team 1 - A', 'Team 1 - B', 'Team 2 - A', 'Team 2 - B', 'Team 3 - A', 'Team 3 - B', 'Team 4 - A', 'Team 4 - B']
        : ['YOU', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7', 'Player 8'];
}

export function toggleDoubleUpMode() {
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

    // ← disable selection & dragging
    circle.style.userSelect        = 'none';
    circle.style.MozUserSelect     = 'none';
    circle.style.msUserSelect      = 'none';
    circle.setAttribute('draggable', 'false');
    // also prevent the native focus/selection rectangle
    circle.onmousedown = e => e.preventDefault();

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