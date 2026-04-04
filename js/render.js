'use strict';

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(side, html, type = '') {
    const el = document.getElementById(`status-${side}`);
    el.className     = `status ${type}`;
    el.innerHTML     = html;
    el.style.display = '';
}

function clearStatus(side) {
    document.getElementById(`status-${side}`).style.display = 'none';
}

// ── Character cards (side panels) ────────────────────────────────────────────

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

// ── Comparison panel ──────────────────────────────────────────────────────────

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
