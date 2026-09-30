// "Sort by rank": reorders the lobby's player columns from the highest rank to the lowest. It only shows once 7 or more
// columns have a rank (a live game search or a looked-up Riot ID fills them in). The columns are moved, not rebuilt, so
// links, items and colors go with their player; renderLinks() repaints the cells for the new order.
import { renderLinks } from './matrix.js';
import { requireFeature } from '../account/plans.js';
import { hasFeature } from '../account/session.js';

const MIN_RANKED = 7;
const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const DIVISIONS = ['IV', 'III', 'II', 'I'];
const APEX = ['MASTER', 'GRANDMASTER', 'CHALLENGER'];

const playersEl = document.getElementById('players');
const button = document.getElementById('sortByRankButton');
const columns = () => [...playersEl.querySelectorAll('.item.player')];
const rankOf = player => player.querySelector('.mini-rank-div');

// Higher is better; players without a rank sort last
function score(player) {
    const rank = rankOf(player)?.dataset;
    const tier = TIERS.indexOf(rank?.tier);
    if (tier < 0) return -1;
    const division = APEX.includes(rank.tier) ? 0 : DIVISIONS.indexOf(rank.division) + 1;
    return tier * 1e6 + division * 1e4 + (Number(rank.lp) || 0);
}

// Shown only when it can be used: Solo mode and enough ranked columns
function refresh() {
    if (!button) return;
    const ranked = columns().filter(rankOf).length;
    button.hidden = document.body.classList.contains('double-up') || ranked < MIN_RANKED;
    button.classList.toggle('locked', !hasFeature('sort_by_rank'));
}

button?.addEventListener('click', () => {
    if (!requireFeature('sort_by_rank')) return;
    // sort() is stable, so players with the same rank keep their order
    columns().sort((a, b) => score(b) - score(a)).forEach(player => playersEl.appendChild(player));
    renderLinks();
});

// ranks arrive after the columns exist, and the mode switch rebuilds them
new MutationObserver(refresh).observe(playersEl, { childList: true, subtree: true });
new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ['class'] });
refresh();
document.addEventListener('tft:userchange', refresh);
