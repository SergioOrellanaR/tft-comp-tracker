import { CONFIG } from '../config.js';

import {
    preloadPlayers,
    resetPlayers
} from './players.js';

import {
    copyShareUrlToClipboard
} from './shareUrl.js';

import { searchPlayer } from './searchCurrentGame.js';


// Unified DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async () => {
    // Copy Share URL Button
    const btn = document.getElementById('copyShareUrlButton');
    if (btn) {
        btn.addEventListener('click', copyShareUrlToClipboard);
    }

    // Preload players and server selector
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

    // Tooltips
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