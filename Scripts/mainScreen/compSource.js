// Where the lobby's comps come from: TFT Flow (the snapshot's own comps), MetaTFT, Tactics Tools or
// TFT Academy (`compSources` in each set). The choice is remembered, and a share URL carries it.
import { links } from './matrix.js';
import { getQueryParams } from './shareUrl.js';

const ORDER = ['tftflow', 'metatft', 'tactics', 'tftacademy'];
// First visit: MetaTFT; after that, whatever the user last picked (localStorage)
const DEFAULT_SOURCE = 'metatft';
const STORAGE_KEY = 'compSource';
const CAPTIONS = {
    tftflow: 'Curated comps and item conditions',
    metatft: 'Real ranked games, Platinum+',
    tactics: 'Real ranked games, Diamond+',
    tftacademy: 'Curated tier list',
};

// Each site's own logo (its favicon, kept in img/sources), always shown with a link to the site
const LOGOS = {
    tftflow: '/img/sources/tftflow.png',
    metatft: '/img/sources/metatft.ico',
    tactics: '/img/sources/tactics.svg',
    tftacademy: '/img/sources/tftacademy.svg',
};
export const sourceLogo = (id, cls = 'source-logo') =>
    LOGOS[id] ? `<img class="${cls}" src="${LOGOS[id]}" alt="" width="16" height="16">` : '';
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

const root = document.getElementById('sourceSwitch');
const note = document.getElementById('sourceNote');
let current = null;

// The set's sources in display order; older snapshots only have TFT Flow's comps
export function sourcesOf(set) {
    const list = set?.compSources?.length
        ? set.compSources
        : [{ id: 'tftflow', name: set?.source?.name || 'TFT Flow', url: set?.source?.url, stats: false }];
    return [...list].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}

// The set as the lobby sees it: the chosen source's comps and item conditions over the set's own data
export function sourceView(set, id) {
    const src = sourcesOf(set).find(s => s.id === id) || sourcesOf(set)[0];
    return {
        ...set,
        comps: src.comps || set.comps,
        conditions: src.conditions || (src.comps ? {} : set.conditions),
        source: { name: src.name, url: src.url },
        compSource: src,
    };
}

// Source for a set: the one in use, else the share URL's, else the remembered one, else TFT Flow
export function initialSource(set) {
    const ids = sourcesOf(set).map(s => s.id);
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    const wanted = [current, getQueryParams().source, saved, DEFAULT_SOURCE];
    current = wanted.find(id => id && ids.includes(id)) || ids[0];
    return current;
}

export const getSourceId = () => current;

// The switch above the comps: a menu of the set's sources; `onSwitch(id)` rebuilds the lobby
export function renderSourceSwitch(set, onSwitch) {
    if (!root) return;
    const sources = sourcesOf(set);
    const active = sources.find(s => s.id === current) || sources[0];
    root.hidden = sources.length < 2;
    root.innerHTML = `
        <button type="button" class="source-btn" aria-haspopup="menu" aria-expanded="false">
            <span class="source-from">Comps from</span>${sourceLogo(active.id)}<b>${active.name}</b>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="source-menu" role="menu" hidden>
            ${sources.map(s => `
                <button type="button" role="menuitemradio" aria-checked="${s.id === active.id}" data-source="${s.id}">
                    ${sourceLogo(s.id, 'source-logo lg')}
                    <span class="source-name">${s.name}${s.stats ? '<i class="source-tag">Stats</i>' : ''}</span>
                    <small>${CAPTIONS[s.id] || ''}${` · ${(s.comps || set.comps || []).length} comps`}</small>
                </button>`).join('')}
        </div>
        <div class="source-confirm" role="alertdialog" aria-live="polite" hidden></div>`;
    // credit: the comps' site, one click away
    const credit = document.getElementById('sourceCredit');
    if (credit) {
        credit.hidden = !active.url;
        credit.href = active.url || '#';
        credit.title = `Open ${active.name}`;
        credit.innerHTML = `${hostOf(active.url)}<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 11 13"/></svg>`;
    }
    if (note) {
        // small print: which patch and when the data is from, and whether the source has stats
        const updated = active.updatedAt || set.updatedAt;
        const parts = [
            set.patch && (set.patch === 'PBE' ? 'PBE' : `Patch ${set.patch}`),
            updated && `updated <time datetime="${updated}" title="${new Date(updated).toLocaleString()}">${timeAgo(updated)}</time>`,
            !active.stats && `${active.name} doesn't publish placement stats`,
        ].filter(Boolean);
        note.hidden = !parts.length;
        note.innerHTML = parts.join(' · ');
    }

    const btn = root.querySelector('.source-btn');
    const menu = root.querySelector('.source-menu');
    const confirmBox = root.querySelector('.source-confirm');
    const close = () => { menu.hidden = true; confirmBox.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', () => {
        const open = menu.hidden;
        close();
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        if (open) menu.querySelector('[aria-checked="true"]')?.focus();
    });
    menu.addEventListener('click', e => {
        const id = e.target.closest('[data-source]')?.dataset.source;
        if (!id) return;
        if (id === current) return close();
        const target = sources.find(s => s.id === id);
        const linked = links.length;
        if (!linked) return switchTo(id);
        // Comp links only mean something in the source they were made in: confirm before dropping them
        menu.hidden = true;
        confirmBox.hidden = false;
        confirmBox.innerHTML = `
            <p><b>Switch to ${target.name}?</b> The ${linked} comp ${linked === 1 ? 'link' : 'links'} in this lobby will be cleared. Players and their items stay.</p>
            <div class="source-confirm-actions">
                <button type="button" class="btn-ghost" data-act="cancel">Cancel</button>
                <button type="button" class="btn-primary" data-act="switch">Switch and clear</button>
            </div>`;
        confirmBox.querySelector('[data-act="switch"]').focus();
        confirmBox.onclick = ev => {
            const act = ev.target.closest('[data-act]')?.dataset.act;
            if (act === 'cancel') close();
            if (act === 'switch') switchTo(id);
        };
    });
    root.onkeydown = e => { if (e.key === 'Escape') { close(); btn.focus(); } };

    function switchTo(id) {
        close();
        current = id;
        try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
        onSwitch(id);
    }
}

// "12 min ago", "3 h ago", "2 days ago"
function timeAgo(iso) {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

// keep "updated … ago" current while the page stays open
setInterval(() => note?.querySelectorAll('time[datetime]').forEach(t => { t.textContent = timeAgo(t.getAttribute('datetime')); }), 60000);

// Clicking anywhere else closes the menu or the confirmation
document.addEventListener('click', e => {
    if (!root || root.contains(e.target)) return;
    root.querySelector('.source-menu')?.setAttribute('hidden', '');
    root.querySelector('.source-confirm')?.setAttribute('hidden', '');
    root.querySelector('.source-btn')?.setAttribute('aria-expanded', 'false');
});
