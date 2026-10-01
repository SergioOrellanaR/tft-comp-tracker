// index.html preloads every module the entry scripts import (see the comment there): a new import that isn't
// listed would still work, only slower, so this keeps the list honest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ENTRIES = ['Scripts/mainScreen/domContentLoad.js', 'Scripts/mainScreen.js', 'Scripts/account/header.js'];

function staticImports(path, seen = new Set()) {
    if (seen.has(path)) return seen;
    seen.add(path);
    const source = read(path);
    for (const m of source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)) {
        staticImports(posix.normalize(posix.join(posix.dirname(path), m[1] || m[2])), seen);
    }
    return seen;
}

test('every statically imported module has a modulepreload in index.html', () => {
    const html = read('index.html');
    const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map(m => m[1]));
    const all = new Set();
    ENTRIES.forEach(entry => staticImports(entry, all));
    const missing = [...all].filter(path => !ENTRIES.includes(path) && !preloaded.has(path));
    assert.deepEqual(missing, []);
});

test('modulepreload only lists files that exist', () => {
    const html = read('index.html');
    for (const m of html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)) assert.doesNotThrow(() => read(m[1]), m[1]);
});
