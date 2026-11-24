import { renderOutline } from './outline.mjs';
import { commandsToSvg } from './geometry.mjs';
const $ = (id) => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
let model = null,
  radii = [],
  selected = new Set([0]),
  valid = true,
  busy = false;
const send = (message) => parent.postMessage(message, '*');
const roundedNumber = (n) => Math.round(n * 1000) / 1000;
function notice(message, kind = '') {
  $('notice').textContent = message;
  $('notice').className = kind;
}
function vertexSelect(i, multi) {
  if (multi) {
    if (selected.has(i)) selected.delete(i);
    else selected.add(i);
  } else selected = new Set([i]);
  valid = true;
  render();
  if (selected.size && !$('radius').disabled) {
    $('radius').focus();
    $('radius').select();
  }
}
function render(preserveInput = false) {
  if (!model) return;
  const vertices = model.vertices;
  const result = renderOutline(model, radii);
  const original =
    model.source ??
    renderOutline(
      model,
      vertices.map(() => 0),
    ).commands;
  const points = [...vertices];
  for (const { params: p } of original) {
    for (const [x, y] of [
      ['x', 'y'],
      ['c1x', 'c1y'],
      ['c2x', 'c2y'],
    ])
      if (p && Number.isFinite(p[x])) points.push({ x: p[x], y: p[y] });
  }
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    w = Math.max(...xs) - minX,
    h = Math.max(...ys) - minY;
  const scale = Math.min(340 / Math.max(w, 1), 170 / Math.max(h, 1));
  const offsetX = (400 - w * scale) / 2,
    offsetY = (230 - h * scale) / 2;
  const project = (value, isX) =>
    (value - (isX ? minX : minY)) * scale + (isX ? offsetX : offsetY);
  const previewVertices = vertices.map((p) => ({
    x: project(p.x, true),
    y: project(p.y, false),
  }));
  function preview(commands) {
    return commandsToSvg(
      commands.map((c) => ({
        ...c,
        params: Object.fromEntries(
          Object.entries(c.params ?? {}).map(([k, v]) => [
            k,
            project(v, k.endsWith('x')),
          ]),
        ),
      })),
    );
  }
  $('original').setAttribute('d', preview(original));
  $('rounded').setAttribute('d', preview(result.commands));
  const markers = $('vertices');
  markers.replaceChildren();
  const list = $('radius-list');
  list.replaceChildren();
  previewVertices.forEach((p, i) => {
    if (model.editable?.[i] === false) return;
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', `vertex${selected.has(i) ? ' selected' : ''}`);
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', `顶点 ${i + 1}`);
    g.setAttribute('aria-pressed', String(selected.has(i)));
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', '11');
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', p.x);
    text.setAttribute('y', p.y);
    text.textContent = i + 1;
    g.append(circle, text);
    g.addEventListener('click', (e) => vertexSelect(i, e.shiftKey));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        vertexSelect(i, e.shiftKey);
      }
    });
    markers.append(g);
    const row = document.createElement('button');
    row.className = `radius-row${selected.has(i) ? ' selected' : ''}`;
    row.setAttribute('aria-label', `选择顶点 ${i + 1}`);
    const name = document.createElement('span');
    name.textContent = `顶点 ${i + 1}`;
    const value = document.createElement('span');
    value.textContent = `${roundedNumber(radii[i])} px${result.limited[i] ? '（受限）' : ''}`;
    row.append(name, value);
    row.addEventListener('click', (e) => vertexSelect(i, e.shiftKey));
    list.append(row);
  });
  const values = [...selected].map((i) => radii[i]);
  $('radius').disabled = !selected.size || busy;
  $('radius').placeholder =
    values.length && values.some((r) => r !== values[0]) ? '多个值' : '';
  if (!preserveInput)
    $('radius').value =
      values.length && values.every((r) => r === values[0])
        ? roundedNumber(values[0])
        : '';
  $('selection-label').textContent =
    selected.size === 1
      ? `顶点 ${[...selected][0] + 1}`
      : `已选 ${selected.size} 个顶点`;
  $('radius').step = model.native ? '1' : 'any';
  $('restore').disabled = busy;
  $('zero').disabled = !selected.size || busy;
  const limited = result.limited.flatMap((yes, i) =>
    yes ? [`${i + 1}：${roundedNumber(result.effectiveRadii[i])}px`] : [],
  );
  $('limit-note').hidden = !limited.length;
  $('limit-note').textContent =
    `受边长或轮廓间距限制，实际半径 ${limited.join('；')}。输入值仍会保存。`;
}
let timer = null;
function cancelSave() {
  clearTimeout(timer);
  timer = null;
}
function commit() {
  cancelSave();
  if (!model || busy || !valid || radii.every((r, i) => r === model.radii[i]))
    return;
  busy = true;
  $('radius').readOnly = true;
  send({
    type: 'apply',
    shapeId: model.shapeId,
    requestKey: model.requestKey,
    radii: [...radii],
  });
}
function updateRadius() {
  cancelSave();
  const raw = $('radius').value,
    value = Number(raw);
  valid =
    raw.trim() !== '' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100000 &&
    (!model.native || Number.isInteger(value));
  if (!valid) {
    notice(
      model.native
        ? '请输入 0–100000 的整数半径。'
        : '请输入 0–100000 之间的半径。',
      'error',
    );
    return;
  }
  selected.forEach((i) => {
    radii[i] = value;
  });
  render(true);
  notice('正在预览…');
  timer = setTimeout(commit, 450);
}
$('radius').addEventListener('input', updateRadius);
$('radius').addEventListener('change', commit);
$('radius').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commit();
  }
});
$('all').onclick = () => {
  selected = new Set(
    model.vertices
      .map((_, i) => i)
      .filter((i) => model.editable?.[i] !== false),
  );
  valid = true;
  render();
};
$('none').onclick = () => {
  selected.clear();
  valid = true;
  render();
};
$('zero').onclick = () => {
  $('radius').value = '0';
  updateRadius();
  commit();
};
$('restore').onclick = () => {
  cancelSave();
  if (model && !busy) {
    valid = true;
    radii = model.radii.map(() => 0);
    commit();
    render();
  }
};
$('layers').onchange = (e) => {
  cancelSave();
  send({
    type: 'choose',
    id: e.target.value,
    requestKey: model?.requestKey ?? lastKey,
  });
};
let lastKey;
function showLayers(msg) {
  lastKey = msg.requestKey;
  const layers = $('layers');
  layers.hidden = (msg.options?.length ?? 0) < 2;
  layers.replaceChildren(
    ...(msg.options ?? []).map(
      (opt) => new Option(opt.name, opt.id, false, opt.id === msg.shapeId),
    ),
  );
}
window.addEventListener('message', (event) => {
  if (event.source !== parent) return;
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'theme') {
    document.documentElement.dataset.theme = msg.theme;
    return;
  }
  if (msg.type === 'model') {
    const same = model?.shapeId === msg.shapeId;
    const preserve =
      same &&
      busy &&
      document.activeElement === $('radius') &&
      valid &&
      selected.size &&
      [...selected].every((i) => Number($('radius').value) === msg.radii[i]);
    $('radius').readOnly = false;
    cancelSave();
    model = msg;
    radii = [...msg.radii];
    busy = false;
    valid = true;
    const available = radii
      .map((_, i) => i)
      .filter((i) => msg.editable?.[i] !== false);
    selected = same
      ? new Set([...selected].filter((i) => available.includes(i)))
      : new Set(available.slice(0, 1));
    if (!selected.size && available.length) selected.add(available[0]);
    showLayers(msg);
    document.documentElement.dataset.theme = msg.theme;
    $('editor').hidden = false;
    $('shape-name').textContent = msg.name;
    notice(
      !available.length
        ? '此轮廓只有平滑节点或端点，没有可倒圆的转角。'
        : msg.rebased
          ? '已按当前轮廓读取，可继续调整。'
          : '',
    );
    render(preserve);
  } else if (msg.type === 'unavailable') {
    cancelSave();
    model = null;
    busy = false;
    showLayers(msg);
    $('editor').hidden = true;
    $('shape-name').textContent = msg.name ?? '';
    notice(msg.message);
  } else if (msg.type === 'applied' && model?.shapeId === msg.shapeId) {
    busy = false;
    notice('已保存');
  } else if (msg.type === 'error') {
    busy = false;
    notice(msg.message, 'error');
  }
});
send({ type: 'ready' });
// Also recover a missed ready or selection event when a background tab wakes.
setInterval(() => send({ type: model ? 'sync' : 'ready' }), 1250);
