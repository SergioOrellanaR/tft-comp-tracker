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

function createDivHelper(id, setPlaceHolder = false) {
    const div = document.createElement('div');
    div.id = id;
    if (setPlaceHolder) {
        div.textContent = `Placeholder for ${id}`;
    }
    return div;
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
            overlay.appendChild(createTitleModal());
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

function createTitleModal() {
    const titleDiv = document.createElement('div');
    titleDiv.className = 'modal-title';
    titleDiv.textContent = 'Common games stats';
    return titleDiv;
}

// Common method to create a colored square for legends.
function createPlayerColorBox(color) {
    const colorBox = document.createElement('span');
    colorBox.classList.add('player-color-box'); // Adding a uniform class for all color boxes.
    colorBox.style.backgroundColor = color;
    return colorBox;
}

function createLegendTextNode(playerWins) {
    const span = document.createElement('span');
    span.className = 'legend-text';
    span.textContent = `${playerWins} better placements`;
    return span;
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
        // Append the player card inside a wrapper div
        createPlayerCard(data, server, 'player-card-' + data.name).then(card => {
            const wrapper = document.createElement('div');
            wrapper.className = 'player-card-wrapper';
            wrapper.appendChild(card);
            element.appendChild(wrapper);
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
    console.log('Params: ', player1Name, player2Name, statsData, player1Color, player2Color);

    const statsContainer = document.createElement('div');
    statsContainer.id = 'headerModalStatsContent';

    // Extract wins for player1 and player2.
    const player1Wins = statsData.player1_duel_stats && typeof statsData.player1_duel_stats.won === 'number'
        ? statsData.player1_duel_stats.won
        : 0;
    const player2Wins = statsData.player2_duel_stats && typeof statsData.player2_duel_stats.won === 'number'
        ? statsData.player2_duel_stats.won
        : 0;

    // Check if both players haven't played any games.
    if (player1Wins === 0 && player2Wins === 0) {
        statsContainer.innerHTML = '<p style="text-align:center;">Both players have not played any game.</p>';
        return statsContainer;
    }

    // Container for the donut graph.
    createCharts(statsContainer, player1Wins, player2Wins, player1Color, player2Color, statsData);

    return statsContainer;


}

function createCharts(statsContainer, player1Wins, player2Wins, player1Color, player2Color, statsData) {
    const donutContainer = createDivHelper('donutContainer');

    // Create three divs inside donutContainer: player1Legend, canvas container, and player2Legend
    const player1Legend = createDivHelper('player1Legend');
    const canvasContainer = createDivHelper('canvasContainer');
    const player2Legend = createDivHelper('player2Legend');
    const duelStatsContainer = createDivHelper('duelStatsContainer');

    // Configure player1Legend: square then text.
    player1Legend.appendChild(createPlayerColorBox(player1Color));
    player1Legend.appendChild(createLegendTextNode(player1Wins));

    // Configure player2Legend: text then square.
    player2Legend.appendChild(createLegendTextNode(player2Wins));
    player2Legend.appendChild(createPlayerColorBox(player2Color));

    // Create canvas element and append it to canvasContainer
    const canvas = document.createElement('canvas');
    canvas.id = 'donutChart';
    canvasContainer.appendChild(canvas);

    // Append the three divs in order to donutContainer
    donutContainer.appendChild(player1Legend);
    donutContainer.appendChild(canvasContainer);
    donutContainer.appendChild(player2Legend);
    statsContainer.appendChild(donutContainer);
    statsContainer.appendChild(duelStatsContainer);

    // Delegate all donut chart logic to another method.
    initializeDonutChart(canvas, player1Wins, player2Wins, player1Color, player2Color);
    initializeDuelStatsGraph(player1Color, player2Color, statsData, duelStatsContainer);
}

// Method that creates a div styled with a gradient using the two colors and displays data.
function createDuelStatDiv(player1Color, player2Color, data1, data2, text, icon = null) {
    const div = document.createElement('div');
    div.classList.add('duel-stat-div'); // Assigning a uniform class to the div
    div.textContent = `${text}: ${data1} / ${data2}`;
    return div;
}

function createContestedDiv(percentage, text) {
    // Format the percentage to 1 decimal place (remove .0 if integer)
    const rounded = Math.round(percentage * 10) / 10;
    const displayPercentage = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);

    // Create the main container for the contested KPI display.
    const container = document.createElement('div');
    container.classList.add('duel-contested-div');
    container.style.textAlign = 'center';
    container.style.padding = '8px';
    container.style.borderRadius = '8px'; // Slightly more rounded corners for a nicer look.
    container.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';

    // Add tooltip explanation on mouse hover.
    container.title = 'Percentage of units that both players shared on their games.';

    // Create and append the label with refined text.
    const label = document.createElement('div');
    label.textContent = `${text.toLowerCase()}: ${displayPercentage}%`;
    label.style.fontSize = '14px';
    label.style.fontWeight = '500';
    label.style.marginBottom = '4px';
    container.appendChild(label);

    // Determine the rectangle color based on the KPI thresholds.
    let color;
    if (percentage <= 50) {
        color = '#4caf50'; // Green for 50% and below.
    } else if (percentage <= 80) {
        color = '#ffc107'; // Yellow for 51% - 80%.
    } else {
        color = '#f44336'; // Red for 80% - 100%.
    }

    // Create the rectangle element that visualizes the percentage.
    const rectangle = document.createElement('div');
    rectangle.style.width = (percentage === 0 ? 1 : percentage) + '%';
    rectangle.style.height = '20px';
    rectangle.style.backgroundColor = color;
    rectangle.style.borderRadius = '4px';
    rectangle.style.margin = '0 auto';

    container.appendChild(rectangle);
    return container;
}

function initializeDuelStatsGraph(player1Color, player2Color, statsData, duelStatsContainer) {
    console.log(statsData);
    const player1DuelStats = statsData.player1_duel_stats;
    const player2DuelStats = statsData.player2_duel_stats;

    const contestedDiv = createContestedDiv(statsData.duel_contested_percentage, 'Contested Percentage');
    const statDiv1 = createDuelStatDiv(player1Color, player2Color, player1DuelStats.damage_to_players, player2DuelStats.damage_to_players, 'Damage to Players');
    const statDiv2 = createDuelStatDiv(player1Color, player2Color, player1DuelStats.players_eliminated, player2DuelStats.players_eliminated, 'Players Eliminated');
    const statDiv3 = createDuelStatDiv(player1Color, player2Color, player1DuelStats.average_position, player2DuelStats.average_position, 'Average Position');

    // Create a wrapper div for the statsDiv elements (excluding contestedDiv)
    const statsWrapper = document.createElement('div');
    statsWrapper.className = 'stats-wrapper';
    statsWrapper.appendChild(statDiv1);
    statsWrapper.appendChild(statDiv2);
    statsWrapper.appendChild(statDiv3);

    duelStatsContainer.appendChild(contestedDiv);
    duelStatsContainer.appendChild(statsWrapper);
}

function initializeDonutChart(canvas, player1Wins, player2Wins, player1Color, player2Color) {
    const startChart = () => {
        renderDonutChart(canvas, player1Wins, player2Wins, player1Color, player2Color);
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

function renderDonutChart(canvas, player1Wins, player2Wins, player1Color, player2Color) {
    console.log('Rendering donut chart...');
    new Chart(canvas, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [player1Wins, player2Wins],
                backgroundColor: [player1Color, player2Color],
                borderColor: '#000',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rotation: 180,
            cutout: '75%',
            animations: {
                animateRotate: true
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
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