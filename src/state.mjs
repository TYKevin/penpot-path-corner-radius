import { readOutline, renderOutline } from './outline.mjs';
import {
  polygonFromCommands,
  validateVertices,
  validateRadii,
  filletPolygon,
} from './geometry.mjs';

export const DATA_NAMESPACE = 'path-corner-radius';
export const DATA_KEY = 'editable-corners-v1';

export function commandsEqual(a, b, tolerance = 0.002) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
    return false;
  return a.every(
    (c, i) =>
      c.command === b[i].command &&
      [
        ...new Set([
          ...Object.keys(c.params ?? {}),
          ...Object.keys(b[i].params ?? {}),
        ]),
      ].every((k) => {
        const x = c.params?.[k],
          y = b[i].params?.[k];
        return typeof x === 'number' && typeof y === 'number'
          ? Math.abs(x - y) <= tolerance
          : x === y;
      }),
  );
}

function pointsInCommands(commands) {
  return commands.flatMap(({ params: p = {} }) => {
    const pts = [];
    for (const [x, y] of [
      ['x', 'y'],
      ['c1x', 'c1y'],
      ['c2x', 'c2y'],
    ]) {
      if (typeof p[x] === 'number' && typeof p[y] === 'number')
        pts.push({ x: p[x], y: p[y] });
    }
    return pts;
  });
}

// Allow moving, rotating, mirroring and uniformly scaling a finished shape.
// Non-uniform scaling/node edits cannot retain circular radii, so refuse to
// overwrite them with stale metadata.
export function reconcileState(saved, current) {
  if (saved?.version !== 1)
    throw new Error('圆角数据版本不受支持，请使用匹配版本的插件。');
  validateVertices(saved.vertices);
  validateRadii(saved.radii, saved.vertices.length);
  const expected = filletPolygon(saved.vertices, saved.radii).commands;
  if (!commandsEqual(expected, saved.rendered))
    throw new Error('圆角数据不完整，已停止写入。');
  if (commandsEqual(saved.rendered, current)) return { ...saved };
  if (
    saved.rendered.length !== current.length ||
    saved.rendered.some((c, i) => c.command !== current[i]?.command)
  ) {
    throw new Error(
      '路径已在插件外修改。请先撤销外部编辑；插件不会覆盖这些修改。',
    );
  }
  const old = pointsInCommands(saved.rendered),
    now = pointsInCommands(current);
  if (old.length !== now.length)
    throw new Error('路径控制点已改变，无法继续编辑原半径。');
  let j = 1;
  while (
    j < old.length &&
    Math.hypot(old[j].x - old[0].x, old[j].y - old[0].y) < 0.01
  )
    j++;
  if (j === old.length) throw new Error('路径已退化。');
  for (const reflected of [false, true]) {
    const ux = old[j].x - old[0].x,
      uy = (old[j].y - old[0].y) * (reflected ? -1 : 1);
    const vx = now[j].x - now[0].x,
      vy = now[j].y - now[0].y;
    const den = ux * ux + uy * uy;
    const a = (vx * ux + vy * uy) / den,
      b = (vy * ux - vx * uy) / den;
    const scale = Math.hypot(a, b);
    if (!Number.isFinite(scale) || scale < 1e-6) continue;
    const transform = (p) => {
      const x = p.x - old[0].x,
        y = (p.y - old[0].y) * (reflected ? -1 : 1);
      return { x: now[0].x + a * x - b * y, y: now[0].y + b * x + a * y };
    };
    if (
      old.every((p, i) => {
        const t = transform(p);
        return Math.hypot(t.x - now[i].x, t.y - now[i].y) < 0.005;
      })
    ) {
      const vertices = saved.vertices.map(transform),
        radii = saved.radii.map((r) => r * scale);
      const rendered = filletPolygon(vertices, radii).commands;
      if (commandsEqual(rendered, current, 0.01))
        return { version: 1, vertices, radii, rendered };
    }
  }
  throw new Error(
    '路径已被非等比缩放或修改节点。请先撤销该操作，避免覆盖现有形状。',
  );
}

export function loadState(raw, commands) {
  if (raw) {
    let saved;
    try {
      saved = JSON.parse(raw);
    } catch {
      throw new Error('圆角数据无法读取，已停止写入。');
    }
    return reconcileState(saved, commands);
  }
  const vertices = polygonFromCommands(commands);
  return {
    version: 1,
    vertices,
    radii: vertices.map(() => 0),
    rendered: commands,
  };
}

// Retain v1 radii wherever the original outline still matches. Outside edits
// become the new source and are only persisted on the next deliberate edit.
export function readPathModel(raw, commands) {
  let saved;
  try {
    saved = raw && JSON.parse(raw);
  } catch {}
  if (
    saved?.version === 2 &&
    Array.isArray(saved.source) &&
    commandsEqual(saved.rendered, commands)
  ) {
    try {
      const model = readOutline(saved.source);
      const output = renderOutline(model, saved.radii);
      if (commandsEqual(output.commands, commands))
        return { ...model, radii: saved.radii, source: saved.source };
    } catch {}
  }
  if (saved?.version === 1) {
    try {
      return reconcileState(saved, commands);
    } catch {}
  }
  try {
    return { ...loadState('', commands), rebased: Boolean(raw) };
  } catch {
    return {
      ...readOutline(commands),
      source: commands,
      rebased: Boolean(raw),
    };
  }
}
