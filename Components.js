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
    span.textContent = playerWins === 1
        ? `outplaced opponent in ${playerWins} game`
        : `outplaced opponent in ${playerWins} games`;
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

    const total = player1Wins + player2Wins;

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
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed;
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${percentage}%`;
                        }
                    }
                }
            }
        }
    });
}

function initializeDuelStatsGraph(player1Color, player2Color, statsData, duelStatsContainer) {
    console.log(statsData);
    const player1DuelStats = statsData.player1_duel_stats;
    const player2DuelStats = statsData.player2_duel_stats;

    const contestedDiv = createContestedDiv(statsData.duel_contested_percentage, 'Contested');
    // Pass icon strings: sword for damage, skull for players eliminated, podium for average position.
    const statDiv1 = createDuelStatDiv(
        player1Color,
        player2Color,
        player1DuelStats.damage_to_players,
        player2DuelStats.damage_to_players,
        'Damage to Players',
        '⚔'
    );
    const statDiv2 = createDuelStatDiv(
        player1Color,
        player2Color,
        player1DuelStats.players_eliminated,
        player2DuelStats.players_eliminated,
        'Players Eliminated',
        '💀'
    );
    const statDiv3 = createDuelStatDiv(
        player1Color,
        player2Color,
        player1DuelStats.average_position,
        player2DuelStats.average_position,
        'Average Position',
        '🥇'
    );

    // Create a wrapper div for the statsDiv elements (excluding contestedDiv)
    const statsWrapper = document.createElement('div');
    statsWrapper.className = 'stats-wrapper';
    statsWrapper.appendChild(statDiv1);
    statsWrapper.appendChild(statDiv2);
    statsWrapper.appendChild(statDiv3);

    duelStatsContainer.appendChild(contestedDiv);
    duelStatsContainer.appendChild(statsWrapper);
}


function createDuelStatDiv(player1Color, player2Color, data1, data2, text, icon = null) {
    let total = null;
    // Calculate total for applicable stats
    if (text === 'Damage to Players' || text === 'Players Eliminated') {
        total = data1 + data2;
    }

    // Determine widths for left and right rectangles
    let leftWidth, rightWidth;
    if (total !== null && total > 0) {
        // Compute percentage widths based on data ratio
        leftWidth = (data1 / total) * 100 + '%';
        rightWidth = (data2 / total) * 100 + '%';
    } else {
        // Use fixed widths mapping for non-percentage stats.
        leftWidth = (9 - data1) * 10 + 'px';
        rightWidth = (9 - data2) * 10 + 'px';
    }

    // Left rectangle (player 1)
    const leftRect = document.createElement('div');
    leftRect.style.backgroundColor = player1Color;
    leftRect.style.height = '20px';
    leftRect.style.width = leftWidth;
    leftRect.style.minWidth = '10px';
    leftRect.style.transition = 'width 0.3s';
    leftRect.classList.add('duel-stat-rect');

    // Right rectangle (player 2)
    const rightRect = document.createElement('div');
    rightRect.style.backgroundColor = player2Color;
    rightRect.style.height = '20px';
    rightRect.style.width = rightWidth;
    rightRect.style.minWidth = '10px';
    rightRect.style.transition = 'width 0.3s';
    rightRect.classList.add('duel-stat-rect');

    // Create wrapper for left side (rectangle + value)
    const leftWrapper = document.createElement('div');
    leftWrapper.style.display = 'flex';
    leftWrapper.style.alignItems = 'center';
    leftWrapper.style.justifyContent = 'flex-start';
    leftWrapper.style.flex = '1';
    leftWrapper.appendChild(leftRect);
    const leftValue = document.createElement('span');
    leftValue.textContent = data1;
    leftValue.style.marginLeft = '5px';
    leftValue.style.textAlign = 'left';
    leftValue.classList.add('duel-stat-number');
    leftWrapper.appendChild(leftValue);

    // Create wrapper for right side (value + rectangle)
    const rightWrapper = document.createElement('div');
    rightWrapper.style.display = 'flex';
    rightWrapper.style.alignItems = 'center';
    rightWrapper.style.justifyContent = 'flex-end';
    rightWrapper.style.flex = '1';
    const rightValue = document.createElement('span');
    rightValue.textContent = data2;
    rightValue.style.marginRight = '5px';
    rightValue.style.textAlign = 'right';
    rightValue.classList.add('duel-stat-number');
    rightWrapper.appendChild(rightValue);
    rightWrapper.appendChild(rightRect);

    // Center container for the icon; tooltip shows full text.
    const centerContainer = document.createElement('div');
    centerContainer.style.display = 'flex';
    centerContainer.style.alignItems = 'center';
    centerContainer.style.justifyContent = 'center';
    centerContainer.style.margin = '0 10px';
    centerContainer.style.whiteSpace = 'nowrap';
    centerContainer.title = text;
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon ? icon : "";
    iconSpan.style.cursor = 'pointer';
    iconSpan.classList.add('duel-stat-icon');
    centerContainer.appendChild(iconSpan);

    // Main container with flex layout, ensuring all items are aligned.
    const div = document.createElement('div');
    div.classList.add('duel-stat-div');
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'space-between';

    // Append wrappers and center container
    div.appendChild(leftWrapper);
    div.appendChild(centerContainer);
    div.appendChild(rightWrapper);

    return div;
}

function createContestedDiv(percentage, text) {
    const rounded = Math.round(percentage * 10) / 10;
    const displayPercentage = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
    const container = document.createElement('div');
    container.classList.add('duel-contested-div');
    container.title = 'Percentage of units that both players shared on their games.';

    const label = document.createElement('div');
    label.classList.add('duel-contested-label');
    label.textContent = `${displayPercentage}% ${text}`;
    if (percentage > 75) {
        label.textContent += ' (highly contested)';
    }
    container.appendChild(label);

    const rectangle = document.createElement('div');
    rectangle.classList.add('duel-contested-rectangle');
    rectangle.style.width = (percentage === 0 ? 1 : percentage) + '%'; // dynamic width
    let color;
    // KPIs color logic
    if (percentage <= 50) {
        color = '#4caf50';
    } else if (percentage <= 75) {
        color = '#ffc107';
    } else {
        color = '#f44336';
    }
    rectangle.style.backgroundColor = color; // dynamic color
    container.appendChild(rectangle);

    return container;
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