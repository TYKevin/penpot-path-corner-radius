import test from 'node:test';
import assert from 'node:assert/strict';
import { startPlugin } from '../src/plugin.mjs';
import { createMockHost } from './mock-host.mjs';
import { filletPolygon } from '../src/geometry.mjs';
const vertices = [
  { x: 50, y: 0 },
  { x: 300, y: 0 },
  { x: 300, y: 300 },
  { x: 0, y: 300 },
];
const original = filletPolygon(vertices, [0, 0, 0, 0]).commands;
const lastModel = (api) => api.messages.findLast((m) => m.type === 'model');
const request = (api, type, radii) => {
  const m = lastModel(api);
  api.send({ type, shapeId: m.shapeId, requestKey: m.requestKey, radii });
};
function setup(data = '', commands = original) {
  const api = createMockHost(commands, data);
  startPlugin(api);
  api.send({ type: 'ready' });
  return api;
}

test('apply/reopen/edit/restore round trip preserves shape identity, styles, tokens and parent', () => {
  const api = setup(),
    style = JSON.stringify([
      api.shape.id,
      api.shape.fills,
      api.shape.tokens,
      api.shape.parent,
    ]);
  request(api, 'apply', [50, 0, 0, 0]);
  assert.equal(api.messages.at(-1).type, 'applied');
  assert.deepEqual(lastModel(api).radii, [50, 0, 0, 0]);
  const second = setup(api.shape.getSharedPluginData(), api.shape.commands);
  assert.deepEqual(lastModel(second).radii, [50, 0, 0, 0]);
  request(second, 'apply', [20, 0, 0, 0]);
  assert.deepEqual(lastModel(second).radii, [20, 0, 0, 0]);
  request(second, 'restore');
  assert.deepEqual(second.shape.commands, original);
  assert.equal(
    JSON.stringify([
      second.shape.id,
      second.shape.fills,
      second.shape.tokens,
      second.shape.parent,
    ]),
    style,
  );
});

test('geometry and saved half-edit data undo and redo as one operation', () => {
  const api = setup();
  request(api, 'apply', [50, 0, 0, 0]);
  const rounded = structuredClone(api.shape.commands);
  api.undo();
  assert.deepEqual(api.shape.commands, original);
  assert.equal(api.shape.getSharedPluginData(), '');
  assert.deepEqual(lastModel(api).radii, [0, 0, 0, 0]);
  api.redo();
  assert.deepEqual(api.shape.commands, rounded);
  assert.deepEqual(lastModel(api).radii, [50, 0, 0, 0]);
});

test('rejects stale apply after selection/page change without writing', () => {
  const api = setup(),
    m = lastModel(api);
  api.selection = [];
  api.send({
    type: 'apply',
    shapeId: m.shapeId,
    requestKey: m.requestKey,
    radii: [12, 0, 0, 0],
  });
  assert.equal(api.messages.at(-1).type, 'error');
  assert.deepEqual(api.shape.commands, original);
  api.selection = [api.shape];
  api.currentPage.id = 'different-page';
  api.send({
    type: 'apply',
    shapeId: m.shapeId,
    requestKey: m.requestKey,
    radii: [12, 0, 0, 0],
  });
  assert.deepEqual(api.shape.commands, original);
});

test('rejects geometry or metadata changes made after UI was loaded', () => {
  const api = setup();
  api.shape.commands[0].params.x += 1;
  const changed = structuredClone(api.shape.commands);
  request(api, 'apply', [20, 0, 0, 0]);
  assert.equal(api.messages.at(-1).type, 'error');
  assert.deepEqual(api.shape.commands, changed);
  const api2 = setup();
  api2.shape.setSharedPluginData('', '', 'external');
  request(api2, 'apply', [20, 0, 0, 0]);
  assert.equal(api2.messages.at(-1).type, 'error');
  assert.equal(api2.shape.getSharedPluginData(), 'external');
});

test('failure to save metadata restores original path and closes undo block', () => {
  const api = setup();
  const setter = api.shape.setSharedPluginData;
  let fail = true;
  api.shape.setSharedPluginData = (...args) => {
    if (fail) {
      fail = false;
      throw Error('write failed');
    }
    setter(...args);
  };
  request(api, 'apply', [20, 0, 0, 0]);
  assert.equal(api.messages.at(-1).type, 'error');
  assert.deepEqual(api.shape.commands, original);
  assert.equal(api.shape.getSharedPluginData(), '');
});

test('locked paths reject writes and existing imported arcs open without writing', () => {
  const api = setup();
  api.shape.blocked = true;
  request(api, 'apply', [20, 0, 0, 0]);
  assert.deepEqual(api.shape.commands, original);
  const curve = setup('', filletPolygon(vertices, [50, 0, 0, 0]).commands);
  assert.equal(curve.messages.at(-1).type, 'model');
  assert.ok(curve.messages.at(-1).radii.some((r) => Math.abs(r - 50) < 0.001));
  assert.equal(curve.shape.getSharedPluginData(), '');
});
