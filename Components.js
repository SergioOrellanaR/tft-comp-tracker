import { CDragonBaseUrl, getProfileIconUrl, getRankIconUrl } from './tftVersusHandler.js';
import { CDRAGON_URL } from './config.js';

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
export function openDuelModal() {
    const overlay = document.createElement('div');
    overlay.id = 'popupOverlay';

    // Header modal
    const headerModal = document.createElement('div');
    headerModal.id = 'headerModal';
    headerModal.innerHTML = '<h2>Header</h2><p>Header content goes here...</p>';

    // History modal
    const historyModal = document.createElement('div');
    historyModal.id = 'historyModal';
    historyModal.innerHTML = '<h2>History</h2><p>History content goes here...</p>';

    // Common close button for both modals
    const closeBtn = document.createElement('button');
    closeBtn.id = 'popupCloseButton';
    closeBtn.innerText = 'X';
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    // Append the close button to headerModal (or can be appended to both if needed)
    overlay.appendChild(closeBtn);

    // Append modals to the overlay so they appear one below the other
    overlay.appendChild(headerModal);
    overlay.appendChild(historyModal);
    document.body.appendChild(overlay);
}