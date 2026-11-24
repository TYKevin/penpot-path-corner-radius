import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveLanguage, translate } from '../src/i18n.mjs';

test('manual selection wins and automatic selection respects preferred languages', () => {
  assert.equal(resolveLanguage('en', ['zh-CN']), 'en');
  assert.equal(resolveLanguage('zh', ['en-US']), 'zh');
  assert.equal(resolveLanguage('auto', ['fr-FR', 'zh-Hant', 'en']), 'zh');
  assert.equal(resolveLanguage('auto', ['en-GB', 'zh-CN']), 'en');
  assert.equal(resolveLanguage('auto', ['fr']), 'en');
  assert.equal(resolveLanguage('auto', []), 'en');
});

test('both languages format counts and preserve third-party messages', () => {
  assert.equal(translate('en', '顶点 {n}', { n: 3 }), 'Vertex 3');
  assert.equal(translate('zh', '顶点 {n}', { n: 3 }), '顶点 3');
  assert.equal(translate('en', 'Unexpected host error'), 'Unexpected host error');
});

test('all plugin and geometry messages sent to the panel have English translations', () => {
  for (const name of ['plugin', 'geometry', 'outline', 'state']) {
    const source = readFileSync(new URL(`../src/${name}.mjs`, import.meta.url), 'utf8');
    for (const [, message] of source.matchAll(/'([^'\n]*\p{Script=Han}[^'\n]*)'/gu)) {
      if (message === '顶点圆角 · Path Corner Radius') continue; // Bilingual host window title.
      assert.doesNotMatch(translate('en', message), /\p{Script=Han}/u, message);
    }
  }
});
