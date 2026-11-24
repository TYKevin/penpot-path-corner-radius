import { validateRadii } from './geometry.mjs';
import { renderOutline } from './outline.mjs';
import {
  DATA_KEY,
  DATA_NAMESPACE,
  commandsEqual,
  readPathModel,
} from './state.mjs';

const radiusFields = [
  'borderRadiusTopLeft',
  'borderRadiusTopRight',
  'borderRadiusBottomRight',
  'borderRadiusBottomLeft',
];
const isBox = (s) => s.type === 'rectangle' || s.type === 'board';
const isTarget = (s) => isBox(s) || s.type === 'path';
function boxModel(s) {
  const w = s.width,
    h = s.height;
  return {
    native: true,
    vertices: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
    radii: radiusFields.map((k) => s[k] ?? 0),
  };
}
function locked(s) {
  while (s) {
    if (s.blocked) return true;
    s = s.parent;
  }
  return false;
}
function optionsFor(roots) {
  const map = new Map();
  function visit(s) {
    if (isTarget(s)) map.set(s.id, s);
    if (s.type === 'group' || s.type === 'board')
      for (const child of s.children ?? []) visit(child);
  }
  roots.forEach(visit);
  return [...map.values()];
}
export function startPlugin(api) {
  let ctx = null,
    sequence = 0,
    listener = null,
    watched = null,
    writing = false,
    scope = '',
    chosen = null,
    lastMessage = '',
    menu = {};
  const send = (m) => api.ui.sendMessage(m);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  function selectionKey() {
    return JSON.stringify([
      api.currentFile?.id,
      api.currentPage?.id,
      ...api.selection.map((s) => s.id),
    ]);
  }
  function watch(s) {
    if (watched === s?.id) return;
    if (listener) api.off(listener);
    watched = s?.id;
    listener = s
      ? api.on(
          'shapechange',
          () => {
            if (!writing) readSelection();
          },
          { shapeId: s.id },
        )
      : null;
  }
  function readSelection(force = false) {
    try {
      const key = selectionKey();
      if (key !== scope) {
        scope = key;
        chosen = null;
      }
      const choices = optionsFor(api.selection);
      const options = choices.map((s) => ({ id: s.id, name: s.name }));
      const shape =
        choices.find((s) => s.id === chosen) ??
        api.selection.find((s) => isTarget(s) && !locked(s)) ??
        choices.find((s) => s.type === 'path' && !locked(s)) ??
        choices.find((s) => !locked(s)) ??
        choices[0];
      menu = {
        options,
        shapeId: shape?.id,
        name: shape?.name,
        requestKey: sequence,
      };
      watch(shape);
      if (!shape)
        throw Error(
          api.selection.length
            ? '当前图层没有可设置半径的顶点。请选择矩形、画板或矢量路径。'
            : '选中一个图形即可调整圆角。',
        );
      if (locked(shape)) throw Error('当前图层已锁定。解锁后即可设置圆角。');
      const native = isBox(shape),
        commands = native ? null : clone(shape.commands);
      const raw = native
        ? null
        : shape.getSharedPluginData(DATA_NAMESPACE, DATA_KEY);
      const signature = JSON.stringify([
        scope,
        options,
        shape.id,
        shape.name,
        commands,
        raw,
        native ? boxModel(shape) : null,
      ]);
      if (!force && ctx?.signature === signature) return;
      const model = native ? boxModel(shape) : readPathModel(raw, commands);
      ctx = {
        id: shape.id,
        key: ++sequence,
        scope,
        commands,
        raw,
        model,
        signature,
      };
      lastMessage = '';
      send({
        type: 'model',
        ...model,
        options,
        shapeId: shape.id,
        name: shape.name,
        pageName: api.currentPage.name,
        theme: api.theme,
        requestKey: ctx.key,
        saved: !!raw && !model.rebased,
      });
    } catch (e) {
      ctx = null;
      if (force || lastMessage !== e.message)
        send({ type: 'unavailable', ...menu, message: e.message });
      lastMessage = e.message;
    }
  }
  function apply(m) {
    const c = ctx;
    if (
      !c ||
      c.key !== m.requestKey ||
      c.id !== m.shapeId ||
      c.scope !== selectionKey()
    )
      throw Error('选区已变化，请在当前图形上输入半径。');
    const shape = optionsFor(api.selection).find((s) => s.id === c.id);
    if (!shape || locked(shape)) throw Error('目标图层已变化或锁定。');
    const native = !!c.model.native;
    const valid = native
      ? JSON.stringify(boxModel(shape)) === JSON.stringify(c.model)
      : commandsEqual(c.commands, shape.commands) &&
        c.raw === shape.getSharedPluginData(DATA_NAMESPACE, DATA_KEY);
    if (!valid) throw Error('图层刚刚发生变化，已重新读取。');
    const radii = m.type === 'restore' ? c.model.radii.map(() => 0) : m.radii;
    validateRadii(radii, c.model.vertices.length);
    if (
      native &&
      radii.some((r, i) => r !== c.model.radii[i] && !Number.isInteger(r))
    )
      throw Error('矩形和画板的原生半径需要整数。');
    const result = renderOutline(c.model, radii);
    const changed = radii.flatMap((r, i) =>
      r !== c.model.radii[i] ? [i] : [],
    );
    if (changed.length) {
      // Penpot remaps native setters for flipped boxes. Getters use stored order.
      const field = (i) =>
        radiusFields[
          (shape.flipY ? [3, 2, 1, 0] : [0, 1, 2, 3])[
            (shape.flipX ? [1, 0, 3, 2] : [0, 1, 2, 3])[i]
          ]
        ];
      const block = api.history.undoBlockBegin();
      writing = true;
      try {
        if (native) {
          for (const i of changed) shape[field(i)] = radii[i];
        } else {
          shape.commands = clone(result.commands);
          const saved = c.model.contours
            ? { version: 2, source: c.model.source }
            : { version: 1, vertices: c.model.vertices };
          shape.setSharedPluginData(
            DATA_NAMESPACE,
            DATA_KEY,
            JSON.stringify({
              ...saved,
              radii,
              rendered: clone(shape.commands),
            }),
          );
        }
      } catch (e) {
        if (native) {
          for (const i of changed) shape[field(i)] = c.model.radii[i];
        } else {
          shape.commands = clone(c.commands);
          shape.setSharedPluginData(DATA_NAMESPACE, DATA_KEY, c.raw || '');
        }
        throw e;
      } finally {
        writing = false;
        api.history.undoBlockFinish(block);
      }
    }
    readSelection(true);
    send({ type: 'applied', shapeId: c.id, message: '已保存，可继续调整。' });
  }
  if (api.flags) api.flags.throwValidationErrors = true;
  api.ui.onMessage((m) => {
    if (!m) return;
    try {
      if (m.type === 'ready' || m.type === 'refresh') readSelection(true);
      else if (m.type === 'sync') {
        if (selectionKey() !== scope || !ctx) readSelection();
      } else if (
        m.type === 'choose' &&
        scope === selectionKey() &&
        m.requestKey === (ctx?.key ?? menu.requestKey)
      ) {
        chosen = m.id;
        readSelection(true);
      } else if (m.type === 'apply' || m.type === 'restore') apply(m);
    } catch (e) {
      readSelection(true);
      send({ type: 'error', message: e.message });
    }
  });
  api.on('selectionchange', () => readSelection());
  api.on('pagechange', () => readSelection());
  api.on('themechange', (theme) => send({ type: 'theme', theme }));
  api.ui.open('顶点圆角 · Path Corner Radius', './index.html', {
    width: 410,
    height: 540,
  });
  return { readSelection };
}
