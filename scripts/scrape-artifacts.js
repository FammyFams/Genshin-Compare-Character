#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { load } = require('cheerio');

const WIKI_API = 'https://genshin-impact.fandom.com/api.php';
const OUT_PATH = path.join(__dirname, '..', 'data', 'artifact-sets.json');

async function fetchWikiPage(page) {
    const url = `${WIKI_API}?` + new URLSearchParams({
        action: 'parse', page, prop: 'text', format: 'json',
    });
    const res = await fetch(url, {
        headers: { 'User-Agent': 'hilichurl.com scraper (educational)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.info ?? JSON.stringify(json.error));
    return json.parse?.text?.['*'] ?? null;
}

// Try to parse a numeric bonus value from bonus text
// Returns structured effect or just { text } if unparseable
function parseBonus(text) {
    const t = text.trim();
    const effects = {};

    // ATK %
    const atkPct = t.match(/ATK\s*\+(\d+(?:\.\d+)?)%/i);
    if (atkPct) effects.atkPct = parseFloat(atkPct[1]) / 100;

    // Elemental DMG bonus (specific element)
    const elemDmg = t.match(/(Pyro|Hydro|Cryo|Electro|Anemo|Geo|Dendro|Physical)\s+DMG\s+Bonus\s*\+(\d+(?:\.\d+)?)%/i);
    if (elemDmg) {
        const elemMap = { Pyro:'Fire', Hydro:'Water', Cryo:'Ice', Electro:'Electric',
                          Anemo:'Wind', Geo:'Rock', Dendro:'Grass', Physical:'Physical' };
        effects.elementDmgPct = { [elemMap[elemDmg[1]] ?? elemDmg[1]]: parseFloat(elemDmg[2]) / 100 };
    }

    // All elemental DMG bonus (generic)
    const allElem = t.match(/(?:Elemental|all)\s+DMG\s+(?:Bonus\s*)?\+(\d+(?:\.\d+)?)%/i);
    if (allElem && !elemDmg) effects.dmgPct = parseFloat(allElem[1]) / 100;

    // CRIT Rate
    const critRate = t.match(/CRIT\s+Rate\s*\+(\d+(?:\.\d+)?)%/i);
    if (critRate) effects.critRateBonus = parseFloat(critRate[1]) / 100;

    // CRIT DMG
    const critDmg = t.match(/CRIT\s+DMG\s*\+(\d+(?:\.\d+)?)%/i);
    if (critDmg) effects.critDmgBonus = parseFloat(critDmg[1]) / 100;

    // Elemental Mastery flat
    const em = t.match(/Elemental\s+Mastery\s+(?:by\s+)?(\+?\d+(?:\.\d+)?)\b/i);
    if (em) effects.emBonus = parseFloat(em[1]);

    // Energy Recharge
    const er = t.match(/Energy\s+Recharge\s*\+(\d+(?:\.\d+)?)%/i);
    if (er) effects.erBonus = parseFloat(er[1]) / 100;

    // HP %
    const hp = t.match(/(?:Max\s+)?HP\s*\+(\d+(?:\.\d+)?)%/i);
    if (hp) effects.hpPct = parseFloat(hp[1]) / 100;

    // DEF %
    const def = t.match(/DEF\s*\+(\d+(?:\.\d+)?)%/i);
    if (def) effects.defPct = parseFloat(def[1]) / 100;

    // Normal/Charged Attack DMG
    const normalCharge = t.match(/Normal(?:\s+and\s+Charged)?\s+Attack\s+DMG\s*\+(\d+(?:\.\d+)?)%/i);
    if (normalCharge) effects.normalChargeDmgPct = parseFloat(normalCharge[1]) / 100;

    // Elemental Skill/Burst DMG
    const skillDmg = t.match(/Elemental\s+Skill\s+DMG\s*\+(\d+(?:\.\d+)?)%/i);
    if (skillDmg) effects.skillDmgPct = parseFloat(skillDmg[1]) / 100;

    const burstDmg = t.match(/Elemental\s+Burst\s+DMG\s*\+(\d+(?:\.\d+)?)%/i);
    if (burstDmg) effects.burstDmgPct = parseFloat(burstDmg[1]) / 100;

    // Physical DMG
    const physDmg = t.match(/Physical\s+DMG\s+Bonus\s*\+(\d+(?:\.\d+)?)%/i);
    if (physDmg) {
        if (!effects.elementDmgPct) effects.elementDmgPct = {};
        effects.elementDmgPct.Physical = parseFloat(physDmg[1]) / 100;
    }

    effects.text = t;
    return effects;
}

async function main() {
    console.log('Fetching Artifact/Sets page...');
    const html = await fetchWikiPage('Artifact/Sets');
    if (!html) { console.error('No HTML'); process.exit(1); }

    const $ = load(html);
    const output = {};

    $('table').first().find('tbody tr').each((_, row) => {
        const tds = $(row).find('td');
        if (!tds.length) return;

        const nameLink = $(tds).eq(0).find('a[title]').first();
        const name = nameLink.attr('title')?.trim();
        if (!name) return;

        const quality = $(tds).eq(1).text().trim();
        // Skip 1★, 2★, 3★ only sets
        if (quality && !quality.includes('4') && !quality.includes('5')) return;

        const piecesText = $(tds).eq(2).text().trim();
        const bonusesText = $(tds).eq(3).text().trim();
        if (!bonusesText) return;

        // Split into 2pc / 4pc parts
        const twoMatch  = bonusesText.match(/2-Piece:\s*(.+?)(?=4-Piece:|$)/s);
        const fourMatch = bonusesText.match(/4-Piece:\s*(.+)/s);
        const oneMatch  = bonusesText.match(/1-Piece:\s*(.+)/s);

        const entry = { quality: quality.trim() };

        if (oneMatch) {
            entry['1pc'] = parseBonus(oneMatch[1].trim());
        }
        if (twoMatch) {
            entry['2pc'] = parseBonus(twoMatch[1].trim());
        }
        if (fourMatch) {
            entry['4pc'] = parseBonus(fourMatch[1].trim());
        }

        if (Object.keys(entry).length > 1) {
            output[name] = entry;
            console.log(`✓ ${name} (${quality.trim()})`);
        }
    });

    fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
    console.log(`\nSaved ${Object.keys(output).length} artifact sets → ${OUT_PATH}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
