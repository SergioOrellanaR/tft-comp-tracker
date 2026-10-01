import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initCompFit, fit, isEmblem, isArtifact, itemName } from '../Scripts/mainScreen/compFit.js';

const carry = { name: 'Jinx', apiName: 'TFT_Jinx', cost: 4, items: ['TFT_Item_InfinityEdge'], artifacts: ['Art_Shiv'] };
const comp = { title: 'Jinx Reroll', champions: [carry], mainChampion: { name: 'Jinx' } };
const other = { title: 'Other', champions: [{ name: 'Ahri', apiName: 'TFT_Ahri', cost: 2 }] };

const set = {
    champions: [
        { name: 'Jinx', apiName: 'TFT_Jinx', cost: 4, traits: ['Sniper'], items: { core: [['TFT_Item_GiantSlayer']], S: [['TFT_Item_LastWhisper']], A: [['TFT_Item_Bloodthirster']] } },
        { name: 'Ahri', apiName: 'TFT_Ahri', cost: 2, traits: ['Mage'], items: {} },
    ],
    items: {
        artifact: [{ apiName: 'Art_Shiv', name: 'Shiv' }, { apiName: 'Art_Other', name: 'Other Artifact' }],
        emblem: [{ apiName: 'Emb_Sniper', name: 'Sniper Emblem' }],
    },
    components: [], recipes: [],
    comps: [comp, other],
    conditions: {
        Art_Other: { type: 'artifact', name: 'Other Artifact', comps: [{ comp: 0, tier: 'A', holder: 'TFT_Jinx' }] },
    },
};

test('an item the carry builds fits fully, a rated one by its tier', () => {
    initCompFit(set);
    assert.equal(fit('TFT_Item_InfinityEdge', comp).weight, 1);
    assert.equal(fit('TFT_Item_GiantSlayer', comp).weight, 1);   // core
    assert.equal(fit('TFT_Item_LastWhisper', comp).weight, 0.8); // S
    assert.equal(fit('TFT_Item_Bloodthirster', comp).weight, 0.5); // A
    assert.equal(fit('TFT_Item_Redemption', comp).weight, 0);    // not rated
});

test('the holder of an item is the unit that builds it', () => {
    initCompFit(set);
    assert.equal(fit('TFT_Item_InfinityEdge', comp).holder?.name, 'Jinx');
});

test('an artifact with a curated list only fits the comps on it, weighted by tier', () => {
    initCompFit(set);
    const onList = fit('Art_Other', comp);
    assert.equal(onList.weight, 0.8);
    assert.equal(onList.tier, 'A');
    assert.equal(onList.holder?.apiName, 'TFT_Jinx');
    assert.equal(fit('Art_Other', other).weight, 0);
});

test('an artifact without a list fits where a unit already carries it', () => {
    initCompFit(set);
    assert.equal(fit('Art_Shiv', comp).weight, 1);
    assert.equal(fit('Art_Shiv', other).weight, 0);
});

test('kinds and names come from the set', () => {
    initCompFit(set);
    assert.ok(isArtifact('Art_Shiv'));
    assert.ok(isEmblem('Emb_Sniper'));
    assert.equal(itemName('Art_Shiv'), 'Shiv');
    assert.equal(itemName('Unknown_Api'), 'Unknown_Api');
});
