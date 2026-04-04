'use strict';

// ── UID history (localStorage) ────────────────────────────────────────────────

function getHistory() {
    try { return JSON.parse(localStorage.getItem('uid_history') || '[]'); } catch { return []; }
}

function saveToHistory(uid, nickname) {
    const list = getHistory().filter(e => e.uid !== uid);
    list.unshift({ uid, nickname });
    localStorage.setItem('uid_history', JSON.stringify(list.slice(0, 10)));
}

function showHistory(side) {
    const list = getHistory();
    if (!list.length) return;
    const wrap = document.querySelector(`#uid-${side}`).closest('.uid-wrap');
    if (wrap.querySelector('.uid-history')) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'uid-history';
    list.forEach(({ uid, nickname }) => {
        const item = document.createElement('div');
        item.className = 'uid-history-item';
        item.innerHTML = `<span class="h-uid">${uid}</span><span class="h-name">${nickname}</span>`;
        item.addEventListener('mousedown', e => {
            e.preventDefault();
            document.getElementById(`uid-${side}`).value = uid;
            hideHistory(side);
            loadPlayer(side);
        });
        dropdown.appendChild(item);
    });
    wrap.appendChild(dropdown);
}

function hideHistory(side) {
    const wrap = document.querySelector(`#uid-${side}`)?.closest('.uid-wrap');
    wrap?.querySelector('.uid-history')?.remove();
}

// ── Core actions ──────────────────────────────────────────────────────────────

async function loadPlayer(side) {
    const uid = document.getElementById(`uid-${side}`).value.trim();
    if (!uid) return;

    const btn = document.getElementById(`btn-${side}`);
    btn.disabled = true;
    setStatus(side, '<span class="spinner"></span> Loading…', 'loading');
    document.getElementById(`info-${side}`).textContent = '';
    document.getElementById(`chars-${side}`).innerHTML  = '';
    state.selected[side] = null;
    updateComparison();

    try {
        const [apiRes, charData] = await Promise.all([
            fetch(`${ENKA_API}${uid}`),
            fetchCharData(),
        ]);

        if (!apiRes.ok) {
            const msgs = {
                400: 'Invalid UID',
                404: 'UID not found — make sure the profile is public',
                429: 'Rate limited — please wait a moment and try again',
            };
            throw new Error(msgs[apiRes.status] ?? `Server error (${apiRes.status})`);
        }

        const data = await apiRes.json();
        state.players[side] = { ...data, charData };

        const pi = data.playerInfo;
        document.getElementById(`info-${side}`).textContent =
            `${pi.nickname}  ·  AR ${pi.level}  ·  WL ${pi.worldLevel ?? 0}`;

        // Save to history
        saveToHistory(uid, pi.nickname);

        // Persist UID in URL
        const params = new URLSearchParams(window.location.search);
        params.set(`p${side}`, uid);
        history.replaceState(null, '', `?${params}`);

        clearStatus(side);

        const avatars = data.avatarInfoList ?? [];
        if (!avatars.length) {
            setStatus(side, 'No showcase characters found. Add characters to your in-game showcase first.');
            return;
        }

        const grid = document.getElementById(`chars-${side}`);
        avatars.forEach((av, idx) => grid.appendChild(renderCharCard(av, side, idx)));

    } catch (e) {
        setStatus(side, e.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

function selectChar(side, idx, cardEl) {
    document.querySelectorAll(`.char-card[data-side="${side}"]`).forEach(c => c.classList.remove('selected'));

    if (state.selected[side]?.idx === idx) {
        state.selected[side] = null;
        const params = new URLSearchParams(window.location.search);
        params.delete(`c${side}`);
        history.replaceState(null, '', `?${params}`);
        updateComparison();
        return;
    }

    cardEl.classList.add('selected');
    const pd = state.players[side];
    if (pd) {
        state.selected[side] = {
            idx,
            avatar:   pd.avatarInfoList[idx],
            charData: pd.charData,
            player:   pd.playerInfo,
        };
    }

    const params = new URLSearchParams(window.location.search);
    params.set(`c${side}`, idx);
    history.replaceState(null, '', `?${params}`);

    updateComparison();
}

function updateComparison() {
    const s1      = state.selected[1];
    const s2      = state.selected[2];
    const content = document.getElementById('comp-content');

    if (!s1 && !s2) {
        content.innerHTML = '<div class="comp-placeholder">Select a character on each side<br>to start comparing</div>';
        return;
    }

    content.innerHTML = `
        <div class="comp-char-row">
            ${renderCharBox(s1, 'left')}
            <div class="comp-vs-mid">VS</div>
            ${renderCharBox(s2, 'right')}
        </div>
        <div class="weapon-row">
            ${renderWeaponCard(s1, 'left')}
            <div class="weapon-divider">Weapon</div>
            ${renderWeaponCard(s2, 'right')}
        </div>
        <div class="stats-table">${renderStatRows(s1, s2)}</div>
    `;

    document.querySelector('.center-col')?.scrollTo({ top: 0, behavior: 'smooth' });
    if (s1 && s2 && window.innerWidth <= 767) setMobileTab('compare');
}

// ── Mobile tab navigation ─────────────────────────────────────────────────────

function setMobileTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach((p, i) =>
        p.classList.toggle('tab-active', tab === String(i + 1)));
    const cc = document.querySelector('.center-col');
    if (cc) cc.classList.toggle('tab-active', tab === 'compare');
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('btn-1').addEventListener('click', () => loadPlayer(1));
document.getElementById('btn-2').addEventListener('click', () => loadPlayer(2));
document.getElementById('uid-1').addEventListener('keydown', e => { if (e.key === 'Enter') loadPlayer(1); });
document.getElementById('uid-2').addEventListener('keydown', e => { if (e.key === 'Enter') loadPlayer(2); });
document.getElementById('uid-1').addEventListener('focus', () => showHistory(1));
document.getElementById('uid-2').addEventListener('focus', () => showHistory(2));
document.getElementById('uid-1').addEventListener('blur', () => hideHistory(1));
document.getElementById('uid-2').addEventListener('blur', () => hideHistory(2));
document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => setMobileTab(btn.dataset.tab)));

(async () => {
    const el = document.getElementById('proxy-status');
    try {
        await fetch(`${PROXY}api/uid/`, { signal: AbortSignal.timeout(3000) });
        el.style.color = '#5dbb63';
        el.textContent = '● Proxy connected';
    } catch {
        el.style.color = '#c8a96e';
        el.textContent = '● Server waking up — wait a few seconds, then refresh the page';
    }

    // Auto-load UIDs and select characters from URL params
    const params = new URLSearchParams(window.location.search);
    const loads = [1, 2].map(side => {
        const uid = params.get(`p${side}`);
        if (!uid) return Promise.resolve();
        document.getElementById(`uid-${side}`).value = uid;
        return loadPlayer(side);
    });
    await Promise.all(loads);

    for (const side of [1, 2]) {
        const cidx = params.get(`c${side}`);
        if (cidx == null) continue;
        const card = document.querySelector(`.char-card[data-side="${side}"][data-idx="${cidx}"]`);
        if (card) selectChar(side, Number(cidx), card);
    }
})();
