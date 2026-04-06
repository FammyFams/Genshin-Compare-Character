'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

const teamState = {
    player:       null,
    team:         [],
    talentData:   null,
    rotationData: null,
    buffData:     null,
};

// ── Resonance definitions ─────────────────────────────────────────────────────

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

// ── Talent level extraction ───────────────────────────────────────────────────

function getTalentLevels(avatar) {
    const base   = Object.values(avatar.skillLevelMap ?? {});
    const extras = Object.values(avatar.proudSkillExtraLevelMap ?? {});
    return base.map((lv, i) => Math.min(lv + (extras[i] ?? 0), 13));
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

function getTeamBuffs(team, thisMember) {
    const buffData = teamState.buffData ?? {};
    const rotation = teamState.rotationData?.[thisMember.name];
    const myElement  = thisMember.element;
    const myInfusion = rotation?.infusion ?? myElement;

    const out = {
        atkFlat:         0,
        atkPct:          0,
        dmgPct:          0,
        critRateBonus:   0,
        defShredPct:     0,
        allResShred:     0,
        elemResShred:    0,
        elementDmgPct:   0,
        emBonus:         0,
        normalFlatDmg:   0,
        iceQuillFlatDmg: 0,
    };

    team.forEach(member => {
        if (member === thisMember) return;
        const def = buffData[member.name];
        if (!def) return;

        const fp      = member.avatar.fightPropMap ?? {};
        const baseAtk = fp['1']  ?? fp['2001'] ?? 0;
        const baseDef = fp['4']  ?? fp['2002'] ?? 0;
        const em      = fp['28'] ?? 0;

        // Does this buff apply to this character?
        const tgt = def.targets ?? 'all';
        const applies = tgt === 'all'
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

// ── Talent row sum ────────────────────────────────────────────────────────────

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

    // Base stat
    let baseStat;
    switch (scalingStat) {
        case 'HP':  baseStat = fp['2000'] ?? 0; break;
        case 'DEF': baseStat = (fp['2002'] ?? 0) * (1 + (teamBuffs.defPctBonus ?? 0)); break;
        default:    baseStat = fp['2001'] ?? 0;
    }

    // Apply ATK buffs (only for ATK/EM scaling chars)
    if (scalingStat === 'ATK' || scalingStat === 'EM') {
        baseStat = baseStat * (1 + teamBuffs.atkPct) + teamBuffs.atkFlat;
    }

    // CRIT
    const critRate = Math.min((fp['20'] ?? 0) + teamBuffs.critRateBonus, 1);
    const critDmg  = fp['22'] ?? 0;
    const critMult = 1 + critRate * critDmg;

    // DMG bonus — pick best element, apply buffs
    const elemKeys   = { Fire:'40', Electric:'41', Water:'42', Grass:'43', Wind:'44', Rock:'45', Ice:'46' };
    const infusion   = rotation?.infusion;
    const infKey     = infusion ? elemKeys[infusion] : null;
    const dmgKeys    = ['40','41','42','43','44','45','46','30'];
    const bestElemDmg = Math.max(0, ...dmgKeys.map(k => fp[k] ?? 0));
    const elemDmg    = (infKey ? Math.max(fp[infKey] ?? 0, bestElemDmg) : bestElemDmg)
                       + teamBuffs.elementDmgPct;
    const dmgMult    = 1 + elemDmg + teamBuffs.dmgPct;

    // DEF reduction vs Lv.90 enemy
    const charLv   = getLevel(avatar);
    const defBase  = 190 * (1 - teamBuffs.defShredPct);
    const defMult  = (charLv + 100) / ((charLv + 100) + defBase);

    // RES reduction (enemy base 10%, stacks additively then caps)
    const totalResShred = teamBuffs.allResShred + teamBuffs.elemResShred;
    const enemyRes      = 0.10 - totalResShred;
    const resMult       = enemyRes >= 0 ? (1 - enemyRes) : (1 - enemyRes / 2);

    // Reaction
    const rxnMult = rotation?.reaction ? (REACTION_MULT[rotation.reaction] ?? 1) : 1;

    // EM bonus
    let emBonus = 1;
    if (scalingStat === 'EM' || rotation?.reaction === 'Spread') {
        const em = (fp['28'] ?? 0) + teamBuffs.emBonus;
        emBonus = 1 + (5 * em) / (em + 1200);
    }

    // Talent multipliers × hit counts
    const levels     = getTalentLevels(avatar);
    const talentKeys = ['normal', 'skill', 'burst'];
    let totalMult = 0;
    talentKeys.forEach((key, i) => {
        if (!tData?.talents?.[key]) return;
        const lv   = levels[i] ?? 6;
        const rows = sumTalentRows(tData.talents[key], scalingStat, lv);
        const hits = rotation?.hitMult?.[key] ?? 1;
        totalMult += rows * hits;
    });

    // Fallback if no talent data
    if (totalMult === 0) {
        return baseStat * critMult * dmgMult * defMult * resMult;
    }

    const talentDmg = baseStat * totalMult * critMult * dmgMult * defMult * resMult * rxnMult * emBonus;

    // Add flat DMG sources (Shenhe Icy Quill, Yun Jin)
    const flatDmg = (teamBuffs.iceQuillFlatDmg + teamBuffs.normalFlatDmg)
                    * critMult * defMult * resMult;

    return talentDmg + flatDmg;
}

function calcTeamDPS(team) {
    return team.map(member => {
        const buffs = getTeamBuffs(team, member);
        return { member, score: calcCharDPS(member, buffs), buffs };
    });
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
    const total   = results.reduce((s, r) => s + r.score, 0);

    // Slots
    slotsEl.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        const res  = results[i];

        if (res) {
            const { member, score, buffs } = res;
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

            // Active buffs summary
            const buffLines = [];
            if (buffs.atkFlat > 0)         buffLines.push(`+${Math.round(buffs.atkFlat)} ATK`);
            if (buffs.atkPct > 0)          buffLines.push(`+${(buffs.atkPct*100).toFixed(0)}% ATK`);
            if (buffs.dmgPct > 0)          buffLines.push(`+${(buffs.dmgPct*100).toFixed(0)}% DMG`);
            if (buffs.critRateBonus > 0)   buffLines.push(`+${(buffs.critRateBonus*100).toFixed(0)}% CR`);
            if (buffs.elemResShred > 0)    buffLines.push(`-${(buffs.elemResShred*100).toFixed(0)}% RES`);
            if (buffs.allResShred > 0)     buffLines.push(`-${(buffs.allResShred*100).toFixed(0)}% RES`);
            if (buffs.elementDmgPct > 0)   buffLines.push(`+${(buffs.elementDmgPct*100).toFixed(0)}% eDMG`);

            slot.className = 'team-slot filled';
            slot.innerHTML = `
                <button class="team-slot-remove" data-idx="${i}" title="Remove">✕</button>
                <img class="team-slot-portrait" src="${member.iconUrl}" onerror="this.src='${BLANK_IMG}'">
                <div class="team-slot-name">${member.name}</div>
                <div class="team-slot-dps">
                    <span class="slot-dps-score">${fmtScore(score)}</span>
                    <span class="slot-dps-pct">${pct}% of team</span>
                    <span class="slot-dps-meta">${cr}% / ${cd}% CR/CD</span>
                    <span class="slot-dps-meta">T${levels} · ${stat}${rxn}</span>
                    ${role ? `<span class="slot-dps-role role-${role}">${role}</span>` : ''}
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
            `<span class="team-breakdown-item">${r.member.name.split(' ')[0]} ${fmtScore(r.score)}</span>`
        ).join('');
        scoreEl.innerHTML = `
            Team Rotation Score
            <span class="team-score-val">${fmtScore(total)}</span>
            <div class="team-breakdown">${breakdown}</div>
            <span class="team-score-note">Talent multipliers × hit counts × crit × DMG buffs × RES/DEF shred × reaction</span>
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
        await Promise.all([fetchTalentData(), fetchRotationData(), fetchBuffData()]);

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
