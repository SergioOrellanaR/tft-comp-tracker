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
        console.log(imgUrl);
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
        console.log(ladderNumber);

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
    // Creates the overlay if it doesn't exist.
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

    // Mostrar spinner mientras se cargan ambos componentes.
    headerModal.appendChild(createLoadingSpinner("Loading duel stats"));

    // Ejecutar ambas peticiones en paralelo y actualizar el headerModal cuando ambas finalicen.
    const player2Promise = fetchPlayerSummary(player2Name, server);
    const duelStatsPromise = fetchDuelStats(playerData.name, player2Name, server);

    Promise.all([player2Promise, duelStatsPromise])
        .then(([summaryData, statsData]) => {
            const duelData = duelsCache.get(player2Name) || {};
            duelData.stats = statsData;
            duelsCache.set(player2Name, duelData);
            headerModal.innerHTML = ''; // Limpiar spinner
            headerModal.appendChild(createHeaderModalPlayer(playerData, CONFIG.mainPlayerColor, server));
            headerModal.appendChild(createHeaderModalStats(statsData, CONFIG.mainPlayerColor, player2Color));
            headerModal.appendChild(createHeaderModalPlayer(summaryData, player2Color, server));
        })
        .catch(error => {
            console.error("Error loading header modal:", error);
            headerModal.innerHTML = '<p>Error loading duel information.</p>';
        });

    return headerModal;
}

// Update createHeaderModalPlayer to include createPlayerCard
function createHeaderModalPlayer(data, color, server) {
    const element = document.createElement('div');
    element.classList.add('playerHeaderModal');
    if (typeof data === 'object' && data !== null) {
        element.id = `player_${data.id || data.name || 'unknown'}`;
        element.innerHTML = `<p>${data.name || 'Player'} - ${data.summary || ''}</p>`;
        // Append the player card inside element
        createPlayerCard(data, server).then(card => {
            element.appendChild(card);
        });
    } else {
        element.id = data;
        element.innerHTML = `<p>Player Placeholder (${data})</p>`;
    }
    if (color) {
        element.style.color = color;
    }
    return element;
}

function createHeaderModalStats(statsData, player1Color, player2Color) {
    const statsContainer = document.createElement('div');
    statsContainer.id = 'headerModalStatsContent';

    // Use the statsData object to fill in meaningful details.
    // Adjust these properties based on the structure of statsData.
    statsContainer.innerHTML = `
        <h2>Duel Stats</h2>
        <p>Total Games: ${statsData.totalGames || 0}</p>
        <p>Wins: ${statsData.wins || 0}</p>
        <p>Losses: ${statsData.losses || 0}</p>
        <p>Win Rate: ${statsData.winRate || 'N/A'}</p>
    `;
    return statsContainer;
}

// GAME HISTORY COMPONENTS
function createHistoryModal(playerData, duelsCache, player2Name, player2Color, server) {
    const historyModal = document.createElement('div');
    historyModal.id = 'historyModal';
    // Remove old static content and add spinner for common matches.
    historyModal.appendChild(createLoadingSpinner("Loading common matches"));

    // Initiate asynchronous call to fetchCommonMatches concurrently.
    fetchCommonMatches(playerData.name, player2Name, server)
        .then(matchesData => {
            const duelData = duelsCache.get(player2Name);
            duelData.commonMatches = matchesData;
            duelsCache.set(player2Name, duelData);
            historyModal.innerHTML = '<h2>History</h2><p>' + JSON.stringify(matchesData) + '</p>';
        })
        .catch(error => {
            historyModal.innerHTML = '<h2>History</h2><p>Error loading common matches.</p>';
            console.error("Error in fetchCommonMatches:", error);
        });

    return historyModal;
}