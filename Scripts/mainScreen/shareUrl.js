import { CONFIG } from '../config.js';

import { createPlayerDiv, getDefaultNames, enableDragAndDrop, playersContainer, updatePlayerColorBars, toggleDoubleUpMode, getTeamIcon, createTeamContainer } from './players.js';

import { drawLines, links } from './canvas.js';

export function copyShareUrlToClipboard() {
    const shareUrl = getShareUrl();
    const notificationMsg = 'Link copied! Share it to show players and comps from this game.';
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl)
            .then(() => {
                showNotification(notificationMsg);
            })
    } else {
        prompt(promptMsg, shareUrl);
    }
}

export function applyQueryParams() {
    const params = getQueryParams();
    let mode = params.mode ? params.mode.toLowerCase() : null;
    if (mode === 'double') {
        const checkbox = document.getElementById('color_mode');
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            toggleDoubleUpMode();
        }
    } else if (mode === 'solo') {
        const checkbox = document.getElementById('color_mode');
        if (checkbox && checkbox.checked) {
            checkbox.checked = false;
            toggleDoubleUpMode();
        }
    }

    // Pre-select set based on URL param
    if (params.set) {
        const sel = document.getElementById('setSelector');
        if (sel && sel.value !== params.set) sel.value = params.set;
    }
    // Always build 8 player names, using param or default
    setTimeout(() => {
        const isDoubleUp = document.body.classList.contains('double-up');
        const defaultNames = getDefaultNames(isDoubleUp);
        const playerNames = [];
        for (let i = 1; i <= 8; i++) {
            const key = `Player${i}`;
            playerNames.push(params[key] ? params[key] : defaultNames[i - 1]);
        }
        playersContainer.innerHTML = '';
        if (isDoubleUp) {
            for (let i = 0; i < 8; i += 2) {
                const p1 = createPlayerDiv(playerNames[i], i, true);
                const p2 = createPlayerDiv(playerNames[i + 1], i + 1, true);
                const teamIconData = getTeamIcon(i + 1);
                const teamContainer = createTeamContainer(p1, p2, teamIconData, i + 1);
                playersContainer.appendChild(teamContainer);
            }
        } else {
            playerNames.forEach((name, idx) => {
                playersContainer.appendChild(createPlayerDiv(name, idx, false));
            });
        }
        enableDragAndDrop(isDoubleUp);
        updatePlayerColorBars();
    }, 0);
}

// --- Helper: Link players to comps based on query params ---
export function linkPlayersToCompsFromQuery() {
    const params = getQueryParams();
    // Get all player elements in order
    const playerDivs = Array.from(document.querySelectorAll('.item.player'));
    // For each playerXComps param
    for (let i = 1; i <= 8; i++) {
        const key = `Player${i}Comps`;
        if (params[key]) {
            const compIndexes = params[key].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            compIndexes.forEach(idx => {
                // Find comp element by data-id (compo-INDEX)
                const compEl = document.querySelector(`.item.compo[data-id="compo-${idx}"]`);
                const playerEl = playerDivs[i - 1];
                if (compEl && playerEl) {
                    // Avoid duplicate links
                    if (!links.some(l => l.compo === compEl && l.player === playerEl)) {
                        links.push({ compo: compEl, player: playerEl });
                    }
                }
            });
        }
    }
    drawLines();
}

function getShareUrl() {
    const url = new URL(window.location.origin + window.location.pathname);
    // Mode
    const isDoubleUp = document.body.classList.contains('double-up');
    // Only add mode param if not solo
    if (isDoubleUp) {
        url.searchParams.set('mode', 'double');
    } else {
        url.searchParams.delete('mode');
    }
    // Include selected set in URL params
    const setSelector = document.getElementById('setSelector');
    if (setSelector && setSelector.value) {
        url.searchParams.set('set', setSelector.value);
    }
    // Players
    const playerDivs = Array.from(document.querySelectorAll('.item.player'));
    // Get default names for current mode
    const isDoubleUpMode = document.body.classList.contains('double-up');
    const defaultNames = getDefaultNames(isDoubleUpMode);
    playerDivs.forEach((player, idx) => {
        let name = player.querySelector('.player-name')?.textContent || '';
        // Remove trailing ' (YOU)' if present
        name = name.replace(/ \(YOU\)$/, '');
        // Only add PlayerX param if name differs from default
        if (name !== defaultNames[idx]) {
            url.searchParams.set(`Player${idx + 1}`, name);
        } else {
            url.searchParams.delete(`Player${idx + 1}`);
        }
    });
    // Comps linked to each player
    playerDivs.forEach((player, idx) => {
        const linkedComps = links
            .filter(l => l.player === player)
            .map(l => {
                // Get comp index from data-id="compo-X"
                const id = l.compo?.dataset?.id;
                if (id && id.startsWith('compo-')) {
                    return parseInt(id.replace('compo-', ''), 10);
                }
                return null;
            })
            .filter(n => n !== null);
        if (linkedComps.length > 0) {
            url.searchParams.set(`Player${idx + 1}Comps`, linkedComps.join(','));
        }
    });
    return url.toString();
}

// Notification helper
function showNotification(message, duration = CONFIG.notificationDuration) {
    let notification = document.getElementById('copilot-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'copilot-notification';
        // Only class, no inline style
        notification.className = 'copilot-notification';
        document.body.appendChild(notification);
    }
    notification.textContent = message;
    notification.style.opacity = '1';
    clearTimeout(notification._timeout);
    notification._timeout = setTimeout(() => {
        notification.style.opacity = '0';
    }, duration);
}

// --- New: Support for query params to set mode and player names ---
export function getQueryParams() {
    const params = {};
    window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, key, value) {
        params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    });
    return params;
}