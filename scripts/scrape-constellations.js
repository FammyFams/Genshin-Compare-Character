#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { load } = require('cheerio');

const WIKI_API     = 'https://genshin-impact.fandom.com/api.php';
const SLEEP_MS     = 800;
const OUT_PATH     = path.join(__dirname, '..', 'data', 'constellations.json');
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

// Get constellation links from a character page
async function getConstellationLinks(charName) {
    const html = await fetchWikiPage(charName);
    if (!html) return [];

    const $ = load(html);
    const consts = [];

    $('table.constellation-table tr').each((_, row) => {
        const tds = $(row).find('td');
        if (tds.length < 3) return;

        const link = $(tds).eq(1).find('a[href]').first();
        const levelText = $(tds).eq(2).text().trim();
        const constName = link.text().trim();
        const constPage = decodeURIComponent(link.attr('href')?.replace('/wiki/', '') ?? '').replace(/_/g, ' ');

        // Extract constellation number
        const levelDiv = $(tds).eq(2).find('[id]').first().attr('id') ?? '';
        const levelMatch = levelDiv.match(/Constellation_C(\d+)/) ?? levelText.match(/^C?(\d+)$/);
        const level = levelMatch ? parseInt(levelMatch[1]) : null;

        if (constName && constPage && level !== null) {
            consts.push({ level, name: constName, page: constPage });
        }
    });

    return consts;
}

// Fetch a constellation page and get its description
async function getConstellationDesc(page) {
    const html = await fetchWikiPage(page.replace(/ /g, '_'));
    if (!html) return '';

    const $ = load(html);

    const desc = $('[data-source="description"] .pi-data-value').text().trim();
    if (desc.length > 10) return desc;

    // Fallback
    let fallback = '';
    $('p').each((_, el) => {
        const t = $(el).text().trim();
        if (!fallback && t.length > 30 && !t.toLowerCase().includes('disambiguation')) {
            fallback = t;
        }
    });
    return fallback;
}

// Parse key constellation effects into numeric modifiers
function parseConstellationEffects(level, desc) {
    const effects = {};

    // C3 or C5: Increases skill/burst talent level by 3
    if (level === 3) {
        const skillMatch = desc.match(/Increases.*?(?:Elemental\s+Skill|skill).*?level by\s+(\d)/i);
        if (skillMatch || desc.match(/skill.*?level.*?\+3/i)) effects.skillTalentBonus = 3;
        else effects.skillTalentBonus = 3; // C3 almost always buffs skill
    }
    if (level === 5) {
        const burstMatch = desc.match(/Increases.*?(?:Elemental\s+Burst|burst).*?level by\s+(\d)/i);
        if (burstMatch || desc.match(/burst.*?level.*?\+3/i)) effects.burstTalentBonus = 3;
        else effects.burstTalentBonus = 3; // C5 almost always buffs burst
    }

    // DMG bonus
    const dmg = desc.match(/(?:DMG|damage)\s+(?:is\s+)?(?:increased?\s+by\s+)?(\d+(?:\.\d+)?)%/i);
    if (dmg && level !== 3 && level !== 5) effects.dmgPct = parseFloat(dmg[1]) / 100;

    // CRIT Rate
    const critRate = desc.match(/CRIT\s+Rate.*?(\d+(?:\.\d+)?)%/i);
    if (critRate) effects.critRateBonus = parseFloat(critRate[1]) / 100;

    // CRIT DMG
    const critDmg = desc.match(/CRIT\s+DMG.*?(\d+(?:\.\d+)?)%/i);
    if (critDmg) effects.critDmgBonus = parseFloat(critDmg[1]) / 100;

    // ATK bonus
    const atk = desc.match(/ATK.*?(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (atk && level !== 3 && level !== 5) effects.atkPct = parseFloat(atk[1]) / 100;

    // EM bonus
    const em = desc.match(/Elemental\s+Mastery.*?(?:by\s+)?(\d+(?:\.\d+)?)\b/i);
    if (em) effects.emBonus = parseFloat(em[1]);

    // RES shred
    const resShred = desc.match(/(?:Elemental\s+)?RES.*?(?:decreased?|reduced?).*?(\d+(?:\.\d+)?)%/i);
    if (resShred) effects.resShred = parseFloat(resShred[1]) / 100;

    // HP bonus
    const hp = desc.match(/(?:Max\s+)?HP.*?(?:increased?\s+by\s+)?(\d+(?:\.\d+)?)%/i);
    if (hp && level !== 3 && level !== 5) effects.hpPct = parseFloat(hp[1]) / 100;

    return effects;
}

async function main() {
    let charNames = [];
    if (fs.existsSync(TALENTS_PATH)) {
        const talents = JSON.parse(fs.readFileSync(TALENTS_PATH, 'utf8'));
        charNames = Object.keys(talents);
    } else {
        console.error('Run scrape-talents.js first to generate talents.json');
        process.exit(1);
    }

    console.log(`Processing ${charNames.length} characters...\n`);

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
            const constLinks = await getConstellationLinks(charName);
            await sleep(SLEEP_MS);

            const entry = {};

            for (const c of constLinks) {
                const desc = await getConstellationDesc(c.page);
                await sleep(SLEEP_MS);

                entry[`c${c.level}`] = {
                    name: c.name,
                    desc,
                    effects: parseConstellationEffects(c.level, desc),
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
