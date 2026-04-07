#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { load } = require('cheerio');

const WIKI_API = 'https://genshin-impact.fandom.com/api.php';
const OUT_PATH = path.join(__dirname, '..', 'data', 'weapons.json');
const SLEEP_MS = 800;

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

// Extract per-refinement values from a raw passive text
// "HP increased by 20~40%" → [0.20, 0.25, 0.30, 0.35, 0.40]
function extractRefinementValues(text) {
    const refined = {};
    const pattern = /(\d+(?:\.\d+)?)~(\d+(?:\.\d+)?)/g;
    let m;
    while ((m = pattern.exec(text)) !== null) {
        const r1 = parseFloat(m[1]);
        const r5 = parseFloat(m[2]);
        // Not storing per-pattern, just return first r1/r5 pair encountered
        if (!refined.r1) { refined.r1 = r1; refined.r5 = r5; }
    }
    return refined;
}

// Parse passive text - extract key values at R1 and R5
function parsePassive(name, text) {
    const t = text.trim();
    const effects = { name, text: t };

    // Resolve X~Y ranges to R5 value (the last value)
    const resolveRange = (str, useR1 = false) => {
        return str.replace(/(\d+(?:\.\d+)?)~(\d+(?:\.\d+)?)/g, (_, r1, r5) => useR1 ? r1 : r5);
    };
    const r5 = resolveRange(t);
    const r1 = resolveRange(t, true);

    // Helper: extract both R1 and R5 numeric values for a regex match on both strings
    function extractR(fieldR5, fieldR1) {
        return fieldR5 !== undefined
            ? { r5: fieldR5, r1: fieldR1 ?? fieldR5 }
            : null;
    }

    // HP %
    const hpR5 = r5.match(/HP\s+increased?\s+by\s+(\d+(?:\.\d+)?)%/i);
    const hpR1 = r1.match(/HP\s+increased?\s+by\s+(\d+(?:\.\d+)?)%/i);
    if (hpR5) effects.hpPct = { r5: parseFloat(hpR5[1]) / 100, r1: parseFloat((hpR1 ?? hpR5)[1]) / 100 };

    // ATK %
    const atkR5 = r5.match(/ATK\s+(?:increased?\s+by\s+|is\s+increased?\s+by\s+)?(\d+(?:\.\d+)?)%/i);
    const atkR1 = r1.match(/ATK\s+(?:increased?\s+by\s+|is\s+increased?\s+by\s+)?(\d+(?:\.\d+)?)%/i);
    if (atkR5) effects.atkPct = { r5: parseFloat(atkR5[1]) / 100, r1: parseFloat((atkR1 ?? atkR5)[1]) / 100 };

    // ATK flat from HP
    const atkFromHpR5 = r5.match(/ATK\s+Bonus\s+based\s+on\s+(\d+(?:\.\d+)?)%\s+of.*Max\s+HP/i);
    const atkFromHpR1 = r1.match(/ATK\s+Bonus\s+based\s+on\s+(\d+(?:\.\d+)?)%\s+of.*Max\s+HP/i);
    if (atkFromHpR5) effects.atkFlatFromHpPct = { r5: parseFloat(atkFromHpR5[1]) / 100, r1: parseFloat((atkFromHpR1 ?? atkFromHpR5)[1]) / 100 };

    // ATK flat from HP when low HP
    const atkLowR5 = r5.match(/less\s+than\s+50%.*?additional\s+(\d+(?:\.\d+)?)%\s+of\s+Max\s+HP/is);
    const atkLowR1 = r1.match(/less\s+than\s+50%.*?additional\s+(\d+(?:\.\d+)?)%\s+of\s+Max\s+HP/is);
    if (atkLowR5) effects.atkFlatFromHpLowPct = { r5: parseFloat(atkLowR5[1]) / 100, r1: parseFloat((atkLowR1 ?? atkLowR5)[1]) / 100 };

    // DMG increased by X%
    const dmgR5 = r5.match(/DMG\s+(?:increased?\s+by\s+|Bonus\s+)?(\d+(?:\.\d+)?)%/i);
    const dmgR1 = r1.match(/DMG\s+(?:increased?\s+by\s+|Bonus\s+)?(\d+(?:\.\d+)?)%/i);
    if (dmgR5) effects.dmgPct = { r5: parseFloat(dmgR5[1]) / 100, r1: parseFloat((dmgR1 ?? dmgR5)[1]) / 100 };

    // CRIT Rate
    const critRateR5 = r5.match(/CRIT\s+Rate\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    const critRateR1 = r1.match(/CRIT\s+Rate\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (critRateR5) effects.critRateBonus = { r5: parseFloat(critRateR5[1]) / 100, r1: parseFloat((critRateR1 ?? critRateR5)[1]) / 100 };

    // CRIT DMG
    const critDmgR5 = r5.match(/CRIT\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    const critDmgR1 = r1.match(/CRIT\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (critDmgR5) effects.critDmgBonus = { r5: parseFloat(critDmgR5[1]) / 100, r1: parseFloat((critDmgR1 ?? critDmgR5)[1]) / 100 };

    // Elemental Mastery
    const emR5 = r5.match(/Elemental\s+Mastery\s+(?:increased?\s+by\s+|by\s+)?(\+?\d+(?:\.\d+)?)\b/i);
    const emR1 = r1.match(/Elemental\s+Mastery\s+(?:increased?\s+by\s+|by\s+)?(\+?\d+(?:\.\d+)?)\b/i);
    if (emR5) effects.emBonus = { r5: parseFloat(emR5[1]), r1: parseFloat((emR1 ?? emR5)[1]) };

    // Elemental DMG bonus
    const elemDmgR5 = r5.match(/(Pyro|Hydro|Cryo|Electro|Anemo|Geo|Dendro|Physical)\s+DMG\s+Bonus\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (elemDmgR5) {
        const elemDmgR1 = r1.match(/(Pyro|Hydro|Cryo|Electro|Anemo|Geo|Dendro|Physical)\s+DMG\s+Bonus\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
        const elemMap = { Pyro:'Fire', Hydro:'Water', Cryo:'Ice', Electro:'Electric',
                          Anemo:'Wind', Geo:'Rock', Dendro:'Grass', Physical:'Physical' };
        effects.elementDmgPct = {
            element: elemMap[elemDmgR5[1]] ?? elemDmgR5[1],
            r5: parseFloat(elemDmgR5[2]) / 100,
            r1: parseFloat((elemDmgR1 ?? elemDmgR5)[2]) / 100,
        };
    }

    // Normal Attack DMG
    const normalR5 = r5.match(/Normal\s+Attack\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    const normalR1 = r1.match(/Normal\s+Attack\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (normalR5) effects.normalDmgPct = { r5: parseFloat(normalR5[1]) / 100, r1: parseFloat((normalR1 ?? normalR5)[1]) / 100 };

    // Charged Attack DMG
    const chargedR5 = r5.match(/Charged\s+Attack\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    const chargedR1 = r1.match(/Charged\s+Attack\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (chargedR5) effects.chargedDmgPct = { r5: parseFloat(chargedR5[1]) / 100, r1: parseFloat((chargedR1 ?? chargedR5)[1]) / 100 };

    // Elemental Skill DMG
    const skillR5 = r5.match(/Elemental\s+Skill\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    const skillR1 = r1.match(/Elemental\s+Skill\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (skillR5) effects.skillDmgPct = { r5: parseFloat(skillR5[1]) / 100, r1: parseFloat((skillR1 ?? skillR5)[1]) / 100 };

    // Elemental Burst DMG
    const burstR5 = r5.match(/Elemental\s+Burst\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    const burstR1 = r1.match(/Elemental\s+Burst\s+DMG\s*(?:increased?\s+by\s+)?\+?(\d+(?:\.\d+)?)%/i);
    if (burstR5) effects.burstDmgPct = { r5: parseFloat(burstR5[1]) / 100, r1: parseFloat((burstR1 ?? burstR5)[1]) / 100 };

    return effects;
}

function parseSubstat(text) {
    // e.g. "CRIT DMG 44.1%(9.6%)" or "ATK 49.6%(10.8%)" or "Elemental Mastery 265(58)"
    const crit = text.match(/CRIT\s+(Rate|DMG)\s+([\d.]+)%/);
    if (crit) return { type: crit[1] === 'Rate' ? 'CritRate' : 'CritDMG', value: parseFloat(crit[2]) / 100 };

    const atkPct = text.match(/ATK\s+([\d.]+)%/);
    if (atkPct) return { type: 'ATKPct', value: parseFloat(atkPct[1]) / 100 };

    const em = text.match(/Elemental\s+Mastery\s+([\d.]+)/);
    if (em) return { type: 'EM', value: parseFloat(em[1]) };

    const er = text.match(/Energy\s+Recharge\s+([\d.]+)%/);
    if (er) return { type: 'ER', value: parseFloat(er[1]) / 100 };

    const hp = text.match(/(?:Max\s+)?HP\s+([\d.]+)%/);
    if (hp) return { type: 'HPPct', value: parseFloat(hp[1]) / 100 };

    const def = text.match(/DEF\s+([\d.]+)%/);
    if (def) return { type: 'DEFPct', value: parseFloat(def[1]) / 100 };

    const hpFlat = text.match(/HP\s+([\d,]+)(?!\s*%)/);
    if (hpFlat) return { type: 'HP', value: parseFloat(hpFlat[1].replace(/,/g, '')) };

    const defFlat = text.match(/DEF\s+([\d,]+)(?!\s*%)/);
    if (defFlat) return { type: 'DEF', value: parseFloat(defFlat[1].replace(/,/g, '')) };

    return { type: 'Unknown', raw: text };
}

async function scrapeWeaponPage(name) {
    const html = await fetchWikiPage(name.replace(/ /g, '_'));
    if (!html) return null;

    const $ = load(html);
    const result = { name };

    // Extract weapon type
    $('.pi-data-value.pi-font').each((_, el) => {
        const t = $(el).text().trim();
        if (['Sword','Claymore','Polearm','Bow','Catalyst'].includes(t)) {
            result.type = t;
        }
    });

    // Get base ATK range and substat from pi-data elements
    $('[data-source]').each((_, el) => {
        const src = $(el).attr('data-source');
        const val = $(el).find('.pi-data-value').text().trim();
        if (src === 'atk' || src === 'atk_r1') {
            // Format: "46 - 608" or "608(46)" — max ATK is the largest number
            const nums = val.match(/(\d+)/g)?.map(Number) ?? [];
            if (nums.length) result.baseAtkMax = Math.max(...nums);
        }
        if (src === 'substat' || src === 'secondary_stat') {
            result.substat = parseSubstat(val);
        }
    });

    // Get passive at R5 (last occurrence of passive text)
    const passiveValues = [];
    $('.pi-data-value.pi-font').each((_, el) => {
        const t = $(el).text().trim();
        // Passive text usually references stats or has pattern of game effects
        if (t.length > 40 && !['Sword','Claymore','Polearm','Bow','Catalyst'].includes(t)
            && !/^\d/.test(t) && !t.includes('Mora') && !t.includes('wishes')
            && !t.includes('years') && !t.includes('ago') && !t.includes('Source')) {
            passiveValues.push(t);
        }
    });

    // R1 through R5 passives - take the last meaningful one (R5)
    // Filter to only entries that look like passive descriptions (contain numbers with %)
    const passiveCandidates = passiveValues.filter(t => /%/.test(t) || /\d+/.test(t));
    if (passiveCandidates.length > 0) {
        // Last one is usually R5
        const r5text = passiveCandidates[passiveCandidates.length - 1];
        // Get passive name - it's the text before the description in the first entry
        const firstName = passiveCandidates[0];
        const nameMatch = firstName.match(/^([A-Z][^.!?]+?)(?=\n|HP |ATK |DMG |CRIT |EM |Elemental)/);
        result.passive = parsePassive(nameMatch?.[1]?.trim() ?? '', r5text);
    }

    return result;
}

async function main() {
    console.log('Fetching weapon list...');
    const listHtml = await fetchWikiPage('Weapon/List');
    if (!listHtml) { console.error('No HTML'); process.exit(1); }

    const $ = load(listHtml);
    const weapons = [];

    $('table.article-table tbody tr').each((_, row) => {
        const tds = $(row).find('td');
        if (!tds.length) return;

        const name = $(tds).eq(1).text().trim();
        if (!name) return;

        // Format: "608(46)" — max ATK is the largest number
        const atkText = $(tds).eq(3).text().trim();
        const atkNums = atkText.match(/(\d+)/g)?.map(Number) ?? [];
        const maxAtk = atkNums.length ? Math.max(...atkNums) : 0;

        const substatText = $(tds).eq(4).text().trim();
        const passiveText = $(tds).eq(5).text().trim();

        // Split passive name from text - first word(s) are the passive name
        const passiveLines = passiveText.split('\n');
        const passiveName = passiveLines[0]?.trim() ?? '';
        const passiveBody = passiveLines.slice(1).join(' ').trim() || passiveText;

        weapons.push({
            name,
            baseAtkMax: maxAtk,
            substatText,
            passiveText: passiveText,
        });
    });

    console.log(`Found ${weapons.length} weapons total`);

    // Load existing output to allow resume
    let output = {};
    if (fs.existsSync(OUT_PATH)) {
        try { output = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch {}
        console.log(`Resuming — ${Object.keys(output).length} already done\n`);
    }

    // For each weapon, build entry from list data (no individual page visits needed
    // since Weapon/List has the passive text inline, R1~R5 format)
    for (const w of weapons) {
        if (output[w.name]) continue;

        process.stdout.write(`  ${w.name.padEnd(35)}`);

        // Passive text from list: "PassiveName<no separator>Description with R1~R5"
        // Split passive name: title-case words at start, separated from sentence by transition
        // to a number digit or lowercase that follows a capital run
        const raw = w.passiveText;
        // Name ends when we see a digit (value), or a word-boundary HP/ATK/etc. preceded by a non-letter
        const nameMatch = raw.match(/^((?:[A-Z][^\s]*(?:\s|$))+?)(?=[A-Z][a-z].*?\d|(?<![a-zA-Z])\d|\bHP\b|\bATK\b|\bDMG\b|\bCRIT\b|Gain |Increase|Decrease|When |After |Upon |Each |Every )/);
        const passiveName = nameMatch ? nameMatch[1].trim() : '';
        // Always use full text for description parsing to avoid losing HP% prefix
        const passiveBody = raw;

        const entry = {
            baseAtkMax: w.baseAtkMax,
            substat: parseSubstat(w.substatText),
            passive: parsePassive(passiveName, passiveBody),
        };

        output[w.name] = entry;
        console.log(`✓  ATK:${w.baseAtkMax}`);

        fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
    }

    console.log(`\nSaved ${Object.keys(output).length} weapons → ${OUT_PATH}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
