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
        const slot     = item.flat?.equipType;
        const nameHash = item.flat?.nameTextMapHash;
        const setHash  = item.flat?.setNameTextMapHash;
        const setId    = item.flat?.setId;

        // Resolve names with Yatta fallback for newer items not in locale data
        const locPieceName = nameHash && state.locData?.[nameHash];
        const locSetName   = setHash  && state.locData?.[setHash];
        const yattaSet     = setId && (state.yattaRelics?.[setId]
                                    ?? state.yattaRelics?.[String(setId)]);

        bySlot[slot] = {
            slot,
            name:     locPieceName || yattaSet?.name || SLOT_NAME[slot] ?? '',
            setName:  locSetName   || yattaSet?.name || '',
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

    const header = `
        <div class="comp-char-row">
            ${sel1 ? renderCharBox(sel1, 'left') : '<div class="comp-char-empty">No character selected</div>'}
            <div class="comp-vs-mid">VS</div>
            ${sel2 ? renderCharBox(sel2, 'right') : '<div class="comp-char-empty">No character selected</div>'}
        </div>
    `;

    const rows = SLOT_ORDER.map((slot, i) => `
        <div class="art-row">
            ${renderArtifactCard(arts1[i], 'left')}
            <div class="art-slot-label">${SLOT_NAME[slot]}</div>
            ${renderArtifactCard(arts2[i], 'right')}
        </div>
    `).join('');

    content.innerHTML = header + rows;

    if (sel1 && sel2) {
        const ci1 = getCharInfo(sel1.avatar.avatarId, sel1.charData);
        const ci2 = getCharInfo(sel2.avatar.avatarId, sel2.charData);
        trackEvent('comparison_viewed', {
            char1: ci1.name,
            char2: ci2.name,
            page:  'artifacts',
        });
    }

    document.querySelector('.center-col')?.scrollTo({ top: 0, behavior: 'smooth' });
    if (sel1 && sel2 && window.innerWidth <= 767) setMobileTab('compare');
}

// ── Page-specific comparison update (called by shared.js) ─────────────────────

function updateComparison() {
    renderArtifactComparison(state.selected[1], state.selected[2]);
}
