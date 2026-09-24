// Versus: your history against one lobby player, from their column's ⚔ button.
// - Glance: a card next to the player's column (record, your last finishes against them, averages, contested %).
// - Report: every game you've shared (current set by default, or all sets), placements game by game and
//   both final boards per game, with the units you both played marked, and each player's rank then.
// One call (/versus) feeds both; it only reads what /find already saved, plus stored rank histories.
// Clicking a game expands its whole lobby (/match/{id}: the boards come from the database, and names too
// for players saved before; the rest are asked to Riot once by puuid and saved, so it's asked once per game).
import { fetchVersus, fetchSpecificMatch, getChampionImageUrl, getItemWEBPImageUrl, getMiniRankIconUrl, CDragonBaseUrl } from '../tftVersusHandler.js';
import { CDRAGON_URL, CONFIG } from '../config.js';
import { getSnapshotSets } from './dataLoader.js';

const YOU = CONFIG.colors[0];
const PLACEMENTS_MAX_GAMES = 10; // more games than this open on the finishes grid instead of the line chart
const cache = new Map(); // opponent → versus data (the lobby lasts one game)
const lobbies = new Map(); // match id → its full lobby (a promise)
let companions = null; // the Little Legends list (large): fetched once, when a report first needs it

// ---------- data ----------
async function loadVersus(me, opponent, server) {
    const key = `${server}|${me}|${opponent}`;
    if (cache.has(key)) return cache.get(key);
    const promise = fetchVersus(me, opponent, server).then(data => {
        if (!data || data.detail !== undefined) throw data;
        // older sets' ranks are fetched in the background the first time: pick them up once
        if (data.ranks_pending) setTimeout(() => fetchVersus(me, opponent, server).then(fresh => { if (fresh && fresh.detail === undefined) Object.assign(data, fresh); }).catch(() => {}), 8000);
        return data;
    });
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
    return promise;
}

async function companionIcon(contentId) {
    if (!contentId) return null;
    try {
        companions ??= fetch(CDRAGON_URL.companionData).then(r => r.json());
        const found = (await companions).find(c => c.contentId === contentId);
        return found ? CDragonBaseUrl(found.loadoutsIcon) : null;
    } catch { return null; }
}

// unit cost: from the snapshot's champions, else from Riot's rarity (0,1,2,4,6 → 1..5)
let costs = null;
function unitCost(unit) {
    if (!costs) {
        costs = new Map();
        Object.values(getSnapshotSets()).forEach(set => (set.champions || []).forEach(c => costs.set(c.apiName, c.cost)));
    }
    return costs.get(unit.character_id) || ({ 0: 1, 1: 2, 2: 3, 3: 4, 4: 4, 5: 5, 6: 5 }[unit.rarity] ?? 1);
}

const games = data => [...data.games].sort((a, b) => (b.match_epoch || 0) - (a.match_epoch || 0)); // newest first
const me = g => g.player1_game_details;
const them = g => g.player2_game_details;
const sharedUnits = g => new Set((me(g)?.units || []).map(u => u.character_id).filter(id => (them(g)?.units || []).some(v => v.character_id === id)));

function stats(list) {
    const n = list.length || 1;
    const ahead = list.filter(g => me(g).placement < them(g).placement).length;
    const avg = side => list.reduce((s, g) => s + side(g).placement, 0) / n;
    return {
        n: list.length, ahead, behind: list.length - ahead, avg1: avg(me), avg2: avg(them),
        top1: Math.round(list.filter(g => me(g).placement <= 4).length / n * 100),
        top2: Math.round(list.filter(g => them(g).placement <= 4).length / n * 100),
        win1: list.filter(g => me(g).placement === 1).length, win2: list.filter(g => them(g).placement === 1).length,
    };
}

// ---------- small pieces ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const nm = name => esc((name || '').split('#')[0]);
const ord = n => n + (['st', 'nd', 'rd'][n - 1] || 'th');
const placeClass = n => n === 1 ? 'p1' : n <= 4 ? 'top' : 'bot';
const ctClass = pct => pct < 25 ? 'ct-low' : pct < 50 ? 'ct-mid' : 'ct-high'; // traffic light
const pill = n => `<span class="vs-pl ${placeClass(n)}">${ord(n)}</span>`;
const unitName = id => id.replace(/^(DA|TFT\d+)_(\d+_)?|\d+$|_AD$|_AP$/g, '').replace(/\d+(?=_|$)/, '');
function when(epoch) {
    if (!epoch) return '';
    const h = (Date.now() - epoch) / 3.6e6;
    if (h < 1) return 'Just now';
    if (h < 24) return `${Math.round(h)} h ago`;
    if (h < 24 * 30) return `${Math.round(h / 24)} d ago`;
    return new Date(epoch).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function rankText(r) {
    if (!r?.tier) return '';
    const tier = r.tier[0] + r.tier.slice(1).toLowerCase();
    return ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(r.tier) ? `${tier} ${r.lp} LP` : `${tier} ${r.rank || ''}`.trim();
}
const rankHtml = r => r?.tier ? `<span class="vs-rank"><img src="${getMiniRankIconUrl(r.tier)}" alt="">${rankText(r)}</span>` : '';
function unitHtml(u, shared) {
    const both = shared?.has(u.character_id);
    return `<span class="vs-unit${both ? ' shared' : ''}" style="--cc:var(--c${Math.min(unitCost(u), 5)})" title="${esc(unitName(u.character_id))}${both ? ' (you both played it)' : ''}">
        ${u.tier >= 2 ? `<span class="st">${'★'.repeat(u.tier)}</span>` : ''}<img src="${getChampionImageUrl(u.character_id)}?w=48" alt="" loading="lazy">
        ${u.item_names?.length ? `<span class="its">${u.item_names.slice(0, 3).map(i => `<img src="${getItemWEBPImageUrl(i)}" alt="">`).join('')}</span>` : ''}</span>`;
}
const boardOf = side => [...(side.units || [])].sort((a, b) => (b.item_names?.length > 0) - (a.item_names?.length > 0) || unitCost(b) - unitCost(a));
const carriesOf = side => boardOf(side).filter(u => u.item_names?.length).slice(0, 3);
const avatar = (icon, color, size) => `<span class="vs-avatar" style="--pc:${color};--s:${size}px">${icon ? `<img src="${icon}" alt="">` : ''}</span>`;
const profileIcon = id => id != null ? `${CDRAGON_URL.profileIcons}/${id}.jpg` : null;

// ---------- glance ----------
let glance = null;

export async function openGlance(button, myName, opponentName, opponentColor, server) {
    closeGlance();
    const column = button.closest('.item.player') || button;
    glance = document.createElement('div');
    glance.className = 'vs-glance';
    glance.setAttribute('role', 'dialog');
    glance.setAttribute('aria-label', `Your games against ${opponentName}`);
    glance.innerHTML = `<div class="vs-loading">Loading your games together…</div>`;
    document.body.appendChild(glance);
    place(column);
    const onOutside = e => { if (glance && !glance.contains(e.target) && !button.contains(e.target)) closeGlance(); };
    setTimeout(() => document.addEventListener('click', onOutside), 0);
    glance._cleanup = () => document.removeEventListener('click', onOutside);

    let data;
    try {
        data = await loadVersus(myName, opponentName, server);
    } catch (err) {
        if (glance) glance.innerHTML = `<div class="vs-loading">${err?.status === 429 ? `Riot is busy, try again in ${err.retryAfter || 10}s.` : 'Couldn\'t load your games together.'}</div>`;
        return;
    }
    if (!glance) return;
    const list = games(data);
    const all = stats(list);
    const opp = data.players[1];
    const thisSet = stats(list.filter(g => g.tft_set_number === data.current_set));
    const nowRank = data.seasons?.[data.current_set]?.[1]?.final;
    const contested = Math.round(list.reduce((s, g) => s + (g.contested_percentage || 0), 0) / Math.max(1, list.length));
    glance.innerHTML = `
        <div class="vs-g-head">${avatar(profileIcon(opp.profile_icon_id), opponentColor, 34)}
            <div class="vs-who"><b>${nm(opp.name)}</b>${rankHtml(nowRank)}</div>
            <button type="button" class="vs-x" aria-label="Close">×</button></div>
        <div class="vs-g-rec"><span class="vs-kpi">${all.ahead}–${all.behind}</span>
            <span>you finished ahead in ${Math.round(all.ahead / Math.max(1, all.n) * 100)}% of ${all.n} ${all.n === 1 ? 'game' : 'games'}${thisSet.n && thisSet.n !== all.n ? ` · ${thisSet.ahead}–${thisSet.behind} this set` : ''}</span></div>
        <div class="vs-g-last" style="--c-you:${YOU}">${list.slice(0, 10).map(g => `<i class="${me(g).placement < them(g).placement ? 'won' : ''}" title="${ord(me(g).placement)} vs ${ord(them(g).placement)}">${me(g).placement}</i>`).join('')}</div>
        <div class="vs-lbl">Your last ${Math.min(10, list.length)} finishes against them, newest first</div>
        <div class="vs-g-grid"><div><span class="vs-lbl">Your avg</span><b>${all.avg1.toFixed(2)}</b></div><div><span class="vs-lbl">Their avg</span><b>${all.avg2.toFixed(2)}</b></div>
            <div><span class="vs-lbl">Contested</span><b class="${ctClass(contested)}">${contested}%</b></div></div>
        <div class="vs-g-foot"><button type="button" class="btn-primary vs-open">Open full history</button></div>`;
    glance.querySelector('.vs-x').onclick = closeGlance;
    glance.querySelector('.vs-open').onclick = () => { closeGlance(); openReport(data, opponentColor); };
    place(column);
}

function place(column) {
    if (!glance) return;
    const r = column.getBoundingClientRect();
    if (window.innerWidth <= 640) { glance.style.left = ''; glance.style.top = ''; return; } // bottom sheet
    const w = glance.offsetWidth || 330;
    const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - 40));
    glance.style.left = `${left}px`;
    glance.style.top = `${r.bottom + 10}px`;
    glance.style.setProperty('--arrow', `${Math.max(16, r.left + r.width / 2 - left - 7)}px`);
}

function closeGlance() {
    if (!glance) return;
    glance._cleanup?.();
    glance.remove();
    glance = null;
}

// ---------- report ----------
export function openReport(data, opponentColor) {
    const THEM = opponentColor;
    const all = games(data);
    const sets = [...new Set(all.map(g => g.tft_set_number))].sort((a, b) => b - a);
    let filter = sets.includes(data.current_set) ? data.current_set : 'all';
    let chart = null; // null = pick by number of games

    const overlay = document.createElement('div');
    overlay.className = 'vs-overlay';
    overlay.innerHTML = `<div class="vs-report" role="dialog" aria-modal="true" aria-label="Versus history" style="--p1:${YOU};--p2:${THEM}"></div>`;
    document.body.appendChild(overlay);
    document.body.classList.add('vs-open');
    const report = overlay.firstElementChild;
    const close = () => { overlay.remove(); document.body.classList.remove('vs-open'); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    function render() {
        const list = filter === 'all' ? all : all.filter(g => g.tft_set_number === filter);
        const s = stats(list);
        const mode = chart || (list.length > PLACEMENTS_MAX_GAMES ? 'finishes' : 'placements');
        const [p1, p2] = data.players;
        const summary = data.seasons?.[filter === 'all' ? data.current_set : filter] || [];
        const better = (a, b, low) => (low ? a < b : a > b) ? 1 : a === b ? 0 : 2;
        const mrow = (k, a, b, fa, fb, win) => `<div class="vs-mrow"><span class="v" style="${win === 1 ? `color:${YOU}` : ''}">${a}</span><div class="bar l"><i style="--pc:${YOU};width:${fa}%"></i></div><span class="k">${k}</span><div class="bar"><i style="--pc:${THEM};width:${fb}%"></i></div><span class="v r" style="${win === 2 ? `color:${THEM}` : ''}">${b}</span></div>`;
        report.innerHTML = `
          <header class="vs-top">
            <div class="l">${avatar(profileIcon(p1.profile_icon_id), YOU, 46)}<div class="vs-who"><b>${nm(p1.name)}</b>${rankHtml(summary[0]?.final)}</div><div class="vs-big" style="color:${YOU}">${s.ahead}<small>times ahead</small></div></div>
            <span class="vs-badge">VS</span>
            <div class="r">${avatar(profileIcon(p2.profile_icon_id), THEM, 46)}<div class="vs-who"><b>${nm(p2.name)}</b>${rankHtml(summary[1]?.final)}</div><div class="vs-big" style="color:${THEM}"><small>times ahead</small>${s.behind}</div></div>
            <button type="button" class="vs-x" aria-label="Close">×</button>
          </header>
          <div class="vs-body">
            <div class="vs-bar-row"><div class="vs-seg" role="group" aria-label="Set">
              ${sets.map(n => `<button type="button" data-f="${n}" aria-pressed="${filter === n}">Set ${n}<span>${all.filter(g => g.tft_set_number === n).length}</span></button>`).join('')}
              ${sets.length > 1 ? `<button type="button" data-f="all" aria-pressed="${filter === 'all'}">All sets<span>${all.length}</span></button>` : ''}
            </div></div>
            ${list.length ? `<div class="vs-mirror">
              ${mrow('Avg place', s.avg1.toFixed(2), s.avg2.toFixed(2), (8 - s.avg1) / 7 * 100, (8 - s.avg2) / 7 * 100, better(s.avg1, s.avg2, true))}
              ${mrow('Top 4 rate', s.top1 + '%', s.top2 + '%', s.top1, s.top2, better(s.top1, s.top2))}
              ${mrow('1st places', s.win1, s.win2, s.win1 / Math.max(1, s.n) * 100, s.win2 / Math.max(1, s.n) * 100, better(s.win1, s.win2))}
            </div>
            <section class="vs-chart">
              <div class="vs-chart-hd"><span>${mode === 'placements' ? 'Placement, game by game' : 'Finishes, game by game'} (oldest → newest)</span>
                <span class="vs-seg small" role="group" aria-label="Chart">${[['placements', 'Placements'], ['finishes', 'Finishes']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</span></div>
              ${mode === 'placements' ? placementsChart(list, THEM, filter === 'all') : finishesGrid(list, THEM, filter === 'all', sets)}
              <div class="vs-tip" hidden></div>
            </section>
            <div class="vs-games">${gameRows(list, THEM, filter === 'all', sets)}</div>` : `<p class="vs-empty">No games together in Set ${filter}.</p>`}
          </div>`;
        report.querySelector('.vs-x').onclick = close;
        report.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f === 'all' ? 'all' : +b.dataset.f; chart = null; render(); });
        report.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { chart = b.dataset.mode; render(); });
        wireTips(report, list, THEM);
        report.querySelectorAll('.vs-game').forEach(row => {
            const toggle = () => toggleLobby(row, all.find(g => g.match_id === row.dataset.id), THEM);
            row.addEventListener('click', toggle);
            row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        });
        report.querySelectorAll('.vs-cols').forEach(c => { c.scrollLeft = c.scrollWidth; }); // newest in view when it scrolls
    }
    render();
    report.querySelector('.vs-x')?.focus();
}

// Line chart of both placements, oldest to newest; sets separated by a gap when showing several
function placementsChart(list, THEM, grouped) {
    const g = [...list].reverse();
    const W = 900, H = 170, L = 30, R = 10, T = 14, B = 12;
    const n = g.length, gap = grouped ? 16 : 0;
    const breaks = g.map((x, i) => i > 0 && x.tft_set_number !== g[i - 1].tft_set_number);
    const step = (W - L - R - gap * breaks.filter(Boolean).length) / Math.max(1, n - 1);
    let acc = 0;
    const xs = g.map((_, i) => { if (breaks[i]) acc += gap; return n === 1 ? W / 2 : L + i * step + acc; });
    const y = p => T + (p - 1) * (H - T - B) / 7;
    const line = (side, color) => {
        const segs = []; let cur = [];
        g.forEach((x, i) => { if (breaks[i]) { segs.push(cur); cur = []; } cur.push(`${xs[i].toFixed(1)},${y(side(x).placement).toFixed(1)}`); });
        segs.push(cur);
        return segs.map(sg => `<polyline points="${sg.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`).join('') +
            g.map((x, i) => `<circle cx="${xs[i].toFixed(1)}" cy="${y(side(x).placement).toFixed(1)}" r="3.4" fill="#fff" stroke="${color}" stroke-width="2"/>`).join('');
    };
    let labels = '';
    if (grouped) g.forEach((x, i) => { if (i === 0 || breaks[i]) labels += `<text x="${xs[i] - 4}" y="10" font-size="10" font-weight="700" fill="#6B7380">SET ${x.tft_set_number}</text>`; });
    return `<svg class="vs-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <rect x="${L - 8}" y="${y(1) - 6}" width="${W - L}" height="${y(4) - y(1) + 12}" fill="var(--open-soft)" opacity=".6"/>
        ${[1, 4, 8].map(p => `<text x="0" y="${y(p) + 4}" font-size="10" fill="#9AA3AF">${ord(p)}</text>`).join('')}
        ${labels}${line(them, THEM)}${line(me, YOU)}
        ${g.map((x, i) => `<rect class="vs-hit" data-id="${esc(x.match_id)}" x="${(xs[i] - Math.max(6, step / 2)).toFixed(1)}" y="0" width="${Math.max(12, step).toFixed(1)}" height="${H}" fill="transparent"/>`).join('')}
    </svg>`;
}

// Two numbered tiles per game, your place above theirs; the one who finished higher is outlined in their color
function finishesGrid(list, THEM, grouped, sets) {
    const groups = grouped ? sets.map(n => [n, list.filter(g => g.tft_set_number === n)]).filter(([, l]) => l.length) : [[null, list]];
    return groups.map(([n, l]) => {
        const s = stats(l);
        const cols = [...l].reverse().map(g => {
            const won = me(g).placement < them(g).placement;
            return `<div class="vs-gcol" data-id="${esc(g.match_id)}"><span class="vs-t ${placeClass(me(g).placement)}${won ? ' won' : ''}" style="--pc:${YOU}">${me(g).placement}</span><span class="vs-t ${placeClass(them(g).placement)}${won ? '' : ' won'}" style="--pc:${THEM}">${them(g).placement}</span></div>`;
        }).join('');
        return `<div class="vs-fset">${n != null ? `<span class="vs-fset-name">Set ${n}<small>${s.ahead}–${s.behind}</small></span>` : ''}
            <div class="vs-rows-lbl"><span><i style="--pc:${YOU}"></i>You</span><span><i style="--pc:${THEM}"></i>Them</span></div><div class="vs-cols">${cols}</div></div>`;
    }).join('');
}

// The games: both final boards, the units you both played marked, the winner's side tinted
function gameRows(list, THEM, grouped, sets) {
    const row = g => {
        const sh = sharedUnits(g), won = me(g).placement < them(g).placement;
        // each side: the Little Legend that player brought, then their place, rank and final board
        const side = (s, color, cls) => `<div class="vs-side ${cls}" style="--pc:${color}">
            <span class="vs-ll big" data-ll="${esc(s.companion?.content_id || '')}"></span>
            <div class="vs-side-hd">${pill(s.placement)}${rankHtml(s.rank_info)}</div>
            <div class="vs-board">${boardOf(s).map(u => unitHtml(u, sh)).join('')}</div></div>`;
        return `<article class="vs-game ${won ? 'you-won' : 'they-won'}" data-id="${esc(g.match_id)}" tabindex="0" aria-expanded="false" title="Show the whole lobby">
            <div class="vs-when"><b>${when(g.match_epoch)}</b><span>${esc(g.game_length || '')}</span><span class="vs-ct ${ctClass(g.contested_percentage ?? 0)}" title="Share of units you both played">${g.contested_percentage ?? 0}% contested</span></div>
            ${side(me(g), YOU, 'me')}${side(them(g), THEM, 'them')}</article>`;
    };
    if (!grouped) return list.map(row).join('');
    return sets.map(n => { const l = list.filter(g => g.tft_set_number === n); if (!l.length) return ''; const s = stats(l);
        return `<h4 class="vs-set-hd">Set ${n}<span>${s.ahead}–${s.behind} · ${l.length} ${l.length === 1 ? 'game' : 'games'}</span></h4>${l.map(row).join('')}`; }).join('');
}

// ---------- a game's whole lobby ----------
function loadLobby(matchId) {
    if (!lobbies.has(matchId)) {
        const promise = fetchSpecificMatch(matchId).then(m => { if (!m || m.detail !== undefined) throw m; return m; });
        lobbies.set(matchId, promise);
        promise.catch(() => lobbies.delete(matchId));
    }
    return lobbies.get(matchId);
}

async function toggleLobby(row, g, THEM) {
    if (!g) return;
    const open = row.nextElementSibling?.classList.contains('vs-lobby') ? row.nextElementSibling : null;
    if (open) { open.remove(); row.setAttribute('aria-expanded', 'false'); return; }
    const box = document.createElement('div');
    box.className = 'vs-lobby';
    box.innerHTML = `<div class="vs-loading">Loading the lobby…</div>`;
    row.after(box);
    row.setAttribute('aria-expanded', 'true');
    let match;
    try {
        match = await loadLobby(g.match_id);
    } catch (err) {
        box.innerHTML = `<div class="vs-loading">${err?.status === 429 ? `Riot is busy, try again in ${err.retryAfter || 10}s.` : "Couldn't load this lobby."}</div>`;
        return;
    }
    // you and them by placement (unique in a ranked lobby); units either of you played are marked
    const mine = me(g).placement, theirs = them(g).placement;
    const yours = new Set([...(me(g).units || []), ...(them(g).units || [])].map(u => u.character_id));
    const players = (match.players || []).filter(Boolean).sort((a, b) => a.placement - b.placement);
    box.innerHTML = players.map(p => {
        const who = p.placement === mine ? 'you' : p.placement === theirs ? 'them' : '';
        const color = who === 'you' ? YOU : who === 'them' ? THEM : null;
        const marks = who ? null : new Set((p.units || []).map(u => u.character_id).filter(id => yours.has(id)));
        return `<div class="vs-lp${who ? ` ${who}` : ''}"${color ? ` style="--pc:${color}"` : ''}>
            ${pill(p.placement)}<span class="vs-ll" data-ll="${esc(p.companion?.content_id || '')}"></span>
            <span class="vs-lp-name">${p.name ? nm(p.name) : `<i>Player ${p.placement}</i>`}<small>Lv ${p.level ?? '?'}</small></span>
            <div class="vs-board">${boardOf(p).map(u => unitHtml(u, marks)).join('')}</div></div>`;
    }).join('') + `<div class="vs-lbl vs-lobby-note">Marked: units you or they also played</div>`;
    fillLittleLegends(box);
}

function fillLittleLegends(root) {
    root.querySelectorAll('.vs-ll[data-ll]').forEach(async el => {
        const url = await companionIcon(el.dataset.ll);
        if (url) el.innerHTML = `<img src="${url}" alt="" title="Little Legend">`;
    });
}

function wireTips(report, list, THEM) {
    const box = report.querySelector('.vs-chart');
    if (!box) return fillLittleLegends(report);
    const tip = box.querySelector('.vs-tip');
    const show = (el, id) => {
        const g = list.find(x => x.match_id === id); if (!g) return;
        const sh = sharedUnits(g);
        tip.innerHTML = `<div class="vs-tip-hd"><b>Set ${g.tft_set_number}</b><span>${when(g.match_epoch)}</span></div>
            <div class="vs-tip-ln">${pill(me(g).placement)}<span class="vs-board">${carriesOf(me(g)).map(u => unitHtml(u, sh)).join('')}</span>${rankHtml(me(g).rank_info)}</div>
            <div class="vs-tip-ln">${pill(them(g).placement)}<span class="vs-board">${carriesOf(them(g)).map(u => unitHtml(u, sh)).join('')}</span>${rankHtml(them(g).rank_info)}</div>`;
        tip.hidden = false;
        const br = box.getBoundingClientRect(), r = el.getBoundingClientRect();
        const x = r.left - br.left + r.width + 8;
        tip.style.left = `${x + 270 > br.width ? Math.max(4, r.left - br.left - 270) : x}px`;
        tip.style.top = `${Math.max(4, r.top - br.top - 6)}px`;
        report.querySelector(`.vs-game[data-id="${CSS.escape(id)}"]`)?.classList.add('hl');
    };
    const hide = () => { tip.hidden = true; report.querySelectorAll('.vs-game.hl').forEach(e => e.classList.remove('hl')); };
    box.querySelectorAll('[data-id]').forEach(el => {
        el.addEventListener('mouseenter', () => show(el, el.dataset.id));
        el.addEventListener('mouseleave', hide);
        // on touch, a tap jumps to that game's row
        el.addEventListener('click', () => report.querySelector(`.vs-game[data-id="${CSS.escape(el.dataset.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    });
    // little legends, once the (large) companion list is loaded
    fillLittleLegends(report);
}
