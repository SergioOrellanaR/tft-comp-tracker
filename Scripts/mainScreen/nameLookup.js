// VIP stand-in while Riot's spectator API is off: rename a column with the name seen in game (the game doesn't
// show tags) and the backend finds who it is among your own games. One match fills in the Riot ID and checks your
// games against them; several open a picker under the column. A full Name#TAG skips the lookup.
import { fetchOpponents, fetchPlayerSummary } from '../tftVersusHandler.js';
import { createLoadingSpinner } from '../components.js';
import { hasFeature, escapeHtml, getUser } from '../account/session.js';
import { renamePlayer, ownRiotId, setPlayerAvatar } from './players.js';
import { checkVersus, clearPlayerActions, createAndInsertPlayerRankDiv } from './searchCurrentGame.js';
import { showNotification } from './shareUrl.js';

let picker = null;

document.addEventListener('tft:playerrename', e => {
    const { player, name } = e.detail;
    if (player) lookup(player, name);
});

async function lookup(player, name) {
    if (!hasFeature('name_lookup') || !ownRiotId() || name === ownRiotId()) return;
    closePicker();
    const actions = player.querySelector('.player-action-container');
    // your games are on your Riot ID's server (Riot Sign On links don't say which: the region picked then)
    const server = getUser()?.riot?.server || document.getElementById('serverSelector').value;
    clearProfile(player);
    if (name.includes('#')) {
        checkVersus(player, server);
        loadProfile(player, name, server);
        return;
    }
    const spinner = createLoadingSpinner();
    spinner.classList.add('duel-spinner');
    spinner.title = `Looking for ${name} in your games`;
    clearPlayerActions(actions);
    actions.appendChild(spinner);

    let result;
    try {
        result = await fetchOpponents(name, server);
    } catch {
        result = { detail: "Couldn't reach TrackerTFT. Try again in a moment." };
    }
    // renamed again (or the lobby reset) while this ran
    if (!player.isConnected || currentName(player) !== name) return;
    spinner.remove();

    if (!result || result.detail !== undefined) {
        showNotification(result?.status === 429
            ? `Riot is busy, try again in ${result.retryAfter || 10}s.`
            : result?.detail || "Couldn't look that player up.", 5000);
        return;
    }
    const found = result.players || [];
    if (!found.length) {
        showNotification(`No ${name} in your recent games. Type their full Riot ID (Name#TAG) to check it.`, 5000);
    } else if (found.length === 1) {
        pick(player, found[0].riot_id, result.server);
    } else {
        openPicker(player, name, found, result.server);
    }
}

const currentName = player => player.querySelector('.player-name')?.textContent.trim();

function pick(player, riotId, server) {
    closePicker();
    renamePlayer(player, riotId);
    checkVersus(player, server);
    loadProfile(player, riotId, server);
}

// The column shows the player as the live game does: their profile icon in place of the number, and their rank
async function loadProfile(player, riotId, server) {
    const summary = await fetchPlayerSummary(riotId, server).catch(() => null);
    if (!summary || summary.detail !== undefined || !player.isConnected || currentName(player) !== riotId) return;
    setPlayerAvatar(player, summary.profile_icon_id);
    const rank = summary.rank_info;
    if (!rank?.tier) return;
    let info = player.querySelector('.participant-info-container');
    if (!info) {
        info = document.createElement('div');
        info.className = 'participant-info-container';
        player.insertBefore(info, player.querySelector('.player-items'));
        info.appendChild(player.querySelector('.player-name'));
    }
    info.appendChild(createAndInsertPlayerRankDiv(rank.tier, rank.rank, rank.lp));
}

// A new name: the previous player's icon and rank go
function clearProfile(player) {
    const img = player.querySelector('.player-avatar img');
    if (img) { img.onload = null; img.hidden = true; img.removeAttribute('src'); }
    player.querySelectorAll('.mini-rank-div').forEach(rank => rank.remove());
}

function openPicker(player, name, found, server) {
    picker = document.createElement('div');
    picker.className = 'vs-glance vs-pick';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', `Players named ${name}`);
    picker.innerHTML = `
        <div class="vs-g-head"><div class="vs-who"><b>Which ${escapeHtml(name)}?</b>
            <span class="vs-lbl">${found.length} players with this name in your games</span></div>
            <button type="button" class="vs-x" aria-label="Close">×</button></div>
        <ul class="vs-pick-list">${found.map((p, i) => {
            const [gameName, tag] = p.riot_id.split('#');
            const when = p.last_played ? ` · last ${lastPlayed(p.last_played)}` : '';
            return `<li><button type="button" data-i="${i}"><b>${escapeHtml(gameName)}<span class="riot-tag">#${escapeHtml(tag)}</span></b>
                <span>${p.games} ${p.games === 1 ? 'game' : 'games'}${when}</span></button></li>`;
        }).join('')}</ul>`;
    document.body.appendChild(picker);
    place(player);

    picker.querySelector('.vs-x').onclick = closePicker;
    picker.querySelectorAll('.vs-pick-list button').forEach(button => {
        button.onclick = () => pick(player, found[button.dataset.i].riot_id, server);
    });
    const onOutside = e => { if (picker && !picker.contains(e.target)) closePicker(); };
    const onKey = e => { if (e.key === 'Escape') closePicker(); };
    setTimeout(() => document.addEventListener('click', onOutside), 0);
    document.addEventListener('keydown', onKey);
    picker._cleanup = () => {
        document.removeEventListener('click', onOutside);
        document.removeEventListener('keydown', onKey);
    };
    picker.querySelector('.vs-pick-list button')?.focus();
}

// Under the column, like the versus Glance card (a bottom sheet on phones)
function place(column) {
    const r = column.getBoundingClientRect();
    if (window.innerWidth <= 640) return;
    const w = picker.offsetWidth || 330;
    const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - 40));
    picker.style.left = `${left}px`;
    picker.style.top = `${r.bottom + 10}px`;
    picker.style.setProperty('--arrow', `${Math.max(16, r.left + r.width / 2 - left - 7)}px`);
}

function closePicker() {
    picker?._cleanup?.();
    picker?.remove();
    picker = null;
}

function lastPlayed(epochMs) {
    const date = new Date(epochMs);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
