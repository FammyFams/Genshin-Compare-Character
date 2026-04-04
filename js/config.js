'use strict';

// Enka.network doesn't set CORS headers, so requests are proxied through a
// Render.com web service.
const PROXY         = 'https://genshin-compare-proxy.onrender.com/';
const ENKA_API      = `${PROXY}api/uid/`;
const ICON_BASE     = 'https://enka.network/ui/';
const CHAR_DATA_URL = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json';
const LOC_DATA_URL  = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/loc.json';
const YATTA_URL     = 'https://gi.yatta.moe/api/v2/en/avatar';

const ELEM_COLOR = {
    Fire:     '#e8602c',
    Water:    '#4aaad8',
    Wind:     '#74c8a0',
    Electric: '#b088cc',
    Grass:    '#7cbb50',
    Ice:      '#90d8e8',
    Rock:     '#c8a050',
};

/** Combat stats shown in the comparison table. */
const FIGHT_PROPS = [
    { key: '2000', name: 'Max HP',            fmt: 'int' },
    { key: '2001', name: 'ATK',               fmt: 'int' },
    { key: '2002', name: 'DEF',               fmt: 'int' },
    { key: '28',   name: 'Elemental Mastery', fmt: 'int' },
    { key: '20',   name: 'CRIT Rate',         fmt: 'pct' },
    { key: '22',   name: 'CRIT DMG',          fmt: 'pct' },
    { key: '23',   name: 'Energy Recharge',   fmt: 'pct' },
    { key: '26',   name: 'Healing Bonus',     fmt: 'pct' },
];

/** Elemental DMG bonus stats — only shown when at least one character has them. */
const DMG_PROPS = [
    { key: '40', name: 'Pyro DMG Bonus',     fmt: 'pct' },
    { key: '41', name: 'Electro DMG Bonus',  fmt: 'pct' },
    { key: '42', name: 'Hydro DMG Bonus',    fmt: 'pct' },
    { key: '43', name: 'Dendro DMG Bonus',   fmt: 'pct' },
    { key: '44', name: 'Anemo DMG Bonus',    fmt: 'pct' },
    { key: '45', name: 'Geo DMG Bonus',      fmt: 'pct' },
    { key: '46', name: 'Cryo DMG Bonus',     fmt: 'pct' },
    { key: '30', name: 'Physical DMG Bonus', fmt: 'pct' },
];

const WEAPON_SUBSTAT_NAME = {
    FIGHT_PROP_CRITICAL:          'CRIT Rate',
    FIGHT_PROP_CRITICAL_HURT:     'CRIT DMG',
    FIGHT_PROP_CHARGE_EFFICIENCY: 'Energy Recharge',
    FIGHT_PROP_ELEMENT_MASTERY:   'Elem. Mastery',
    FIGHT_PROP_HP_PERCENT:        'HP',
    FIGHT_PROP_ATTACK_PERCENT:    'ATK',
    FIGHT_PROP_DEFENSE_PERCENT:   'DEF',
    FIGHT_PROP_HP:                'HP',
    FIGHT_PROP_ATTACK:            'ATK',
    FIGHT_PROP_DEFENSE:           'DEF',
    FIGHT_PROP_PHYSICAL_ADD_HURT: 'Physical DMG',
    FIGHT_PROP_FIRE_ADD_HURT:     'Pyro DMG',
    FIGHT_PROP_ELEC_ADD_HURT:     'Electro DMG',
    FIGHT_PROP_WATER_ADD_HURT:    'Hydro DMG',
    FIGHT_PROP_GRASS_ADD_HURT:    'Dendro DMG',
    FIGHT_PROP_WIND_ADD_HURT:     'Anemo DMG',
    FIGHT_PROP_ROCK_ADD_HURT:     'Geo DMG',
    FIGHT_PROP_ICE_ADD_HURT:      'Cryo DMG',
};

const WEAPON_FLAT_SUBSTAT = new Set([
    'FIGHT_PROP_HP', 'FIGHT_PROP_ATTACK', 'FIGHT_PROP_DEFENSE', 'FIGHT_PROP_ELEMENT_MASTERY',
]);

/** Which fightPropMap keys are most important, based on a character's ascension stat. */
const ASCENSION_TO_KEY_STATS = {
    FIGHT_PROP_CRITICAL:          ['20', '22'],
    FIGHT_PROP_CRITICAL_HURT:     ['20', '22'],
    FIGHT_PROP_HP_PERCENT:        ['2000'],
    FIGHT_PROP_ATTACK_PERCENT:    ['2001'],
    FIGHT_PROP_DEFENSE_PERCENT:   ['2002'],
    FIGHT_PROP_ELEMENT_MASTERY:   ['28'],
    FIGHT_PROP_CHARGE_EFFICIENCY: ['23'],
    FIGHT_PROP_HEAL_ADD:          ['26', '2000'],
};

const BLANK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60'%3E%3Ccircle cx='30' cy='30' r='30' fill='%23222'/%3E%3Ctext x='30' y='36' text-anchor='middle' fill='%23555' font-size='20'%3E?%3C/text%3E%3C/svg%3E";
