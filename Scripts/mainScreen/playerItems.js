// Each player column has a box for up to 6 items, artifacts or emblems (dragged in from the item
// picker, or from another player's box). From them we guess the player's potential comps: the best
// unlinked ones get a hint in the player's column, and the side card lists them with the unit that
// should hold each item. On linked comps, artifacts and emblems are shown on their holder.
import { getItemWEBPImageUrl } from '../tftVersusHandler.js';
import { getCurrentSetData } from './dataLoader.js';
import { playerColumns, links } from './matrix.js';
import { ITEM_DRAG_TYPE, scoreComp, rankResults, suggestionButton } from './itemPicker.js';
import { itemName, isArtifact, isEmblem, isRadiant, isSpecial, fit } from './compFit.js';

const MAX_ITEMS = 6;
const HINTS_PER_PLAYER = 3;
const MIN_HINT_SCORE = 0.8;
const CARD_COMPS = 5;

const playersContainer = document.getElementById('players');
const compsContainer = document.getElementById('compos');
const card = document.getElementById('playerCard');
let focused = null; // player element whose potential comps the side card shows

export const getPlayerItems = player => (player?.dataset.items || '').split(',').filter(Boolean);

export function setPlayerItems(player, list) {
    player.dataset.items = list.slice(0, MAX_ITEMS).join(',');
    renderBox(player);
}

function renderBox(player) {
    const box = player.querySelector('.player-items');
    if (!box) return;
    const list = getPlayerItems(player);
    box.innerHTML = '';
    for (let i = 0; i < MAX_ITEMS; i++) {
        const slot = document.createElement('span');
        slot.className = 'slot';
        if (list[i]) {
            const img = document.createElement('img');
            img.src = getItemWEBPImageUrl(list[i]);
            img.alt = itemName(list[i]);
            img.title = `${itemName(list[i])} (click to remove)`;
            img.draggable = true;
            img.dataset.slot = i;
            if (isArtifact(list[i])) img.classList.add('artifact');
            if (isEmblem(list[i])) img.classList.add('emblem');
            if (isRadiant(list[i])) img.classList.add('radiant');
            slot.appendChild(img);
        }
        box.appendChild(slot);
    }
    box.classList.toggle('empty', list.length === 0);
}

// Rebuild every box from its player's data (after players are rebuilt or loaded from a share URL)
export function refreshPlayerItems() {
    playerColumns().forEach(renderBox);
    repaint();
}

// ---------- potential comps ----------
function potentials(player) {
    const set = getCurrentSetData();
    const list = getPlayerItems(player);
    if (!set || !list.length) return [];
    const wanted = new Map();
    list.forEach(it => wanted.set(it, (wanted.get(it) || 0) + 1));
    const results = set.comps.map((comp, index) => ({ comp, index, ...scoreComp(comp, wanted) }))
        .filter(r => r.score > 0 && compsContainer.querySelector(`.item.compo[data-id="compo-${r.index}"]`));
    return rankResults(results);
}

function repaint() {
    const set = getCurrentSetData();
    if (!set) return;
    const players = playerColumns();
    compsContainer.querySelectorAll('.link-cell.hint').forEach(c => {
        c.classList.remove('hint');
        c.style.removeProperty('--hint');
        if (!c.classList.contains('on')) c.title = '';
    });
    compsContainer.querySelectorAll('.holder-badge').forEach(b => b.remove());

    players.forEach((player, k) => {
        const ranked = potentials(player);
        const linked = new Set(links.filter(l => l.player === player).map(l => l.compo));
        // hints: the best comps this player isn't on yet
        const top = ranked.filter(r => r.score >= MIN_HINT_SCORE)
            .filter(r => !linked.has(compsContainer.querySelector(`.item.compo[data-id="compo-${r.index}"]`)))
            .slice(0, HINTS_PER_PLAYER);
        const best = top[0]?.score || 1;
        top.forEach(r => {
            const cell = compsContainer.querySelector(`.item.compo[data-id="compo-${r.index}"] .link-cell[data-slot="${k}"]`);
            if (!cell) return;
            cell.classList.add('hint');
            cell.style.setProperty('--hint', (0.45 + 0.55 * r.score / best).toFixed(2));
            cell.title = `Potential: ${r.matched.map(m => itemName(m.item) + (m.holder ? ` → ${m.holder.name}` : '')).join(', ')}`;
        });
        // holders of this player's artifacts, emblems and radiants on the comps they're linked to
        const special = getPlayerItems(player).filter(isSpecial);
        linked.forEach(compo => {
            const comp = set.comps[+compo.dataset.id.replace('compo-', '')];
            special.forEach(it => {
                const { holder } = fit(it, comp);
                const unit = holder && [...compo.querySelectorAll('.unit-icon-wrapper')].find(w => w.querySelector('img').alt === holder.name);
                if (!unit) return;
                // wrapped in a span: the wrapper's direct <img> is the champion portrait
                const badge = document.createElement('span');
                badge.className = 'holder-badge';
                badge.innerHTML = `<img src="${getItemWEBPImageUrl(it)}" alt="">`;
                badge.title = `${itemName(it)} on ${holder.name} (${player.querySelector('.player-name')?.textContent.trim()})`;
                badge.style.setProperty('--pc', player.dataset.color);
                badge.style.setProperty('--i', unit.querySelectorAll('.holder-badge').length);
                unit.appendChild(badge);
            });
        });
    });
    renderCard();
}

function renderCard() {
    if (!card) return;
    // players were rebuilt (reset, mode switch): start over from the first one with items
    if (focused && !focused.isConnected) focused = null;
    focused ??= playerColumns().find(p => getPlayerItems(p).length) || null;
    // a clicked player with an empty box clears the card
    card.hidden = !focused || !getPlayerItems(focused).length;
    if (card.hidden) return;
    const name = focused.querySelector('.player-name')?.textContent.trim() || 'Player';
    const ranked = potentials(focused).slice(0, CARD_COMPS);
    card.innerHTML = '';
    card.style.setProperty('--pc', focused.dataset.color);
    const h = document.createElement('h3');
    h.innerHTML = `<span class="pc-title"><i class="pc-dot"></i><span></span></span><small>potential comps</small>`;
    h.querySelector('.pc-title span').textContent = name;
    card.appendChild(h);
    const list = document.createElement('div');
    list.className = 'suggested-list flush';
    if (!ranked.length) list.innerHTML = '<p class="empty">No comp fits these items.</p>';
    ranked.forEach(r => list.appendChild(suggestionButton(r, { holders: true })));
    card.appendChild(list);
}

// ---------- drag & drop ----------
const hasItem = e => [...(e.dataTransfer?.types || [])].includes(ITEM_DRAG_TYPE);

// Capture phase: a dragged box item must not start the column reordering of its player
playersContainer.addEventListener('dragstart', e => {
    const img = e.target.closest?.('.player-items img');
    if (!img) return;
    e.stopPropagation();
    const player = img.closest('.item.player');
    const list = getPlayerItems(player);
    e.dataTransfer.setData(ITEM_DRAG_TYPE, JSON.stringify({ api: list[+img.dataset.slot], from: playerColumns().indexOf(player), slot: +img.dataset.slot }));
    e.dataTransfer.effectAllowed = 'copyMove';
    document.body.classList.add('dragging-item');
}, true);
playersContainer.addEventListener('dragend', () => document.body.classList.remove('dragging-item'), true);

playersContainer.addEventListener('dragover', e => {
    if (!hasItem(e)) return;
    const player = e.target.closest('.item.player');
    if (!player) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
    playerColumns().forEach(p => p.classList.toggle('item-drop', p === player));
});

playersContainer.addEventListener('dragleave', e => {
    const player = e.target.closest('.item.player');
    if (player && !player.contains(e.relatedTarget)) player.classList.remove('item-drop');
});

playersContainer.addEventListener('drop', e => {
    if (!hasItem(e)) return;
    const player = e.target.closest('.item.player');
    playerColumns().forEach(p => p.classList.remove('item-drop'));
    document.body.classList.remove('dragging-item');
    if (!player) return;
    e.preventDefault();
    let data;
    try { data = JSON.parse(e.dataTransfer.getData(ITEM_DRAG_TYPE)); } catch { return; }
    const source = data.from != null ? playerColumns()[data.from] : null;
    if (source === player) return;
    const list = getPlayerItems(player);
    if (!data.api || list.length >= MAX_ITEMS) return;
    setPlayerItems(player, [...list, data.api]);
    if (source) {
        const from = getPlayerItems(source);
        from.splice(data.slot, 1);
        setPlayerItems(source, from);
    }
    focused = player;
    repaint();
});

// Click an item in a box to take it out; click a player to see their potential comps
playersContainer.addEventListener('click', e => {
    const img = e.target.closest('.player-items img');
    const player = e.target.closest('.item.player');
    if (!player) return;
    if (img) {
        e.stopPropagation();
        const list = getPlayerItems(player);
        list.splice(+img.dataset.slot, 1);
        setPlayerItems(player, list);
    } else if (e.target.closest('button, input')) {
        return;
    }
    focused = player;
    repaint();
});

document.addEventListener('tft:linkschange', repaint);
