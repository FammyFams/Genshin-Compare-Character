'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

const teamState = {
    player:          null,
    team:            [],
    talentData:      null,
    rotationData:    null,
    buffData:        null,
    weaponData:      null,
    artifactSetData: null,
    passiveData:     null,
    constellData:    null,
};

// ── Resonance definitions ─────────────────────────────────────────────────────

const ELEM_COLORS = {
    Fire: '#e8602c', Water: '#4aaad8', Wind: '#74c8a0', Electric: '#b088cc',
    Grass: '#7cbb50', Ice: '#90d8e8', Rock: '#c8a050',
};

const RESONANCES = [
    { elements: ['Fire'],     min: 2, name: 'Fervent Flames',     desc: 'ATK +25%',          color: '#e8602c', buff: { atkPct: 0.25 } },
    { elements: ['Water'],    min: 2, name: 'Soothing Water',     desc: 'HP +25%',            color: '#4aaad8', buff: {} },
    { elements: ['Wind'],     min: 2, name: 'Impetuous Winds',    desc: 'Skill CD -5s',       color: '#74c8a0', buff: {} },
    { elements: ['Electric'], min: 2, name: 'High Voltage',       desc: 'ER +25%',            color: '#b088cc', buff: {} },
    { elements: ['Grass'],    min: 2, name: 'Sprawling Greenery', desc: 'EM +50',             color: '#7cbb50', buff: { emBonus: 50 } },
    { elements: ['Ice'],      min: 2, name: 'Shattering Ice',     desc: 'CRIT Rate +15%',     color: '#90d8e8', buff: { critRateBonus: 0.15 } },
    { elements: ['Rock'],     min: 2, name: 'Enduring Rock',      desc: 'DMG +15% shielded',  color: '#c8a050', buff: { dmgPct: 0.15 } },
];

// ── Row labels to skip ────────────────────────────────────────────────────────

const SKIP_KEYWORDS = [
    'plunge', 'stamina', 'heal', 'regenerat', 'absorption', 'shield',
    'energy', 'duration', 'cooldown', 'interrupt', 'activation cost',
    'atk increase', '% chance',
];

function isSkippedRow(label) {
    const l = label.toLowerCase();
    return SKIP_KEYWORDS.some(k => l.includes(k)) ||
           (!l.includes('dmg') && !l.includes('%') && !l.includes('hit'));
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function fetchTalentData() {
    if (teamState.talentData) return teamState.talentData;
    try {
        const res = await fetch('../data/talents.json');
        teamState.talentData = res.ok ? await res.json() : {};
    } catch { teamState.talentData = {}; }
    return teamState.talentData;
}

async function fetchRotationData() {
    if (teamState.rotationData) return teamState.rotationData;
    try {
        const res = await fetch('../data/rotations.json');
        teamState.rotationData = res.ok ? await res.json() : {};
    } catch { teamState.rotationData = {}; }
    return teamState.rotationData;
}

async function fetchBuffData() {
    if (teamState.buffData) return teamState.buffData;
    try {
        const res = await fetch('../data/buffs.json');
        teamState.buffData = res.ok ? await res.json() : {};
    } catch { teamState.buffData = {}; }
    return teamState.buffData;
}

async function fetchWeaponData() {
    if (teamState.weaponData) return teamState.weaponData;
    try {
        const res = await fetch('../data/weapons.json');
        teamState.weaponData = res.ok ? await res.json() : {};
    } catch { teamState.weaponData = {}; }
    return teamState.weaponData;
}

async function fetchArtifactSetData() {
    if (teamState.artifactSetData) return teamState.artifactSetData;
    try {
        const res = await fetch('../data/artifact-sets.json');
        teamState.artifactSetData = res.ok ? await res.json() : {};
    } catch { teamState.artifactSetData = {}; }
    return teamState.artifactSetData;
}

async function fetchPassiveData() {
    if (teamState.passiveData) return teamState.passiveData;
    try {
        const res = await fetch('../data/passives.json');
        teamState.passiveData = res.ok ? await res.json() : {};
    } catch { teamState.passiveData = {}; }
    return teamState.passiveData;
}

async function fetchConstellData() {
    if (teamState.constellData) return teamState.constellData;
    try {
        const res = await fetch('../data/constellations.json');
        teamState.constellData = res.ok ? await res.json() : {};
    } catch { teamState.constellData = {}; }
    return teamState.constellData;
}

// ── Talent level extraction ───────────────────────────────────────────────────

function getTalentLevels(avatar) {
    const base   = Object.values(avatar.skillLevelMap ?? {});
    const extras = Object.values(avatar.proudSkillExtraLevelMap ?? {});
    // C3/C5 bonuses are always exactly +3 — cap to prevent misaligned key addition
    return base.map((lv, i) => Math.min(lv + Math.min(extras[i] ?? 0, 3), 13));
}

// ── Buff calculation ──────────────────────────────────────────────────────────

function getResonanceBuffs(team) {
    const counts = {};
    team.forEach(m => counts[m.element] = (counts[m.element] ?? 0) + 1);
    const active = RESONANCES.filter(r => (counts[r.elements[0]] ?? 0) >= r.min);
    const result = { atkPct: 0, critRateBonus: 0, emBonus: 0, dmgPct: 0 };
    active.forEach(r => {
        if (r.buff.atkPct)         result.atkPct         += r.buff.atkPct;
        if (r.buff.critRateBonus)  result.critRateBonus  += r.buff.critRateBonus;
        if (r.buff.emBonus)        result.emBonus        += r.buff.emBonus;
        if (r.buff.dmgPct)         result.dmgPct         += r.buff.dmgPct;
    });
    return result;
}

// Build rotation order for a team: longer buff duration → goes first.
// The main DPS (no buff or shortest duration) always goes last.
// Returns a map of member.name → order index (0 = first to act).
function buildRotationOrder(team) {
    const buffData = teamState.buffData ?? {};
    const sorted = [...team].sort((a, b) => {
        const da = buffData[a.name]?.buffDuration ?? 0;
        const db = buffData[b.name]?.buffDuration ?? 0;
        return db - da; // longer duration goes first
    });
    const order = {};
    sorted.forEach((m, i) => { order[m.name] = i; });
    return order;
}

function getTeamBuffs(team, thisMember) {
    const buffData = teamState.buffData ?? {};
    const rotation = teamState.rotationData?.[thisMember.name];
    const myElement  = thisMember.element;
    const myInfusion = rotation?.infusion ?? myElement;
    const rotOrder   = buildRotationOrder(team);
    const myPos      = rotOrder[thisMember.name] ?? 99;

    const out = {
        atkFlat:         0,
        atkPct:          0,
        dmgPct:          0,
        critRateBonus:   0,
        critDmgBonus:    0,
        defShredPct:     0,
        allResShred:     0,
        elemResShred:    0,
        elementDmgPct:   0,
        emBonus:         0,
        normalFlatDmg:   0,
        iceQuillFlatDmg: 0,
    };

    team.forEach(member => {
        const def = buffData[member.name];
        if (!def) return;

        // Only receive buffs from characters who activated before us (lower order index).
        // Self-buffs are allowed (e.g. Furina Fanfare applies to her own salon members)
        const memberPos = rotOrder[member.name] ?? 99;
        if (member !== thisMember && memberPos >= myPos) return;

        const fp      = member.avatar.fightPropMap ?? {};
        const baseAtk = fp['1']  ?? fp['2001'] ?? 0;
        const baseDef = fp['4']  ?? fp['2002'] ?? 0;
        const em      = fp['28'] ?? 0;

        // Does this buff apply to this character?
        const tgt = def.targets ?? 'all';
        const isOnfield = myPos === Math.max(...Object.values(rotOrder));
        const applies = tgt === 'all'
            || (tgt === 'onfield' && isOnfield)
            || tgt === myElement
            || tgt === myInfusion
            || (Array.isArray(tgt) && (tgt.includes(myElement) || tgt.includes(myInfusion)));
        if (!applies) return;

        if (def.atkFlatMult)     out.atkFlat       += baseAtk * def.atkFlatMult;
        if (def.atkPct)          out.atkPct         += def.atkPct;
        if (def.dmgPct)          out.dmgPct         += def.dmgPct;
        if (def.critRateBonus)   out.critRateBonus  += def.critRateBonus;
        if (def.defShred)        out.defShredPct    += def.defShred;
        if (def.allResShred)     out.allResShred    += def.allResShred;
        if (def.emBonus)         out.emBonus        += def.emBonus;
        if (def.defPctBonus)     out.atkPct         += 0; // DEF buff handled separately
        if (def.vv)              out.elemResShred   += 0.40;

        // EM-scaling DMG bonus (Kazuha)
        if (def.emDmgPerPoint)   out.dmgPct         += em * def.emDmgPerPoint;

        // EM share (Sucrose)
        if (def.emSharePct)      out.emBonus        += em * def.emSharePct;

        // Element-specific DMG bonus (Shenhe, Faruzan, Gorou, etc.)
        if (def.elementDmgPct) {
            for (const [elem, val] of Object.entries(def.elementDmgPct)) {
                if (elem === myElement || elem === myInfusion) out.elementDmgPct += val;
            }
        }

        // Element-specific RES shred
        if (def.resShredElement) {
            for (const [elem, val] of Object.entries(def.resShredElement)) {
                if (elem === myElement || elem === myInfusion) out.elemResShred += val;
            }
        }

        // Escoffier C1: +60% Cryo CRIT DMG when 4 party members are Hydro/Cryo
        if (def.c1CryoCritDmg && getCons(member.avatar) >= 1) {
            const cryoHydroCount = team.filter(m => m.element === 'Ice' || m.element === 'Water').length;
            if (cryoHydroCount >= 4 && (myElement === 'Ice' || myInfusion === 'Ice')) {
                out.critDmgBonus = (out.critDmgBonus ?? 0) + def.c1CryoCritDmg;
            }
        }

        // Shenhe Icy Quill flat DMG (only for Ice characters)
        if (def.iceQuillMult && (myElement === 'Ice' || myInfusion === 'Ice')) {
            out.iceQuillFlatDmg += baseAtk * def.iceQuillMult * (def.iceQuillCount ?? 10);
        }

        // Yun Jin normal flat DMG
        if (def.normalFlatMult) {
            out.normalFlatDmg += baseDef * def.normalFlatMult;
        }
    });

    // Add resonance buffs
    const resBuff = getResonanceBuffs(team);
    out.atkPct        += resBuff.atkPct;
    out.critRateBonus += resBuff.critRateBonus;
    out.emBonus       += resBuff.emBonus;
    out.dmgPct        += resBuff.dmgPct;

    return out;
}

// ── Artifact set counting ─────────────────────────────────────────────────────

function getArtifactSetCounts(avatar) {
    const counts = {};
    for (const item of avatar.equipList ?? []) {
        if (!item.reliquary) continue;
        const hash = item.flat?.setNameTextMapHash;
        const name = (hash && state.locData?.[hash]) ?? '';
        if (name) counts[name] = (counts[name] ?? 0) + 1;
    }
    return counts;
}

// ── Hardcoded 4pc set bonuses (conditional, not in fightPropMap) ──────────────

// Returns extra buffs for wearing 4pc of a given set.
// member: { element, infusion, avatar, name }
// fp: fightPropMap
const ARTIFACT_4PC = {
    'Emblem of Severed Fate': (fp) => {
        // 25% of ER as Burst DMG, capped at 75%
        // Key 23 = bonus ER (decimal, e.g. 0.65 for +65%)
        const erBonus = (fp['23'] ?? 0) + (fp['2003'] ? fp['2003'] - 1 : 0);
        const erTotal = 1 + erBonus;
        return { burstDmgPct: Math.min(0.25 * erTotal, 0.75) };
    },
    'Crimson Witch of Flames': () => ({
        // 3 stacks: +50% of 2pc value (15%) per stack = +7.5% per stack × 3 = 22.5%
        elementDmgPct: 0.225, applyElement: 'Fire',
    }),
    'Marechaussee Hunter': () => ({
        critRateBonus: 0.36, // 3 stacks × 12%
    }),
    'Noblesse Oblige': () => ({
        burstDmgPct: 0.20,
    }),
    'Golden Troupe': () => ({
        skillDmgPct: 0.25,
    }),
    "Shimenawa's Reminiscence": () => ({
        normalChargeDmgPct: 0.50,
    }),
    'Pale Flame': () => ({
        physDmgPct: 0.25, // simplified (2 stacks = 50% but ATK from 4pc is in fightPropMap)
    }),
    'Blizzard Strayer': (fp, member) => member.element === 'Ice' || member.infusion === 'Ice'
        ? { critRateBonus: 0.40 } // vs frozen enemies
        : {},
    'Thundersoother': (fp, member) => member.element === 'Electric' || member.infusion === 'Electric'
        ? { dmgPct: 0.35 } : {},
    'Lavawalker': (fp, member) => member.element === 'Fire' || member.infusion === 'Fire'
        ? { dmgPct: 0.35 } : {},
    'Heart of Depth': () => ({
        normalChargeDmgPct: 0.30,
    }),
    'Desert Pavilion Chronicle': () => ({
        normalChargeDmgPct: 0.40,
    }),
    'Obsidian Codex': (fp, member) => member.infusion === 'Fire' || member.element === 'Fire'
        ? { critDmgBonus: 0.52 } : {},
    'Fragment of Harmonic Whimsy': () => ({
        normalChargeDmgPct: 0.18, // simplified: average stacks
    }),
    'Unfinished Reverie': () => ({
        dmgPct: 0.40, // simplified: full stacks off-field
    }),
    'Scroll of the Hero of Cinder City': () => ({
        elemResShred: 0.12, // team element RES shred when in reaction
    }),
    'Deepwood Memories': () => ({
        elemResShred: 0.30, applyElement: 'Grass',
    }),
    'Gilded Dreams': (fp) => ({
        // EM-based: ATK + EM per party member of different element (simplified)
        emBonus: 50,
    }),
    'Flower of Paradise Lost': () => ({
        reactionBonus: 0.40, // 40% Bloom/Hyperbloom/Burgeon
    }),
    'Vourukasha\'s Glow': () => ({
        skillBurstDmgPct: 0.32, // 4 stacks × 8%
    }),
    'Vermillion Hereafter': () => ({
        atkPct: 0.24, // simplified 3 stacks × 8%
    }),
    'Nighttime Whispers in the Echoing Woods': (fp, member) => member.element === 'Rock'
        ? { elementDmgPct: 0.40, applyElement: 'Rock' } : {},
    'Long Night\'s Oath': (fp, member) => member.element === 'Fire' || member.infusion === 'Fire'
        ? { dmgPct: 0.40 } : {},
    'Finale of the Deep Galleries': (_fp, member) => member.element === 'Ice' || member.infusion === 'Ice'
        ? { dmgPct: 0.45 } : {},  // 4pc: +45% DMG in Nightsoul state (Skirk's tE state)
};

// ── Self-buff calculation (weapon, artifacts, passives) ───────────────────────

function getSelfBuffs(member) {
    const out = {
        atkFlat:             0,
        atkPct:              0,
        hpPct:               0,
        dmgPct:              0,
        critRateBonus:       0,
        critDmgBonus:        0,
        elementDmgPct:       0,  // already filtered to this character's element
        normalChargeDmgPct:  0,
        skillDmgPct:         0,
        burstDmgPct:         0,
        skillBurstDmgPct:    0,
        physDmgPct:          0,
        defShredPct:         0,
        elemResShred:        0,
        emBonus:             0,
    };

    const avatar   = member.avatar;
    const fp       = avatar.fightPropMap ?? {};
    const rotation = teamState.rotationData?.[member.name];
    const myElem   = member.element;
    const myInfusion = rotation?.infusion ?? myElem;

    // ── 1. Weapon passive ──────────────────────────────────────────────────────
    const weapInfo   = typeof getWeapon === 'function' ? getWeapon(avatar) : null;
    const weaponData = teamState.weaponData ?? {};
    if (weapInfo?.name && weaponData[weapInfo.name]) {
        const wDef  = weaponData[weapInfo.name];
        const ref   = Math.max(1, Math.min(weapInfo.refRank ?? 1, 5));
        const lerp  = (r1, r5) => r1 != null && r5 != null
            ? r1 + (r5 - r1) * (ref - 1) / 4
            : (r5 ?? r1 ?? 0);

        const p = wDef.passive ?? {};

        // IMPORTANT: fightPropMap already includes all always-on weapon passive bonuses
        // (ATK%, CRIT Rate, CRIT DMG, EM, HP%, elemental DMG shown on character screen).
        // Only add effects that are CONDITIONAL and NOT shown on the character screen.

        // Conditional universal DMG% (e.g. Aqua Simulacra: "when near enemies")
        if (p.dmgPct)           out.dmgPct          += lerp(p.dmgPct.r1, p.dmgPct.r5);

        // Conditional ATK flat from low HP (Staff of Homa's second threshold bonus)
        if (p.atkFlatFromHpLowPct) {
            const maxHp = fp['2000'] ?? 0;
            out.atkFlat += maxHp * lerp(p.atkFlatFromHpLowPct.r1, p.atkFlatFromHpLowPct.r5);
        }

        // Conditional per-talent-type DMG bonuses (e.g. conditional from stacks)
        if (p.normalDmgPct)     out.normalChargeDmgPct += lerp(p.normalDmgPct.r1, p.normalDmgPct.r5);
        if (p.chargedDmgPct)    out.normalChargeDmgPct += lerp(p.chargedDmgPct.r1, p.chargedDmgPct.r5);
        if (p.skillDmgPct)      out.skillDmgPct        += lerp(p.skillDmgPct.r1, p.skillDmgPct.r5);
        if (p.burstDmgPct)      out.burstDmgPct        += lerp(p.burstDmgPct.r1, p.burstDmgPct.r5);

        // Do NOT add atkPct, critRateBonus, critDmgBonus, emBonus, hpPct, elementDmgPct
        // — these are always-on and already reflected in fightPropMap totals.
    }

    // ── 2. Artifact 4pc bonuses ────────────────────────────────────────────────
    const artifactSets   = getArtifactSetCounts(avatar);
    const artifactSetDef = teamState.artifactSetData ?? {};
    for (const [setName, count] of Object.entries(artifactSets)) {
        if (count < 4) continue;

        const fn = ARTIFACT_4PC[setName];
        if (fn) {
            const bonus = fn(fp, { element: myElem, infusion: myInfusion });
            if (bonus.critRateBonus)      out.critRateBonus      += bonus.critRateBonus;
            if (bonus.critDmgBonus)       out.critDmgBonus       += bonus.critDmgBonus;
            if (bonus.dmgPct)             out.dmgPct             += bonus.dmgPct;
            if (bonus.atkPct)             out.atkPct             += bonus.atkPct;
            if (bonus.emBonus)            out.emBonus            += bonus.emBonus;
            if (bonus.burstDmgPct)        out.burstDmgPct        += bonus.burstDmgPct;
            if (bonus.skillDmgPct)        out.skillDmgPct        += bonus.skillDmgPct;
            if (bonus.skillBurstDmgPct)   out.skillBurstDmgPct   += bonus.skillBurstDmgPct;
            if (bonus.normalChargeDmgPct) out.normalChargeDmgPct += bonus.normalChargeDmgPct;
            if (bonus.physDmgPct)         out.physDmgPct         += bonus.physDmgPct;
            if (bonus.elemResShred)       out.elemResShred       += bonus.elemResShred;
            if (bonus.elementDmgPct) {
                const applyElem = bonus.applyElement;
                if (!applyElem || applyElem === myElem || applyElem === myInfusion) {
                    out.elementDmgPct += bonus.elementDmgPct;
                }
            }
        }
    }

    // ── 3. Character passives (conditional only) ─────────────────────────────
    // Most A1/A4 always-on effects are already in fightPropMap.
    // Only apply passives that are strictly conditional (not on character screen).
    // Hardcoded key conditionals to avoid regex-parsing false positives:
    const CHAR_PASSIVE_OVERRIDE = {
        // Hu Tao A4: +33% Pyro DMG when HP ≤ 50%
        'Hu Tao':      { elementDmgPct: 0.33, applyElement: 'Fire' },
        // Neuvillette A4: up to +30% Hydro DMG based on HP > 30%
        'Neuvillette':  { elementDmgPct: 0.30, applyElement: 'Water' },
        // Wriothesley A4: +20% CRIT Rate when HP > 50%
        'Wriothesley':  { critRateBonus: 0.20 },
        // Arlecchino A4: +1% ATK per 100 Bond of Life (simplified ~+30%)
        'Arlecchino':   { atkPct: 0.30 },
        // Mualani A4: Nightsoul Burst stacks
        'Mualani':      { dmgPct: 0.30 },
        // Lyney A4: extra Pyro DMG based on party
        'Lyney':        { elementDmgPct: 0.15, applyElement: 'Fire' },
        // Navia A4: 20% Cryo RES shred
        'Navia':        { elemResShred: 0.20 },
        // Furina A4: +0.7% Salon Member DMG per 1000 Max HP, capped at 28% (40k HP)
        'Furina':       { dmgPctFromHp: 0.007, dmgPctFromHpCap: 0.28 },
    };
    const charOverride = CHAR_PASSIVE_OVERRIDE[member.name];
    if (charOverride) {
        if (charOverride.critRateBonus) out.critRateBonus += charOverride.critRateBonus;
        if (charOverride.dmgPct)        out.dmgPct        += charOverride.dmgPct;
        if (charOverride.atkPct)        out.atkPct        += charOverride.atkPct;
        if (charOverride.elemResShred)  out.elemResShred  += charOverride.elemResShred;
        if (charOverride.elementDmgPct) {
            const applyElem = charOverride.applyElement;
            if (!applyElem || applyElem === myElem || applyElem === myInfusion) {
                out.elementDmgPct += charOverride.elementDmgPct;
            }
        }
        // Furina A4: salon member DMG scales with Max HP
        if (charOverride.dmgPctFromHp) {
            const maxHp = fp['2000'] ?? 0;
            out.dmgPct += Math.min(maxHp / 1000 * charOverride.dmgPctFromHp, charOverride.dmgPctFromHpCap ?? 1);
        }
    }

    return out;
}

// ── Talent row helpers ────────────────────────────────────────────────────────

// Get a single talent row value by substring filter (for simulation)
function getTalentRowValue(talentObj, filter, scalingStat, level) {
    if (!talentObj?.scaling) return 0;
    const lv = Math.max(0, Math.min(level - 1, 9));
    const fl = filter.toLowerCase();
    for (const [label, values] of Object.entries(talentObj.scaling)) {
        if (isSkippedRow(label)) continue;
        if (label.toLowerCase().includes(fl)) return (values[lv] ?? 0) / 100;
    }
    return 0;
}

function sumTalentRows(talentObj, scalingStat, level) {
    if (!talentObj?.scaling) return 0;
    const lv = Math.max(0, Math.min(level - 1, 9));
    let total = 0;
    for (const [label, values] of Object.entries(talentObj.scaling)) {
        if (isSkippedRow(label)) continue;
        const val = values[lv] ?? 0;
        if (val <= 0) continue;
        const isHPRow  = label.toLowerCase().includes('max hp') || label.toLowerCase().includes('% hp');
        const isDEFRow = label.toLowerCase().includes('% def') || label.toLowerCase().includes('def)');
        if (isHPRow  && scalingStat !== 'HP')  continue;
        if (isDEFRow && scalingStat !== 'DEF') continue;
        total += val;
    }
    return total / 100;
}

// ── Main DPS calculation ──────────────────────────────────────────────────────

const REACTION_MULT = {
    Vaporize: 1.5,
    Melt:     1.5,
    Spread:   1.25,
    Bloom:    1.0,
    Swirl:    0.6,
};

function calcCharDPS(member, teamBuffs) {
    const avatar   = member.avatar;
    const charName = member.name;
    const fp       = avatar.fightPropMap ?? {};
    const tData    = teamState.talentData?.[charName];
    const rotation = teamState.rotationData?.[charName];

    const scalingStat = tData?.scalingStat ?? 'ATK';

    // Self buffs: weapon passive, artifact 4pc, character passives
    const selfBuffs = getSelfBuffs(member);

    // Combine team + self ATK/CRIT buffs
    const totalAtkPct        = teamBuffs.atkPct         + selfBuffs.atkPct;
    const totalAtkFlat       = teamBuffs.atkFlat        + selfBuffs.atkFlat;
    const totalCritRate      = teamBuffs.critRateBonus  + selfBuffs.critRateBonus;
    const totalCritDmg       = (teamBuffs.critDmgBonus ?? 0) + selfBuffs.critDmgBonus;  // additive bonus on top of fp['22']
    const totalElemDmgPct    = teamBuffs.elementDmgPct  + selfBuffs.elementDmgPct;
    const totalDmgPct        = teamBuffs.dmgPct         + selfBuffs.dmgPct;
    const totalDefShred      = teamBuffs.defShredPct    + selfBuffs.defShredPct;
    const totalResShredTeam  = teamBuffs.allResShred    + teamBuffs.elemResShred + selfBuffs.elemResShred;
    const totalEmBonus       = teamBuffs.emBonus        + selfBuffs.emBonus;

    // Base stat
    let baseStat;
    switch (scalingStat) {
        case 'HP':  baseStat = fp['2000'] ?? 0; break;
        case 'DEF': baseStat = (fp['2002'] ?? 0) * (1 + (teamBuffs.defPctBonus ?? 0)); break;
        default:    baseStat = fp['2001'] ?? 0;
    }

    // Apply ATK buffs (only for ATK/EM scaling chars)
    if (scalingStat === 'ATK' || scalingStat === 'EM') {
        baseStat = baseStat * (1 + totalAtkPct) + totalAtkFlat;
    }

    // CRIT (base fightPropMap + team + self bonuses)
    const critRate = Math.min((fp['20'] ?? 0) + totalCritRate, 1);
    const critDmg  = (fp['22'] ?? 0) + totalCritDmg;
    const critMult = 1 + critRate * critDmg;

    // DMG bonus — pick best element, apply all buffs
    const elemKeys    = { Fire:'40', Electric:'41', Water:'42', Grass:'43', Wind:'44', Rock:'45', Ice:'46' };
    const infusion    = rotation?.infusion;
    const infKey      = infusion ? elemKeys[infusion] : null;
    const dmgKeys     = ['40','41','42','43','44','45','46','30'];
    const bestElemDmg = Math.max(0, ...dmgKeys.map(k => fp[k] ?? 0));
    const elemDmg     = (infKey ? Math.max(fp[infKey] ?? 0, bestElemDmg) : bestElemDmg)
                        + totalElemDmgPct;
    const dmgMult     = 1 + elemDmg + totalDmgPct;

    // DEF reduction vs Lv.100 enemy (standard Spiral Abyss)
    const charLv  = getLevel(avatar);
    const defBase = 200 * (1 - totalDefShred);
    const defMult = (charLv + 100) / ((charLv + 100) + defBase);

    // RES reduction (enemy base 10%)
    const enemyRes = 0.10 - totalResShredTeam;
    const resMult  = enemyRes >= 0 ? (1 - enemyRes) : (1 - enemyRes / 2);

    // Reaction
    const rxnMult = rotation?.reaction ? (REACTION_MULT[rotation.reaction] ?? 1) : 1;

    // EM bonus
    let emBonus = 1;
    if (scalingStat === 'EM' || rotation?.reaction === 'Spread') {
        const em = (fp['28'] ?? 0) + totalEmBonus;
        emBonus = 1 + (5 * em) / (em + 1200);
    }

    // Talent multipliers × hit counts
    // Also compute per-type hit weights for type-specific DMG bonuses
    const levels     = getTalentLevels(avatar);
    const talentKeys = ['normal', 'skill', 'burst'];
    const hitMult    = rotation?.hitMult ?? {};
    let talentDmgTotal = 0;

    talentKeys.forEach((key, i) => {
        if (!tData?.talents?.[key]) return;
        // skillScaledNormals: Seven-Phase Flash normals use Skill talent level
        const lvIdx = (key === 'normal' && rotation?.skillScaledNormals) ? 1 : i;
        const lv   = levels[lvIdx] ?? 6;
        const rows = sumTalentRows(tData.talents[key], scalingStat, lv);
        const hits = hitMult[key] ?? 0;
        if (hits === 0 || rows === 0) return;

        // Per-type DMG bonus (on top of universal dmgMult)
        let typeDmgBonus = 0;
        if (key === 'burst') {
            typeDmgBonus += selfBuffs.burstDmgPct + selfBuffs.skillBurstDmgPct;
        } else if (key === 'skill') {
            typeDmgBonus += selfBuffs.skillDmgPct + selfBuffs.skillBurstDmgPct;
        } else if (key === 'normal') {
            typeDmgBonus += selfBuffs.normalChargeDmgPct;
        }

        const typeMult = 1 + typeDmgBonus;
        talentDmgTotal += baseStat * rows * hits * critMult * dmgMult * typeMult * defMult * resMult * rxnMult * emBonus;
    });

    // Fallback if no talent/rotation data
    if (talentDmgTotal === 0) {
        return baseStat * critMult * dmgMult * defMult * resMult;
    }

    // Add flat DMG sources (Shenhe Icy Quill, Yun Jin)
    const flatDmg = (teamBuffs.iceQuillFlatDmg + teamBuffs.normalFlatDmg)
                    * critMult * defMult * resMult;

    // A4 multiplicative buff (e.g. Skirk A4: 1.7x at max stacks with 3 Cryo/Hydro teammates)
    const a4Mult = rotation?.a4Mult ?? 1;

    return (talentDmgTotal + flatDmg) * a4Mult;
}

function calcTeamDPS(team) {
    return team.map(member => {
        const buffs = getTeamBuffs(team, member);
        return { member, score: calcCharDPS(member, buffs), buffs };
    });
}

// ── Event-driven simulation ───────────────────────────────────────────────────

function simulate(team) {
    const rotData  = teamState.rotationData ?? {};
    const buffData = teamState.buffData     ?? {};
    const talData  = teamState.talentData   ?? {};

    // Only simulate characters that have an actions array defined
    const hasActions = team.every(m => rotData[m.name]?.actions);
    if (!hasActions) return null;

    // Rotation order: longest buffDuration first
    const order = buildRotationOrder(team);
    const sortedTeam = [...team].sort((a, b) =>
        (order[a.name] ?? 99) - (order[b.name] ?? 99)
    );

    // Absolute start time per character (3s per cast slot)
    const CAST_SLOT = 3;
    const charStartT = {};
    sortedTeam.forEach((m, i) => { charStartT[m.name] = i * CAST_SLOT; });

    // Phase 1: expand actions into raw hit events
    const rawEvents   = [];   // { t, member, action }
    const reactiveSlots = []; // { member, action, startT, endT }

    for (const member of team) {
        const rot    = rotData[member.name];
        const offset = charStartT[member.name];

        for (const action of rot.actions) {
            if (action.hits === 0) continue; // cast-only, no damage

            const absT = action.t + offset;

            if (action.triggeredBy === 'onfield_hit') {
                reactiveSlots.push({
                    member,
                    action,
                    startT: absT,
                    endT:   absT + (action.duration ?? 15),
                });
            } else if (action.interval && action.duration) {
                // Periodic off-field ticks
                const end = absT + action.duration;
                for (let t = absT; t < end; t += action.interval) {
                    rawEvents.push({ t: +t.toFixed(2), member, action });
                }
            } else {
                rawEvents.push({ t: absT, member, action });
            }
        }
    }

    // Phase 2: resolve reactive hits (Yelan throws triggered by on-field hits)
    const mainDPS = sortedTeam[sortedTeam.length - 1]; // last = main DPS
    const onfieldHits = rawEvents.filter(e => e.member === mainDPS);
    for (const slot of reactiveSlots) {
        for (const hit of onfieldHits) {
            if (hit.t >= slot.startT && hit.t < slot.endT) {
                rawEvents.push({ t: hit.t, member: slot.member, action: slot.action, reactive: true });
            }
        }
    }

    // Phase 3: build buff windows
    const buffWindows = []; // { charName, startT, endT }
    for (const member of team) {
        const rot    = rotData[member.name];
        const def    = buffData[member.name];
        const dur    = rot?.buffDuration ?? def?.buffDuration ?? 0;
        if (!dur) continue;
        const buffAction = rot.actions.find(a => a.buffStart);
        const startT = buffAction
            ? (buffAction.t + charStartT[member.name])
            : charStartT[member.name];
        buffWindows.push({ charName: member.name, startT, endT: startT + dur });
    }

    // Phase 4: compute damage for each event

    const elemKeys  = { Fire:'40', Electric:'41', Water:'42', Grass:'43', Wind:'44', Rock:'45', Ice:'46' };
    const resBuff   = getResonanceBuffs(team);

    rawEvents.sort((a, b) => a.t - b.t);

    const events = [];
    const perCharDmg = {};

    for (const ev of rawEvents) {
        const { t, member, action } = ev;
        const fp         = member.avatar.fightPropMap ?? {};
        const rot        = rotData[member.name];
        const tData      = talData[member.name];
        const scalingStat = tData?.scalingStat ?? 'ATK';
        const myElement  = member.element;
        const myInfusion = rot?.infusion ?? myElement;

        // Active team buffs at time t
        const activeBuff = { atkFlat: 0, atkPct: 0, dmgPct: 0, critRateBonus: 0,
                             critDmgBonus: 0, allResShred: 0, elemResShred: 0,
                             elementDmgPct: 0, emBonus: 0, defShredPct: 0 };
        const activeBuffNames = [];
        const isOnfield = member === mainDPS;

        for (const w of buffWindows) {
            if (t < w.startT || t >= w.endT) continue;
            const def = buffData[w.charName];
            if (!def) continue;

            const tgt = def.targets ?? 'all';
            const applies = tgt === 'all'
                || (tgt === 'onfield' && isOnfield)
                || tgt === myElement || tgt === myInfusion
                || (Array.isArray(tgt) && (tgt.includes(myElement) || tgt.includes(myInfusion)));
            if (!applies) continue;

            const provMember = team.find(m => m.name === w.charName);
            const provFp   = provMember?.avatar.fightPropMap ?? {};
            const baseAtk  = provFp['1'] ?? provFp['2001'] ?? 0;

            if (def.atkFlatMult)  activeBuff.atkFlat       += baseAtk * def.atkFlatMult;
            if (def.atkPct)       activeBuff.atkPct         += def.atkPct;
            if (def.dmgPct)       activeBuff.dmgPct         += def.dmgPct;
            if (def.critRateBonus)activeBuff.critRateBonus  += def.critRateBonus;
            if (def.allResShred)  activeBuff.allResShred    += def.allResShred;
            if (def.vv)           activeBuff.elemResShred   += 0.40;
            if (def.elementDmgPct) {
                for (const [el, val] of Object.entries(def.elementDmgPct)) {
                    if (el === myElement || el === myInfusion) activeBuff.elementDmgPct += val;
                }
            }
            if (def.resShredElement) {
                for (const [el, val] of Object.entries(def.resShredElement)) {
                    if (el === myElement || el === myInfusion) activeBuff.elemResShred += val;
                }
            }
            // Escoffier C1: +60% Cryo CRIT DMG
            if (def.c1CryoCritDmg && provMember && getCons(provMember.avatar) >= 1) {
                const cryoHydroCount = team.filter(m => m.element === 'Ice' || m.element === 'Water').length;
                if (cryoHydroCount >= 4 && (myElement === 'Ice' || myInfusion === 'Ice')) {
                    activeBuff.critDmgBonus += def.c1CryoCritDmg;
                }
            }
            activeBuffNames.push(w.charName.split(' ')[0]);
        }

        // Add resonance buffs
        activeBuff.atkPct        += resBuff.atkPct;
        activeBuff.critRateBonus += resBuff.critRateBonus;

        // Self buffs
        const selfB = getSelfBuffs(member);

        // Base stat
        let baseStat;
        switch (scalingStat) {
            case 'HP':  baseStat = fp['2000'] ?? 0; break;
            case 'DEF': baseStat = fp['2002'] ?? 0; break;
            default:    baseStat = fp['2001'] ?? 0;
        }
        if (scalingStat === 'ATK') {
            baseStat = baseStat * (1 + activeBuff.atkPct + selfB.atkPct)
                     + activeBuff.atkFlat + selfB.atkFlat;
        }

        // Talent multiplier — same index mapping as calcCharDPS: [0]=normal, [1]=skill, [2]=burst
        const talentKey = action.talentKey;
        const talentObj = tData?.talents?.[talentKey];
        const tlIdx     = { normal: 0, skill: 1, burst: 2 };
        const allLvs    = getTalentLevels(member.avatar);
        // Seven-Phase Flash normals scale with Skill level, not Normal Attack level
        const lvIdx     = (talentKey === 'normal' && rot?.skillScaledNormals) ? 1 : (tlIdx[talentKey] ?? 1);
        const lv        = allLvs[lvIdx] ?? 10;
        const talMult   = action.talentRowFilter
            ? getTalentRowValue(talentObj, action.talentRowFilter, scalingStat, lv)
            : sumTalentRows(talentObj, scalingStat, lv);
        if (talMult === 0) continue;

        // Crit
        const critRate = Math.min((fp['20'] ?? 0) + activeBuff.critRateBonus + selfB.critRateBonus, 1);
        const critDmg  = (fp['22'] ?? 0) + (activeBuff.critDmgBonus ?? 0) + selfB.critDmgBonus;
        const critMult = 1 + critRate * critDmg;

        // DMG mult
        const infKey      = myInfusion ? elemKeys[myInfusion] : null;
        const dmgKeys     = ['40','41','42','43','44','45','46','30'];
        const bestElem    = Math.max(0, ...dmgKeys.map(k => fp[k] ?? 0));
        const elemDmg     = (infKey ? Math.max(fp[infKey] ?? 0, bestElem) : bestElem)
                          + activeBuff.elementDmgPct + selfB.elementDmgPct;
        let typeDmgBonus  = 0;
        if      (talentKey === 'burst')  typeDmgBonus = selfB.burstDmgPct  + selfB.skillBurstDmgPct;
        else if (talentKey === 'skill')  typeDmgBonus = selfB.skillDmgPct  + selfB.skillBurstDmgPct;
        else if (talentKey === 'normal') typeDmgBonus = selfB.normalChargeDmgPct;
        const dmgMult = 1 + elemDmg + activeBuff.dmgPct + selfB.dmgPct + typeDmgBonus;

        // Def / res
        const charLv   = getLevel(member.avatar);
        const defShred = activeBuff.defShredPct + selfB.defShredPct;
        const defMult  = (charLv + 100) / ((charLv + 100) + 200 * (1 - (defShred ?? 0)));
        const resShred = activeBuff.allResShred + activeBuff.elemResShred + selfB.elemResShred;
        const enemyRes = 0.10 - resShred;
        const resMult  = enemyRes >= 0 ? (1 - enemyRes) : (1 - enemyRes / 2);

        // A4 multiplicative buff (e.g. Skirk A4: 1.7x at max stacks)
        const a4Mult = rot?.a4Mult ?? 1;

        // Furina salon HP multiplier (140% with 4 chars >50% HP)
        const salonMult = (action.type === 'offfield' && rot?.salonHpMult) ? rot.salonHpMult : 1;

        const hits = action.hits ?? 1;
        const dmg  = baseStat * talMult * hits * critMult * dmgMult * defMult * resMult * a4Mult * salonMult;

        if (isNaN(dmg) || !isFinite(dmg)) continue; // skip bad events
        perCharDmg[member.name] = (perCharDmg[member.name] ?? 0) + dmg;
        events.push({ t, charName: member.name, color: ELEM_COLORS[member.element] ?? '#c8a96e',
                      actionType: action.type, talentKey, talMult, dmg, activeBuffNames });
    }

    // Rotation ends when the main DPS finishes their last action
    const mainActions = rawEvents.filter(e => e.member === mainDPS);
    const mainEndT   = mainActions.length
        ? Math.max(...mainActions.map(e => e.t)) + 1
        : 20;

    // Discard off-field events that land after the main DPS finishes
    const filteredEvents = events.filter(e => e.t <= mainEndT);
    const perCharDmgFinal = {};
    for (const ev of filteredEvents) {
        perCharDmgFinal[ev.charName] = (perCharDmgFinal[ev.charName] ?? 0) + ev.dmg;
    }

    const totalDmg = Object.values(perCharDmgFinal).reduce((s, v) => s + v, 0);
    const rotDur   = mainEndT;

    return { events: filteredEvents, totalDmg, rotDur, dps: totalDmg / rotDur, perCharDmg: perCharDmgFinal, buffWindows, charStartT };
}

function fmtScore(val) {
    if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
    if (val >= 1000)      return (val / 1000).toFixed(1) + 'k';
    return Math.round(val).toLocaleString();
}

function getActiveResonances(team) {
    const counts = {};
    team.forEach(m => counts[m.element] = (counts[m.element] ?? 0) + 1);
    return RESONANCES.filter(r => (counts[r.elements[0]] ?? 0) >= r.min);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCharElement(avatarId) {
    const strId = String(avatarId);
    const entry = state.charData?.[avatarId] ?? state.charData?.[strId];
    if (entry?.Element) return entry.Element;
    return state.yattaData?.[avatarId]?.element ?? state.yattaData?.[strId]?.element ?? 'Unknown';
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderTeam() {
    const slotsEl     = document.getElementById('team-slots');
    const resonanceEl = document.getElementById('team-resonance');
    const scoreEl     = document.getElementById('team-score');

    const results = calcTeamDPS(teamState.team);
    const staticTotal = results.reduce((s, r) => s + r.score, 0);

    // Run simulation once — only if all data loaded
    const dataReady = teamState.talentData && teamState.buffData && teamState.rotationData && teamState.weaponData;
    const sim = dataReady ? simulate(teamState.team) : null;
    const simTotal = sim ? Object.values(sim.perCharDmg).reduce((s, v) => s + v, 0) : 0;
    const total = (sim && simTotal > 0) ? simTotal : staticTotal;

    const getCharScore = name => {
        if (sim) {
            const v = sim.perCharDmg[name];
            if (v !== undefined && !isNaN(v)) return v;
        }
        return results.find(r => r.member.name === name)?.score ?? 0;
    };

    // Slots
    slotsEl.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        const res  = results[i];

        if (res) {
            const { member, buffs } = res;
            const score = getCharScore(member.name);
            const fp       = member.avatar.fightPropMap ?? {};
            const cr       = ((Math.min((fp['20'] ?? 0) + buffs.critRateBonus, 1)) * 100).toFixed(1);
            const cd       = ((fp['22'] ?? 0) * 100).toFixed(1);
            const levels   = getTalentLevels(member.avatar).slice(0, 3).join('/');
            const tData    = teamState.talentData?.[member.name];
            const rotation = teamState.rotationData?.[member.name];
            const stat     = tData?.scalingStat ?? 'ATK';
            const rxn      = rotation?.reaction ? ` · ${rotation.reaction}` : '';
            const role     = rotation?.role ?? '';
            const pct      = total > 0 ? (score / total * 100).toFixed(0) : 0;

            // Self buffs (weapon, artifacts, passives)
            const selfB   = getSelfBuffs(member);
            const artSets = getArtifactSetCounts(member.avatar);
            const wInfo   = typeof getWeapon === 'function' ? getWeapon(member.avatar) : null;

            // Artifact set display
            const artLines = [];
            for (const [setName, cnt] of Object.entries(artSets)) {
                if (cnt >= 4) artLines.push(`4pc ${setName}`);
                else if (cnt >= 2) artLines.push(`2pc ${setName}`);
            }

            // Active buffs summary (team buffs + self buffs)
            const buffLines = [];
            if (buffs.atkFlat > 0)           buffLines.push(`+${Math.round(buffs.atkFlat)} ATK`);
            if (buffs.atkPct > 0)            buffLines.push(`+${(buffs.atkPct*100).toFixed(0)}% ATK`);
            if (buffs.dmgPct > 0)            buffLines.push(`+${(buffs.dmgPct*100).toFixed(0)}% DMG`);
            if (buffs.critRateBonus > 0)     buffLines.push(`+${(buffs.critRateBonus*100).toFixed(0)}% CR`);
            if (buffs.elemResShred > 0)      buffLines.push(`-${(buffs.elemResShred*100).toFixed(0)}% RES`);
            if (buffs.allResShred > 0)       buffLines.push(`-${(buffs.allResShred*100).toFixed(0)}% RES`);
            if (buffs.elementDmgPct > 0)     buffLines.push(`+${(buffs.elementDmgPct*100).toFixed(0)}% eDMG`);
            // Self buffs
            if (selfB.critRateBonus > 0)     buffLines.push(`+${(selfB.critRateBonus*100).toFixed(0)}% CR`);
            if (selfB.critDmgBonus > 0)      buffLines.push(`+${(selfB.critDmgBonus*100).toFixed(0)}% CD`);
            if (selfB.dmgPct > 0)            buffLines.push(`+${(selfB.dmgPct*100).toFixed(0)}% DMG`);
            if (selfB.elementDmgPct > 0)     buffLines.push(`+${(selfB.elementDmgPct*100).toFixed(0)}% eDMG`);
            if (selfB.burstDmgPct > 0)       buffLines.push(`+${(selfB.burstDmgPct*100).toFixed(0)}% Burst`);
            if (selfB.skillDmgPct > 0)       buffLines.push(`+${(selfB.skillDmgPct*100).toFixed(0)}% Skill`);
            if (selfB.normalChargeDmgPct > 0) buffLines.push(`+${(selfB.normalChargeDmgPct*100).toFixed(0)}% NA/CA`);
            if (selfB.atkFlat > 0)           buffLines.push(`+${Math.round(selfB.atkFlat)} ATK`);

            const cons = getCons(member.avatar);
            const consLabel = cons > 0 ? `C${cons}` : 'C0';

            slot.className = 'team-slot filled';
            slot.innerHTML = `
                <button class="team-slot-remove" data-idx="${i}" title="Remove">✕</button>
                <img class="team-slot-portrait" src="${member.iconUrl}" onerror="this.src='${BLANK_IMG}'">
                <div class="team-slot-name">${member.name} <span class="slot-cons">${consLabel}</span></div>
                <div class="team-slot-dps">
                    <span class="slot-dps-score">${fmtScore(score)}</span>
                    <span class="slot-dps-pct">${pct}% of team</span>
                    <span class="slot-dps-meta">${cr}% / ${cd}% CR/CD</span>
                    <span class="slot-dps-meta">T${levels} · ${stat}${rxn}</span>
                    ${role ? `<span class="slot-dps-role role-${role}">${role}</span>` : ''}
                    ${wInfo ? `<span class="slot-weapon">${wInfo.name} R${wInfo.refRank}</span>` : ''}
                    ${artLines.length ? `<span class="slot-artifact-sets">${artLines.join(', ')}</span>` : ''}
                    ${buffLines.length ? `<span class="slot-buffs">${buffLines.join(' · ')}</span>` : ''}
                </div>
                <div class="slot-bar-wrap"><div class="slot-bar" style="width:${pct}%"></div></div>
            `;
            slot.querySelector('.team-slot-remove').addEventListener('click', e => {
                e.stopPropagation();
                teamState.team.splice(i, 1);
                renderTeam();
                renderCharGrid();
            });
        } else {
            slot.className = 'team-slot';
            slot.innerHTML = `<span style="color:var(--text-dim);font-size:.8em">Slot ${i + 1}</span>`;
        }

        slotsEl.appendChild(slot);
    }

    // Resonances
    const active = getActiveResonances(teamState.team);
    resonanceEl.innerHTML = active.length
        ? active.map(r => `<span class="resonance-badge" style="color:${r.color}">${r.name} — ${r.desc}</span>`).join('')
        : '<span style="color:var(--text-dim);font-size:.78em">Select characters to see team resonance</span>';

    // Team total
    if (teamState.team.length) {
        const breakdown = results.map(r =>
            `<span class="team-breakdown-item">${r.member.name.split(' ')[0]} ${fmtScore(getCharScore(r.member.name))}</span>`
        ).join('');

        // Rotation order
        const rotOrder = buildRotationOrder(results.map(r => r.member));
        const sortedResults = [...results].sort((a, b) =>
            (rotOrder[a.member.name] ?? 99) - (rotOrder[b.member.name] ?? 99)
        );
        const ordinals = ['1st', '2nd', '3rd', '4th'];
        const rotLines = sortedResults.map((r, idx) => {
            const rot = teamState.rotationData?.[r.member.name];
            if (!rot) return null;
            const rotText = rot.label ?? (() => {
                const hm = rot.hitMult ?? {};
                const steps = [];
                if (hm.skill)  steps.push(`E`);
                if (hm.burst)  steps.push(`Q`);
                if (hm.normal) steps.push(`NA×${hm.normal}`);
                return steps.join(' → ') + (rot.infusion ? ` (${rot.infusion})` : '');
            })();
            const ordinal = ordinals[idx] ?? `${idx+1}th`;
            return `<span class="rot-line"><b>${r.member.name.split(' ')[0]}</b> <span style="opacity:.5;font-size:.85em">(${ordinal})</span>: ${rotText}</span>`;
        }).filter(Boolean);

        // ── Bar chart timeline (using sim buff windows if available) ──────────
        const TOTAL_TIME = sim ? sim.rotDur : 25;
        const PX_PER_SEC = 100 / TOTAL_TIME;

        const timelineRows = sortedResults.map((r) => {
            const rot     = teamState.rotationData?.[r.member.name];
            const name    = r.member.name.split(' ')[0];
            const color   = ELEM_COLORS[r.member.element] ?? '#c8a96e';

            // Use precise buff windows from sim if available
            const bw = sim?.buffWindows?.find(w => w.charName === r.member.name);
            const castStart  = sim ? (sim.charStartT[r.member.name] ?? 0) : 0;
            const castEnd    = castStart + 2;
            const buffStart  = bw ? bw.startT : castStart;
            const buffEnd    = bw ? bw.endT   : castStart + (rot?.buffDuration ?? 0);
            const dmgStart   = castEnd;
            const dmgEnd     = rot?.role === 'main' ? TOTAL_TIME : Math.min(buffEnd, TOTAL_TIME);

            const castPct    = (castStart * PX_PER_SEC).toFixed(1);
            const castWid    = ((castEnd - castStart) * PX_PER_SEC).toFixed(1);
            const buffPct    = (buffStart * PX_PER_SEC).toFixed(1);
            const buffWid    = (Math.max(0, buffEnd - buffStart) * PX_PER_SEC).toFixed(1);
            const dmgPct2    = (dmgStart * PX_PER_SEC).toFixed(1);
            const dmgWid     = (Math.max(0, dmgEnd - dmgStart) * PX_PER_SEC).toFixed(1);

            // Hit dots from sim events
            let dots = '';
            if (sim) {
                const charEvents = sim.events.filter(e => e.charName === r.member.name);
                const seen = new Set();
                for (const ev of charEvents) {
                    const key = ev.t.toFixed(1);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    const pct = (ev.t * PX_PER_SEC).toFixed(1);
                    dots += `<span class="tl-tick" style="left:${pct}%"></span>`;
                }
            }

            return `
            <div class="tl-row">
                <div class="tl-name" style="color:${color}">${name}</div>
                <div class="tl-track">
                    ${buffEnd > buffStart ? `<div class="tl-buff" style="left:${buffPct}%;width:${buffWid}%;background:${color}22;border-color:${color}66"></div>` : ''}
                    ${+dmgWid > 0 ? `<div class="tl-dmg" style="left:${dmgPct2}%;width:${dmgWid}%;background:${color}44"></div>` : ''}
                    <div class="tl-cast" style="left:${castPct}%;width:${castWid}%;background:${color}"></div>
                    ${dots}
                </div>
            </div>`;
        }).join('');

        const secMarkers = Array.from({length: Math.floor(TOTAL_TIME / 5) + 1}, (_, i) => i * 5)
            .map(s => `<span class="tl-sec-label" style="left:${(s * PX_PER_SEC).toFixed(1)}%">${s}s</span>`)
            .join('');

        // ── Event log ─────────────────────────────────────────────────────────
        let eventLogHtml = '';
        if (sim) {
            const actionLabel = { normal: 'N', skill: 'E', burst: 'Q', offfield: '~' };
            const rows = sim.events.map(ev => {
                const buffTag = ev.activeBuffNames.length
                    ? `<span class="tl-event-buffs">+${ev.activeBuffNames.join(' +')}</span>` : '';
                return `<div class="tl-event-row">
                    <span class="tl-event-time">t=${ev.t.toFixed(1)}s</span>
                    <span class="tl-event-char" style="color:${ev.color}">${ev.charName.split(' ')[0]}</span>
                    <span class="tl-event-action">${actionLabel[ev.actionType] ?? ev.actionType}</span>
                    <span class="tl-event-dmg">${fmtScore(ev.dmg)}</span>
                    ${buffTag}
                </div>`;
            }).join('');
            eventLogHtml = `<div class="tl-eventlog">${rows}</div>`;
        }

        const displayTotal = sim ? simTotal : total;
        const dpsNote = sim
            ? `${fmtScore(sim.dps)} DPS over ${sim.rotDur.toFixed(1)}s`
            : 'Talent multipliers × hit counts × crit × DMG buffs × RES/DEF shred × reaction';

        const dpsInline = sim ? ` <span style="font-size:.55em;color:var(--text-dim);font-weight:400">(${fmtScore(sim.dps)} DPS)</span>` : '';
        scoreEl.innerHTML = `
            Team Rotation Score
            <span class="team-score-val">${fmtScore(displayTotal)}${dpsInline}</span>
            <div class="team-breakdown">${breakdown}</div>
            <span class="team-score-note">${dpsNote}</span>
            ${rotLines.length ? `<div class="team-rotation-summary"><span class="rot-label">Assumed rotation:</span>${rotLines.join('')}</div>` : ''}
            <div class="tl-wrap">
                <div class="tl-header">
                    <div class="tl-name"></div>
                    <div class="tl-track tl-track-header">${secMarkers}</div>
                </div>
                ${timelineRows}
                <div class="tl-legend">
                    <span class="tl-legend-cast">■ Cast</span>
                    <span class="tl-legend-dmg">■ Damage window</span>
                    <span class="tl-legend-buff">■ Buff window</span>
                    <span class="tl-legend-tick">· hit</span>
                </div>
                ${eventLogHtml}
            </div>
        `;
    } else {
        scoreEl.innerHTML = `<span style="color:var(--text-dim)">Add up to 4 characters to see team score</span>`;
    }

    if (teamState.team.length === 4) {
        trackEvent('team_built', {
            members: teamState.team.map(m => m.name).join(', '),
            score:   Math.round(total),
        });
    }
}

function renderCharGrid() {
    const grid    = document.getElementById('team-chars-grid');
    const avatars = teamState.player?.avatarInfoList ?? [];
    grid.innerHTML = '';

    avatars.forEach(av => {
        const ci       = getCharInfo(av.avatarId, teamState.player.charData);
        const inTeam   = teamState.team.some(m => m.avatar === av);
        const teamFull = teamState.team.length >= 4;
        const card     = document.createElement('div');
        card.className = `char-card ${ci.rarity === 5 ? 'q5' : 'q4'}${inTeam ? ' selected' : ''}`;
        const cons = getCons(av);
        card.innerHTML = `
            ${cons > 0 ? `<div class="cons-badge">C${cons}</div>` : ''}
            <img class="char-portrait" src="${ci.iconUrl}" alt="${ci.name}" onerror="this.src='${BLANK_IMG}'">
            <div class="char-name">${ci.name}</div>
            <div class="char-lvl">Lv.&nbsp;${getLevel(av)}</div>
        `;
        if (!inTeam && !teamFull) {
            card.addEventListener('click', () => {
                teamState.team.push({
                    avatar:   av,
                    charData: teamState.player.charData,
                    name:     ci.name,
                    iconUrl:  ci.iconUrl,
                    element:  getCharElement(av.avatarId),
                });
                renderTeam();
                renderCharGrid();
                trackEvent('team_character_added', { character: ci.name });
            });
        } else if (inTeam) {
            card.style.opacity = '0.5';
        } else {
            card.style.opacity = '0.35';
            card.style.cursor  = 'default';
        }
        grid.appendChild(card);
    });
}

// ── Load player ───────────────────────────────────────────────────────────────

async function loadTeamPlayer() {
    const uid = document.getElementById('team-uid').value.trim();
    if (!uid) return;

    const btn      = document.getElementById('team-btn');
    const statusEl = document.getElementById('team-status');
    const infoEl   = document.getElementById('team-info');
    btn.disabled = true;
    statusEl.textContent = 'Loading…';
    statusEl.style.display = '';
    infoEl.textContent = '';
    teamState.team   = [];
    teamState.player = null;
    renderTeam();
    document.getElementById('team-chars-grid').innerHTML = '';

    try {
        const charData = await fetchCharData();
        await Promise.all([
            fetchTalentData(), fetchRotationData(), fetchBuffData(),
            fetchWeaponData(), fetchArtifactSetData(), fetchPassiveData(), fetchConstellData(),
        ]);

        let data = loadPlayerCache(uid);
        if (!data) {
            const res = await fetch(`${ENKA_API}${uid}`);
            if (!res.ok) throw new Error(res.status === 400 ? 'Invalid UID' : 'Enka is down, try again in a few minutes');
            data = await res.json();
            savePlayerCache(uid, data);
        }

        teamState.player = { ...data, charData };
        const pi = data.playerInfo;
        infoEl.textContent = `${pi.nickname}  ·  AR ${pi.level}  ·  WL ${pi.worldLevel ?? 0}`;
        statusEl.style.display = 'none';

        const params = new URLSearchParams(window.location.search);
        params.set('uid', uid);
        history.replaceState(null, '', `?${params}`);

        trackEvent('uid_loaded', { uid, nickname: pi.nickname, ar_level: pi.level, page: 'team', source: 'manual' });
        renderCharGrid();

    } catch (e) {
        statusEl.textContent = e.message === 'Invalid UID' ? e.message : 'Enka is down, try again in a few minutes';
        trackEvent('uid_load_error', { error: statusEl.textContent, page: 'team' });
    } finally {
        btn.disabled = false;
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('.page-nav-link').forEach(a => {
    const base = a.getAttribute('href');
    a.addEventListener('click', ev => {
        ev.preventDefault();
        trackEvent('page_nav_click', { from: 'team', to: a.dataset.page });
        window.location.href = base + window.location.search;
    });
});

document.getElementById('team-btn').addEventListener('click', loadTeamPlayer);
document.getElementById('team-uid').addEventListener('keydown', e => { if (e.key === 'Enter') loadTeamPlayer(); });

renderTeam();

(async () => {
    const uid = new URLSearchParams(window.location.search).get('uid');
    if (uid) {
        document.getElementById('team-uid').value = uid;
        await loadTeamPlayer();
    }
})();
