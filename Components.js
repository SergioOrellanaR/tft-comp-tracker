import { CDragonBaseUrl, getProfileIconUrl, getRankIconUrl } from './tftVersusHandler.js';
import { CDRAGON_URL } from './config.js';

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