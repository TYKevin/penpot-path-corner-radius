export function createMockHost(commands, initialData = '') {
  let data = initialData;
  const handlers = new Map(),
    messages = [],
    undo = [],
    redo = [];
  let uiHandler, before;
  const shape = {
    id: 'test-path',
    type: 'path',
    name: '梯形测试',
    blocked: false,
    commands: structuredClone(commands),
    fills: [{ fillColor: '#8a6be9', fillOpacity: 1 }],
    tokens: { fill: 'color.Background.brand' },
    parent: { id: 'test-board' },
    getSharedPluginData: () => data,
    setSharedPluginData: (_ns, _key, value) => {
      data = value;
    },
  };
  function emit(type) {
    for (const { type: t, fn } of [...handlers.values()]) if (t === type) fn();
  }
  const api = {
    ui: {
      open() {},
      sendMessage(m) {
        messages.push(structuredClone(m));
        api.onMessage?.(m);
      },
      onMessage(fn) {
        uiHandler = fn;
      },
    },
    flags: {},
    selection: [shape],
    theme: 'light',
    currentFile: { id: 'local-demo-file' },
    currentPage: {
      id: 'local-demo-page',
      name: '本地测试',
      getShapeById: (id) => (id === shape.id ? shape : null),
    },
    history: {
      undoBlockBegin() {
        before = { commands: structuredClone(shape.commands), data };
        return Symbol();
      },
      undoBlockFinish() {
        undo.push(before);
        redo.length = 0;
        api.onChange?.();
      },
    },
    on(type, fn) {
      const key = Symbol();
      handlers.set(key, { type, fn });
      return key;
    },
    off(key) {
      handlers.delete(key);
    },
    send(message) {
      uiHandler(message);
    },
    messages,
    shape,
    emit,
    undo() {
      if (!undo.length) return;
      redo.push({ commands: structuredClone(shape.commands), data });
      const item = undo.pop();
      shape.commands = item.commands;
      data = item.data;
      emit('shapechange');
      api.onChange?.();
    },
    redo() {
      if (!redo.length) return;
      undo.push({ commands: structuredClone(shape.commands), data });
      const item = redo.pop();
      shape.commands = item.commands;
      data = item.data;
      emit('shapechange');
      api.onChange?.();
    },
  };
  return api;
}
