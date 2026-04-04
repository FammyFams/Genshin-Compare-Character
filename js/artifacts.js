'use strict';

// ── Artifact constants ────────────────────────────────────────────────────────

const SLOT_ORDER = ['EQUIP_BRACER', 'EQUIP_NECKLACE', 'EQUIP_SHOES', 'EQUIP_RING', 'EQUIP_DRESS'];
const SLOT_NAME  = {
    EQUIP_BRACER:   'Flower',
    EQUIP_NECKLACE: 'Feather',
    EQUIP_SHOES:    'Sands',
    EQUIP_RING:     'Goblet',
    EQUIP_DRESS:    'Circlet',
};

const ARTIFACT_STAT_NAME = {
    FIGHT_PROP_HP:                'HP',
    FIGHT_PROP_HP_PERCENT:        'HP%',
    FIGHT_PROP_ATTACK:            'ATK',
    FIGHT_PROP_ATTACK_PERCENT:    'ATK%',
    FIGHT_PROP_DEFENSE:           'DEF',
    FIGHT_PROP_DEFENSE_PERCENT:   'DEF%',
    FIGHT_PROP_ELEMENT_MASTERY:   'Elem. Mastery',
    FIGHT_PROP_CRITICAL:          'CRIT Rate',
    FIGHT_PROP_CRITICAL_HURT:     'CRIT DMG',
    FIGHT_PROP_CHARGE_EFFICIENCY: 'Energy Recharge',
    FIGHT_PROP_HEAL_ADD:          'Healing Bonus',
    FIGHT_PROP_FIRE_ADD_HURT:     'Pyro DMG',
    FIGHT_PROP_ELEC_ADD_HURT:     'Electro DMG',
    FIGHT_PROP_WATER_ADD_HURT:    'Hydro DMG',
    FIGHT_PROP_GRASS_ADD_HURT:    'Dendro DMG',
    FIGHT_PROP_WIND_ADD_HURT:     'Anemo DMG',
    FIGHT_PROP_ROCK_ADD_HURT:     'Geo DMG',
    FIGHT_PROP_ICE_ADD_HURT:      'Cryo DMG',
    FIGHT_PROP_PHYSICAL_ADD_HURT: 'Physical DMG',
};

const ARTIFACT_FLAT_STATS = new Set([
    'FIGHT_PROP_HP', 'FIGHT_PROP_ATTACK', 'FIGHT_PROP_DEFENSE', 'FIGHT_PROP_ELEMENT_MASTERY',
]);

const CRIT_STATS = new Set(['FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT']);

// ── Artifact helpers ──────────────────────────────────────────────────────────

function getArtifacts(avatar) {
    const bySlot = {};
    for (const item of avatar.equipList ?? []) {
        if (!item.reliquary) continue;
        const slot    = item.flat?.equipType;
        const nameHash = item.flat?.nameTextMapHash;
        const setHash  = item.flat?.setNameTextMapHash;
        bySlot[slot] = {
            slot,
            name:     (nameHash && state.locData?.[nameHash]) ?? SLOT_NAME[slot] ?? '',
            setName:  (setHash  && state.locData?.[setHash])  ?? '',
            iconUrl:  item.flat?.icon ? `${ICON_BASE}${item.flat.icon}.png` : BLANK_IMG,
            level:    (item.reliquary?.level ?? 1) - 1,
            rarity:   item.flat?.rankLevel ?? 4,
            mainStat: item.flat?.reliquaryMainstat ?? null,
            subStats: item.flat?.reliquarySubstats ?? [],
        };
    }
    return SLOT_ORDER.map(slot => bySlot[slot] ?? null);
}

function fmtArtStat(propId, value) {
    if (value == null) return '—';
    return ARTIFACT_FLAT_STATS.has(propId)
        ? Math.round(value).toLocaleString()
        : value.toFixed(1) + '%';
}

// ── Artifact rendering ────────────────────────────────────────────────────────

function renderArtifactCard(art, align) {
    if (!art) {
        return `<div class="art-card art-empty"><span>No artifact</span></div>`;
    }

    const mainName = ARTIFACT_STAT_NAME[art.mainStat?.mainPropId] ?? art.mainStat?.mainPropId ?? '';
    const mainVal  = fmtArtStat(art.mainStat?.mainPropId, art.mainStat?.statValue);

    const subsHtml = art.subStats.map(s => {
        const name   = ARTIFACT_STAT_NAME[s.appendPropId] ?? s.appendPropId;
        const val    = fmtArtStat(s.appendPropId, s.statValue);
        const isCrit = CRIT_STATS.has(s.appendPropId);
        return `<div class="art-sub${isCrit ? ' crit' : ''}">
            <span class="art-sub-name">${name}</span>
            <span class="art-sub-val">${val}</span>
        </div>`;
    }).join('');

    const critRate = art.subStats.find(s => s.appendPropId === 'FIGHT_PROP_CRITICAL')?.statValue ?? 0;
    const critDmg  = art.subStats.find(s => s.appendPropId === 'FIGHT_PROP_CRITICAL_HURT')?.statValue ?? 0;
    const cv       = critRate * 2 + critDmg;
    const cvTier   = cv >= 40 ? 'cv-green' : cv >= 30 ? 'cv-blue' : 'cv-gold';
    const cvHtml   = cv > 0 ? `<div class="art-cv ${cvTier}">CV ${cv.toFixed(1)}</div>` : '';

    return `
        <div class="art-card${align === 'right' ? ' right' : ''}">
            <div class="art-header">
                <img class="art-icon" src="${art.iconUrl}" alt="${art.name}"
                     onerror="this.src='${BLANK_IMG}'">
                <div class="art-info">
                    <div class="art-set">${art.setName}</div>
                    <div class="art-name">${art.name}</div>
                    <div class="art-level">+${art.level}</div>
                </div>
            </div>
            <div class="art-main">
                <span class="art-main-name">${mainName}</span>
                <span class="art-main-val">${mainVal}</span>
            </div>
            <div class="art-subs">${subsHtml}</div>
            ${cvHtml}
        </div>
    `;
}

function renderArtifactComparison(sel1, sel2) {
    const content = document.getElementById('comp-content');

    if (!sel1 && !sel2) {
        content.innerHTML = '<div class="comp-placeholder">Select a character on each side<br>to compare artifacts</div>';
        return;
    }

    const arts1 = sel1 ? getArtifacts(sel1.avatar) : Array(5).fill(null);
    const arts2 = sel2 ? getArtifacts(sel2.avatar) : Array(5).fill(null);

    const header = (sel1 || sel2) ? `
        <div class="comp-char-row">
            ${sel1 ? renderCharBox(sel1, 'left') : '<div class="comp-char-empty">No character selected</div>'}
            <div class="comp-vs-mid">VS</div>
            ${sel2 ? renderCharBox(sel2, 'right') : '<div class="comp-char-empty">No character selected</div>'}
        </div>
    ` : '';

    const rows = SLOT_ORDER.map((slot, i) => `
        <div class="art-row">
            ${renderArtifactCard(arts1[i], 'left')}
            <div class="art-slot-label">${SLOT_NAME[slot]}</div>
            ${renderArtifactCard(arts2[i], 'right')}
        </div>
    `).join('');

    content.innerHTML = header + rows;
    document.querySelector('.center-col')?.scrollTo({ top: 0, behavior: 'smooth' });
    if (sel1 && sel2 && window.innerWidth <= 767) setMobileTab('compare');
}

// ── Core actions ──────────────────────────────────────────────────────────────

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

async function loadPlayer(side, useCache = false) {
    const uid = document.getElementById(`uid-${side}`).value.trim();
    if (!uid) return;

    const btn = document.getElementById(`btn-${side}`);
    btn.disabled = true;
    setStatus(side, '<span class="spinner"></span> Loading…', 'loading');
    document.getElementById(`info-${side}`).textContent = '';
    document.getElementById(`chars-${side}`).innerHTML  = '';
    state.selected[side] = null;
    renderArtifactComparison(state.selected[1], state.selected[2]);

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

        const grid = document.getElementById(`chars-${side}`);
        avatars.forEach((av, idx) => grid.appendChild(renderCharCard(av, side, idx)));

    } catch (e) {
        const msg = e.message === 'Invalid UID' ? e.message : 'Enka is down, try again in a few minutes';
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
        renderArtifactComparison(state.selected[1], state.selected[2]);
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

    renderArtifactComparison(state.selected[1], state.selected[2]);
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

// Preserve URL params when switching pages (update on click so params are always current)
document.querySelectorAll('.page-nav-link').forEach(a => {
    const base = a.getAttribute('href');
    a.addEventListener('click', e => {
        e.preventDefault();
        window.location.href = base + window.location.search;
    });
});

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
