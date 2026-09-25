import { CONFIG, CDRAGON_URL } from '../config.js';
import { throttle } from '../utils.js';
import { renderLinks, links } from './matrix.js';
import { resetCompFilters } from './compSearchBar.js';
import { getUser } from '../account/session.js';

export let duelsCache = new Map();

export const playersContainer = document.getElementById('players');

// A player is a column header of the lobby matrix
export function createPlayerDiv(name, index, isDoubleUp) {
    const div = document.createElement('div');
    div.classList.add('item', 'player', 'player-card');

    const avatar = document.createElement('span');
    avatar.className = 'player-avatar';
    avatar.innerHTML = `<img alt="" hidden><b>${index + 1}</b>`;

    const span = createEditableSpan(name);
    const editIcon = createEditIcon(span);

    // Holds the edit icon, then the spinner and duel button once a live game is loaded
    const actionContainer = document.createElement('div');
    actionContainer.classList.add('player-action-container');
    actionContainer.appendChild(editIcon);

    div.dataset.color = getPlayerColor(index, isDoubleUp);
    div.style.setProperty('--pc', div.dataset.color);
    div.title = name;

    // Items, artifacts and emblems dropped on this player (see playerItems.js)
    const itemBox = document.createElement('div');
    itemBox.className = 'player-items empty';
    itemBox.innerHTML = '<span class="slot"></span>'.repeat(6);

    div.append(actionContainer, avatar, span, itemBox);
    if (!isDoubleUp && index === 0 && name === ownRiotId()) setPlayerAvatar(div, getUser().riot.profile_icon_id);
    return div;
}

// The signed-in user's verified Riot ID: the first column's default name instead of "YOU"
export function ownRiotId() {
    const riot = getUser()?.riot;
    return riot?.verified ? riot.riot_id : null;
}

// A Riot ID shows its tag dimmed, as the live game does; textContent stays the full name
function showName(span, name) {
    const [gameName, tagLine] = name.split('#');
    span.textContent = tagLine ? gameName : name;
    if (tagLine) {
        const tag = document.createElement('span');
        tag.className = 'riot-tag';
        tag.textContent = '#' + tagLine;
        span.appendChild(tag);
    }
}

// Profile icon from the live game (Riot spectator participants carry profileIconId)
export function setPlayerAvatar(player, profileIconId) {
    const img = player.querySelector('.player-avatar img');
    if (!img || profileIconId == null) return;
    img.src = `${CDRAGON_URL.profileIcons}/${profileIconId}.jpg`;
    img.onload = () => { img.hidden = false; };
}

export function enableDragAndDrop(isDoubleUp) {
    const selector = isDoubleUp
        ? '.team-container .item.player'
        : '.item.player';
    const throttledRender = throttle(renderLinks, 50);

    document.querySelectorAll(selector).forEach(player => {
        player.setAttribute('draggable', true);
        player.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', isDoubleUp ? '' : player.dataset.index);
            player.classList.add('dragging');
        });

        if (isDoubleUp) {
            // swap players between teams
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
                                updatePlayerColors();
                            }
                        }
                    }
                    if (evt === 'dragend') {
                        player.classList.remove('dragging', 'drop-target');
                    }
                    throttledRender();
                });
            });
        } else {
            // reorder columns
            ['dragover', 'drop', 'dragend'].forEach(evt => {
                player.addEventListener(evt, e => {
                    if (evt === 'dragover') {
                        e.preventDefault();
                        const dragging = document.querySelector('.item.player.dragging');
                        if (!dragging) return;
                        const afterEl = getDragAfterElement(playersContainer, e.clientX);
                        if (!afterEl) playersContainer.appendChild(dragging);
                        else if (afterEl !== dragging.nextElementSibling) playersContainer.insertBefore(dragging, afterEl);
                    }
                    if (evt === 'drop' || evt === 'dragend') {
                        player.classList.remove('dragging');
                    }
                    throttledRender();
                });
            });
        }
    });
}

export function preloadPlayers() {
    const isDoubleUp = document.body.classList.contains('double-up');
    const defaultNames = getDefaultNames(isDoubleUp);

    if (playersContainer.children.length > 0) return;

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

    enableDragAndDrop(isDoubleUp);
    updatePlayerColors();
}

export function getTeamIcon(index) {
    const teamIndex = Math.floor(index / 2);
    return CONFIG.iconOptions[teamIndex % CONFIG.iconOptions.length];
}

export function createTeamContainer(player1, player2, icon, index) {
    const container = document.createElement('div');
    container.classList.add('team-container');
    const iconCircle = createTeamIcon(icon, player1, player2, container);
    container.append(player1, iconCircle, player2);
    return container;
}

export const resetPlayers = () => {
    links.splice(0, links.length);

    document.getElementById('players').innerHTML = '';
    preloadPlayers();
    renderLinks();

    duelsCache = new Map();

    // Close any open modal
    const modal = document.getElementById('popupOverlay');
    if (modal) modal.parentNode.removeChild(modal);

    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) messageContainer.style.display = 'none';

    resetCompFilters();
};

export function updatePlayerColors() {
    document.querySelectorAll('.item.player').forEach(player => {
        player.style.setProperty('--pc', player.dataset.color || 'transparent');
    });
}

// withOwn: the first solo column is the signed-in user's Riot ID (share URLs compare against the plain "YOU")
export function getDefaultNames(isDoubleUp, withOwn = true) {
    return isDoubleUp
        ? ['Team 1 - A', 'Team 1 - B', 'Team 2 - A', 'Team 2 - B', 'Team 3 - A', 'Team 3 - B', 'Team 4 - A', 'Team 4 - B']
        : [(withOwn && ownRiotId()) || 'YOU', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7', 'Player 8'];
}

// Signing in, linking or signing out renames the first column while it still has its default name
let shownOwnName = 'YOU';
document.addEventListener('tft:userchange', () => {
    const next = ownRiotId() || 'YOU';
    const first = playersContainer?.querySelector('.item.player');
    const span = first?.querySelector('.player-name');
    if (!span || document.body.classList.contains('double-up') || next === shownOwnName) return;
    if (span.textContent.trim() === shownOwnName) {
        showName(span, next);
        first.title = next;
        const img = first.querySelector('.player-avatar img');
        if (next === 'YOU') { if (img) { img.hidden = true; img.removeAttribute('src'); } }
        else setPlayerAvatar(first, getUser().riot.profile_icon_id);
        renderLinks();
    }
    shownOwnName = next;
});

export function toggleDoubleUpMode() {
    const checkbox = document.getElementById('color_mode');
    const active = checkbox.checked;

    document.body.classList.toggle('double-up', active);
    document.querySelectorAll('.mode-switch [data-mode]').forEach(b =>
        b.setAttribute('aria-pressed', String((b.dataset.mode === 'double') === active)));

    links.splice(0, links.length);
    document.getElementById('players').innerHTML = '';
    preloadPlayers();
    renderLinks();
}

function getPlayerColor(index, isDoubleUp) {
    return isDoubleUp
        ? getTeamIcon(index).color
        : CONFIG.colors[index % CONFIG.colors.length];
}

function createEditableSpan(name) {
    const span = document.createElement('span');
    span.classList.add('player-name');
    showName(span, name);

    const editHandler = () => {
        const input = document.createElement('input');
        input.classList.add('editable-input');
        const original = span.textContent;

        Object.assign(input, {
            type: 'text',
            value: '',
            maxLength: 22,
            placeholder: original,
        });

        input.onblur = () => {
            showName(span, input.value.trim().substring(0, 22) || original);
            span.closest('.item.player')?.setAttribute('title', span.textContent);
            span.style.display = '';
            input.remove();
            renderLinks();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = '';
                input.blur();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                input.blur();
                const allPlayers = Array.from(document.querySelectorAll('.item.player'));
                const currentIndex = allPlayers.findIndex(p => p.contains(span));
                const next = allPlayers[currentIndex + (e.shiftKey ? -1 : 1)];
                next?.querySelector('.player-name')?.dispatchEvent(new Event('dblclick'));
            }
        });

        span.style.display = 'none';
        span.parentElement.insertBefore(input, span);
        input.focus();
    };

    span.ondblclick = (e) => {
        e.stopPropagation();
        editHandler();
    };

    // Store the edit handler so the edit icon can call it
    span._editHandler = editHandler;

    return span;
}

function createEditIcon(span) {
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
    icon.classList.add('edit-icon');
    icon.title = 'Rename';
    icon.setAttribute('aria-label', 'Rename player');
    icon.onclick = (e) => {
        e.stopPropagation();
        span._editHandler?.();
    };
    return icon;
}

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.item.player:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
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
    let currentIndex = CONFIG.iconOptions.indexOf(icon);

    const circle = document.createElement('button');
    circle.type = 'button';
    circle.classList.add('team-icon');
    circle._iconConfig = icon;
    circle.setAttribute('draggable', 'false');
    circle.onmousedown = e => e.preventDefault();

    circle.onclick = (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex + 1) % CONFIG.iconOptions.length;
        const newIcon = CONFIG.iconOptions[currentIndex];
        circle._iconConfig = newIcon;

        const teamPlayers = container.querySelectorAll('.item.player');
        const [p1, p2] = teamPlayers.length >= 2 ? teamPlayers : [player1, player2];
        updateIconColor(circle, newIcon, p1, p2, container);
    };

    updateIconColor(circle, icon, player1, player2, container);
    return circle;
}

function updateIconColor(circle, icon, player1, player2, container) {
    [player1, player2].forEach(player => {
        player.dataset.color = icon.color;
        player.style.setProperty('--pc', icon.color);
    });

    circle.textContent = icon.emoji;
    circle.title = icon.name;
    container.style.setProperty('--pc', icon.color);
    if (player1.isConnected) renderLinks();
}
