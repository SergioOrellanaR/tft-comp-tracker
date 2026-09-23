// Lobby matrix: comps (rows) × lobby players (columns). `links` is the source of truth for who plays
// what; renderLinks() paints it onto the cells, derives each comp's state and the contested carries.
import { unitImageMap, unitCostMap } from './dataLoader.js';
import { applyCompVisibility } from './compSearchBar.js';

// { compo: comp row element, player: player column element, pivot: boolean }
// A player on one comp plays it as their main one; on several, every one of them is a pivot.
export const links = [];

const compsContainer = document.getElementById('compos');
const contestedCard = document.getElementById('contestedCard');
const contestedBars = document.getElementById('contestedBars');

export const playerColumns = () => [...document.querySelectorAll('#players .item.player')];
const unitNames = compo => [...compo.querySelectorAll('.unit-icons .unit-icon-wrapper > img')].map(img => img.alt);

export function toggleLink(player, compo) {
    const i = links.findIndex(l => l.player === player && l.compo === compo);
    if (i >= 0) links.splice(i, 1);
    else links.push({ compo, player });
    renderLinks();
}

export function renderLinks() {
    const players = playerColumns();
    const perPlayer = new Map();
    links.forEach(l => perPlayer.set(l.player, (perPlayer.get(l.player) || 0) + 1));
    links.forEach(l => { l.pivot = perPlayer.get(l.player) > 1; });
    const byCompo = new Map();
    links.forEach(l => {
        if (!byCompo.has(l.compo)) byCompo.set(l.compo, []);
        byCompo.get(l.compo).push(l);
    });

    // champion → players on a comp that uses it (a player counts once however many comps share it)
    const champPlayers = new Map();
    links.forEach(({ compo, player }) => unitNames(compo).forEach(name => {
        if (!champPlayers.has(name)) champPlayers.set(name, new Set());
        champPlayers.get(name).add(player);
    }));

    compsContainer.querySelectorAll('.item.compo').forEach(compo => {
        const compLinks = byCompo.get(compo) || [];
        const onComp = new Set(compLinks.map(l => l.player));

        compo.querySelectorAll('.link-cell').forEach((cell, k) => {
            const player = players[k];
            const link = player && compLinks.find(l => l.player === player);
            cell.classList.toggle('on', !!link);
            cell.classList.toggle('pivot', !!link?.pivot);
            cell.style.setProperty('--pc', player?.dataset.color || 'transparent');
            cell.setAttribute('aria-pressed', String(!!link));
            cell.title = link ? (link.pivot ? 'Pivot' : 'Main comp') : '';
        });

        // a carry is taken when a player who isn't on this comp plays it elsewhere
        let taken = 0;
        compo.querySelectorAll('.unit-icons .unit-icon-wrapper').forEach(wrapper => {
            const others = [...(champPlayers.get(wrapper.querySelector('img').alt) || [])].filter(p => !onComp.has(p));
            wrapper.classList.toggle('hot', others.length > 0);
            if (others.length) taken++;
        });

        const n = onComp.size;
        const state = n > 1 ? 'crowded' : n === 1 ? 'linked' : taken ? 'shared' : 'open';
        compo.dataset.state = state;
        compo.classList.toggle('mine', compLinks.some(l => l.player === players[0]));
    });

    renderContested(champPlayers, players);
    applyCompVisibility();
    document.dispatchEvent(new CustomEvent('tft:linkschange'));
}

function renderContested(champPlayers, players) {
    const rows = [...champPlayers.entries()]
        .map(([name, set]) => ({ name, set, cost: unitCostMap[name] || 1 }))
        .sort((a, b) => b.set.size - a.set.size || b.cost - a.cost || a.name.localeCompare(b.name))
        .slice(0, 8);
    contestedCard.hidden = rows.length === 0;
    contestedBars.innerHTML = '';
    rows.forEach(({ name, set, cost }) => {
        const row = document.createElement('div');
        row.className = 'bar';
        row.style.setProperty('--cc', `var(--c${cost})`);
        row.title = `${name}: ${[...set].map(p => p.querySelector('.player-name')?.textContent.trim()).join(', ')}`;
        const img = document.createElement('img');
        img.src = `${unitImageMap[name]}?w=56`;
        img.alt = name;
        const track = document.createElement('div');
        track.className = 'track';
        players.forEach(p => {
            const seg = document.createElement('i');
            if (set.has(p)) {
                seg.className = 'on';
                seg.style.setProperty('--pc', p.dataset.color);
            }
            track.appendChild(seg);
        });
        const count = document.createElement('b');
        count.textContent = set.size;
        count.classList.toggle('hot', set.size > 1);
        row.append(img, track, count);
        contestedBars.appendChild(row);
    });
}

// ---------- cell interaction (delegated: comp rows are rebuilt on every set change) ----------
function cellTarget(e) {
    const cell = e.target.closest('.link-cell');
    if (!cell) return null;
    const player = playerColumns()[+cell.dataset.slot];
    return player ? { cell, player, compo: cell.closest('.item.compo') } : null;
}


compsContainer.addEventListener('click', e => {
    const t = cellTarget(e);
    if (t) toggleLink(t.player, t.compo);
});

// Crosshair: hovering a cell lights up its player column
compsContainer.addEventListener('mouseover', e => {
    const cell = e.target.closest('.link-cell');
    const players = playerColumns();
    players.forEach((p, k) => p.classList.toggle('col-hot', !!cell && k === +cell.dataset.slot));
});
compsContainer.addEventListener('mouseleave', () => playerColumns().forEach(p => p.classList.remove('col-hot')));
