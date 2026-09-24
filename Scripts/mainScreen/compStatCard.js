// Hover card with a comp's placement stats (MetaTFT, Tactics Tools): average, top 4, win and play rate,
// games, and how its games spread over 1st-8th. Rows carry the comp's index in `data-stats`.
import { getCurrentSetData } from './dataLoader.js';

const card = document.getElementById('statCard');
const compsContainer = document.getElementById('compos');
const pct = (share, digits = 0) => `${(share * 100).toFixed(digits)}%`;
const compact = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
let anchor = null;

function show(info) {
    const set = getCurrentSetData();
    const comp = set?.comps?.[+info.dataset.stats];
    const stats = comp?.stats;
    if (!stats) return;
    anchor = info;
    const top = Math.max(...stats.places);
    card.innerHTML = `
        <div class="sc-head"><b>${comp.title}</b><span>${set.source?.name || ''}</span></div>
        <dl class="sc-grid">
            <div><dt>Avg place</dt><dd>${stats.avg.toFixed(2)}</dd></div>
            <div><dt>Top 4</dt><dd>${pct(stats.top4, 1)}</dd></div>
            <div><dt>Win</dt><dd>${pct(stats.win, 1)}</dd></div>
            <div><dt>Play rate</dt><dd>${stats.play != null ? pct(stats.play, 2) : '—'}</dd></div>
        </dl>
        <div class="sc-dist" aria-label="Placements from 1st to 8th">
            ${stats.places.map((share, i) => `
                <div class="sc-bar${i < 4 ? ' top4' : ''}" title="${i + 1}${['st', 'nd', 'rd'][i] || 'th'}: ${pct(share, 1)}">
                    <i style="height:${Math.max(4, share / top * 100)}%"></i><small>${i + 1}</small>
                </div>`).join('')}
        </div>
        <p class="sc-foot">${compact(stats.games)} games</p>`;
    card.hidden = false;
    const r = info.getBoundingClientRect();
    const w = card.offsetWidth, h = card.offsetHeight;
    const left = Math.min(r.left, window.innerWidth - w - 12);
    const below = r.bottom + 6 + h < window.innerHeight;
    card.style.left = `${Math.max(12, left)}px`;
    card.style.top = `${below ? r.bottom + 6 : r.top - h - 6}px`;
}

function hide() {
    anchor = null;
    card.hidden = true;
}

if (card && compsContainer) {
    compsContainer.addEventListener('mouseover', e => {
        const info = e.target.closest('.comp-info[data-stats]');
        if (info === anchor) return;
        if (info) show(info);
        else hide();
    });
    compsContainer.addEventListener('mouseleave', hide);
    compsContainer.closest('.matrix')?.addEventListener('scroll', hide, { passive: true });
}
