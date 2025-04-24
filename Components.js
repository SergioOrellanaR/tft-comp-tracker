import { CDragonBaseUrl, getProfileIconUrl, getRankIconUrl, fetchFindGames, fetchDuelStats, fetchCommonMatches, fetchPlayerSummary } from './tftVersusHandler.js';
import { CDRAGON_URL, CONFIG } from './config.js';

// Función para crear un spinner de carga
export function createLoadingSpinner(text = null, longWaitMessage = null) {
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.innerHTML = `<div></div>`;
    if (text) {
        const textElem = document.createElement('p');
        textElem.className = 'spinner-text';
        textElem.appendChild(document.createTextNode(text + ' '));
        // Agregamos 3 puntos animados con un espacio entre cada uno sin afectar la animación.
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.className = 'animated-dot';
            dot.textContent = '.';
            dot.style.animationDelay = `${i * 0.3}s`;
            textElem.appendChild(dot);
            // Agrega un TextNode con un espacio después del span para preservar la animación.
            textElem.appendChild(document.createTextNode(' '));
        }
        spinner.appendChild(textElem);
    }
    if (longWaitMessage) {
        setTimeout(() => {
            // Verifica si el spinner-text aún existe antes de agregar el mensaje
            if (spinner.querySelector('.spinner-text')) {
                const longWaitElem = document.createElement('p');
                longWaitElem.className = 'spinner-long-wait';
                longWaitElem.textContent = longWaitMessage;
                spinner.appendChild(longWaitElem);
            }
        }, 10000);
    }
    return spinner;
}

//PLAYER CARD COMPONENTS
const loadMainCompanion = async (playerData, container) => {
    try {
        const response = await fetch(CDRAGON_URL.companionData);
        if (!response.ok) throw new Error('Error fetching companion data');
        const companionData = await response.json();
        const myCompanion = companionData.find(item => item.contentId === playerData.companion.content_id);
        if (!myCompanion) {
            console.warn('No se encontró companion con content_id:', playerData.companion.content_id);
            return;
        }
        const imgUrl = CDragonBaseUrl(myCompanion.loadoutsIcon);
        // Se encapsula la asignación de estilos en una función auxiliar
        applyBackgroundStyles(container, imgUrl);
    } catch (error) {
        console.error('Error en companion fetch:', error);
    }
};

const applyBackgroundStyles = (container, imgUrl) => {
    Object.assign(container.style, {
        backgroundImage: `url(${imgUrl})`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
    });
};

export const createPlayerCard = async (playerData, server, containerId) => {
    try {
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            // All player cards use the same class for consistent styling.
            container.className = 'player-data-container';
            const msgContainer = document.getElementById('messageContainer');
            if (msgContainer) {
                msgContainer.insertAdjacentElement('afterend', container);
            } else {
                console.error('messageContainer not found in the DOM.');
                return;
            }
        }
        loadMainCompanion(playerData, container);
        const ladderNumber = playerData.rank_info.ladder_id > 3 ? playerData.rank_info.rank : '';

        container.innerHTML = `
            <div class="player-details-data-container">
                <div class="profile-icon-data-container">
                    <img src="${getProfileIconUrl(playerData)}" alt="${playerData.profile_icon_id} profile icon">
                </div>
                <div class="player-name-data-container">${playerData.name}</div>
                <div class="player-server-data-container">${server}</div>
            </div>
            <div class="rank-data-container">
                <div class="rank-icon-data-container">
                    <img src="${getRankIconUrl(playerData)}" alt="${playerData.rank_info.tier} rank icon">
                </div>
                <div class="rank-info-data-container">
                    ${playerData.rank_info.tier} ${ladderNumber} ${playerData.rank_info.lp === null ? '' : playerData.rank_info.lp + 'LP'}
                </div>
            </div>
        `;
        return container; // Returning the created card
    } catch (error) {
        console.error('Error al crear la tarjeta de jugador:', error);
    }
};


// POP UP COMPONENTS
export function openDuelModal(playerData, duelsCache, player2Name, player2Color, server) {
    console.log(duelsCache);    // Creates the overlay if it doesn't exist.
    const overlay = document.createElement('div');
    overlay.id = 'popupOverlay';
    document.body.appendChild(overlay);

    // Add spinner centered within the overlay
    const spinner = createLoadingSpinner('Retrieving old games information', 'Both players share a lot of common matches, please wait...');
    spinner.style.position = 'absolute';
    spinner.style.top = '50%';
    spinner.style.left = '50%';
    spinner.style.transform = 'translate(-50%, -50%)';
    overlay.appendChild(spinner);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'popupCloseButton';
    closeBtn.innerText = 'X';
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    overlay.appendChild(closeBtn);

    // Call fetchFindGames and handle its Promise
    fetchFindGames(playerData.name, player2Name, server)
        .then(result => {
            const duelData = duelsCache.get(player2Name);
            duelData.findGames = result;
            duelsCache.set(player2Name, duelData);
            overlay.removeChild(spinner);
            overlay.appendChild(createHeaderModal(playerData, duelsCache, player2Name, player2Color, server));
            overlay.appendChild(createHistoryModal(playerData, duelsCache, player2Name, player2Color, server));
        })
        .catch(error => {
            console.error("Error fetching games:", error);
            overlay.removeChild(spinner);
            const errorElem = document.createElement('p');
            errorElem.textContent = "Error loading duel information.";
            errorElem.style.textAlign = 'center';
            overlay.appendChild(errorElem);
        });
}

//HEADER MODAL COMPONENTS
function createHeaderModal(playerData, duelsCache, player2Name, player2Color, server) {
    const headerModal = document.createElement('div');
    headerModal.id = 'headerModal';

    // Retrieve cached data; if none exists, set defaults.
    const cachedData = duelsCache.get(player2Name) || {};
    const player2Data = cachedData.header !== undefined ? cachedData.header : null;
    const statsCached = cachedData.stats !== undefined ? cachedData.stats : null;

    // If both header and stats are present in cache, use them.
    if (player2Data && statsCached) {
        headerModal.innerHTML = '';
        headerModal.appendChild(createHeaderModalPlayer(playerData, CONFIG.mainPlayerColor, server));
        headerModal.appendChild(createHeaderModalStats(playerData.name, player2Name, statsCached, CONFIG.mainPlayerColor, player2Color));
        headerModal.appendChild(createHeaderModalPlayer(player2Data, player2Color, server));
    } else {
        // Display spinner while loading missing data.
        headerModal.innerHTML = '';
        const spinner = createLoadingSpinner("Loading duel stats");
        headerModal.appendChild(spinner);

        // Prepare promises: use cached values if present, otherwise fetch.
        const headerPromise = player2Data ? Promise.resolve(player2Data) : fetchPlayerSummary(player2Name, server);
        const statsPromise = statsCached ? Promise.resolve(statsCached) : fetchDuelStats(playerData.name, player2Name, server);

        Promise.all([headerPromise, statsPromise])
            .then(([headerData, statsData]) => {
                // Update cache with the obtained data.
                duelsCache.set(player2Name, { header: headerData, stats: statsData });
                headerModal.innerHTML = ''; // Clear spinner
                headerModal.appendChild(createHeaderModalPlayer(playerData, CONFIG.mainPlayerColor, server));
                headerModal.appendChild(createHeaderModalStats(playerData.name, player2Name, statsData, CONFIG.mainPlayerColor, player2Color));
                headerModal.appendChild(createHeaderModalPlayer(headerData, player2Color, server));
            })
            .catch(error => {
                console.error("Error loading header modal:", error);
                headerModal.innerHTML = '<p>Error loading duel information.</p>';
            });
    }

    return headerModal;
}

// Update createHeaderModalPlayer to include createPlayerCard
function createHeaderModalPlayer(data, color, server) {
    const element = document.createElement('div');
    element.classList.add('playerHeaderModal');
    if (typeof data === 'object' && data !== null) {
        element.id = `player_${data.id || data.name || 'unknown'}`;
        // Append the player card inside element
        createPlayerCard(data, server, 'player-card-' + data.name).then(card => {
            element.appendChild(card);
        });
    } else {
        element.id = data;
        element.innerHTML = `<p>${data}</p>`;
    }

    if (color) {
        element.style.color = color;
    }
    return element;
}

/*
{
    "winner_player_number": 2,
    "winner_name": "NyobZoo#NA1",
    "duel_winrate_percentage": 100.0,
    "duel_contested_percentage": 0.0,
    "player1_duel_stats": {
        "won": 0,
        "damage_to_players": 33,
        "players_eliminated": 0,
        "average_position": 7.0
    },
    "player2_duel_stats": {
        "won": 1,
        "damage_to_players": 229,
        "players_eliminated": 4,
        "average_position": 1.0
    }
}
*/
function createHeaderModalStats(player1Name, player2Name, statsData, player1Color, player2Color) {
    const statsContainer = document.createElement('div');
    statsContainer.id = 'headerModalStatsContent';

    // Extract wins for player1 and player2.
    const player1Wins = statsData.player1_duel_stats && typeof statsData.player1_duel_stats.won === 'number'
        ? statsData.player1_duel_stats.won
        : 0;
    const player2Wins = statsData.player2_duel_stats && typeof statsData.player2_duel_stats.won === 'number'
        ? statsData.player2_duel_stats.won
        : 0;

    // Container for the donut graph.
    const donutContainer = document.createElement('div');
    donutContainer.id = 'donutContainer';

    // Create canvas element for Chart.js.
    const canvas = document.createElement('canvas');
    canvas.id = 'donutChart';
    donutContainer.appendChild(canvas);
    statsContainer.appendChild(donutContainer);

    // Calculate a rotation so that player1's segment is centered on the left.
    const totalWins = player1Wins + player2Wins;
    let rotation = 0; // default rotation if no wins recorded
    if (totalWins > 0) {
        const anglePlayer1 = (player1Wins / totalWins) * 2 * Math.PI;
        rotation = Math.PI - anglePlayer1 / 2;
    }

    // Delegate all donut chart logic to another method.
    initializeDonutChart(canvas, player1Name, player2Name, player1Wins, player2Wins, player1Color, player2Color, rotation);

    return statsContainer;
}

function initializeDonutChart(canvas, player1Name, player2Name, player1Wins, player2Wins, player1Color, player2Color, rotation) {
    const startChart = () => {
        renderDonutChart(canvas, player1Name, player2Name, player1Wins, player2Wins, player1Color, player2Color, rotation);
    };

    if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js';
        script.onload = startChart;
        script.onerror = () => {
            const donutContainer = canvas.parentElement;
            donutContainer.innerHTML = '<p>Error loading Chart.js.</p>';
        };
        document.head.appendChild(script);
    } else {
        startChart();
    }
}

function renderDonutChart(canvas, player1Name, player2Name, player1Wins, player2Wins, player1Color, player2Color, rotation) {    
    new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: [player1Name, player2Name],
            datasets: [{
                data: [player1Wins, player2Wins],
                backgroundColor: [player1Color, player2Color]
            }]
        },
        options: {
            rotation: rotation,
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        align: "center",
                        padding: 20,
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

// GAME HISTORY COMPONENTS
function createHistoryModal(playerData, duelsCache, player2Name, player2Color, server) {
    const historyModal = document.createElement('div');
    historyModal.id = 'historyModal';

    // Implement cache logic similar to createHeaderModal
    const cachedData = duelsCache.get(player2Name) || {};
    const commonMatchesCached = cachedData.commonMatches || null;

    if (commonMatchesCached) {
        historyModal.innerHTML = '<h2>History</h2>';
        const matchesContainer = document.createElement('div');
        matchesContainer.className = 'matches-container';
        commonMatchesCached.match_list.forEach(match => {
            const matchDiv = document.createElement('div');
            matchDiv.className = 'match-item';
            matchDiv.innerHTML = `<pre>${JSON.stringify(match)}</pre>`;
            matchesContainer.appendChild(matchDiv);
        });
        historyModal.appendChild(matchesContainer);
    } else {
        historyModal.appendChild(createLoadingSpinner("Loading common matches"));
        fetchCommonMatches(playerData.name, player2Name, server)
            .then(matchesData => {
                const duelData = duelsCache.get(player2Name) || {};
                duelData.commonMatches = matchesData;
                duelsCache.set(player2Name, duelData);
                
                historyModal.innerHTML = '<h2>History</h2>';
                const matchesContainer = document.createElement('div');
                matchesContainer.className = 'matches-container';
                matchesData.match_list.forEach(match => {
                    const matchDiv = document.createElement('div');
                    matchDiv.className = 'match-item';
                    matchDiv.innerHTML = `<pre>${JSON.stringify(match)}</pre>`;
                    matchesContainer.appendChild(matchDiv);
                });
                historyModal.appendChild(matchesContainer);
            })
            .catch(error => {
                historyModal.innerHTML = '<h2>History</h2><p>Error loading common matches.</p>';
                console.error("Error in fetchCommonMatches:", error);
            });
    }

    return historyModal;
}