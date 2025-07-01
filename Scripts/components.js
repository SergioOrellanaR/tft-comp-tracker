import {
    CDragonBaseUrl,
    getProfileIconUrl,
    getRankIconUrl,
    fetchDuelStats,
    fetchCommonMatches,
    fetchPlayerSummary,
    getChampionImageUrl,
    getItemPNGImageUrl,
    getTierImageUrl,
    getTraitBackgroundUrl,
    getTFTSetImageUrl
} from './tftVersusHandler.js';
import { CDRAGON_URL, CONFIG } from './config.js';
import { getFormattedDateTime, getRelativeTime, convertToUserLocalDateTime } from './utils.js';

// Constants for stat item icons and tooltips
const ICON_GOLD = '💰';
const TOOLTIP_GOLD = 'Gold left';
const ICON_PLAYERS_ELIMINATED = '💀';
const TOOLTIP_PLAYERS_ELIMINATED = 'Players eliminated';
const ICON_DAMAGE = '⚔';
const TOOLTIP_DAMAGE = 'Total damage to players';

//PLAYER CARD COMPONENTS
// Se agrega variable de caché para companionData
let companionDataCache = null;
let traitDataCache = null;

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

// Modificación en loadMainCompanion para usar caché
const loadMainCompanion = async (playerData, container) => {
    try {
        if (!companionDataCache) {
            const response = await fetch(CDRAGON_URL.companionData);
            if (!response.ok) throw new Error('Error fetching companion data');
            companionDataCache = await response.json();
        }
        const myCompanion = companionDataCache.find(item => item.contentId === playerData.companion.content_id);
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
        statsContainer.innerHTML = '<p style="text-align:center;">Both players have not played any games against each other.</p>';
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

    // Apply border based on the winner condition
    if (player1Wins > player2Wins) {
        player1Legend.style.border = '1px solid green';
        player2Legend.style.border = '1px solid red';
    } else if (player2Wins > player1Wins) {
        player1Legend.style.border = '1px solid red';
        player2Legend.style.border = '1px solid green';
    }

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

function createTitleStatDiv(text) {
    const div = document.createElement('div');
    div.className = 'titleStatDiv';
    div.textContent = text;
    return div;
}

function initializeDuelStatsGraph(player1Color, player2Color, statsData, duelStatsContainer) {
    const player1DuelStats = statsData.player1_duel_stats;
    const player2DuelStats = statsData.player2_duel_stats;

    const contestedDiv = createContestedDiv(statsData.duel_contested_percentage, 'Contested');

    const container1 = createStatContainer(
        'Damage to Players',
        player1Color,
        player2Color,
        player1DuelStats.damage_to_players,
        player2DuelStats.damage_to_players,
        '⚔'
    );
    const container2 = createStatContainer(
        'Players Eliminated',
        player1Color,
        player2Color,
        player1DuelStats.players_eliminated,
        player2DuelStats.players_eliminated,
        '💀'
    );
    const container3 = createStatContainer(
        'Average Position',
        player1Color,
        player2Color,
        player1DuelStats.average_position,
        player2DuelStats.average_position,
        '🥇'
    );

    // Create a wrapper for the individual stat containers
    const statsWrapper = document.createElement('div');
    statsWrapper.className = 'stats-wrapper';
    statsWrapper.appendChild(container1);
    statsWrapper.appendChild(container2);
    statsWrapper.appendChild(container3);

    duelStatsContainer.appendChild(contestedDiv);
    duelStatsContainer.appendChild(statsWrapper);
}

function createStatContainer(statTitle, player1Color, player2Color, player1Stat, player2Stat, icon) {
    const container = document.createElement('div');
    container.className = 'stat-container';
    const titleDiv = createTitleStatDiv(statTitle);
    const statDiv = createDuelStatDiv(
        player1Color,
        player2Color,
        player1Stat,
        player2Stat,
        statTitle,
        icon
    );
    container.appendChild(titleDiv);
    container.appendChild(statDiv);
    return container;
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
        color = '#ff5252';
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
    const overlay = document.createElement('div');
    overlay.id = 'popupOverlay';
    document.body.appendChild(overlay);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'popupCloseButton';
    closeBtn.innerText = 'X';
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    overlay.appendChild(closeBtn);

    overlay.appendChild(createTitleModal());
    overlay.appendChild(createHeaderModal(playerData, duelsCache, player2Name, player2Color, server));
    overlay.appendChild(createHistoryModal(playerData, duelsCache, player2Name, server));
}

/* ============================================================================
    Start of match history
============================================================================ */

/*
matchesData:
{
    "current_page": 1,
    "total_pages": 2,
    "retrieval_datetime": "2025-05-09 21:22:53",
    "common_seasons": [
        14
    ],
    "match_list": [
    ]
}
 */
function createHistoryModal(playerData, duelsCache, player2Name, server) {
    const historyModal = document.createElement('div');
    historyModal.id = 'historyModal';
    historyModal.isFetching = false;
    historyModal.TFTSet = null;
    historyModal.previousTFTSet = null;

    const cached = duelsCache.get(player2Name) || {};
    let matchesState = cached.commonMatches || null;

    const render = () => {
        historyModal.innerHTML = '';
        const { current_page, total_pages, match_list } = matchesState;
        const tooFew = match_list.length < 10 && current_page < total_pages;

        if (tooFew) {
            const info = document.createElement('span');
            info.className = 'info-text';
            info.textContent = 'Both players share too many duo games';

            const btn = document.createElement('button');
            btn.textContent = 'Find More';
            btn.addEventListener('click', loadMore);

            historyModal.append(info, btn);
        } else {
            // only insert matchesContainer once we have 10+ or no more pages
            const container = buildMatchesContainer(match_list, historyModal);
            historyModal.appendChild(container);

            if (current_page < total_pages) {
                addPaginationScrollListener(
                    historyModal,
                    matchesState,
                    playerData,
                    player2Name,
                    server,
                    duelsCache
                );
            }
        }
    };

    const loadMore = async () => {
        const btn = historyModal.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Loading...';

        try {
            const nextPage = matchesState.current_page + 1;
            const more = await fetchCommonMatches(playerData.name, player2Name, server, nextPage);

            matchesState.current_page = more.current_page;
            matchesState.total_pages = more.total_pages;
            matchesState.match_list = matchesState.match_list.concat(more.match_list);

            // if still fewer than 10 and more pages, just update state
            if (matchesState.match_list.length < 10 && matchesState.current_page < matchesState.total_pages) {
                // keep button and info
                return;
            }

            // once we have 10+ or last page, re-render full container
            // clear and show all matches + infinite scroll if needed
            render();

            // update cache
            const cacheEntry = duelsCache.get(player2Name) || {};
            cacheEntry.commonMatches = matchesState;
            duelsCache.set(player2Name, cacheEntry);
        } catch (err) {
            console.error(err);
        } finally {
            if (historyModal.querySelector('button')) {
                btn.disabled = false;
                btn.textContent = 'Find More';
            }
        }
    };

    if (matchesState) {
        render();
    } else {
        const spinner = createLoadingSpinner("Loading common matches");
        historyModal.appendChild(spinner);

        fetchCommonMatches(playerData.name, player2Name, server)
            .then(data => {
                matchesState = data;
                const cacheEntry = duelsCache.get(player2Name) || {};
                cacheEntry.commonMatches = data;
                duelsCache.set(player2Name, cacheEntry);
            })
            .then(render)
            .catch(err => {
                console.error(err);
                historyModal.innerHTML = '<p>Error loading common matches.</p>';
            });
    }

    return historyModal;
}

function addPaginationScrollListener(historyModal, matchesData, playerData, player2Name, server, duelsCache) {
    function onScroll() {
        if (historyModal.scrollTop + historyModal.clientHeight >= historyModal.scrollHeight - 30) {
            if (!historyModal.isFetching) {
                console.log('Fetching more common matches...');
                historyModal.isFetching = true;
                // Create and append the spinner at the end of the historyModal.
                const spinner = createLoadingSpinner("Loading more matches");
                historyModal.appendChild(spinner);
                const nextPage = matchesData.current_page + 1;
                fetchCommonMatches(playerData.name, player2Name, server, nextPage)
                    .then(newMatchesData => {
                        console.log('New matches data fetched:', newMatchesData);
                        matchesData.current_page = newMatchesData.current_page;
                        matchesData.total_pages = newMatchesData.total_pages;
                        matchesData.match_list = matchesData.match_list.concat(newMatchesData.match_list);

                        // Update duelsCache for player2Name with the new matches data.
                        const duelData = duelsCache.get(player2Name) || {};
                        duelData.commonMatches = matchesData;
                        duelsCache.set(player2Name, duelData);

                        const newMatchesContainer = buildMatchesContainer(newMatchesData.match_list, historyModal);
                        historyModal.appendChild(newMatchesContainer);

                        // Remove the spinner once loading is done.
                        spinner.remove();
                        historyModal.isFetching = false;

                        // Remove scroll listener if current_page is equal or greater than total_pages.
                        if (matchesData.current_page >= matchesData.total_pages) {
                            historyModal.removeEventListener('scroll', onScroll);
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching more common matches:', error);
                        spinner.remove();
                        historyModal.isFetching = false;
                    });
            }
        }
    }

    if (matchesData.current_page < matchesData.total_pages) {
        historyModal.addEventListener('scroll', onScroll);
    }
}

const buildMatchesContainer = (matches, state) => {
    const matchesContainer = document.createElement('div');
    matchesContainer.className = 'matches-container';
    matches.forEach(match => {
        // Update the state.
        state.previousTFTSet = state.TFTSet;
        if (state.TFTSet === null || state.TFTSet !== match.tft_set_number) {
            state.TFTSet = match.tft_set_number;
            console.log('TFTSet changed:', state.previousTFTSet, state.TFTSet);
            // Append the set label created by the new helper method.
            matchesContainer.appendChild(createSetLabel(state.TFTSet));
        }
        const player1Placement = match.player1_game_details.placement;
        const player2Placement = match.player2_game_details.placement;
        // Create a div for the match stats.
        const matchDiv = document.createElement('div');
        matchDiv.className = 'match-content';
        // Set relative position so the absolute div is positioned against matchDiv.
        matchDiv.style.position = 'relative';
        // Append the match stats div.
        matchDiv.appendChild(createMatchStats(match));
        // Create a wrapper for player1 and player2 details.
        const playersWrapper = document.createElement('div');
        playersWrapper.className = 'match-player-details-wrapper';

        playersWrapper.appendChild(createMatchPlayer1Detail(match.player1_game_details, player1Placement < player2Placement));

        // Create the contested div using the helper method.
        const contestDiv = createContestDiv(match);
        playersWrapper.appendChild(contestDiv);

        playersWrapper.appendChild(createMatchPlayer2Detail(match.player2_game_details, player2Placement < player1Placement));

        matchDiv.appendChild(playersWrapper);
        matchesContainer.appendChild(matchDiv);
    });
    return matchesContainer;
};

function createSetLabel(tftSet) {
    const text = `Set ${tftSet}`;
    const setLabel = document.createElement('div');
    setLabel.className = 'match-set-label';
    const imageUrl = getTFTSetImageUrl(tftSet);
    if (imageUrl === null) {
        setLabel.textContent = text;
    } else {
        setLabel.innerHTML = `<img src="${imageUrl}" alt="${text}" title="${text}" style="width:165px; height:86px; object-fit:cover; border-radius:10px; border:2px solid #ccc; box-shadow:0 2px 8px rgba(0, 0, 0, 0.2);">`;
    }
    return setLabel;
}

// Helper function to create the contested div for a match.
function createContestDiv(match) {
    const contestDiv = document.createElement('div');
    contestDiv.className = 'match-contest-div';

    const percentage = match.contested_percentage;
    let color;
    if (percentage <= 50) {
        color = '#8f8';
    } else if (percentage <= 75) {
        color = '#ffc107';
    } else {
        color = '#ff5252';
    }

    contestDiv.innerHTML = `<span style="font-size:1em; color:${color};"> ${percentage}%</span><br><span style="font-size:0.6em;">Contested</span>`;
    return contestDiv;
}

const createMatchStats = (matchStats) => {
    const statsDiv = document.createElement('div');
    statsDiv.className = 'match-stats-detail';

    // matchStats.match_datetime viene en hora de Toronto; lo convertimos a la hora local del usuario
    const localDateTime = convertToUserLocalDateTime(matchStats.match_datetime);

    // Usamos la fecha/hora local para formatear y calcular tiempo relativo
    const formattedDateTime = getFormattedDateTime(localDateTime);
    const relativeTime = getRelativeTime(localDateTime);

    // Determinar texto de cola
    let queueText = '';
    switch (matchStats.queue_id) {
        case 1100: queueText = 'Ranked'; break;
        case 1090: queueText = 'Standard'; break;
        case 1160: queueText = 'Double up'; break;
        default: queueText = matchStats.queue_id;
    }

    statsDiv.innerHTML = `
        <span class="match-stats-datetime" title="${formattedDateTime}">
            ${relativeTime}
        </span>
        <span class="match-stats-length">
            ${matchStats.game_length}
        </span>
        <span class="match-stats-queue">
            ${queueText}
        </span>
        <span class="match-stats-link">
            <a href="https://tactics.tools/player/-/-/-/${matchStats.match_id}" target="_blank">
                More info
            </a>
        </span>
    `;
    return statsDiv;
};

// Helper function to create a base player detail container.
function createPlayerDetailBase(className) {
    const div = document.createElement('div');
    div.className = className;
    // Append a pre element for player details.
    const pre = document.createElement('pre');
    div.appendChild(pre);
    return div;
}

// Helper function to set border and background styles.
function setPlayerDetailStyles(element, isWinner, bgWinner, bgLoser) {
    element.style.border = isWinner
        ? "2px solid rgba(0, 128, 0, 0.6)"
        : "2px solid rgba(128, 0, 0, 0.6)";
    element.style.background = isWinner ? bgWinner : bgLoser;
    if (!isWinner) {
        element.style.marginTop = "auto";
    }
}

const createMatchPlayer1Detail = (playerDetails, isWinner) => {
    const revertOrder = false;
    const player1Div = createPlayerDetailBase('match-player1-detail');
    setPlayerDetailStyles(
        player1Div,
        isWinner,
        "linear-gradient(45deg, rgba(0, 128, 0, 0.15), rgba(255, 255, 255, 0.02))",
        "linear-gradient(45deg, rgba(128, 0, 0, 0.15), rgba(255, 255, 255, 0.02))"
    );

    player1Div.appendChild(createMatchPlayerDiv(playerDetails, revertOrder, isWinner));
    player1Div.appendChild(createMatchTraitsDiv(playerDetails));
    player1Div.appendChild(createMatchChampsDiv(playerDetails, revertOrder));
    player1Div.appendChild(createMatchSeparatorDiv());

    return player1Div;
};

const createMatchPlayer2Detail = (playerDetails, isWinner) => {
    const revertOrder = true;
    const player2Div = createPlayerDetailBase('match-player2-detail');
    setPlayerDetailStyles(
        player2Div,
        isWinner,
        "linear-gradient(45deg, rgba(255, 255, 255, 0.02), rgba(0, 128, 0, 0.15))",
        "linear-gradient(45deg, rgba(255, 255, 255, 0.02), rgba(128, 0, 0, 0.15))"
    );

    player2Div.appendChild(createMatchSeparatorDiv());
    player2Div.appendChild(createMatchChampsDiv(playerDetails, revertOrder));
    player2Div.appendChild(createMatchTraitsDiv(playerDetails));
    player2Div.appendChild(createMatchPlayerDiv(playerDetails, revertOrder, isWinner));

    return player2Div;
};

// Helper function to create common player details sub-divs for both players.
const createMatchSeparatorDiv = () => {
    const div = document.createElement('div');
    div.className = 'match-separator';
    return div;
};

// Modificar createMatchTraitsDiv para cargar icons de traits desde la caché
const createMatchTraitsDiv = (playerDetails) => {
    const traits = playerDetails.traits || [];
    const div = document.createElement('div');
    div.className = 'match-traits';
    loadTraits(traits, div); // carga asíncrona de icons de traits
    return div;
};

async function loadTraits(traits, container) {
    // Sort the traits by trait.style in descending order (e.g., 5, 4, 2, 0)
    traits.sort((a, b) => b.style - a.style);

    if (!traitDataCache) {
        try {
            const response = await fetch(CDRAGON_URL.traits);
            if (!response.ok) throw new Error('Error fetching trait data');
            traitDataCache = await response.json();
        } catch (error) {
            console.error('Error loading trait data:', error);
            return;
        }
    }

    traits.forEach(trait => {
        if (trait.tier_current > 0) {
            const traitInfo = traitDataCache.find(item => item.trait_id === trait.name);
            if (traitInfo) {
                const backgroundImgUrl = getTraitBackgroundUrl(trait.tier_current, trait.tier_total, trait.num_unit);

                // Create main icon image element with its class
                const traitImg = document.createElement('img');
                traitImg.src = CDragonBaseUrl(traitInfo.icon_path);
                traitImg.className = 'trait-icon';
                traitImg.title = traitInfo.display_name;

                // Create container and set position relative for overlapping images
                const traitContainer = document.createElement('div');
                traitContainer.className = 'trait-img-container';
                traitContainer.style.backgroundImage = `url(${backgroundImgUrl})`;

                traitContainer.appendChild(traitImg);

                container.appendChild(traitContainer);
            }
        }
    });
}

const createMatchChampsDiv = (playerDetails, reverseChampions = false) => {
    const container = document.createElement('div');
    container.className = 'match-champs';

    if (playerDetails && Array.isArray(playerDetails.units)) {
        const units = reverseChampions ? playerDetails.units.slice().reverse() : playerDetails.units;
        units.forEach(unit => {
            const tierContainer = createTierDiv(unit.tier || '');
            const champContainer = document.createElement('div');
            champContainer.className = 'match-champ';

            const champImg = document.createElement('img');
            champImg.src = getChampionImageUrl(unit.character_id);
            champImg.alt = unit.character_id || '';

            // Calculate tooltip: show text after "_" if exists, else show as is.
            let tooltip = unit.character_id || '';
            if (tooltip.includes('_')) {
                tooltip = tooltip.split('_').pop();
            }
            champImg.title = tooltip;

            champContainer.appendChild(champImg);

            const itemsDiv = createItemsDiv(unit.item_names || []);

            const matchChampWrapper = document.createElement('div');
            matchChampWrapper.className = 'match-champ-wrapper';

            matchChampWrapper.appendChild(tierContainer);
            matchChampWrapper.appendChild(champContainer);
            matchChampWrapper.appendChild(itemsDiv);

            container.appendChild(matchChampWrapper);
        });
    }
    return container;
};

function createTierDiv(tier) {
    const tierDiv = document.createElement('div');
    tierDiv.className = 'match-tier';
    if (tier > 1) {
        const tierImg = document.createElement('img');
        tierImg.src = getTierImageUrl(tier);
        tierImg.alt = `${tier} stars`;
        tierDiv.appendChild(tierImg);
    }
    return tierDiv;
}

const createItemsDiv = (items) => {
    const itemsDiv = document.createElement('div');
    itemsDiv.className = 'match-items';

    // Only process up to 3 items
    items.forEach(itemId => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'match-item';

        const itemImg = document.createElement('img');
        itemImg.src = getItemPNGImageUrl(itemId);
        itemImg.alt = `Item ${itemId}`;

        // Place the item image within the item div.
        itemDiv.appendChild(itemImg);
        itemsDiv.appendChild(itemDiv);
    });

    return itemsDiv;
};

const createPlacementDiv = (placementValue) => {
    const placement = Number(placementValue);
    const placementDiv = document.createElement('div');
    placementDiv.className = 'match-player-placement';

    let suffix = '';
    switch (placement) {
        case 1:
            suffix = 'st';
            placementDiv.style.color = "#FFD700"; // bright gold
            break;
        case 2:
            suffix = 'nd';
            placementDiv.style.color = "#C0C0C0"; // bright silver
            break;
        case 3:
            suffix = 'rd';
            placementDiv.style.color = "#CD7F32"; // bronze
            break;
        case 4:
            suffix = 'th';
            placementDiv.style.color = "#B0B0B0"; // silver
            break;
        default:
            suffix = 'th';
            placementDiv.style.color = "gray";
    }
    placementDiv.textContent = placement + suffix;
    return placementDiv;
};

function createCompanionDiv(playerDetails, isWinner, revertOrder) {
    const companionDiv = document.createElement('div');
    companionDiv.className = 'match-player-companion';

    // Set display to flex and align items at the bottom, with left/right alignment based on revertOrder.
    companionDiv.style.display = 'flex';
    companionDiv.style.alignItems = 'flex-end';
    companionDiv.style.justifyContent = revertOrder ? 'flex-start' : 'flex-end';

    // Call loadMainCompanion to set the companion image as the background.
    loadMainCompanion(playerDetails, companionDiv);

    // If not the winner, apply grayscale filter to remove color.
    if (!isWinner) {
        companionDiv.style.filter = 'grayscale(100%)';
    }

    const levelDiv = document.createElement('div');
    levelDiv.className = 'match-player-companion-level';
    levelDiv.textContent = playerDetails.level;

    companionDiv.appendChild(levelDiv);

    return companionDiv;
}

function createStatItem(icon, value, tooltipText, revertOrder) {
    const statDiv = document.createElement('div');
    statDiv.className = 'match-player-stats-item';

    if (revertOrder) {
        statDiv.style.marginLeft = '3px';
    } else {
        statDiv.style.marginRight = '3px';
    }

    const iconElem = document.createElement('span');
    iconElem.textContent = icon;
    if (tooltipText) {
        iconElem.title = tooltipText;
    }

    const textElem = document.createElement('span');
    textElem.textContent = value;

    if (revertOrder) {
        statDiv.appendChild(textElem);
        statDiv.appendChild(iconElem);
    } else {
        statDiv.appendChild(iconElem);
        statDiv.appendChild(textElem);
    }

    return statDiv;
}

function createStatsDiv(playerDetails, revertOrder) {
    const statsDiv = document.createElement('div');
    statsDiv.className = 'match-player-stats';

    statsDiv.appendChild(createStatItem(ICON_GOLD, playerDetails.gold_left, TOOLTIP_GOLD, revertOrder));
    statsDiv.appendChild(createStatItem(ICON_PLAYERS_ELIMINATED, playerDetails.players_eliminated, TOOLTIP_PLAYERS_ELIMINATED, revertOrder));
    statsDiv.appendChild(createStatItem(ICON_DAMAGE, playerDetails.total_damage_to_players, TOOLTIP_DAMAGE, revertOrder));

    return statsDiv;
}

const createMatchPlayerDiv = (playerDetails, revertOrder, isWinner) => {
    const div = document.createElement('div');
    div.className = 'match-player';

    const placementDiv = createPlacementDiv(playerDetails.placement);
    const companionDiv = createCompanionDiv(playerDetails, isWinner, revertOrder);
    const statsDiv = createStatsDiv(playerDetails, revertOrder);

    // Append divs in the specified order based on revertOrder.
    if (revertOrder) {
        div.appendChild(statsDiv);
        div.appendChild(companionDiv);
        div.appendChild(placementDiv);
    } else {
        div.appendChild(placementDiv);
        div.appendChild(companionDiv);
        div.appendChild(statsDiv);
    }

    return div;
};