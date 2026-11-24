import { filletPolygon, validateRadii } from './geometry.mjs';

// Work with the actual line/cubic segments. Cutting an existing cubic with
// de Casteljau retains its geometry on the part outside the rounded corner.
const minus = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
const plus = (p, v, k) => ({ x: p.x + k * v.x, y: p.y + k * v.y });
const norm = (v) => Math.hypot(v.x, v.y);
const unit = (v) =>
  norm(v) > 1e-12 ? { x: v.x / norm(v), y: v.y / norm(v) } : null;
const det = (a, b) => a.x * b.y - a.y * b.x;
const scalar = (a, b) => a.x * b.x + a.y * b.y;
const mix = (a, b, t) => plus(a, minus(b, a), t);
const left = (v) => ({ x: -v.y, y: v.x });
const distance = (a, b) => norm(minus(a, b));
function splitEdge(edge, t) {
  let level = edge;
  const first = [],
    last = [];
  while (level.length) {
    first.push(level[0]);
    last.unshift(level.at(-1));
    level = level.slice(1).map((p, i) => mix(level[i], p, t));
  }
  return [first, last];
}
function sample(edge, t) {
  const [start, end] = splitEdge(edge, t),
    point = start.at(-1);
  const candidates =
    t < 0.5
      ? end.slice(1).map((p) => minus(p, point))
      : start
          .slice(0, -1)
          .reverse()
          .map((p) => minus(point, p));
  return { point, tangent: candidates.map(unit).find(Boolean) };
}
function edgeCommand(edge) {
  const { x, y } = edge.at(-1);
  return edge.length === 2
    ? { command: 'line-to', params: { x, y } }
    : {
        command: 'curve-to',
        params: {
          x,
          y,
          c1x: edge[1].x,
          c1y: edge[1].y,
          c2x: edge[2].x,
          c2y: edge[2].y,
        },
      };
}
function roundArc(center, a, b, turn) {
  const v = minus(a, center),
    w = minus(b, center);
  const angle = Math.atan2(det(v, w), scalar(v, w));
  if (Math.sign(angle) !== turn || Math.abs(angle) < 1e-8) return null;
  const parts = Math.ceil(Math.abs(angle) / (Math.PI / 2) - 1e-7),
    step = angle / parts,
    k = (4 / 3) * Math.tan(step / 4);
  const out = [];
  let start = a;
  for (let i = 1; i <= parts; i++) {
    const end =
      i === parts
        ? b
        : plus(
            center,
            {
              x: v.x * Math.cos(i * step) - v.y * Math.sin(i * step),
              y: v.x * Math.sin(i * step) + v.y * Math.cos(i * step),
            },
            1,
          );
    out.push([
      start,
      plus(start, left(minus(start, center)), k),
      plus(end, left(minus(end, center)), -k),
      end,
    ]);
    start = end;
  }
  return out;
}
function incomingEdge(contour, i) {
  return contour.edges[i - 1] ?? (contour.closed ? contour.edges.at(-1) : null);
}
function cornerAngle(prev, next) {
  if (!prev || !next) return 0;
  const a = sample(prev, 1).tangent,
    b = sample(next, 0).tangent;
  if (!a || !b) return 0;
  const angle = Math.atan2(det(a, b), scalar(a, b));
  return Math.abs(angle) < 0.001 || Math.abs(angle) > Math.PI - 0.001
    ? 0
    : angle;
}
// If an imported cubic is an ordinary tangent circular fillet, recover its
// virtual sharp vertex and radius. Freehand curves must never be guessed.
function recoverArcs(contour) {
  const { edges, closed } = contour;
  if (closed && edges[0]?.length === 4 && edges.some((e) => e.length === 2)) {
    while (edges[0].length === 4) edges.unshift(edges.pop());
  }
  const inferred = new Map();
  for (let i = 1; i < edges.length; i++) {
    if (edges[i].length !== 4 || edges[i - 1].length !== 2) continue;
    let j = i;
    while (j < edges.length && edges[j].length === 4) j++;
    const next = edges[j] ?? (closed ? edges[0] : null);
    if (next?.length !== 2) continue;
    const prev = edges[i - 1],
      start = edges[i][0],
      end = edges[j - 1].at(-1);
    const a = unit(minus(start, prev[0])),
      b = unit(minus(next.at(-1), end));
    if (!a || !b) continue;
    const cross = det(a, b);
    if (Math.abs(cross) < 0.001) continue;
    const chord = minus(end, start);
    const reach = det(chord, b) / cross;
    const vertex = plus(start, a, reach);
    const angle = Math.atan2(cross, scalar(a, b)),
      radius = reach / Math.tan(Math.abs(angle) / 2);
    if (
      !(radius > 0.001 && radius <= 100000) ||
      scalar(minus(end, vertex), b) <= 0
    )
      continue;
    const center = plus(start, left(a), Math.sign(angle) * radius);
    const eps = Math.max(0.001, radius * 0.0005);
    if (Math.abs(distance(vertex, end) - reach) > eps) continue;
    let sweep = 0;
    const matches = edges.slice(i, j).every((edge) => {
      let last = minus(edge[0], center);
      for (const t of [0, 0.125, 0.25, 0.5, 0.75, 0.875, 1]) {
        const { point, tangent } = sample(edge, t),
          v = minus(point, center);
        if (
          !tangent ||
          Math.abs(norm(v) - radius) > eps ||
          Math.abs(scalar(tangent, v)) > Math.max(0.002, radius * 0.002) ||
          Math.sign(det(v, tangent)) !== Math.sign(angle)
        )
          return false;
        sweep += Math.atan2(det(last, v), scalar(last, v));
        last = v;
      }
      return true;
    });
    if (!matches || Math.abs(sweep - angle) > 0.002) continue;
    prev[1] = vertex;
    next[0] = vertex;
    const original = edges.splice(i, j - i);
    inferred.set(vertex, {
      radius,
      originalStart: start,
      originalEnd: end,
      original,
    });
  }
  return inferred;
}
export function readOutline(commands) {
  const contours = [];
  let contour, current;
  function finish() {
    if (!contour?.edges.length) return;
    if (contour.closed && distance(current, contour.start) > 1e-7)
      contour.edges.push([current, contour.start]);
    contours.push(contour);
  }
  let count = 0;
  for (const item of commands) {
    const { command, params: p = {} } = item;
    const end = { x: p.x, y: p.y };
    if (command === 'close-path' || command === 'Z') {
      if (!contour) throw Error('轮廓缺少起点');
      contour.closed = true;
      contour.source.push(item);
      finish();
      contour = null;
      continue;
    }
    if (!Number.isFinite(end.x) || !Number.isFinite(end.y))
      throw Error('路径坐标无效');
    if (command === 'move-to' || command === 'M') {
      finish();
      contour = { start: end, edges: [], closed: false, source: [item] };
      current = end;
      continue;
    }
    if (!contour) throw Error('轮廓缺少起点');
    contour.source.push(item);
    let edge;
    if (command === 'curve-to' || command === 'C')
      edge = [current, { x: p.c1x, y: p.c1y }, { x: p.c2x, y: p.c2y }, end];
    else if (command === 'line-to' || command === 'L') edge = [current, end];
    else throw Error('无法读取此路径命令');
    if (edge.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y)))
      throw Error('曲线坐标无效');
    if (edge.some((v) => distance(v, current) > 1e-8)) contour.edges.push(edge);
    current = end;
    if (++count > 4096)
      throw Error('此路径超过 4096 段，请选择一个较小的子路径。');
  }
  finish();
  const vertices = [],
    radii = [],
    editable = [];
  for (const c of contours) {
    const recognized = recoverArcs(c);
    const nodes = c.edges.map((e) => e[0]);
    if (!c.closed) nodes.push(c.edges.at(-1).at(-1));
    c.rounds = nodes.map((node) => recognized.get(node) ?? null);
    c.corners = nodes.map((node, i) => {
      const id = vertices.length;
      vertices.push(node);
      radii.push(recognized.get(node)?.radius ?? 0);
      editable.push(Boolean(cornerAngle(incomingEdge(c, i), c.edges[i])));
      return id;
    });
  }
  if (!vertices.length) throw Error('此路径没有可显示的轮廓。');
  return { contours, vertices, radii, editable };
}
// Intersect the radius-offset curves. Newton iteration finds tangent points
// on both original edges. If the available spans are too short, reduce R.
function fitCorner(prev, next, angle, r, maxIn, maxOut) {
  const turn = Math.sign(angle),
    arcLength = r * Math.tan(Math.abs(angle) / 2);
  const edgeLength = (e) =>
    e.slice(1).reduce((s, p, i) => s + distance(p, e[i]), 0);
  let u = 1 - Math.min(maxIn, arcLength / edgeLength(prev)),
    v = Math.min(maxOut, arcLength / edgeLength(next));
  const offset = (edge, t) => {
    const { point, tangent } = sample(edge, t);
    return tangent && plus(point, left(tangent), turn * r);
  };
  const derivative = (e, t) => {
    const lo = Math.max(0, t - 1e-5),
      hi = Math.min(1, t + 1e-5);
    const a = offset(e, lo),
      b = offset(e, hi);
    return a && b && plus({ x: 0, y: 0 }, minus(b, a), 1 / (hi - lo));
  };
  for (let n = 0; n < 16; n++) {
    const a = offset(prev, u),
      b = offset(next, v);
    if (!a || !b) return null;
    const f = minus(a, b);
    if (norm(f) < Math.max(1e-8, r * 1e-8)) {
      const arc = roundArc(
        a,
        sample(prev, u).point,
        sample(next, v).point,
        turn,
      );
      return arc ? { u, v, r, arc } : null;
    }
    const du = derivative(prev, u),
      dv = derivative(next, v);
    if (!du || !dv || Math.abs(det(du, dv)) < 1e-12) return null;
    const un = u - det(f, dv) / det(du, dv),
      vn = v + det(du, f) / det(du, dv);
    if (
      !Number.isFinite(un + vn) ||
      un < 1 - maxIn - 1e-7 ||
      un > 1 ||
      vn < 0 ||
      vn > maxOut + 1e-7
    )
      return null;
    u = Math.max(1 - maxIn, un);
    v = Math.min(maxOut, vn);
  }
  return null;
}
export function renderOutline(model, radii) {
  if (!model.contours) return filletPolygon(model.vertices, radii);
  validateRadii(radii, model.vertices.length);
  const commands = [],
    effectiveRadii = radii.map(() => 0);
  for (const c of model.contours) {
    const { edges, corners, closed } = c,
      size = corners.length;
    if (corners.every((id, i) => radii[id] === (c.rounds[i]?.radius ?? 0))) {
      commands.push(...c.source);
      for (const id of corners) effectiveRadii[id] = radii[id];
      continue;
    }
    function cornerFit(i, maxIn, maxOut) {
      const id = corners[i],
        prev = incomingEdge(c, i),
        next = edges[i],
        angle = cornerAngle(prev, next);
      if (!angle || !radii[id]) return null;
      const solve = (r) => fitCorner(prev, next, angle, r, maxIn, maxOut);
      let best = solve(radii[id]);
      if (!best) {
        let lo = 0,
          hi = radii[id];
        for (let k = 0; k < 32; k++) {
          const mid = (lo + hi) / 2,
            fit = solve(mid);
          if (fit) {
            best = fit;
            lo = mid;
          } else hi = mid;
        }
      }
      return best;
    }
    // Reserve the actual parameter spans required on shared edges. Only
    // shorten rounds when their two tangent points would cross.
    const free = corners.map((_, i) => cornerFit(i, 1, 1));
    const spans = edges.map((edge, i) => {
      const outgoing = free[i]?.v ?? 0,
        incoming = 1 - (free[(i + 1) % size]?.u ?? 1),
        sum = outgoing + incoming;
      return sum > 1 + 1e-8
        ? { out: outgoing / sum, in: incoming / sum }
        : null;
    });
    const cuts = corners.map((id, i) => {
      const before = spans[i - 1] ?? (closed && i === 0 ? spans.at(-1) : null),
        after = spans[i];
      const best =
        before || after
          ? cornerFit(i, before?.in ?? 1, after?.out ?? 1)
          : free[i];
      const known = c.rounds[i];
      if (
        best &&
        known &&
        Math.abs(best.r - known.radius) < 1e-7 &&
        distance(best.arc[0][0], known.originalStart) < 0.002 &&
        distance(best.arc.at(-1).at(-1), known.originalEnd) < 0.002
      )
        best.arc = known.original;
      effectiveRadii[id] = best?.r ?? 0;
      return best;
    });
    const initial = cuts[0]?.arc[0][0] ?? edges[0][0];
    commands.push({ command: 'move-to', params: { ...initial } });
    edges.forEach((edge, i) => {
      for (const arc of cuts[i]?.arc ?? []) commands.push(edgeCommand(arc));
      const from = cuts[i]?.v ?? 0,
        to = cuts[(i + 1) % size]?.u ?? 1;
      if (
        to - from > 1e-9 &&
        !(closed && i === edges.length - 1 && edge.length === 2)
      ) {
        const piece =
          from === 0 && to === 1
            ? edge
            : splitEdge(splitEdge(edge, to)[0], from / to)[1];
        commands.push(edgeCommand(piece));
      }
    });
    if (closed) commands.push({ command: 'close-path', params: {} });
  }
  return {
    commands,
    effectiveRadii,
    limited: radii.map((r, i) => effectiveRadii[i] + 1e-5 < r),
  };
}
