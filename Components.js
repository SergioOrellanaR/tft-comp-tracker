import { CDragonBaseUrl, getProfileIconUrl, getRankIconUrl, fetchFindGames } from './tftVersusHandler.js';
import { CDRAGON_URL } from './config.js';

// Función para crear un spinner de carga
export function createLoadingSpinner(text = null) {
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

export const createPlayerCard = async (playerData, server) => {
    try {
        let container = document.getElementById('playerDataContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'playerDataContainer';
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
            <div class="player-name-data-container">${playerData.name} </div>
            <div class="player-server-data-container">${server}</div>
            </div>
            <div class="rank-data-container">
            <div class="rank-icon-data-container">
                <img src="${getRankIconUrl(playerData)}" alt="${playerData.rank_info.tier} rank icon">
            </div>
            <div class="rank-info-data-container">${playerData.rank_info.tier} ${ladderNumber} ${playerData.rank_info.lp === null ? '' : playerData.rank_info.lp + 'LP'} </div>
            </div>
        `;
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
    const spinner = createLoadingSpinner('Retrieving old games information');
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
            duelsCache.set(player2Name, result);
            overlay.removeChild(spinner);
            overlay.appendChild(createHeaderModal(playerData));
            overlay.appendChild(createHistoryModal(playerData));
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

function createHistoryModal(playerData) {
    // Header modal
    const historyModal = document.createElement('div');
    historyModal.id = 'historyModal';
    historyModal.innerHTML = '<h2>History</h2><p>History content goes here...</p>';
    return historyModal;
}

function createHeaderModal(playerData) {
    // Header modal
    const headerModal = document.createElement('div');
    headerModal.id = 'headerModal';

    // Dentro de createHeaderModal, reemplazamos $SELECTION_PLACEHOLDER$ con:
    const headerModalPlayer1 = createHeaderModalPlayer('headerModalPlayer1', 'white');
    const headerModalStats = createHeaderModalStats();
    const headerModalPlayer2 = createHeaderModalPlayer('headerModalPlayer2', 'black');

    // Inyección de los divs dentro de headerModal
    headerModal.appendChild(headerModalPlayer1);
    headerModal.appendChild(headerModalStats);
    headerModal.appendChild(headerModalPlayer2);

    return headerModal;
}

// Nuevo método para crear headerModalStats
function createHeaderModalStats() {
    const element = document.createElement('div');
    element.id = 'headerModalStats';
    element.innerHTML = '<p>Stats Placeholder</p>';
    return element;
}

function createHeaderModalPlayer(id, color) {
    const element = document.createElement('div');
    element.id = id;
    element.classList.add('playerHeaderModal');
    element.innerHTML = `<p>Player Placeholder (${id})</p>`;
    if (color) {
        element.style.color = color;
    }
    return element;
}