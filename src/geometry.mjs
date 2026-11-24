// Circular fillets are represented by cubic Bezier segments (sweep <= pi/2).
// Original polygon vertices are retained separately; rendered curves are never
// used as the source for the next edit.
export const GEOMETRY_EPSILON = 1e-7;
export const MAX_VERTICES = 256;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const length = (a) => Math.hypot(a.x, a.y);
const nearPoint = (a, b) => length(sub(a, b)) < GEOMETRY_EPSILON;
const at = (p, v, t) => ({ x: p.x + v.x * t, y: p.y + v.y * t });
const finitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);

function onSegment(a, b, p) {
  return (
    Math.abs(cross(sub(b, a), sub(p, a))) < GEOMETRY_EPSILON &&
    p.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON &&
    p.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON &&
    p.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON &&
    p.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON
  );
}

function segmentsIntersect(a, b, c, d) {
  const ab = sub(b, a),
    cd = sub(d, c);
  const s1 = cross(ab, sub(c, a)),
    s2 = cross(ab, sub(d, a));
  const s3 = cross(cd, sub(a, c)),
    s4 = cross(cd, sub(b, c));
  return (
    (s1 * s2 < 0 && s3 * s4 < 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}

export function validateVertices(vertices) {
  if (
    !Array.isArray(vertices) ||
    vertices.length < 3 ||
    vertices.length > MAX_VERTICES ||
    !vertices.every(finitePoint)
  ) {
    throw new Error('需要一个包含 3–256 个顶点的闭合多边形。');
  }
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    if (nearPoint(vertices[i], vertices[(i + 1) % n]))
      throw new Error('路径存在重合的相邻顶点。');
    const u = sub(vertices[(i + n - 1) % n], vertices[i]);
    const v = sub(vertices[(i + 1) % n], vertices[i]);
    if (Math.abs(cross(u, v)) < GEOMETRY_EPSILON && dot(u, v) > 0) {
      throw new Error('路径存在折返或重叠的边，无法安全圆角。');
    }
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (
        segmentsIntersect(
          vertices[i],
          vertices[(i + 1) % n],
          vertices[j],
          vertices[(j + 1) % n],
        )
      ) {
        throw new Error('暂不支持自相交或自接触的路径。');
      }
    }
  }
  const origin = vertices[0];
  const area = vertices.reduce(
    (sum, p, i) =>
      sum + cross(sub(p, origin), sub(vertices[(i + 1) % n], origin)),
    0,
  );
  if (Math.abs(area) < GEOMETRY_EPSILON) throw new Error('路径面积为零。');
  return vertices;
}

export function polygonFromCommands(commands) {
  if (!Array.isArray(commands) || commands.length > MAX_VERTICES + 3)
    throw new Error('路径格式不受支持。');
  const vertices = [];
  let closed = false;
  for (const item of commands) {
    const cmd = item.command,
      p = item.params ?? {};
    if (closed) throw new Error('首版只支持一个闭合轮廓，不支持复合路径。');
    if (cmd === 'move-to' || cmd === 'M') {
      if (vertices.length) throw new Error('首版不支持多个轮廓或带孔路径。');
      vertices.push({ x: p.x, y: p.y });
    } else if (cmd === 'line-to' || cmd === 'L') {
      if (!vertices.length) throw new Error('路径缺少起点。');
      vertices.push({ x: p.x, y: p.y });
    } else if (cmd === 'close-path' || cmd === 'Z') {
      closed = true;
    } else {
      throw new Error(
        '请选择由直线组成的闭合路径；已有曲线需由本插件创建才能继续编辑半径。',
      );
    }
  }
  if (vertices.length > 1 && nearPoint(vertices[0], vertices.at(-1))) {
    vertices.pop();
    closed = true;
  }
  if (!closed) throw new Error('暂不支持开放路径，请先闭合轮廓。');
  return validateVertices(vertices);
}

export function validateRadii(radii, n) {
  if (
    !Array.isArray(radii) ||
    radii.length !== n ||
    radii.some(
      (r) =>
        typeof r !== 'number' || !Number.isFinite(r) || r < 0 || r > 100000,
    )
  ) {
    throw new Error('每个顶点的半径须为 0–100000 之间的有限数字。');
  }
  return radii;
}

export function filletPolygon(vertices, radii) {
  validateVertices(vertices);
  validateRadii(radii, vertices.length);
  const n = vertices.length;
  const corners = vertices.map((p, i) => {
    const av = sub(vertices[(i + n - 1) % n], p),
      bv = sub(vertices[(i + 1) % n], p);
    const a = at({ x: 0, y: 0 }, av, 1 / length(av));
    const b = at({ x: 0, y: 0 }, bv, 1 / length(bv));
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    const straight = Math.PI - theta < 1e-6;
    const tanHalf = Math.tan(theta / 2);
    return {
      p,
      a,
      b,
      theta,
      straight,
      tanHalf,
      desired: straight ? 0 : radii[i] / tanHalf,
    };
  });
  // In a concave outline, a short remote edge can be much closer than either
  // incident edge. Keep each rounded corner inside a disjoint neighbourhood,
  // conservatively avoiding collisions across narrow notches/corridors.
  const turns = corners.map((c) => Math.sign(cross(c.a, c.b))).filter(Boolean);
  if (turns.some((t) => t !== turns[0])) {
    corners.forEach((c, i) => {
      for (let j = 0; j < n; j++) {
        if (j === i || j === (i + n - 1) % n) continue;
        const a = vertices[j],
          b = vertices[(j + 1) % n];
        const ab = sub(b, a);
        const ratio = Math.max(
          0,
          Math.min(1, dot(sub(c.p, a), ab) / dot(ab, ab)),
        );
        const clearance = length(sub(c.p, at(a, ab, ratio)));
        c.desired = Math.min(c.desired, clearance * 0.49);
      }
    });
  }
  const edgeScales = corners.map((c, i) => {
    const total = c.desired + corners[(i + 1) % n].desired;
    return total > 0
      ? Math.min(1, length(sub(vertices[(i + 1) % n], c.p)) / total)
      : 1;
  });
  corners.forEach((c, i) => {
    c.distance =
      c.desired * Math.min(edgeScales[(i + n - 1) % n], edgeScales[i]);
    c.radius = c.straight ? 0 : c.distance * c.tanHalf;
    c.entry = at(c.p, c.a, c.distance);
    c.exit = at(c.p, c.b, c.distance);
  });
  const commands = [{ command: 'move-to', params: { ...corners[0].entry } }];
  for (let i = 0; i < n; i++) {
    const c = corners[i];
    if (i) commands.push({ command: 'line-to', params: { ...c.entry } });
    if (c.radius > GEOMETRY_EPSILON) {
      const bisector = { x: c.a.x + c.b.x, y: c.a.y + c.b.y };
      const center = at(
        c.p,
        bisector,
        c.radius / Math.sin(c.theta / 2) / length(bisector),
      );
      const sweep = Math.sign(-cross(c.a, c.b)) * (Math.PI - c.theta);
      const count = Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-10);
      const angle = sweep / count,
        k = (4 / 3) * Math.tan(angle / 4);
      let start = c.entry;
      for (let part = 0; part < count; part++) {
        const v = sub(start, center);
        const end =
          part === count - 1
            ? c.exit
            : {
                x: center.x + v.x * Math.cos(angle) - v.y * Math.sin(angle),
                y: center.y + v.x * Math.sin(angle) + v.y * Math.cos(angle),
              };
        const w = sub(end, center);
        commands.push({
          command: 'curve-to',
          params: {
            c1x: start.x - v.y * k,
            c1y: start.y + v.x * k,
            c2x: end.x + w.y * k,
            c2y: end.y - w.x * k,
            ...end,
          },
        });
        start = end;
      }
    }
  }
  commands.push({ command: 'close-path', params: {} });
  return {
    commands,
    effectiveRadii: corners.map((c) => c.radius),
    limited: corners.map((c, i) => c.radius + 1e-5 < radii[i]),
  };
}

export function commandsToSvg(commands) {
  return commands
    .map(({ command, params: p = {} }) => {
      if (command === 'move-to') return `M ${p.x} ${p.y}`;
      if (command === 'line-to') return `L ${p.x} ${p.y}`;
      if (command === 'curve-to')
        return `C ${p.c1x} ${p.c1y} ${p.c2x} ${p.c2y} ${p.x} ${p.y}`;
      if (command === 'close-path') return 'Z';
      throw new Error('无法预览此路径命令。');
    })
    .join(' ');
}
