// Top-level views: the lobby tracker and the set summary (champion transitions). The active view is kept
// in the URL hash (#summary) so it survives reloads; share URLs are built from the query string and don't carry it.
import { addCompFilter } from './mainScreen/compSearchBar.js';

const VIEWS = ['tracker', 'summary'];
const tabs = document.querySelectorAll('#view-tabs [role="tab"]');
let transitionsModule = null;

export function showView(view) {
    if (!VIEWS.includes(view)) view = 'tracker';
    document.body.dataset.view = view;
    tabs.forEach(tab => {
        const active = tab.dataset.view === view;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
    });
    document.getElementById('tracker-view').hidden = view !== 'tracker';
    document.getElementById('transitions-view').hidden = view !== 'summary';

    const hash = view === 'tracker' ? '' : '#' + view;
    if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);

    if (view === 'tracker') {
        transitionsModule?.closeTransitionsDrawer();
    } else {
        openTransitions();
    }
}

async function openTransitions() {
    transitionsModule ??= await import('./transitionsView.js');
    await transitionsModule.initTransitionsView(document.getElementById('transitions-view'), {
        filterComps: champ => {
            showView('tracker');
            addCompFilter(champ);
        }
    });
    transitionsModule.refreshLobbyMarks();
}

export function initViewTabs() {
    tabs.forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
    // Arrow keys move between tabs (WAI-ARIA tabs pattern)
    document.getElementById('view-tabs').addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const list = [...tabs];
        const i = list.findIndex(t => t.getAttribute('aria-selected') === 'true');
        const next = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
        showView(next.dataset.view);
        next.focus();
    });
    window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
    showView(location.hash.slice(1));
}
