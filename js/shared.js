'use strict';

// ── Analytics helper ──────────────────────────────────────────────────────────

function trackEvent(name, params = {}) {
    if (typeof gtag === 'function') gtag('event', name, params);
}

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
            trackEvent('history_uid_selected', { nickname });
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

const _currentPage = document.title.includes('Artifact') ? 'artifacts' : 'stats';

async function loadPlayer(side, useCache = false) {
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
        const charData = await fetchCharData();

        let data = useCache ? loadPlayerCache(uid) : null;
        if (!data) {
            const apiRes = await fetch(`${ENKA_API}${uid}`);
            if (!apiRes.ok) {
                throw new Error(apiRes.status === 400
                    ? 'Invalid UID'
                    : 'Enka is down, try again in a few minutes');
            }
            data = await apiRes.json();
            savePlayerCache(uid, data);
        }

        state.players[side] = { ...data, charData };

        const pi = data.playerInfo;
        document.getElementById(`info-${side}`).textContent =
            `${pi.nickname}  ·  AR ${pi.level}  ·  WL ${pi.worldLevel ?? 0}`;

        saveToHistory(uid, pi.nickname);

        const params = new URLSearchParams(window.location.search);
        params.set(`p${side}`, uid);
        history.replaceState(null, '', `?${params}`);

        clearStatus(side);

        const avatars = data.avatarInfoList ?? [];
        if (!avatars.length) {
            setStatus(side, 'No showcase characters found. Add characters to your in-game showcase first.');
            return;
        }

        trackEvent('uid_loaded', {
            uid,
            nickname:        pi.nickname,
            ar_level:        pi.level,
            world_level:     pi.worldLevel ?? 0,
            character_count: avatars.length,
            side:            `player_${side}`,
            source:          useCache ? 'url_param' : 'manual',
            page:            _currentPage,
        });

        const grid = document.getElementById(`chars-${side}`);
        avatars.forEach((av, idx) => grid.appendChild(renderCharCard(av, side, idx)));

    } catch (e) {
        const msg = e.message === 'Invalid UID' ? e.message : 'Enka is down, try again in a few minutes';
        trackEvent('uid_load_error', { error: msg, side: `player_${side}`, page: _currentPage });
        setStatus(side, msg, 'error');
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

        const ci = getCharInfo(pd.avatarInfoList[idx].avatarId, pd.charData);
        trackEvent('character_selected', {
            character_name:  ci.name,
            character_level: getLevel(pd.avatarInfoList[idx]),
            constellation:   getCons(pd.avatarInfoList[idx]),
            side:            `player_${side}`,
            page:            _currentPage,
        });
    }

    const params = new URLSearchParams(window.location.search);
    params.set(`c${side}`, idx);
    history.replaceState(null, '', `?${params}`);

    updateComparison();
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

document.querySelectorAll('.page-nav-link').forEach(a => {
    const base = a.getAttribute('href');
    a.addEventListener('click', e => {
        e.preventDefault();
        trackEvent('page_nav_click', {
            from: _currentPage,
            to:   a.dataset.page,
        });
        window.location.href = base + window.location.search;
    });
});

document.getElementById('btn-1').addEventListener('click', () => loadPlayer(1));
document.getElementById('btn-2').addEventListener('click', () => loadPlayer(2));
document.getElementById('uid-1').addEventListener('keydown', e => { if (e.key === 'Enter') loadPlayer(1); });
document.getElementById('uid-2').addEventListener('keydown', e => { if (e.key === 'Enter') loadPlayer(2); });
document.getElementById('uid-1').addEventListener('focus', () => showHistory(1));
document.getElementById('uid-2').addEventListener('focus', () => showHistory(2));
document.getElementById('uid-1').addEventListener('blur',  () => hideHistory(1));
document.getElementById('uid-2').addEventListener('blur',  () => hideHistory(2));
document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => {
        trackEvent('mobile_tab_switched', { tab: btn.dataset.tab, page: _currentPage });
        setMobileTab(btn.dataset.tab);
    }));

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

    const params = new URLSearchParams(window.location.search);

    // Track shared URL opens (someone opened a link with pre-filled state)
    const hasSharedLink = params.has('p1') || params.has('p2');
    if (hasSharedLink) {
        trackEvent('shared_link_opened', {
            has_p1: params.has('p1'),
            has_p2: params.has('p2'),
            has_c1: params.has('c1'),
            has_c2: params.has('c2'),
            page:   _currentPage,
        });
    }

    const loads = [1, 2].map(side => {
        const uid = params.get(`p${side}`);
        if (!uid) return Promise.resolve();
        document.getElementById(`uid-${side}`).value = uid;
        return loadPlayer(side, true);
    });
    await Promise.all(loads);

    for (const side of [1, 2]) {
        const cidx = params.get(`c${side}`);
        if (cidx == null) continue;
        const card = document.querySelector(`.char-card[data-side="${side}"][data-idx="${cidx}"]`);
        if (card) selectChar(side, Number(cidx), card);
    }
})();
