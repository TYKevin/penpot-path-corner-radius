import test from 'node:test';
import assert from 'node:assert/strict';
import { readOutline, renderOutline } from '../src/outline.mjs';
import { readPathModel } from '../src/state.mjs';
import { createMockHost } from './mock-host.mjs';
import { startPlugin } from '../src/plugin.mjs';
const move = (x, y) => ({ command: 'move-to', params: { x, y } }),
  line = (x, y) => ({ command: 'line-to', params: { x, y } });
const cubic = (c1x, c1y, c2x, c2y, x, y) => ({
  command: 'curve-to',
  params: { c1x, c1y, c2x, c2y, x, y },
});
const close = { command: 'close-path', params: {} };
const imported = [
  move(10, 0),
  line(68, 0),
  cubic(74.6274, 0, 80, 5.3726, 80, 12),
  line(80, 70),
  line(0, 82),
  close,
];
test('imported arc becomes a single radius, survives edits and returns to exact source at the imported value', () => {
  const model = readPathModel('', imported);
  assert.equal(model.vertices.length, 4);
  assert.ok(Math.abs(model.radii[1] - 12) < 0.0001);
  const next = model.radii.slice();
  next[1] = 18.5;
  const result = renderOutline(model, next);
  assert.equal(result.effectiveRadii[1], 18.5);
  assert.deepEqual(result.commands[1], line(61.5, 0));
  assert.deepEqual(renderOutline(model, model.radii).commands, imported);
  const saved = JSON.stringify({
    version: 2,
    source: imported,
    radii: next,
    rendered: result.commands,
  });
  assert.equal(readPathModel(saved, result.commands).radii[1], 18.5);
  const changed = structuredClone(result.commands);
  changed.at(-2).params.y += 10;
  const rebased = readPathModel(saved, changed);
  assert.equal(rebased.rebased, true);
  assert.deepEqual(rebased.source, changed);
});
test('open curve-line corners round at the requested radius, preserve open ends and a second subpath verbatim', () => {
  const second = [
    move(200, 200),
    cubic(210, 215, 240, 200, 245, 230),
    line(260, 240),
    close,
  ];
  const first = [move(0, 0), cubic(15, -5, 55, 0, 70, 10), line(65, 75)];
  const model = readOutline([...first, ...second]);
  assert.deepEqual(model.editable.slice(0, 3), [false, true, false]);
  const radii = [...model.radii];
  radii[1] = 8;
  const result = renderOutline(model, radii);
  assert.equal(result.effectiveRadii[1], 8);
  assert.deepEqual(result.commands.slice(-second.length), second);
  const active = result.commands.slice(0, -second.length);
  assert.deepEqual(active[0], first[0]);
  assert.deepEqual(active.at(-1), first.at(-1));
  assert.ok(active.filter((c) => c.command === 'curve-to').length >= 2);
  assert.ok(Object.values(active[1].params).every(Number.isFinite));
  assert.deepEqual(renderOutline(model, model.radii).commands, [
    ...first,
    ...second,
  ]);
});
test('reread recovers missed selection event, follows grouped shapes, protects against reparenting, and edits only changed native radii', () => {
  const api = createMockHost(imported);
  const rect = {
    id: 'r',
    type: 'rectangle',
    name: '普通矩形',
    width: 100,
    height: 60,
    borderRadiusTopLeft: 2,
    borderRadiusTopRight: 8,
  };
  const group = { id: 'g', type: 'group', children: [rect, api.shape] };
  startPlugin(api);
  api.send({ type: 'ready' });
  api.selection = [group];
  api.send({ type: 'sync' });
  let m = api.messages.at(-1);
  assert.equal(m.shapeId, api.shape.id);
  assert.equal(m.options.length, 2);
  api.send({ type: 'choose', id: rect.id, requestKey: m.requestKey });
  m = api.messages.at(-1);
  assert.equal(m.native, true);
  const request = {
    type: 'apply',
    shapeId: rect.id,
    requestKey: m.requestKey,
    radii: [12, 8, 0, 0],
  };
  api.emit('shapechange');
  api.send(request);
  assert.equal(rect.borderRadiusTopLeft, 12);
  assert.equal(rect.borderRadiusTopRight, 8);
  assert.equal(rect.borderRadiusBottomLeft, undefined);
  m = api.messages.findLast((x) => x.type === 'model');
  group.children = [api.shape];
  api.send({ ...request, requestKey: m.requestKey, radii: [30, 8, 0, 0] });
  assert.equal(rect.borderRadiusTopLeft, 12);
  assert.equal(api.messages.at(-1).type, 'error');
});
