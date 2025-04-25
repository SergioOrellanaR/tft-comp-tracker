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

function createLegendTextNode(playerWins, winner) {
    const span = document.createElement('span');
    span.className = 'legend-text';
    const text = playerWins === 1 ? `${playerWins} duel won` : `${playerWins} duels won`;
    span.textContent = winner ? `🏆 ${text} 🏆` : text;
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
    player1Legend.appendChild(createLegendTextNode(player1Wins, player1Wins > player2Wins));

    // Configure player2Legend: text then square.
    player2Legend.appendChild(createLegendTextNode(player2Wins, player2Wins > player1Wins));
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
                            return `${percentage}% duel winrate`;
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
        leftWidth = (6 * data1) + '%';
        rightWidth = (6 * data2) + '%';
    }

    // Left rectangle (player 1)
    const leftRect = document.createElement('div');
    leftRect.style.backgroundColor = player1Color;
    leftRect.style.width = leftWidth;
    leftRect.classList.add('duel-stat-rect');
    leftRect.title = text.toUpperCase() + ': ' + data1;  // Tooltip for leftRect

    // Right rectangle (player 2)
    const rightRect = document.createElement('div');
    rightRect.style.backgroundColor = player2Color;
    rightRect.style.width = rightWidth;
    rightRect.classList.add('duel-stat-rect');
    rightRect.title = text.toUpperCase() + ': ' + data2;;  // Tooltip for rightRect

    // Main container with flex layout, ensuring all items are aligned.
    const div = document.createElement('div');
    div.classList.add('duel-stat-div');
    div.appendChild(createLeftWrapper(leftRect, data1));
    div.appendChild(createCenterContainer(text, icon));
    div.appendChild(createRightWrapper(rightRect, data2));

    return div;
}

// New helper methods
function createLeftWrapper(rect, value) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('duel-stat-left-wrapper');
    wrapper.appendChild(rect);
    const valueElem = document.createElement('span');
    valueElem.textContent = value;
    valueElem.classList.add('duel-stat-number', 'duel-stat-number-left');
    wrapper.appendChild(valueElem);
    return wrapper;
}

function createCenterContainer(text, icon) {
    const container = document.createElement('div');
    container.classList.add('duel-stat-center-container');
    container.title = text;
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon ? icon : "";
    iconSpan.classList.add('duel-stat-icon');
    container.appendChild(iconSpan);
    return container;
}

function createRightWrapper(rect, value) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('duel-stat-right-wrapper');
    const valueElem = document.createElement('span');
    valueElem.textContent = value;
    valueElem.classList.add('duel-stat-number', 'duel-stat-number-right');
    wrapper.appendChild(valueElem);
    wrapper.appendChild(rect);
    return wrapper;
}

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

/* ============================================================================
    Start of match history
============================================================================ */

function createHistoryModal(playerData, duelsCache, player2Name, player2Color, server) {
    const historyModal = document.createElement('div');
    historyModal.id = 'historyModal';

    // Implementa la lógica de cache
    const cachedData = duelsCache.get(player2Name) || {};
    const commonMatchesCached = cachedData.commonMatches || null;

    historyModal.innerHTML = '<h2>History</h2>';
    if (commonMatchesCached) {
        const matchesContainer = buildMatchesContainer(commonMatchesCached.match_list);
        historyModal.appendChild(matchesContainer);
    } else {
        historyModal.appendChild(createLoadingSpinner("Loading common matches"));
        fetchCommonMatches(playerData.name, player2Name, server)
            .then(matchesData => {
                const duelData = duelsCache.get(player2Name) || {};
                duelData.commonMatches = matchesData;
                duelsCache.set(player2Name, duelData);

                historyModal.innerHTML = '<h2>History</h2>';
                const matchesContainer = buildMatchesContainer(matchesData.match_list);
                historyModal.appendChild(matchesContainer);
            })
            .catch(error => {
                historyModal.innerHTML = '<h2>History</h2><p>Error loading common matches.</p>';
                console.error("Error in fetchCommonMatches:", error);
            });
    }
    return historyModal;
}

//A cada match-content agregale 3 divs 
const buildMatchesContainer = (matches) => {
    const matchesContainer = document.createElement('div');
    matchesContainer.className = 'matches-container';
    matches.forEach(match => {
        const player1Placement = match.player1_game_details.placement;
        const player2Placement = match.player2_game_details.placement;
        // Create a div for the match stats.
        const matchDiv = document.createElement('div');
        matchDiv.className = 'match-content';

        // Append the match stats div.
        matchDiv.appendChild(createMatchStats(match));

        // Create a wrapper for player1 and player2 details.
        const playersWrapper = document.createElement('div');
        playersWrapper.className = 'match-player-details-wrapper';
        playersWrapper.appendChild(createMatchPlayer1Detail(match.player1_game_details, player1Placement < player2Placement));
        playersWrapper.appendChild(createMatchPlayer2Detail(match.player2_game_details, player2Placement < player1Placement));

        matchDiv.appendChild(playersWrapper);
        matchesContainer.appendChild(matchDiv);
    });
    return matchesContainer;
};

const createMatchStats = (matchStats) => {
    const statsDiv = document.createElement('div');
    statsDiv.className = 'match-stats-detail';
    // Customize how you want to display the match stats.
    statsDiv.innerHTML = `<pre>${JSON.stringify(matchStats)}</pre>`;
    return statsDiv;
};

const createColorBar = (side, isWinner) => {
    const colorBar = document.createElement('div');
    colorBar.style.display = 'inline-block';
    colorBar.style.width = '10px';
    colorBar.style.height = '100%';
    // Use margin on the correct side depending on which player detail is being created.
    if (side === 'left') {
        colorBar.style.marginRight = '5px';
    } else if (side === 'right') {
        colorBar.style.marginLeft = '5px';
    }
    colorBar.style.backgroundColor = isWinner ? 'green' : 'red';
    return colorBar;
};

const createMatchPlayer1Detail = (playerDetails, isWinner) => {
    const player1Div = document.createElement('div');
    player1Div.className = 'match-player1-detail';

    // Append the color bar (on the left side).
    player1Div.appendChild(createColorBar('left', isWinner));

    // Append the player details.
    const detailsPre = document.createElement('pre');
    detailsPre.textContent = JSON.stringify(playerDetails, null, 2);
    player1Div.appendChild(detailsPre);

    return player1Div;
};

const createMatchPlayer2Detail = (playerDetails, isWinner) => {
    const player2Div = document.createElement('div');
    player2Div.className = 'match-player2-detail';

    // Append the player details first.
    const detailsPre = document.createElement('pre');
    detailsPre.textContent = JSON.stringify(playerDetails, null, 2);
    player2Div.appendChild(detailsPre);

    // Append the color bar (on the right side).
    player2Div.appendChild(createColorBar('right', isWinner));

    return player2Div;
};
