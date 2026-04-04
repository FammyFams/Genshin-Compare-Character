'use strict';

// Enka.network doesn't set CORS headers, so requests are proxied through a
// Render.com web service.
const PROXY         = 'https://genshin-compare-proxy.onrender.com/';
const ENKA_API      = `${PROXY}api/uid/`;
const ICON_BASE     = 'https://enka.network/ui/';
const CHAR_DATA_URL = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json';
const LOC_DATA_URL  = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/loc.json';
const YATTA_URL     = 'https://gi.yatta.moe/api/v2/en/avatar';

// ── Lookup tables ────────────────────────────────────────────────────────────

const ELEM_COLOR = {
    Fire:     '#e8602c',
    Water:    '#4aaad8',
    Wind:     '#74c8a0',
    Electric: '#b088cc',
    Grass:    '#7cbb50',
    Ice:      '#90d8e8',
    Rock:     '#c8a050',
};

/** Combat stats shown in the comparison table. */
const FIGHT_PROPS = [
    { key: '2000', name: 'Max HP',            fmt: 'int' },
    { key: '2001', name: 'ATK',               fmt: 'int' },
    { key: '2002', name: 'DEF',               fmt: 'int' },
    { key: '28',   name: 'Elemental Mastery', fmt: 'int' },
    { key: '20',   name: 'CRIT Rate',         fmt: 'pct' },
    { key: '22',   name: 'CRIT DMG',          fmt: 'pct' },
    { key: '23',   name: 'Energy Recharge',   fmt: 'pct' },
    { key: '26',   name: 'Healing Bonus',     fmt: 'pct' },
];

/** Elemental DMG bonus stats — only shown when at least one character has them. */
const DMG_PROPS = [
    { key: '40', name: 'Pyro DMG Bonus',     fmt: 'pct' },
    { key: '41', name: 'Electro DMG Bonus',  fmt: 'pct' },
    { key: '42', name: 'Hydro DMG Bonus',    fmt: 'pct' },
    { key: '43', name: 'Dendro DMG Bonus',   fmt: 'pct' },
    { key: '44', name: 'Anemo DMG Bonus',    fmt: 'pct' },
    { key: '45', name: 'Geo DMG Bonus',      fmt: 'pct' },
    { key: '46', name: 'Cryo DMG Bonus',     fmt: 'pct' },
    { key: '30', name: 'Physical DMG Bonus', fmt: 'pct' },
];

const WEAPON_SUBSTAT_NAME = {
    FIGHT_PROP_CRITICAL:          'CRIT Rate',
    FIGHT_PROP_CRITICAL_HURT:     'CRIT DMG',
    FIGHT_PROP_CHARGE_EFFICIENCY: 'Energy Recharge',
    FIGHT_PROP_ELEMENT_MASTERY:   'Elem. Mastery',
    FIGHT_PROP_HP_PERCENT:        'HP',
    FIGHT_PROP_ATTACK_PERCENT:    'ATK',
    FIGHT_PROP_DEFENSE_PERCENT:   'DEF',
    FIGHT_PROP_HP:                'HP',
    FIGHT_PROP_ATTACK:            'ATK',
    FIGHT_PROP_DEFENSE:           'DEF',
    FIGHT_PROP_PHYSICAL_ADD_HURT: 'Physical DMG',
    FIGHT_PROP_FIRE_ADD_HURT:     'Pyro DMG',
    FIGHT_PROP_ELEC_ADD_HURT:     'Electro DMG',
    FIGHT_PROP_WATER_ADD_HURT:    'Hydro DMG',
    FIGHT_PROP_GRASS_ADD_HURT:    'Dendro DMG',
    FIGHT_PROP_WIND_ADD_HURT:     'Anemo DMG',
    FIGHT_PROP_ROCK_ADD_HURT:     'Geo DMG',
    FIGHT_PROP_ICE_ADD_HURT:      'Cryo DMG',
};

const WEAPON_FLAT_SUBSTAT = new Set([
    'FIGHT_PROP_HP', 'FIGHT_PROP_ATTACK', 'FIGHT_PROP_DEFENSE', 'FIGHT_PROP_ELEMENT_MASTERY',
]);

/**
 * Which fightPropMap keys are most important, based on a character's
 * ascension stat (sourced from yatta.moe).
 */
const ASCENSION_TO_KEY_STATS = {
    FIGHT_PROP_CRITICAL:          ['20', '22'],
    FIGHT_PROP_CRITICAL_HURT:     ['20', '22'],
    FIGHT_PROP_HP_PERCENT:        ['2000'],
    FIGHT_PROP_ATTACK_PERCENT:    ['2001'],
    FIGHT_PROP_DEFENSE_PERCENT:   ['2002'],
    FIGHT_PROP_ELEMENT_MASTERY:   ['28'],
    FIGHT_PROP_CHARGE_EFFICIENCY: ['23'],
    FIGHT_PROP_HEAL_ADD:          ['26', '2000'],
};

const BLANK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60'%3E%3Ccircle cx='30' cy='30' r='30' fill='%23222'/%3E%3Ctext x='30' y='36' text-anchor='middle' fill='%23555' font-size='20'%3E?%3C/text%3E%3C/svg%3E";

// ── App state ─────────────────────────────────────────────────────────────────

const state = {
    players:   { 1: null, 2: null },
    selected:  { 1: null, 2: null },
    charData:  null,
    locData:   null,
    yattaData: null, // fallback for characters not yet in Enka's data files
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchCharData() {
    if (state.charData && state.locData) return state.charData;

    const [charRes, locRes, yattaRes] = await Promise.all([
        state.charData  ? null : fetch(CHAR_DATA_URL),
        state.locData   ? null : fetch(LOC_DATA_URL),
        state.yattaData ? null : fetch(YATTA_URL),
    ]);

    if (charRes) {
        if (!charRes.ok) throw new Error('Could not load character data from GitHub');
        state.charData = await charRes.json();
    }
    if (locRes) {
        if (!locRes.ok) throw new Error('Could not load locale data from GitHub');
        const loc = await locRes.json();
        state.locData = loc.en ?? loc.EN ?? {};
    }
    if (yattaRes) {
        try {
            const j = await yattaRes.json();
            state.yattaData = j?.data?.items ?? j?.data ?? {};
        } catch {
            state.yattaData = {};
        }
    }

    return state.charData;
}

// ── Pure helper functions ─────────────────────────────────────────────────────

function getCharInfo(avatarId, charData) {
    const strId = String(avatarId);
    const entry = charData[avatarId] ?? charData[strId];

    if (!entry) {
        // Fallback to yatta.moe for characters not yet in Enka's files
        const yatta = state.yattaData?.[avatarId] ?? state.yattaData?.[strId];
        if (yatta) {
            return {
                name:     yatta.name ?? strId,
                iconUrl:  yatta.icon ? `${ICON_BASE}${yatta.icon}.png` : BLANK_IMG,
                rarity:   (yatta.rank ?? 4) === 5 ? 5 : 4,
                color:    ELEM_COLOR[yatta.element] ?? '#c8a96e',
            };
        }
        return { name: `#${avatarId}`, iconUrl: BLANK_IMG, rarity: 4, color: '#888' };
    }

    const side   = entry.SideIconName ?? '';
    const icon   = side.replace('UI_AvatarIcon_Side_', 'UI_AvatarIcon_');
    return {
        name:    entry.NameTextEN
               ?? entry.nameTextEN
               ?? (entry.NameTextMapHash && state.locData?.[entry.NameTextMapHash])
               ?? `#${avatarId}`,
        iconUrl: icon ? `${ICON_BASE}${icon}.png` : BLANK_IMG,
        rarity:  (entry.QualityType ?? '').includes('ORANGE') ? 5 : 4,
        color:   ELEM_COLOR[entry.Element] ?? '#c8a96e',
    };
}

function getWeapon(avatar) {
    const item = (avatar.equipList ?? []).find(e => e.weapon != null);
    if (!item) return null;

    const nameHash = item.flat?.nameTextMapHash;
    const stats    = item.flat?.weaponStats ?? [];
    const subRaw   = stats[1] ?? null;

    let subText = null;
    if (subRaw) {
        const subName = WEAPON_SUBSTAT_NAME[subRaw.appendPropId] ?? subRaw.appendPropId;
        const isFlat  = WEAPON_FLAT_SUBSTAT.has(subRaw.appendPropId);
        subText = `${subName} ${isFlat
            ? Math.round(subRaw.statValue).toLocaleString()
            : subRaw.statValue.toFixed(1) + '%'}`;
    }

    return {
        name:     (nameHash && state.locData?.[nameHash]) ?? 'Unknown Weapon',
        iconUrl:  item.flat?.icon ? `${ICON_BASE}${item.flat.icon}.png` : BLANK_IMG,
        level:    item.weapon?.level ?? 1,
        refRank:  item.weapon?.affixMap ? Object.values(item.weapon.affixMap)[0] + 1 : 1,
        baseAtk:  stats[0]?.statValue ?? 0,
        subText,
    };
}

function getLevel(avatar) {
    const p = avatar.propMap?.['4001'];
    return Math.round(parseFloat(p?.val ?? p?.ival ?? 1));
}

function getCons(avatar) {
    return (avatar.talentIdList ?? []).length;
}

function fmtStat(val, type) {
    if (val == null) return '—';
    return type === 'pct'
        ? (val * 100).toFixed(1) + '%'
        : Math.round(val).toLocaleString();
}

/**
 * Returns the set of fightPropMap keys that matter most for a character,
 * based on their ascension stat and highest elemental DMG bonus.
 */
function getKeyStats(avatarId, fightPropMap) {
    const keys   = new Set();
    const strId  = String(avatarId);
    const yatta  = state.yattaData?.[avatarId] ?? state.yattaData?.[strId];

    (ASCENSION_TO_KEY_STATS[yatta?.specialProp] ?? []).forEach(k => keys.add(k));

    let topKey = null, topVal = 0.05;
    ['40', '41', '42', '43', '44', '45', '46', '30'].forEach(k => {
        const v = fightPropMap[k] ?? 0;
        if (v > topVal) { topVal = v; topKey = k; }
    });
    if (topKey) keys.add(topKey);

    return keys;
}

// ── DOM rendering ─────────────────────────────────────────────────────────────

function setStatus(side, html, type = '') {
    const el = document.getElementById(`status-${side}`);
    el.className    = `status ${type}`;
    el.innerHTML    = html;
    el.style.display = '';
}

function clearStatus(side) {
    document.getElementById(`status-${side}`).style.display = 'none';
}

function renderCharCard(av, side, idx) {
    const ci   = getCharInfo(av.avatarId, state.players[side].charData);
    const lvl  = getLevel(av);
    const cons = getCons(av);

    const card = document.createElement('div');
    card.className    = `char-card ${ci.rarity === 5 ? 'q5' : 'q4'}`;
    card.dataset.side = side;
    card.dataset.idx  = idx;
    card.innerHTML = `
        ${cons > 0 ? `<div class="cons-badge">C${cons}</div>` : ''}
        <img class="char-portrait" src="${ci.iconUrl}" alt="${ci.name}"
             onerror="this.src='${BLANK_IMG}'">
        <div class="char-name">${ci.name}</div>
        <div class="char-lvl">Lv.&nbsp;${lvl}</div>
    `;
    card.addEventListener('click', () => selectChar(side, idx, card));
    return card;
}

function renderCharBox(sel, align) {
    if (!sel) return `<div class="comp-char-empty">No character selected</div>`;

    const ci    = getCharInfo(sel.avatar.avatarId, sel.charData);
    const lvl   = getLevel(sel.avatar);
    const cons  = getCons(sel.avatar);
    const pname = sel.player?.nickname ?? (align === 'left' ? 'Player 1' : 'Player 2');

    return `
        <div class="comp-char-box${align === 'right' ? ' right' : ''}">
            <img class="comp-portrait" src="${ci.iconUrl}" alt="${ci.name}"
                 style="border-color:${ci.color}" onerror="this.src='${BLANK_IMG}'">
            <div class="comp-char-info">
                <div class="comp-char-name">${ci.name}</div>
                <div class="comp-char-sub">Lv.&nbsp;${lvl}${cons > 0 ? `&nbsp;·&nbsp;C${cons}` : ''}</div>
                <div class="comp-char-sub">${pname}</div>
            </div>
        </div>
    `;
}

function renderWeaponCard(sel, align) {
    if (!sel) return `<div class="weapon-empty"></div>`;
    const w = getWeapon(sel.avatar);
    if (!w)  return `<div class="weapon-empty"></div>`;

    return `
        <div class="weapon-card${align === 'right' ? ' right' : ''}">
            <img class="weapon-icon" src="${w.iconUrl}" alt="${w.name}"
                 onerror="this.src='${BLANK_IMG}'">
            <div class="weapon-info">
                <div class="weapon-name">${w.name}</div>
                <div class="weapon-sub">Lv.&nbsp;${w.level}&nbsp;·&nbsp;R${w.refRank}</div>
                <div class="weapon-sub">Base ATK&nbsp;${Math.round(w.baseAtk).toLocaleString()}</div>
                ${w.subText ? `<div class="weapon-sub">${w.subText}</div>` : ''}
            </div>
        </div>
    `;
}

function renderStatRows(s1, s2) {
    const fp1 = s1?.avatar?.fightPropMap ?? {};
    const fp2 = s2?.avatar?.fightPropMap ?? {};

    const props = [...FIGHT_PROPS];
    DMG_PROPS.forEach(p => {
        if ((fp1[p.key] ?? 0) > 0.001 || (fp2[p.key] ?? 0) > 0.001) props.push(p);
    });

    const keyStats1 = s1 ? getKeyStats(s1.avatar.avatarId, fp1) : new Set();
    const keyStats2 = s2 ? getKeyStats(s2.avatar.avatarId, fp2) : new Set();

    return props.map(p => {
        const v1 = fp1[p.key];
        const v2 = fp2[p.key];
        let c1 = '', c2 = '', diffHtml = '';

        if (s1 && s2) {
            const n1 = v1 ?? 0, n2 = v2 ?? 0;
            if      (n1 > n2) { c1 = 'win';  c2 = 'lose'; }
            else if (n2 > n1) { c1 = 'lose'; c2 = 'win';  }
            else              { c1 = 'tie';  c2 = 'tie';  }

            const diff = n1 - n2;
            if (diff !== 0) {
                const diffStr = p.fmt === 'pct'
                    ? (diff > 0 ? '+' : '') + (diff * 100).toFixed(1) + '%'
                    : (diff > 0 ? '+' : '') + Math.round(diff).toLocaleString();
                diffHtml = `<span class="sn-diff ${diff > 0 ? 'p1up' : 'p2up'}">${diffStr}</span>`;
            }
        }

        const isKey = keyStats1.has(p.key) || keyStats2.has(p.key);
        return `
            <div class="stat-row${isKey ? ' key-stat' : ''}">
                <div class="sv left ${c1}">${s1 ? fmtStat(v1, p.fmt) : '—'}</div>
                <div class="sn">${p.name}${diffHtml}</div>
                <div class="sv right ${c2}">${s2 ? fmtStat(v2, p.fmt) : '—'}</div>
            </div>
        `;
    }).join('');
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
document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => setMobileTab(btn.dataset.tab)));

(async () => {
    const el = document.getElementById('proxy-status');
    try {
        await fetch(`${PROXY}api/uid/`, { signal: AbortSignal.timeout(3000) });
        el.style.color  = '#5dbb63';
        el.textContent  = '● Proxy connected';
    } catch {
        el.style.color  = '#c8a96e';
        el.textContent  = '● Server waking up — wait a few seconds, then refresh the page';
    }
})();
