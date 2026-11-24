import test from 'node:test';
import assert from 'node:assert/strict';
import {
  polygonFromCommands,
  filletPolygon,
  validateVertices,
} from '../src/geometry.mjs';
import { loadState, reconcileState, commandsEqual } from '../src/state.mjs';

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const trapezoid = [
  { x: 50, y: 0 },
  { x: 300, y: 0 },
  { x: 300, y: 300 },
  { x: 0, y: 300 },
];
const path = (vertices) => [
  { command: 'move-to', params: vertices[0] },
  ...vertices.slice(1).map((params) => ({ command: 'line-to', params })),
  { command: 'close-path', params: {} },
];
const curves = (commands) => commands.filter((c) => c.command === 'curve-to');
const close = (a, b, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const saved = (vertices, radii) => ({
  version: 1,
  vertices,
  radii,
  rendered: filletPolygon(vertices, radii).commands,
});
const transformCommands = (commands, transform) =>
  commands.map((c) => {
    const params = { ...c.params };
    for (const [x, y] of [
      ['x', 'y'],
      ['c1x', 'c1y'],
      ['c2x', 'c2y'],
    ])
      if (x in params) {
        const p = transform({ x: params[x], y: params[y] });
        params[x] = p.x;
        params[y] = p.y;
      }
    return { command: c.command, params };
  });

test('acute corners split into quarter-circle-or-smaller arcs', () => {
  const triangle = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 100, y: 173.2050807569 },
  ];
  const result = filletPolygon(triangle, [20, 0, 0]);
  assert.equal(curves(result.commands).length, 2);
  close(result.effectiveRadii[0], 20);
  const center = { x: 20 * Math.sqrt(3), y: 20 };
  let p0 = result.commands[0].params;
  for (const { params: c } of curves(result.commands)) {
    for (let k = 0; k <= 20; k++) {
      const t = k / 20,
        u = 1 - t;
      const x =
        u * u * u * p0.x +
        3 * u * u * t * c.c1x +
        3 * u * t * t * c.c2x +
        t * t * t * c.x;
      const y =
        u * u * u * p0.y +
        3 * u * u * t * c.c1y +
        3 * u * t * t * c.c2y +
        t * t * t * c.y;
      assert.ok(Math.abs(Math.hypot(x - center.x, y - center.y) - 20) < 0.006);
    }
    p0 = c;
  }
});

test('large concave fillets are capped before colliding across narrow corridors', () => {
  const u = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 80, y: 100 },
    { x: 80, y: 20 },
    { x: 20, y: 20 },
    { x: 20, y: 100 },
    { x: 0, y: 100 },
  ];
  const result = filletPolygon(
    u,
    u.map(() => 1000),
  );
  assert.ok(result.limited.every(Boolean));
  // The two exterior top corners have diagonal clearance sqrt(20^2+20^2).
  assert.ok(
    result.effectiveRadii.every((r) => r <= Math.hypot(20, 20) * 0.49 + 1e-6),
  );
  assert.ok(result.effectiveRadii.slice(2).every((r) => r <= 9.8 + 1e-6));
});

test('a 20px right-angle fillet has correct tangent points and quarter-circle handle', () => {
  const { commands, effectiveRadii } = filletPolygon(square, [20, 0, 0, 0]);
  close(commands[0].params.x, 0);
  close(commands[0].params.y, 20);
  const c = curves(commands)[0].params;
  close(c.x, 20);
  close(c.y, 0);
  close(c.c1x, 0);
  close(c.c1y, 20 - ((20 * 4) / 3) * Math.tan(Math.PI / 8));
  close(c.c2y, 0);
  close(c.c2x, c.c1y);
  assert.equal(curves(commands).length, 1);
  close(effectiveRadii[0], 20);
});

test('oblique corner is tangent to the original trapezoid edges with the requested radius', () => {
  const r = 50,
    result = filletPolygon(trapezoid, [r, 0, 0, 0]);
  const entry = result.commands[0].params,
    c = curves(result.commands)[0].params;
  // Entry stays on the slanted original edge; exit stays on the horizontal top.
  close((entry.x - 50) * 300 + entry.y * 50, 0, 1e-5);
  close(c.y, 0);
  close(c.c2y, 0);
  close((c.c1x - entry.x) * 300 + (c.c1y - entry.y) * 50, 0, 1e-5);
  close(result.effectiveRadii[0], r);
  const center = { x: c.x, y: r };
  close(Math.hypot(entry.x - center.x, entry.y - center.y), r, 1e-5);
});

test('only requested vertices gain curves, and radius zero restores all original vertices', () => {
  assert.equal(
    curves(filletPolygon(square, [0, 12, 12, 0]).commands).length,
    2,
  );
  assert.deepEqual(
    polygonFromCommands(filletPolygon(trapezoid, [0, 0, 0, 0]).commands),
    trapezoid,
  );
});

test('oversized adjacent fillets share the edge without crossing tangent points', () => {
  const r = filletPolygon(square, [1000, 1000, 1000, 1000]);
  r.effectiveRadii.forEach((value) => close(value, 50));
  assert.deepEqual(r.limited, [true, true, true, true]);
});

test('both winding orders and a concave vertex preserve a closed path', () => {
  const l = [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 40 },
    { x: 40, y: 40 },
    { x: 40, y: 120 },
    { x: 0, y: 120 },
  ];
  for (const v of [l, [...l].reverse()]) {
    const rounded = filletPolygon(
      v,
      v.map(() => 8),
    );
    assert.equal(curves(rounded.commands).length, 6);
    assert.equal(rounded.commands.at(-1).command, 'close-path');
    rounded.effectiveRadii.forEach((r) => close(r, 8));
    for (const c of rounded.commands)
      Object.values(c.params).forEach((x) => assert.ok(Number.isFinite(x)));
  }
});

test('a redundant collinear vertex stays straight, with explicit limiting', () => {
  const v = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const r = filletPolygon(v, [0, 10, 0, 0, 0]);
  assert.equal(curves(r.commands).length, 0);
  assert.equal(r.effectiveRadii[1], 0);
  assert.ok(r.limited[1]);
});

test('normalizes repeated closing points, rejects curves, holes and open contours', () => {
  const closed = path(square);
  closed.splice(-1, 0, { command: 'line-to', params: square[0] });
  assert.deepEqual(polygonFromCommands(closed), square);
  assert.throws(() => polygonFromCommands(path(square).slice(0, -1)), /开放/);
  assert.throws(
    () => polygonFromCommands(filletPolygon(square, [10, 0, 0, 0]).commands),
    /已有曲线/,
  );
  assert.throws(
    () => polygonFromCommands([...path(square), ...path(square)]),
    /复合/,
  );
});

test('rejects self crossings, duplicate vertices, zero area and nonfinite radii', () => {
  assert.throws(
    () => validateVertices([square[0], square[2], square[1], square[3]]),
    /自相交/,
  );
  assert.throws(
    () => validateVertices([square[0], square[0], square[1]]),
    /重合/,
  );
  assert.throws(() =>
    validateVertices([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]),
  );
  for (const value of [-1, NaN, Infinity, '12', 100001])
    assert.throws(() => filletPolygon(square, [value, 0, 0, 0]), /半径/);
});

test('saved source survives JSON reopen; 50 -> 20 is rebuilt from the original polygon', () => {
  const first = saved(trapezoid, [50, 0, 0, 0]);
  const reopened = loadState(JSON.stringify(first), first.rendered);
  assert.deepEqual(reopened.radii, [50, 0, 0, 0]);
  assert.deepEqual(
    filletPolygon(reopened.vertices, [20, 0, 0, 0]),
    filletPolygon(trapezoid, [20, 0, 0, 0]),
  );
  assert.deepEqual(
    polygonFromCommands(
      filletPolygon(reopened.vertices, [0, 0, 0, 0]).commands,
    ),
    trapezoid,
  );
});

test('reopen after translation, uniform scaling, rotation and reflection adapts the saved source', () => {
  const state = saved(trapezoid, [50, 10, 0, 0]);
  for (const [transform, factor] of [
    [(p) => ({ x: p.x + 1234, y: p.y - 789 }), 1],
    [(p) => ({ x: 2 * p.x + 70, y: 2 * p.y - 13 }), 2],
    [(p) => ({ x: -p.y + 70, y: p.x - 13 }), 1],
    [(p) => ({ x: -p.x + 70, y: p.y - 13 }), 1],
  ]) {
    const current = transformCommands(state.rendered, transform);
    const reconciled = reconcileState(state, current);
    assert.ok(
      commandsEqual(
        filletPolygon(reconciled.vertices, reconciled.radii).commands,
        current,
      ),
    );
    close(reconciled.radii[0], 50 * factor);
  }
});

test('nonuniform scaling, external point edits and corrupt metadata refuse stale writes', () => {
  const state = saved(trapezoid, [50, 0, 0, 0]);
  assert.throws(
    () =>
      reconcileState(
        state,
        transformCommands(state.rendered, (p) => ({ x: p.x * 2, y: p.y })),
      ),
    /非等比/,
  );
  const edit = structuredClone(state.rendered);
  edit[1].params.c1x += 8;
  assert.throws(() => reconcileState(state, edit), /修改节点/);
  assert.throws(() => loadState('{', state.rendered), /无法读取/);
  assert.throws(
    () => reconcileState({ ...state, version: 2 }, state.rendered),
    /版本/,
  );
});

test('host float32 normalization at page coordinates near 8000 remains editable', () => {
  const vertices = trapezoid.map((p) => ({ x: p.x + 7781, y: p.y + 241 }));
  const state = saved(vertices, [12, 50, 0, 0]);
  const normalized = state.rendered.map((c) => ({
    command: c.command,
    params: Object.fromEntries(
      Object.entries(c.params).map(([k, v]) => [k, Math.fround(v)]),
    ),
  }));
  assert.ok(commandsEqual(state.rendered, normalized));
  assert.doesNotThrow(() =>
    loadState(JSON.stringify({ ...state, rendered: normalized }), normalized),
  );
});
