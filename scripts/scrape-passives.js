#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { load } = require('cheerio');

const WIKI_API  = 'https://genshin-impact.fandom.com/api.php';
const SLEEP_MS  = 800;
const OUT_PATH  = path.join(__dirname, '..', 'data', 'passives.json');
const TALENTS_PATH = path.join(__dirname, '..', 'data', 'talents.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// Extract passive talent links from character page
async function getPassiveTalentLinks(charName) {
    const html = await fetchWikiPage(charName);
    if (!html) return [];

    const $ = load(html);
    const passives = [];

    $('table.talent-table tr').each((_, row) => {
        const tds = $(row).find('td');
        if (tds.length < 3) return;

        const typeCell = $(tds).eq(2);
        const typeText = typeCell.text().trim();

        if (typeText.includes('Ascension Passive') || typeText.includes('Utility Passive')) {
            const nameCell = $(tds).eq(1);
            const link = nameCell.find('a[href]').first();
            const talentName = link.text().trim();
            const talentPage = decodeURIComponent(link.attr('href')?.replace('/wiki/', '') ?? '').replace(/_/g, ' ');

            // Determine ascension level
            let ascension = 'util';
            if (typeText.includes('1st')) ascension = 'a1';
            else if (typeText.includes('4th')) ascension = 'a4';

            if (talentName && talentPage) {
                passives.push({ ascension, name: talentName, page: talentPage });
            }
        }
    });

    return passives;
}

// Fetch a talent page and extract its description
async function getTalentDescription(page) {
    const html = await fetchWikiPage(page.replace(/ /g, '_'));
    if (!html) return '';

    const $ = load(html);

    // Description is in [data-source="info"] .pi-data-value
    const infoEl = $('[data-source="info"] .pi-data-value');
    if (infoEl.length) {
        const t = infoEl.text().trim();
        if (t.length > 20) return t;
    }

    // Fallback: first <p> tag content
    let desc = '';
    $('p').each((_, el) => {
        const t = $(el).text().trim();
        if (!desc && t.length > 30 && !t.toLowerCase().includes('disambiguation')) {
            desc = t;
        }
    });

    return desc;
}

// Parse passive description into numeric effects
function parsePassiveEffects(desc) {
    const t = desc;
    const effects = {};

    // ATK conversion from HP (e.g. Hu Tao A1: "ATK is increased by an amount equal to ... HP")
    const atkFromHp = t.match(/ATK.*?(\d+(?:\.\d+)?)%.*?Max\s+HP/i);
    if (atkFromHp) effects.atkFromHpPct = parseFloat(atkFromHp[1]) / 100;

    // CRIT Rate bonus
    const critRate = t.match(/CRIT\s+Rate.*?(\d+(?:\.\d+)?)%/i);
    if (critRate) effects.critRateBonus = parseFloat(critRate[1]) / 100;

    // CRIT DMG bonus
    const critDmg = t.match(/CRIT\s+DMG.*?(\d+(?:\.\d+)?)%/i);
    if (critDmg) effects.critDmgBonus = parseFloat(critDmg[1]) / 100;

    // DMG% bonus (flat percentage)
    const dmgBonus = t.match(/(?:DMG|damage)\s+(?:is\s+)?(?:increased?\s+by\s+)?(\d+(?:\.\d+)?)%/i);
    if (dmgBonus) effects.dmgPct = parseFloat(dmgBonus[1]) / 100;

    // Elemental DMG bonus
    const elemDmg = t.match(/(Pyro|Hydro|Cryo|Electro|Anemo|Geo|Dendro|Physical)\s+DMG\s+Bonus\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (elemDmg) {
        const elemMap = { Pyro:'Fire', Hydro:'Water', Cryo:'Ice', Electro:'Electric',
                          Anemo:'Wind', Geo:'Rock', Dendro:'Grass', Physical:'Physical' };
        effects.elementDmgPct = { [elemMap[elemDmg[1]] ?? elemDmg[1]]: parseFloat(elemDmg[2]) / 100 };
    }

    // ATK% bonus
    const atkPct = t.match(/ATK\s+(?:is\s+)?(?:increased?\s+by\s+)?(\d+(?:\.\d+)?)%/i);
    if (atkPct && !atkFromHp) effects.atkPct = parseFloat(atkPct[1]) / 100;

    // Healing bonus
    const healing = t.match(/Healing\s+(?:Bonus|Effectiveness)\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (healing) effects.healingBonus = parseFloat(healing[1]) / 100;

    // EM bonus
    const em = t.match(/Elemental\s+Mastery.*?(?:increased?\s+by\s+|by\s+)?(\d+(?:\.\d+)?)\b/i);
    if (em) effects.emBonus = parseFloat(em[1]);

    // Shield strength
    const shield = t.match(/Shield\s+Strength.*?(\d+(?:\.\d+)?)%/i);
    if (shield) effects.shieldStrength = parseFloat(shield[1]) / 100;

    return effects;
}

async function main() {
    // Load character names from talents.json
    let charNames = [];
    if (fs.existsSync(TALENTS_PATH)) {
        const talents = JSON.parse(fs.readFileSync(TALENTS_PATH, 'utf8'));
        charNames = Object.keys(talents);
    } else {
        console.error('Run scrape-talents.js first to generate talents.json');
        process.exit(1);
    }

    console.log(`Processing ${charNames.length} characters...\n`);

    // Load existing output for resume
    let output = {};
    if (fs.existsSync(OUT_PATH)) {
        try { output = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch {}
        console.log(`Resuming — ${Object.keys(output).length} already done\n`);
    }

    let done = 0, skipped = 0, errors = 0;

    for (const charName of charNames) {
        if (output[charName]) { skipped++; continue; }

        process.stdout.write(`  ${charName.padEnd(28)}`);

        try {
            const passiveLinks = await getPassiveTalentLinks(charName);
            await sleep(SLEEP_MS);

            const entry = {};

            for (const p of passiveLinks) {
                const desc = await getTalentDescription(p.page);
                await sleep(SLEEP_MS);

                entry[p.ascension] = {
                    name: p.name,
                    desc,
                    effects: parsePassiveEffects(desc),
                };
            }

            output[charName] = entry;
            const keys = Object.keys(entry).join(', ');
            console.log(`✓  [${keys || 'none'}]`);
            done++;
        } catch (e) {
            console.log(`✗  ${e.message}`);
            errors++;
        }

        fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Done: ${done}  Skipped: ${skipped}  Errors: ${errors}`);
    console.log(`Total: ${Object.keys(output).length} saved → ${OUT_PATH}`);
}

main().catch(err => { console.error('\nFatal:', err); process.exit(1); });
