import { CONFIG } from '../config.js';
import { preloadPlayers, resetPlayers, toggleDoubleUpMode } from './players.js';
import { copyShareUrlToClipboard } from './shareUrl.js';
import { searchPlayer } from './searchCurrentGame.js';
import { hasFeature } from '../account/session.js';

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('copyShareUrlButton')?.addEventListener('click', copyShareUrlToClipboard);

    preloadPlayers();
    const serverSelector = document.getElementById('serverSelector');
    Object.keys(CONFIG.serverRegionMap).forEach(region => {
        const option = document.createElement('option');
        option.value = region;
        option.textContent = region;
        serverSelector.appendChild(option);
    });
    // Remember the region between visits
    try {
        const saved = localStorage.getItem('region');
        if (saved && CONFIG.serverRegionMap[saved]) serverSelector.value = saved;
    } catch { /* storage unavailable */ }
    serverSelector.addEventListener('change', () => {
        try { localStorage.setItem('region', serverSelector.value); } catch { /* storage unavailable */ }
    });

    const input = document.getElementById('playerNameInput');
    // The live game lookup is VIP-only (the backend enforces it); everyone else fills the lobby by hand
    const search = document.querySelector('.player-search');
    document.addEventListener('tft:userchange', () => { search.hidden = !hasFeature('live_game'); });
    document.getElementById('searchPlayerButton').addEventListener('click', searchPlayer);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchPlayer();
        } else if (e.key === 'Escape') {
            input.blur();
        }
    });
    // "/" jumps to the player search from anywhere
    document.addEventListener('keydown', e => {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        if (search.hidden || e.target.closest('input, textarea, select, [contenteditable]')) return;
        e.preventDefault();
        input.focus();
        input.select();
    });

    // Solo / Double Up (the hidden checkbox stays the source of truth for the rest of the app)
    const checkbox = document.getElementById('color_mode');
    document.querySelectorAll('.mode-switch [data-mode]').forEach(btn => btn.addEventListener('click', () => {
        const double = btn.dataset.mode === 'double';
        if (checkbox.checked === double) return;
        checkbox.checked = double;
        toggleDoubleUpMode();
    }));

    document.getElementById('resetButton')?.addEventListener('click', resetPlayers);
    document.getElementById('copyPlayerNamesButton')?.addEventListener('click', copyPlayerNames);
});

// Copy the lobby's player names, one per line
function copyPlayerNames(e) {
    const btn = e.currentTarget;
    const names = [...document.querySelectorAll('.item.player .player-name')]
        .map(span => span.textContent.replace(/ \(YOU\)$/, '').trim())
        .filter(Boolean)
        .join('\n');
    const done = () => {
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '⧉'; }, 1200);
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(names).then(done).catch(() => prompt('Player names', names));
    } else {
        prompt('Player names', names);
    }
}
