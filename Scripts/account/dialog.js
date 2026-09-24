// The account dialog: sign in, create an account, confirm the email with a code, reset a forgotten password,
// and (signed in) the account settings with the Riot ID link. Classes prefixed acct-.
import { CDRAGON_URL, CONFIG } from '../config.js';
import { authCall, authConfig, getUser, setUser, avatarHtml, escapeHtml as esc } from './session.js';
import { showNotification } from '../mainScreen/shareUrl.js';

let overlay = null;
let box = null;
let view = 'signin';
const state = { email: '', resendAt: 0, riot: null };
let turnstile = null; // { id } of the rendered widget

const ICONS = {
    google: `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`,
    riot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/></svg>`,
    eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
    mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>`,
};

// ---------- open / close ----------
export async function openAccountDialog(which = 'signin') {
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'acct-overlay';
        overlay.innerHTML = `<div class="acct-dialog" role="dialog" aria-modal="true" aria-labelledby="acct-title"></div>`;
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeAccountDialog(); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
        document.body.classList.add('acct-open');
        box = overlay.firstElementChild;
    }
    await go(which);
}

export function closeAccountDialog() {
    if (!overlay) return;
    dropTurnstile();
    overlay.remove();
    overlay = box = null;
    document.body.classList.remove('acct-open');
    document.removeEventListener('keydown', onKey);
}

function onKey(e) { if (e.key === 'Escape') closeAccountDialog(); }

async function go(next) {
    view = next;
    dropTurnstile();
    const cfg = await authConfig();
    if (!box) return;
    const render = VIEWS[view] || VIEWS.signin;
    box.innerHTML = `<button type="button" class="acct-x" aria-label="Close">×</button>${render(cfg)}`;
    box.querySelector('.acct-x').onclick = closeAccountDialog;
    WIRE[view]?.(cfg);
    const slot = box.querySelector('.acct-turnstile');
    if (slot && cfg.turnstile_site_key) mountTurnstile(slot, cfg.turnstile_site_key);
    box.querySelector('[autofocus]')?.focus();
}

// ---------- small pieces ----------
const header = (title, sub = '') => `<header class="acct-hd"><img src="/favicon.svg" alt="" width="28" height="28">
    <h2 id="acct-title">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</header>`;
const field = (label, input, hint = '') => `<label class="acct-field"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
const passwordInput = (name, autocomplete, extra = '') => `<span class="acct-pw"><input name="${name}" type="password" autocomplete="${autocomplete}" required minlength="10" maxlength="128" ${extra}>
    <button type="button" class="acct-eye" aria-label="Show password" aria-pressed="false">${ICONS.eye}</button></span>`;
const honeypot = `<div class="acct-hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>`;
const errorBox = `<p class="acct-error" role="alert" hidden></p>`;
const legal = `<p class="acct-legal">By continuing you agree to the <a href="/legal.html#terms" target="_blank" rel="noopener">Terms</a> and the <a href="/legal.html#privacy" target="_blank" rel="noopener">Privacy notice</a>.</p>`;

function providers(cfg) {
    const button = (id, label) => `<button type="button" class="acct-provider" data-provider="${id}" ${cfg[id] ? '' : 'disabled title="Coming soon"'}>
        ${ICONS[id]}<span>${label}</span>${cfg[id] ? '' : '<em>Soon</em>'}</button>`;
    return `<div class="acct-providers">${button('google', 'Continue with Google')}${button('riot', 'Continue with Riot account')}</div>`;
}

function showError(form, err) {
    const el = form.querySelector('.acct-error') || box.querySelector('.acct-error');
    if (!el) return;
    el.textContent = err?.message || String(err);
    el.hidden = false;
}

// Submit handling: busy button, errors shown in place, the bot check refreshed after each try
function onSubmit(form, handler) {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const button = form.querySelector('button[type=submit]');
        const errorEl = form.querySelector('.acct-error');
        if (errorEl) errorEl.hidden = true;
        button.disabled = true;
        button.classList.add('busy');
        try {
            await handler(Object.fromEntries(new FormData(form)));
        } catch (err) {
            showError(form, err);
            resetTurnstile();
        } finally {
            if (button.isConnected) { button.disabled = false; button.classList.remove('busy'); }
        }
    });
}

function wirePasswords() {
    box.querySelectorAll('.acct-eye').forEach(btn => btn.onclick = () => {
        const input = btn.previousElementSibling;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    box.querySelectorAll('[data-meter]').forEach(input => {
        const meter = box.querySelector(`#${input.dataset.meter}`);
        input.addEventListener('input', () => {
            const s = strength(input.value);
            meter.dataset.score = s;
            meter.querySelector('span').textContent = input.value ? ['Too short', 'Weak', 'Okay', 'Good', 'Strong'][s] : '';
        });
    });
}

// A hint only: the server has the real rules (length, not breached, not your name)
function strength(pw) {
    if (pw.length < 10) return 0;
    const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\w]/].filter(r => r.test(pw)).length;
    return Math.min(4, 1 + (pw.length >= 14) + (kinds >= 3) + (pw.length >= 18 && kinds === 4));
}

function wireProviders() {
    box.querySelectorAll('[data-provider]:not([disabled])').forEach(b => b.onclick = () => {
        const next = location.pathname + location.search + location.hash;
        location.href = `/api/auth/${b.dataset.provider}/start?next=${encodeURIComponent(next)}`;
    });
    box.querySelectorAll('[data-go]').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
}

function signedIn(user, message) {
    setUser(user);
    closeAccountDialog();
    showNotification(message || `Signed in as ${user.username}`);
}

// ---------- Cloudflare Turnstile (bot check) ----------
let turnstileLoading = null;
function loadTurnstile() {
    turnstileLoading ??= new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = () => resolve(window.turnstile);
        s.onerror = () => { turnstileLoading = null; reject(new Error('Bot check unavailable')); };
        document.head.appendChild(s);
    });
    return turnstileLoading;
}

async function mountTurnstile(slot, siteKey) {
    try {
        const ts = await loadTurnstile();
        if (!slot.isConnected) return;
        turnstile = { id: ts.render(slot, { sitekey: siteKey, theme: 'light', size: 'flexible', appearance: 'interaction-only' }) };
    } catch { /* the server will say the check is missing */ }
}
const turnstileToken = () => (turnstile && window.turnstile?.getResponse(turnstile.id)) || null;
function resetTurnstile() { if (turnstile) window.turnstile?.reset(turnstile.id); }
function dropTurnstile() { if (turnstile) { try { window.turnstile?.remove(turnstile.id); } catch { /* gone */ } turnstile = null; } }

// ---------- views ----------
const VIEWS = {
    signin: cfg => `${header('Sign in to TrackerTFT', 'Your lobbies, your rivals and your Riot account in one place.')}
        ${providers(cfg)}
        <div class="acct-or"><span>or with email</span></div>
        <form class="acct-form" novalidate>
            ${field('Email', `<input name="email" type="email" autocomplete="email" required autofocus value="${esc(state.email)}">`)}
            ${field('Password', passwordInput('password', 'current-password'))}
            <a href="#" class="acct-link acct-forgot" data-go="forgot">Forgot password?</a>
            ${honeypot}<div class="acct-turnstile"></div>${errorBox}
            <button type="submit" class="btn-primary acct-submit">Sign in</button>
        </form>
        <p class="acct-switch">New here? <a href="#" data-go="signup">Create an account</a></p>${legal}`,

    signup: cfg => `${header('Create your account', 'Free. Link your Riot account whenever you want.')}
        ${providers(cfg)}
        <div class="acct-or"><span>or with email</span></div>
        <form class="acct-form" novalidate>
            ${field('Username', `<input name="username" autocomplete="username" required minlength="3" maxlength="20" autofocus>`, '3 to 20 characters. Shown on your account.')}
            ${field('Email', `<input name="email" type="email" autocomplete="email" required value="${esc(state.email)}">`)}
            ${field('Password', passwordInput('password', 'new-password', 'data-meter="acct-meter"'), '<span class="acct-meter" id="acct-meter" data-score="0"><i></i><i></i><i></i><i></i><span></span></span>At least 10 characters. A phrase is easy to remember.')}
            <label class="acct-check"><input type="checkbox" name="accept_terms" required><span>I agree to the <a href="/legal.html#terms" target="_blank" rel="noopener">Terms</a> and the <a href="/legal.html#privacy" target="_blank" rel="noopener">Privacy notice</a>.</span></label>
            ${honeypot}<div class="acct-turnstile"></div>${errorBox}
            <button type="submit" class="btn-primary acct-submit" ${cfg.email ? '' : 'disabled title="Email sign-up is coming soon"'}>Create account</button>
        </form>
        <p class="acct-switch">Already have an account? <a href="#" data-go="signin">Sign in</a></p>`,

    verify: () => `${header('Check your inbox', `We sent a 6-digit code to <b>${esc(state.email)}</b>. It expires in 15 minutes.`)}
        <div class="acct-mailicon">${ICONS.mail}</div>
        <form class="acct-form" novalidate>
            ${field('Code', `<input name="code" class="acct-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus>`)}
            ${errorBox}
            <button type="submit" class="btn-primary acct-submit">Confirm email</button>
        </form>
        <p class="acct-switch"><button type="button" class="acct-link acct-resend">Send a new code</button> · <a href="#" data-go="signup">Use another email</a></p>
        <p class="acct-note">Can't find it? Look in spam or promotions.</p>`,

    forgot: () => `${header('Reset your password', 'Enter your account\'s email and we\'ll send you a code.')}
        <form class="acct-form" novalidate>
            ${field('Email', `<input name="email" type="email" autocomplete="email" required autofocus value="${esc(state.email)}">`)}
            ${honeypot}<div class="acct-turnstile"></div>${errorBox}
            <button type="submit" class="btn-primary acct-submit">Send code</button>
        </form>
        <p class="acct-switch"><a href="#" data-go="signin">Back to sign in</a></p>`,

    reset: () => `${header('Choose a new password', `If <b>${esc(state.email)}</b> has an account, a code is on its way.`)}
        <form class="acct-form" novalidate>
            ${field('Code', `<input name="code" class="acct-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus>`)}
            ${field('New password', passwordInput('password', 'new-password', 'data-meter="acct-meter"'), '<span class="acct-meter" id="acct-meter" data-score="0"><i></i><i></i><i></i><i></i><span></span></span>You\'ll be signed out everywhere else.')}
            ${errorBox}
            <button type="submit" class="btn-primary acct-submit">Save and sign in</button>
        </form>
        <p class="acct-switch"><a href="#" data-go="forgot">Send another code</a></p>`,

    settings: cfg => {
        const u = getUser();
        if (!u) return VIEWS.signin(cfg);
        const riot = u.riot;
        const method = (id, label, on, action) => `<li><span class="acct-mlabel">${id === 'password' ? ICONS.mail : ICONS[id]}${label}</span>
            ${on ? `<span class="acct-on">${ICONS.check}Connected</span>` : ''}${action}</li>`;
        const canDrop = [u.methods.password, u.methods.google, u.methods.riot].filter(Boolean).length > 1;
        return `${header('Your account')}
        <section class="acct-card acct-me">${avatarHtml(u, 52)}
            <div><b>${esc(u.username)}</b><span>${esc(u.email || (riot ? riot.riot_id : ''))}</span></div>
            <span class="acct-plan ${u.premium ? 'pro' : ''}">${u.premium ? 'Premium' : 'Free plan'}</span></section>

        <section class="acct-sec"><h3>Profile</h3>
            <form class="acct-inline" data-form="profile" novalidate>
                ${field('Username', `<input name="username" value="${esc(u.username)}" required minlength="3" maxlength="20" autocomplete="username">`)}
                <button type="submit" class="acct-btn">Save</button>${errorBox}
            </form></section>

        <section class="acct-sec"><h3>Riot account</h3>
            ${riot?.verified
                ? `<div class="acct-riot">${riot.profile_icon_id != null ? `<img src="${CDRAGON_URL.profileIcons}/${riot.profile_icon_id}.jpg" alt="">` : ''}
                    <div><b>${esc(riot.riot_id)}</b><span>${ICONS.check}Verified${riot.server ? ` · ${esc(riot.server)}` : ''}</span></div>
                    <button type="button" class="acct-btn ghost" data-act="unlink-riot">Unlink</button></div>`
                : `<p class="acct-note">Link the Riot account you play with. It lets TrackerTFT show your own history against the players you meet.</p>
                   <button type="button" class="acct-btn" data-go="riot">Link your Riot ID</button>`}
        </section>

        <section class="acct-sec"><h3>Sign-in methods</h3><ul class="acct-methods">
            ${method('password', 'Email and password', u.methods.password, `<button type="button" class="acct-btn ghost" data-go="password">${u.methods.password ? 'Change password' : 'Set a password'}</button>`)}
            ${method('google', 'Google', u.methods.google, u.methods.google
                ? (canDrop ? '<button type="button" class="acct-btn ghost" data-act="drop-google">Disconnect</button>' : '')
                : `<button type="button" class="acct-btn ghost" data-link="google" ${cfg.google ? '' : 'disabled title="Coming soon"'}>Connect</button>`)}
            ${method('riot', 'Riot Sign On', u.methods.riot, u.methods.riot
                ? (canDrop ? '<button type="button" class="acct-btn ghost" data-act="drop-riot">Disconnect</button>' : '')
                : `<button type="button" class="acct-btn ghost" data-link="riot" ${cfg.riot ? '' : 'disabled title="Coming soon"'}>Connect</button>`)}
        </ul></section>

        <section class="acct-sec"><h3>Plan</h3>
            ${u.premium
                ? `<p class="acct-note">You're on <b>Premium</b>${u.plan_expires_at ? ` until ${new Date(u.plan_expires_at).toLocaleDateString()}` : ''}. Thanks for supporting TrackerTFT.</p>`
                : '<p class="acct-note">You\'re on the <b>Free</b> plan. Premium is coming soon.</p>'}
        </section>

        <section class="acct-sec"><h3>Security</h3>
            <button type="button" class="acct-btn ghost" data-act="logout-all">Sign out of every device</button></section>

        <section class="acct-sec danger"><h3>Delete account</h3>
            <p class="acct-note">Deletes your account and everything tied to it. This can't be undone.</p>
            <form class="acct-inline" data-form="delete" novalidate>
                ${u.methods.password
                    ? field('Password', `<input name="password" type="password" autocomplete="current-password" required>`)
                    : field(`Type <b>${esc(u.username)}</b> to confirm`, '<input name="confirm" required autocomplete="off">')}
                <button type="submit" class="acct-btn danger">Delete account</button>${errorBox}
            </form></section>`;
    },

    password: () => {
        const u = getUser();
        return `${header(u?.methods.password ? 'Change your password' : 'Set a password', 'You\'ll stay signed in here and be signed out everywhere else.')}
        <form class="acct-form" novalidate>
            ${u?.methods.password ? field('Current password', passwordInput('current', 'current-password', 'autofocus')) : ''}
            ${field('New password', passwordInput('password', 'new-password', 'data-meter="acct-meter"'), '<span class="acct-meter" id="acct-meter" data-score="0"><i></i><i></i><i></i><i></i><span></span></span>At least 10 characters.')}
            ${errorBox}
            <button type="submit" class="btn-primary acct-submit">Save password</button>
        </form>
        <p class="acct-switch"><a href="#" data-go="settings">Back to your account</a></p>`;
    },

    riot: () => {
        const c = state.riot;
        if (c) {
            return `${header('Change your profile icon', `To prove <b>${esc(c.riot_id)}</b> is yours, switch its profile icon to this one:`)}
            <div class="acct-challenge"><img src="${CDRAGON_URL.profileIcons}/${c.icon_id}.jpg" alt="Profile icon ${c.icon_id}" width="96" height="96"></div>
            <ol class="acct-steps"><li>In the League of Legends client, open your profile and click your icon.</li>
                <li>Pick this icon (it's one of the free default ones) and save.</li>
                <li>Come back and press <b>Verify</b>. You can switch back afterwards.</li></ol>
            <form class="acct-form" novalidate>${errorBox}
                <button type="submit" class="btn-primary acct-submit">Verify</button></form>
            <p class="acct-switch"><a href="#" data-act="riot-restart">Use another Riot ID</a> · <a href="#" data-go="settings">Back to your account</a></p>`;
        }
        const u = getUser();
        const current = document.getElementById('serverSelector')?.value;
        return `${header('Link your Riot ID', 'We\'ll ask you to change your profile icon for a moment, to check the account is yours.')}
        <form class="acct-form" novalidate>
            ${field('Riot ID', `<input name="riot_id" placeholder="Name#TAG" required autofocus autocomplete="off" spellcheck="false" value="${esc(u?.riot && !u.riot.verified ? u.riot.riot_id : '')}">`)}
            ${field('Region', `<select name="server">${Object.keys(CONFIG.serverRegionMap).map(r => `<option ${r === current ? 'selected' : ''}>${r}</option>`).join('')}</select>`)}
            ${errorBox}
            <button type="submit" class="btn-primary acct-submit">Continue</button>
        </form>
        <p class="acct-switch"><a href="#" data-go="settings">Back to your account</a></p>`;
    },
};

// ---------- behaviour ----------
const WIRE = {
    signin: () => {
        wireProviders(); wirePasswords();
        onSubmit(box.querySelector('form'), async data => {
            state.email = data.email;
            const res = await authCall('/login', { method: 'POST', body: { email: data.email, password: data.password, website: data.website, turnstile: turnstileToken() } });
            if (res.status === 'verify') { state.resendAt = Date.now() + 60000; return go('verify'); }
            signedIn(res.user, `Welcome back, ${res.user.username}`);
        });
    },
    signup: () => {
        wireProviders(); wirePasswords();
        onSubmit(box.querySelector('form'), async data => {
            if (!data.accept_terms) throw new Error('Please accept the terms and privacy notice to create an account.');
            state.email = data.email;
            await authCall('/register', { method: 'POST', body: { username: data.username, email: data.email, password: data.password, accept_terms: true, website: data.website, turnstile: turnstileToken() } });
            state.resendAt = Date.now() + 60000;
            go('verify');
        });
    },
    verify: () => {
        wireProviders();
        const form = box.querySelector('form');
        onSubmit(form, async data => {
            const res = await authCall('/verify-email', { method: 'POST', body: { email: state.email, code: data.code } });
            signedIn(res.user, `Welcome to TrackerTFT, ${res.user.username}!`);
        });
        autoSubmitCode(form);
        wireResend(box.querySelector('.acct-resend'), () => authCall('/resend-code', { method: 'POST', body: { email: state.email } }));
    },
    forgot: () => {
        wireProviders();
        onSubmit(box.querySelector('form'), async data => {
            state.email = data.email;
            await authCall('/password/forgot', { method: 'POST', body: { email: data.email, website: data.website, turnstile: turnstileToken() } });
            go('reset');
        });
    },
    reset: () => {
        wireProviders(); wirePasswords();
        onSubmit(box.querySelector('form'), async data => {
            const res = await authCall('/password/reset', { method: 'POST', body: { email: state.email, code: data.code, password: data.password } });
            signedIn(res.user, 'Password changed. You\'re signed in.');
        });
    },
    settings: () => {
        wireProviders();
        const u = getUser();
        if (!u) return WIRE.signin();
        onSubmit(box.querySelector('[data-form=profile]'), async data => {
            const res = await authCall('/profile', { method: 'PATCH', body: { username: data.username } });
            setUser(res.user);
            showNotification('Username saved');
            go('settings');
        });
        onSubmit(box.querySelector('[data-form=delete]'), async data => {
            await authCall('/account/delete', { method: 'POST', body: data });
            setUser(null);
            closeAccountDialog();
            showNotification('Your account was deleted');
        });
        box.querySelectorAll('[data-link]:not([disabled])').forEach(b => b.onclick = () => {
            location.href = `/api/auth/${b.dataset.link}/start?link=1&next=${encodeURIComponent(location.pathname + location.search)}`;
        });
        const act = async (name, fn) => {
            const b = box.querySelector(`[data-act=${name}]`);
            if (b) b.onclick = async () => { b.disabled = true; try { await fn(); } catch (err) { showNotification(err.message); b.disabled = false; } };
        };
        act('unlink-riot', async () => { setUser((await authCall('/riot-link', { method: 'DELETE' })).user); go('settings'); });
        act('drop-google', async () => { setUser((await authCall('/identity/google', { method: 'DELETE' })).user); go('settings'); });
        act('drop-riot', async () => { setUser((await authCall('/identity/riot', { method: 'DELETE' })).user); go('settings'); });
        act('logout-all', async () => { await authCall('/logout-all', { method: 'POST' }); setUser(null); closeAccountDialog(); showNotification('Signed out of every device'); });
    },
    password: () => {
        wireProviders(); wirePasswords();
        onSubmit(box.querySelector('form'), async data => {
            const res = await authCall('/password/change', { method: 'POST', body: { current: data.current || null, password: data.password } });
            setUser(res.user);
            showNotification('Password saved');
            go('settings');
        });
    },
    riot: () => {
        wireProviders();
        const restart = box.querySelector('[data-act=riot-restart]');
        if (restart) restart.onclick = e => { e.preventDefault(); state.riot = null; go('riot'); };
        onSubmit(box.querySelector('form'), async data => {
            if (!state.riot) {
                const res = await authCall('/riot-link/start', { method: 'POST', body: { riot_id: data.riot_id, server: data.server } });
                setUser(res.user);
                state.riot = { icon_id: res.icon_id, riot_id: res.riot_id };
                return go('riot');
            }
            const res = await authCall('/riot-link/verify', { method: 'POST' });
            state.riot = null;
            setUser(res.user);
            showNotification(`${res.user.riot.riot_id} is linked to your account`);
            go('settings');
        });
    },
};

// Six digits typed or pasted: submit right away
function autoSubmitCode(form) {
    const input = form.querySelector('.acct-code');
    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
        if (input.value.length === 6) form.requestSubmit();
    });
}

function wireResend(button, send) {
    const tick = () => {
        if (!button.isConnected) return;
        const left = Math.ceil((state.resendAt - Date.now()) / 1000);
        button.disabled = left > 0;
        button.textContent = left > 0 ? `Send a new code (${left}s)` : 'Send a new code';
        if (left > 0) setTimeout(tick, 1000);
    };
    tick();
    button.onclick = async () => {
        button.disabled = true;
        try {
            await send();
            state.resendAt = Date.now() + 60000;
            showNotification('A new code is on its way');
        } catch (err) { showNotification(err.message); }
        tick();
    };
}
