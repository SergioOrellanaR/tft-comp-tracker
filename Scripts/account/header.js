// The account button in the app header: "Sign in" when signed out; avatar, username and plan when signed in,
// with a small menu (account, Riot ID, sign out). Also finishes Google/Riot sign-ins that come back to the page.
import { authCall, getUser, setUser, refreshUser, avatarHtml, escapeHtml as esc } from './session.js';
import { openAccountDialog, isAccountDialogOpen } from './dialog.js';
import { showNotification } from '../mainScreen/shareUrl.js';

const slot = document.getElementById('accountSlot');
let menu = null;

const OAUTH_ERRORS = {
    cancelled: 'Sign-in was cancelled.',
    expired: 'That sign-in took too long. Please try again.',
    state: 'That sign-in couldn\'t be verified. Please try again.',
    email_unverified: 'Your Google account\'s email isn\'t verified.',
    taken: 'That account is already linked to another TrackerTFT account.',
    failed: 'Couldn\'t finish signing in. Please try again.',
};

function render(user) {
    closeMenu();
    if (!slot) return;
    if (!user) {
        slot.innerHTML = `<button type="button" class="acct-signin">Sign in</button>`;
        slot.firstElementChild.onclick = () => openAccountDialog('signin');
        return;
    }
    slot.innerHTML = `<button type="button" class="acct-chip" aria-haspopup="menu" aria-expanded="false" title="Your account">
        ${avatarHtml(user, 26)}<span class="acct-chip-name">${esc(user.username)}</span>${user.premium ? '<span class="acct-pro">PRO</span>' : ''}
        <svg class="acct-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`;
    slot.firstElementChild.onclick = e => { e.stopPropagation(); menu ? closeMenu() : openMenu(); };
}

function openMenu() {
    const user = getUser();
    const chip = slot.querySelector('.acct-chip');
    if (!user || !chip) return;
    menu = document.createElement('div');
    menu.className = 'acct-menu';
    menu.setAttribute('role', 'menu');
    const riot = user.riot?.verified ? user.riot.riot_id : null;
    menu.innerHTML = `
        <div class="acct-menu-hd">${avatarHtml(user, 40)}<div><b>${esc(user.username)}</b><span>${esc(user.email || riot || '')}</span></div></div>
        <div class="acct-menu-plan"><span class="acct-plan ${user.premium ? 'pro' : ''}">${user.premium ? 'Premium' : 'Free plan'}</span>
            ${riot ? `<span class="acct-menu-riot" title="Linked Riot account">${esc(riot)}</span>` : ''}</div>
        <button type="button" role="menuitem" data-open="settings">Account settings</button>
        ${riot ? '' : '<button type="button" role="menuitem" data-open="riot">Link your Riot ID</button>'}
        <button type="button" role="menuitem" class="acct-signout">Sign out</button>`;
    document.body.appendChild(menu);
    const r = chip.getBoundingClientRect();
    menu.style.top = `${r.bottom + 8}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    chip.setAttribute('aria-expanded', 'true');
    menu.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { closeMenu(); openAccountDialog(b.dataset.open); });
    menu.querySelector('.acct-signout').onclick = async () => {
        closeMenu();
        try { await authCall('/logout', { method: 'POST' }); } catch { /* signed out locally anyway */ }
        setUser(null);
        showNotification('Signed out');
    };
    menu.querySelector('button')?.focus();
    setTimeout(() => {
        document.addEventListener('click', outside);
        document.addEventListener('keydown', escape);
    }, 0);
}

function closeMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
    slot?.querySelector('.acct-chip')?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside);
    document.removeEventListener('keydown', escape);
}
const outside = e => { if (menu && !menu.contains(e.target)) closeMenu(); };
const escape = e => { if (e.key === 'Escape') { closeMenu(); slot?.querySelector('.acct-chip')?.focus(); } };

document.addEventListener('tft:userchange', e => {
    render(e.detail);
    // an account without a verified Riot ID is asked for it (the dialog walks through it once it's open)
    if (e.detail?.needs_riot_link && !isAccountDialogOpen()) openAccountDialog('riot');
});
window.addEventListener('resize', closeMenu);

// Coming back from Google / Riot: say what went wrong, if anything, and tidy the address bar
const params = new URLSearchParams(location.search);
const oauthError = params.get('auth_error');
if (oauthError) {
    params.delete('auth_error');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
}

render(null);
refreshUser().then(user => {
    if (oauthError) showNotification(OAUTH_ERRORS[oauthError] || OAUTH_ERRORS.failed, 6000);
    else if (user && document.referrer && /accounts\.google\.com|auth\.riotgames\.com/.test(document.referrer)) {
        showNotification(`Signed in as ${user.username}`);
    }
});
