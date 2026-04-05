'use strict';

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

    if (s1 && s2) {
        const ci1 = getCharInfo(s1.avatar.avatarId, s1.charData);
        const ci2 = getCharInfo(s2.avatar.avatarId, s2.charData);
        trackEvent('comparison_viewed', {
            char1: ci1.name,
            char2: ci2.name,
            page:  'stats',
        });
    }

    document.querySelector('.center-col')?.scrollTo({ top: 0, behavior: 'smooth' });
    if (s1 && s2 && window.innerWidth <= 767) setMobileTab('compare');
}
