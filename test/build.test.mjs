import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createMockHost } from './mock-host.mjs';
import { filletPolygon } from '../src/geometry.mjs';

test('installable bundle executes without module imports and persists a vertex radius', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  execFileSync(process.execPath, [`${root}scripts/build.mjs`]);
  const manifest = JSON.parse(readFileSync(`${root}dist/manifest.json`));
  assert.deepEqual(manifest.permissions, ['content:read', 'content:write']);
  const api = createMockHost(
    filletPolygon(
      [
        { x: 50, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 300 },
        { x: 0, y: 300 },
      ],
      [0, 0, 0, 0],
    ).commands,
  );
  vm.runInNewContext(readFileSync(`${root}dist/${manifest.code}`, 'utf8'), {
    penpot: api,
  });
  api.send({ type: 'ready' });
  const model = api.messages.findLast((m) => m.type === 'model');
  api.send({
    type: 'apply',
    shapeId: model.shapeId,
    requestKey: model.requestKey,
    radii: [50, 0, 0, 0],
  });
  assert.equal(api.messages.at(-1).type, 'applied');
  assert.deepEqual(
    JSON.parse(api.shape.getSharedPluginData()).radii,
    [50, 0, 0, 0],
  );
});
