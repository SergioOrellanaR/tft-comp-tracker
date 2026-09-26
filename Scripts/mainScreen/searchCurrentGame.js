import { renderLinks } from './matrix.js';
import { CONFIG } from '../config.js';
import { createLoadingSpinner } from '../components.js';
import { openGlance } from './versus.js';
import { fetchPlayerSummary, fetchLiveGame, fetchFindGames, getMiniRankIconUrl } from '../tftVersusHandler.js';
import { duelsCache, resetPlayers, toggleDoubleUpMode, setPlayerAvatar, ownRiotId } from './players.js';
import { showNotification } from './shareUrl.js';
import { getUser } from '../account/session.js';

// Riot rate limits (429): the backend retries short waits itself; longer ones come back with the wait,
// and these retry by themselves while telling the user, without blocking anything else
const SEARCH_MAX_ATTEMPTS = 3;
const DUEL_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_SECONDS = 10;
// Versus checks run a few at a time (the backend queues them behind lobby searches)
const DUEL_CONCURRENCY = 3;
const DUEL_TIMEOUT_MS = 60000;

// Incremented on every search so duel-button loops from a previous search stop touching the UI
let searchGeneration = 0;

// Searches are spaced out except for VIP accounts (the backend enforces the same wait);
// the button counts down in place of its icon
const SEARCH_COOLDOWN_MS = 30000;
let nextSearchAt = 0;
let cooldownTimer = null;
const searchIcon = document.getElementById('searchPlayerButton')?.innerHTML;
const isVip = () => getUser()?.plan === 'vip';
const cooldownLeft = () => (isVip() ? 0 : Math.max(0, Math.ceil((nextSearchAt - Date.now()) / 1000)));

function tickCooldown() {
    clearTimeout(cooldownTimer);
    const button = document.getElementById('searchPlayerButton');
    if (!button) return;
    const left = cooldownLeft();
    button.classList.toggle('cooling', left > 0);
    if (left > 0) {
        button.textContent = `${left}s`;
        button.title = `You can search again in ${left}s`;
        cooldownTimer = setTimeout(tickCooldown, 1000);
    } else {
        button.innerHTML = searchIcon;
        button.removeAttribute('title');
    }
}

export const searchPlayer = async () => {
    const wait = cooldownLeft();
    if (wait > 0) {
        showMessage(`You can search again in ${wait}s.`);
        return;
    }
    const generation = ++searchGeneration;
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
    const riotId = `${playerName.trim()}#${tag.trim()}`;
    const messageContainer = document.getElementById('messageContainer');
    // Clear any previous content and show the container
    messageContainer.innerHTML = '';
    messageContainer.style.display = 'block';
    // Append spinner so that it uses the same space as error messages
    const spinner = createLoadingSpinner();
    messageContainer.appendChild(spinner);
    const searchButton = document.getElementById('searchPlayerButton');
    searchButton.disabled = true;
    nextSearchAt = Date.now() + SEARCH_COOLDOWN_MS;
    tickCooldown();
    try {
        // The lobby comes first: the live game and the player's card load side by side
        const summaryPromise = withRateLimitRetry(() => fetchPlayerSummary(riotId, server), generation, spinner);
        const spectatorData = await withRateLimitRetry(() => fetchLiveGame(riotId, server), generation, spinner);
        if (generation !== searchGeneration) return;

        if (!spectatorData || spectatorData.detail !== undefined) {
            const summary = await summaryPromise.catch(() => null);
            if (generation !== searchGeneration) return;
            resetLoadingState(spinner, searchButton);
            // "player not found" explains more than "no live game"
            showMessage(summary?.status === 404 ? summary.detail : (spectatorData?.detail || 'Failed to fetch data'));
            return;
        }
        resetLoadingState(spinner, searchButton);
        handleSpectatorData(spectatorData, summaryPromise, riotId, server, generation);
    } catch (error) {
        console.error('Error fetching data:', error);
        resetLoadingState(spinner, searchButton);
        showMessage('Failed to fetch data');
    }
};

let messageTimeout = null;

// Runs an API call, and while Riot rate-limits it (429) waits the time it asked for and tries again,
// with a countdown next to the search spinner
async function withRateLimitRetry(call, generation, spinner) {
    for (let attempt = 1; ; attempt++) {
        const result = await call();
        if (result?.status !== 429 || attempt >= SEARCH_MAX_ATTEMPTS || generation !== searchGeneration) return result;
        await countdown(result.retryAfter || DEFAULT_RETRY_SECONDS, left => {
            if (!spinner) return;
            let text = spinner.querySelector('.spinner-text');
            if (!text) {
                text = document.createElement('div');
                text.className = 'spinner-text';
                spinner.appendChild(text);
            }
            text.textContent = `Riot is busy, retrying in ${left}s`;
        });
        if (generation !== searchGeneration) return result;
    }
}

function countdown(seconds, onTick) {
    return new Promise(resolve => {
        let left = Math.ceil(seconds);
        onTick(left);
        const timer = setInterval(() => {
            left -= 1;
            if (left <= 0) {
                clearInterval(timer);
                resolve();
            } else {
                onTick(left);
            }
        }, 1000);
    });
}

function showMessage(message) {
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.textContent = message;
    messageContainer.style.display = 'block';

    renderLinks();

    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => {
        messageContainer.style.display = 'none';
        renderLinks();
    }, 3000);
}

const resetLoadingState = (spinner, searchButton) => {
    spinner.remove();
    searchButton.disabled = false;
};

async function handleSpectatorData(spectatorData, summaryPromise, riotId, server, generation) {
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
    // The versus needs the searched player's card; without it (e.g. rate limited), the name is enough
    const summary = await summaryPromise.catch(() => null);
    if (generation !== searchGeneration) return;
    const playerData = summary && summary.detail === undefined ? summary : { name: riotId };
    updatePlayersDuelButtons(playerData, server, generation);
}

async function updatePlayersDuelButtons(playerData, server, generation) {
    // Remove the edit-icon from each player's action container
    document.querySelectorAll('.item.player .player-action-container').forEach(container => {
        const editIcon = container.querySelector('.edit-icon');
        if (editIcon) editIcon.remove();
    });

    const queue = [...document.querySelectorAll('.item.player')].filter(player => {
        const name = player.querySelector('.player-name').textContent.trim();
        if (playerData.name === name) {
            player.classList.add('is-you');
            return false;
        }
        return !player.querySelector('.player-action-container .duel-button');
    });
    // Whether you've played each of them before is what decides if a versus is worth opening, so every
    // player is checked right away, a few at a time
    const worker = async () => {
        while (queue.length && generation === searchGeneration) {
            const player = queue.shift();
            if (player.isConnected) await checkDuel(player, playerData, server, generation, 1);
        }
    };
    await Promise.all(Array.from({ length: DUEL_CONCURRENCY }, worker));
}

// A column renamed by hand (see nameLookup.js): your games against it are checked as the live search does
export function checkVersus(player, server) {
    const me = ownRiotId();
    if (me && player.isConnected) checkDuel(player, { name: me }, server, searchGeneration, 1);
}

// Empties a column's actions, but a column still named by hand keeps its edit icon
export function clearPlayerActions(actionContainer) {
    [...actionContainer.children].forEach(child => { if (!child.classList.contains('edit-icon')) child.remove(); });
}

async function checkDuel(player, playerData, server, generation, attempt) {
    const actionContainer = player.querySelector('.player-action-container');
    const player2Name = player.querySelector('.player-name').textContent.trim();

    const spinner = createLoadingSpinner();
    spinner.classList.add('duel-spinner');
    clearPlayerActions(actionContainer);
    actionContainer.appendChild(spinner);

    let result;
    try {
        const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), DUEL_TIMEOUT_MS));
        result = await Promise.race([fetchFindGames(playerData.name, player2Name, server), timeout]);
    } catch (error) {
        result = null;
    }
    // A new search or reset replaced these players; stop touching them
    if (generation !== searchGeneration || !player.isConnected) return;
    // renamed again while this ran: the newer check owns the column
    if (player.querySelector('.player-name').textContent.trim() !== player2Name) return;
    clearPlayerActions(actionContainer);

    if (result?.status === 429 && attempt < DUEL_MAX_ATTEMPTS) {
        waitAndRetryDuel(actionContainer, result.retryAfter || DEFAULT_RETRY_SECONDS, () => {
            if (generation === searchGeneration && player.isConnected) {
                checkDuel(player, playerData, server, generation, attempt + 1);
            }
        });
        return;
    }

    const duelButton = document.createElement('button');
    duelButton.type = 'button';
    duelButton.className = 'duel-button';
    try {
        processFindGamesResult(result, duelButton, player2Name, player, playerData, server);
    } catch (error) {
        // On error, show red exclamation and continue
        handleTimeoutOrFailedRetrieval(null, duelButton);
    }
    actionContainer.appendChild(duelButton);
}

// Rate limited: a small countdown where the versus button goes, then the check runs again by itself
let rateLimitNoticeShown = false;
function waitAndRetryDuel(actionContainer, seconds, retry) {
    const badge = document.createElement('span');
    badge.className = 'duel-wait';
    badge.setAttribute('role', 'status');
    actionContainer.appendChild(badge);
    countdown(seconds, left => {
        badge.textContent = `${left}s`;
        badge.title = `Riot is rate-limiting requests: checking your games against this player again in ${left}s`;
    }).then(() => {
        badge.remove();
        retry();
    });
    if (!rateLimitNoticeShown) {
        rateLimitNoticeShown = true;
        showNotification('Riot is busy right now: versus checks will retry by themselves.');
        setTimeout(() => { rateLimitNoticeShown = false; }, 60000);
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
        result.status !== undefined || // backend returned an HTTP error (404, 429, etc.)
        (result.FAILED_RETRIEVAL.length > 0 && commonGamesCount(result) === 0)
    );
}

// Games found together: saved already, just downloaded, or still downloading in the background
function commonGamesCount(result) {
    return result.SUCCESSFUL_RETRIEVAL.length + result.ALREADY_ON_DB.length + (result.PENDING_RETRIEVAL || []).length;
}

function isEmptySuccessAndDB(result) {
    return commonGamesCount(result) === 0;
}

// Crossed swords (Lucide's "swords", ISC) and an alert mark, drawn in currentColor like the site's other icons
const SWORDS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>';
const ALERT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" x2="12" y1="7.5" y2="13"/><line x1="12" x2="12.01" y1="16.5" y2="16.5"/></svg>';

function handleTimeoutOrFailedRetrieval(result, duelButton) {
    duelButton.disabled = true;
    duelButton.classList.add('is-error');
    duelButton.innerHTML = ALERT_ICON;
    if (result && result.status === 429) {
        duelButton.title = 'Too many requests, try again later';
    } else if (!result || result === "timeout") {
        duelButton.title = 'Error retrieving old games data';
    } else {
        duelButton.title = 'Failed to retrieve game data';
    }
    duelButton.setAttribute('aria-label', duelButton.title);
}

function handleEmptySuccessAndDB(duelButton) {
    duelButton.disabled = true;
    duelButton.classList.add('is-new');
    duelButton.innerHTML = SWORDS_ICON;
    duelButton.title = 'First time playing against this player';
    duelButton.setAttribute('aria-label', duelButton.title);
}

function handleSuccessfulResult(result, duelButton, player2Name, player, playerData, server) {
    // Update cache with the duel data.
    const duelData = duelsCache.get(player2Name) || {};
    duelData.findGames = result;
    duelsCache.set(player2Name, duelData);
    // the swords and how many games you've shared (still downloading ones included)
    const games = commonGamesCount(result);
    duelButton.innerHTML = `${SWORDS_ICON}<span>${games}</span>`;
    duelButton.title = `${games} ${games === 1 ? 'game' : 'games'} together: open your versus history`;
    duelButton.setAttribute('aria-label', duelButton.title);
    duelButton.addEventListener('click', (e) => {
        e.stopPropagation();
        openGlance(duelButton, playerData.name, player2Name, player.getAttribute('data-color'), server);
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

            // Set the player's name (tag dimmed; textContent stays the full Riot ID) and move it into the container
            const [gameName, tagLine] = (participant.riotId || '').split('#');
            playerNameElement.textContent = gameName;
            if (tagLine) {
                const tag = document.createElement('span');
                tag.className = 'riot-tag';
                tag.textContent = '#' + tagLine;
                playerNameElement.appendChild(tag);
            }
            participantInfoContainer.appendChild(playerNameElement);

            // Create the mini rank div and add it to the container
            const miniRankDiv = createAndInsertPlayerRankDiv(participant.tier, participant.rank, participant.league_points);
            participantInfoContainer.appendChild(miniRankDiv);

            // Insert the container at the end of the player element
            const playerEl = playerElements[index];
            playerEl.insertBefore(participantInfoContainer, playerEl.querySelector('.player-items'));
            playerEl.title = participant.riotId;
            setPlayerAvatar(playerEl, participant.profileIconId);

            duelsCache.set(participant.riotId, initializeDuelCacheObject(participant.riotId));
            }
        }
    });
}


export function createAndInsertPlayerRankDiv(tier, playerRank, lp, numberOfGames = 0) {
    const rankDiv = document.createElement('div');
    rankDiv.classList.add('mini-rank-div');

    // Create a container for the icon and first rank text
    const iconAndRankDiv = document.createElement('div');
    iconAndRankDiv.classList.add('mini-rank-icon-text');

    const miniRankSvg = getMiniRankIconUrl(tier);
    const miniRankImg = document.createElement('img');
    miniRankImg.src = miniRankSvg;
    miniRankImg.classList.add('mini-rank-img');
    miniRankImg.title = tier;

    let rank = '';
    if (tier !== 'CHALLENGER' && tier !== 'MASTER' && tier !== 'GRANDMASTER' && tier !== 'UNRANKED') {
        rank = playerRank;
    }

    const rankText = document.createElement('span');
    rankText.textContent = rank;
    rankText.classList.add('mini-rank-text'); // first mini-rank-text

    iconAndRankDiv.append(miniRankImg, rankText);

    const lpText = document.createElement('span');
    if (tier !== null && tier !== 'UNRANKED') {
        lpText.textContent = lp + ' LP';
    }

    if (numberOfGames > 0) {
        lpText.textContent += ` (${numberOfGames} Games)`;
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