import { drawLines } from './canvas.js';
import { CONFIG } from '../config.js';
import { createLoadingSpinner, openDuelModal } from '../components.js';
import { fetchPlayerSummary, fetchLiveGame, fetchFindGames, getMiniRankIconUrl } from '../tftVersusHandler.js';
import { duelsCache } from './players.js';

export const searchPlayer = async () => {
    
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

        console.log('Spectator Data:', spectatorData);
        resetLoadingState(spinner, searchButton);
        console.log('Player Data 1:', playerData);
        handleSpectatorData(spectatorData, playerData, server);
        console.log('Player Data 2:', playerData);
    } catch (error) {
        console.error('Error fetching data:', error);
        resetLoadingState(spinner, searchButton);
        showMessage('Failed to fetch data');
    }
};

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
    // Remove the edit-icon from each player's action container
    document.querySelectorAll('.item.player .player-action-container').forEach(container => {
        const editIcon = container.querySelector('.edit-icon');
        if (editIcon) editIcon.remove();
    });

    const players = document.querySelectorAll('.item.player');

    for (let i = 0; i < players.length; i++) {
        const player = players[i];

        // Wait delayBetweenPlayers between players (except before the first)
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenPlayers));
        }

        // Use the action container for all player actions
        const actionContainer = player.querySelector('.player-action-container');
        if (!actionContainer.querySelector('.duel-button')) {
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
            actionContainer.innerHTML = '';
            actionContainer.appendChild(spinner);

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
            actionContainer.innerHTML = '';

            // Create the actual duel button.
            const duelButton = document.createElement('button');
            duelButton.className = 'duel-button';
            duelButton.title = 'Vs. History';
            duelButton.innerText = '⚔️';
            player.querySelector('.participant-info-container').classList.add('margin-none');
            processFindGamesResult(result, duelButton, player2Name, player, playerData, server);
            actionContainer.appendChild(duelButton);
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

function updatePlayers(participants) {
    const playerElements = document.querySelectorAll('.item.player');

    participants.forEach((participant, index) => {
        if (playerElements[index]) {
            const playerNameElement = playerElements[index].querySelector('span.player-name');
            if (playerNameElement) {
                // Create a new container for the player's name and rank information
                const participantInfoContainer = document.createElement('div');
                participantInfoContainer.classList.add('participant-info-container');

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

function createAndInsertPlayerRankDiv(participant) {
    const rankDiv = document.createElement('div');
    rankDiv.classList.add('mini-rank-div');

    // Create a container for the icon and first rank text
    const iconAndRankDiv = document.createElement('div');
    iconAndRankDiv.classList.add('mini-rank-icon-text');

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
    rankText.classList.add('mini-rank-text'); // first mini-rank-text

    iconAndRankDiv.append(miniRankImg, rankText);

    const lpText = document.createElement('span');
    if (participant.tier !== null && participant.tier !== 'UNRANKED') {
        lpText.textContent = participant.league_points + ' LP';
    }
    lpText.classList.add('mini-rank-lp-text'); // changed class name for second mini-rank-text

    rankDiv.append(iconAndRankDiv, lpText);

    return rankDiv;
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