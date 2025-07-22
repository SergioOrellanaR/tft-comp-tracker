import { tryLoadDefaultData } from './mainScreen/dataLoader.js';
import { applyQueryParams } from './mainScreen/shareUrl.js';
import { resetPlayers, toggleDoubleUpMode} from './mainScreen/players.js';
import { drawLines, resizeCanvas } from './mainScreen/canvas.js';
import { createCompToggle, hideContestedBtn, hideUnselectedBtn } from './mainScreen/compSearchBar.js';

window.addEventListener('resize', resizeCanvas);

applyQueryParams();
tryLoadDefaultData();

window.addEventListener('load', () => {
    setTimeout(() => {
        resizeCanvas();
    }, 250);
});

['left', 'players'].forEach(id => {
    const el = document.getElementById(id);
    if (el && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
            id === 'left' ? resizeCanvas() : drawLines();
        }).observe(el);
    }
});

createCompToggle(
    hideContestedBtn,
    hideUnselectedBtn,
    (checked, isLinked, compo) => {
        const starIcon = compo.querySelector('.star-icon');
        const isUncontested = starIcon && starIcon.style.visibility !== 'hidden';
        return checked ? (isLinked || isUncontested) : true;
    }
);

createCompToggle(
    hideUnselectedBtn,
    hideContestedBtn,
    (checked, isLinked) => isLinked || !checked
);

window.toggleDoubleUpMode = toggleDoubleUpMode;
window.resetPlayers = resetPlayers;