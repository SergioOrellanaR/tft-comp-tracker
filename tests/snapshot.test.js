// What the frontend relies on in Data/MetaSnapshot.json (the bot regenerates it, so a bad publish shows up here)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const snapshot = JSON.parse(readFileSync(new URL('../Data/MetaSnapshot.json', import.meta.url), 'utf8'));
const TIERS = ['S', 'A', 'B', 'C', 'D', 'X'];
const sets = Object.entries(snapshot);

// every comp list the lobby can show: the set's own, and each source's
function compLists(set) {
    const lists = [['tftflow', set.comps]];
    (set.compSources || []).forEach(s => { if (s.comps) lists.push([s.id, s.comps]); });
    return lists;
}

test('there is at least one set, with comps and champions', () => {
    assert.ok(sets.length > 0);
    sets.forEach(([key, set]) => {
        assert.match(key, /^SET \d+$/);
        assert.ok(Array.isArray(set.comps) && set.comps.length > 0, `${key} has comps`);
        assert.ok(Array.isArray(set.champions) && set.champions.length > 0, `${key} has champions`);
        assert.ok(set.items && typeof set.items === 'object', `${key} has an item catalog`);
    });
});

test('every comp has what a row needs', () => {
    sets.forEach(([key, set]) => compLists(set).forEach(([source, comps]) => comps.forEach(comp => {
        const where = `${key} ${source} "${comp.title}"`;
        assert.ok(comp.title, `${where}: title`);
        assert.ok(TIERS.includes(comp.tier), `${where}: tier ${comp.tier}`);
        assert.ok(Array.isArray(comp.champions) && comp.champions.length > 0, `${where}: champions`);
        comp.champions.forEach(ch => assert.ok(ch.name && ch.apiName, `${where}: champion name and apiName`));
    })));
});

test('comp titles are unique within a source (share URLs name comps by title) and avoid the URL separators', () => {
    sets.forEach(([key, set]) => compLists(set).forEach(([source, comps]) => {
        const titles = comps.map(c => c.title);
        assert.equal(new Set(titles).size, titles.length, `${key} ${source} repeats a title`);
        titles.forEach(t => assert.ok(!/[~*]/.test(t), `${key} ${source}: "${t}" holds ~ or *`));
    }));
});

test('team planner codes have the shape the copy button promises', () => {
    sets.forEach(([key, set]) => set.comps.forEach(comp => {
        if (comp.plannerCode) assert.match(comp.plannerCode, /^02[0-9a-f]{30}TFTSet\d+$/, `${key} "${comp.title}"`);
    }));
});

test('curated item conditions point at comps that exist', () => {
    sets.forEach(([key, set]) => {
        const lists = [['tftflow', set.comps, set.conditions]];
        (set.compSources || []).forEach(s => { if (s.comps) lists.push([s.id, s.comps, s.conditions]); });
        lists.forEach(([source, comps, conditions]) => Object.entries(conditions || {}).forEach(([api, cond]) =>
            cond.comps.forEach(entry => assert.ok(comps[entry.comp], `${key} ${source} ${api}: comp ${entry.comp}`))));
    });
});
