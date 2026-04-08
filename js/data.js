'use strict';

// ── App state ─────────────────────────────────────────────────────────────────

const state = {
    players:      { 1: null, 2: null },
    selected:     { 1: null, 2: null },
    charData:     null,
    locData:      null,
    yattaData:    null,
    yattaWeapons: null,
    yattaRelics:  null,
};

// ── Analytics helper ──────────────────────────────────────────────────────────

function trackEvent(name, params = {}) {
    if (typeof gtag === 'function') gtag('event', name, params);
}

// ── Player data cache (sessionStorage) ───────────────────────────────────────

function savePlayerCache(uid, data) {
    try { sessionStorage.setItem(`enka_${uid}`, JSON.stringify(data)); } catch {}
}

function loadPlayerCache(uid) {
    try {
        const raw = sessionStorage.getItem(`enka_${uid}`);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchCharData() {
    if (state.charData && state.locData) return state.charData;

    const [charRes, locRes, yattaRes, yattaWepRes, yattaRelRes] = await Promise.all([
        state.charData     ? null : fetch(CHAR_DATA_URL),
        state.locData      ? null : fetch(LOC_DATA_URL),
        state.yattaData    ? null : fetch(YATTA_URL),
        state.yattaWeapons ? null : fetch(YATTA_WEAPON_URL).catch(() => null),
        state.yattaRelics  ? null : fetch(YATTA_RELIC_URL).catch(() => null),
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
    if (yattaWepRes?.ok) {
        try {
            const j = await yattaWepRes.json();
            state.yattaWeapons = j?.data?.items ?? j?.data ?? {};
        } catch {
            state.yattaWeapons = {};
        }
    } else {
        state.yattaWeapons ??= {};
    }
    if (yattaRelRes?.ok) {
        try {
            const j = await yattaRelRes.json();
            state.yattaRelics = j?.data?.items ?? j?.data ?? {};
        } catch {
            state.yattaRelics = {};
        }
    } else {
        state.yattaRelics ??= {};
    }

    return state.charData;
}

// ── Helper functions ──────────────────────────────────────────────────────────

function getCharInfo(avatarId, charData) {
    const strId = String(avatarId);
    const entry = charData[avatarId] ?? charData[strId];

    if (!entry) {
        const yatta = state.yattaData?.[avatarId] ?? state.yattaData?.[strId];
        if (yatta) {
            return {
                name:    yatta.name ?? strId,
                iconUrl: yatta.icon ? `${ICON_BASE}${yatta.icon}.png` : BLANK_IMG,
                rarity:  (yatta.rank ?? 4) === 5 ? 5 : 4,
                color:   ELEM_COLOR[yatta.element] ?? '#c8a96e',
            };
        }
        return { name: `#${avatarId}`, iconUrl: BLANK_IMG, rarity: 4, color: '#888' };
    }

    const side = entry.SideIconName ?? '';
    const icon = side.replace('UI_AvatarIcon_Side_', 'UI_AvatarIcon_');
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
    const itemId   = item.itemId;
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

    // Try locale data first, fall back to Yatta weapon name by itemId
    const locName   = nameHash && state.locData?.[nameHash];
    const yattaName = itemId && (state.yattaWeapons?.[itemId]?.name
                              ?? state.yattaWeapons?.[String(itemId)]?.name);

    return {
        name:    locName || yattaName || 'Unknown Weapon',
        iconUrl: item.flat?.icon ? `${ICON_BASE}${item.flat.icon}.png` : BLANK_IMG,
        level:   item.weapon?.level ?? 1,
        refRank: item.weapon?.affixMap ? Object.values(item.weapon.affixMap)[0] + 1 : 1,
        baseAtk: stats[0]?.statValue ?? 0,
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

function getKeyStats(avatarId, fightPropMap) {
    const keys  = new Set();
    const strId = String(avatarId);
    const yatta = state.yattaData?.[avatarId] ?? state.yattaData?.[strId];

    (ASCENSION_TO_KEY_STATS[yatta?.specialProp] ?? []).forEach(k => keys.add(k));

    let topKey = null, topVal = 0.05;
    ['40', '41', '42', '43', '44', '45', '46', '30'].forEach(k => {
        const v = fightPropMap[k] ?? 0;
        if (v > topVal) { topVal = v; topKey = k; }
    });
    if (topKey) keys.add(topKey);

    return keys;
}
