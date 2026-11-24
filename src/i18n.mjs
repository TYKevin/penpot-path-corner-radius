// The host and geometry modules use the original Chinese messages. Translate
// at the panel boundary so switching languages never changes stored path data.
const english = new Map([
  ["顶点圆角", "Path Corner Radius"],
  ["界面语言", "Interface language"],
  ["跟随浏览器", "Browser language"],
  ["选择图层", "Select layer"],
  ["路径顶点预览", "Path vertex preview"],
  ["点击预览中的编号选择顶点 · 按住 Shift 可多选", "Click a numbered vertex. Hold Shift to select more than one."],
  ["全选", "Select all"],
  ["清空选择", "Clear selection"],
  ["圆角半径", "Corner radius"],
  ["设为 0", "Set to 0"],
  ["输入后自动保存，按回车立即保存。", "Changes save automatically. Press Enter to save now."],
  ["各顶点半径", "Radii by vertex"],
  ["所有角设为 0", "Reset all corners to 0"],
  ["顶点 {n}", "Vertex {n}"],
  ["选择顶点 {n}", "Select vertex {n}"],
  ["已选 {n} 个顶点", "{n} vertices selected"],
  ["（受限）", " (limited)"],
  ["多个值", "Mixed values"],
  ["受边长或轮廓间距限制，实际半径为 {values}。输入值仍会保存。", "Nearby edges limit the actual radii to {values}. Your entered values are saved."],
  ["请输入 0–100000 的整数半径。", "Enter a whole-number radius between 0 and 100000."],
  ["请输入 0–100000 之间的半径。", "Enter a radius between 0 and 100000."],
  ["正在预览…", "Previewing…"],
  ["此轮廓只有平滑节点或端点，没有可倒圆的转角。", "This outline contains only smooth nodes or endpoints. There are no corners to round."],
  ["已按当前轮廓读取，可继续调整。", "The current outline has been loaded. You can continue editing."],
  ["已保存", "Saved"],
  ["当前图层没有可设置半径的顶点。请选择矩形、画板或矢量路径。", "This layer has no editable corners. Select a rectangle, board or vector path."],
  ["选中一个图形即可调整圆角。", "Select a shape to edit its corners."],
  ["当前图层已锁定。解锁后即可设置圆角。", "This layer is locked. Unlock it to edit its corners."],
  ["选区已变化，请在当前图形上输入半径。", "The selection changed. Enter a radius on the current shape."],
  ["目标图层已变化或锁定。", "The target layer changed or is locked."],
  ["图层刚刚发生变化，已重新读取。", "The layer changed and has been reloaded."],
  ["矩形和画板的原生半径需要整数。", "Rectangles and boards require whole-number radii."],
  ["已保存，可继续调整。", "Saved. You can continue editing."],
  ["圆角数据版本不受支持，请使用匹配版本的插件。", "This corner data requires a different version of the plugin."],
  ["圆角数据不完整，已停止写入。", "The corner data is incomplete. The edit was stopped."],
  ["路径已在插件外修改。请先撤销外部编辑；插件不会覆盖这些修改。", "The path was edited outside the plugin. Undo that edit before changing the stored radius."],
  ["路径控制点已改变，无法继续编辑原半径。", "The path control points changed. The original radius can no longer be edited."],
  ["路径已退化。", "The path has collapsed."],
  ["路径已被非等比缩放或修改节点。请先撤销该操作，避免覆盖现有形状。", "The path was scaled unevenly or its nodes were edited. Undo that change before editing its original corners."],
  ["圆角数据无法读取，已停止写入。", "The saved corner data could not be read. The edit was stopped."],
  ["需要一个包含 3–256 个顶点的闭合多边形。", "Select a closed polygon with 3–256 vertices."],
  ["路径存在重合的相邻顶点。", "The path has overlapping adjacent vertices."],
  ["路径存在折返或重叠的边，无法安全圆角。", "The path has overlapping or backtracking edges that cannot be rounded."],
  ["暂不支持自相交或自接触的路径。", "Paths that intersect or touch themselves are unsupported."],
  ["路径面积为零。", "The path has zero area."],
  ["路径格式不受支持。", "This path format is unsupported."],
  ["首版只支持一个闭合轮廓，不支持复合路径。", "This polygon operation requires a single closed outline."],
  ["首版不支持多个轮廓或带孔路径。", "This polygon operation cannot process multiple contours or holes."],
  ["路径缺少起点。", "The path has no starting point."],
  ["请选择由直线组成的闭合路径；已有曲线需由本插件创建才能继续编辑半径。", "Select a closed polygon with straight sides or reopen a curve previously saved by the plugin."],
  ["暂不支持开放路径，请先闭合轮廓。", "Close the outline before applying this polygon operation."],
  ["每个顶点的半径须为 0–100000 之间的有限数字。", "Each radius must be a finite number between 0 and 100000."],
  ["无法预览此路径命令。", "This path command cannot be previewed."],
  ["轮廓缺少起点", "The contour has no starting point."],
  ["路径坐标无效", "The path coordinates are invalid."],
  ["无法读取此路径命令", "This path command could not be read."],
  ["曲线坐标无效", "The curve coordinates are invalid."],
  ["此路径超过 4096 段，请选择一个较小的子路径。", "This path exceeds 4096 segments. Select a smaller subpath."],
  ["此路径没有可显示的轮廓。", "This path has no outline to display."],
]);

export function resolveLanguage(preference, browserLanguages = []) {
  if (preference === 'zh' || preference === 'en') return preference;
  for (const tag of browserLanguages) {
    const language = tag.toLowerCase().split('-')[0];
    if (language === 'zh' || language === 'en') return language;
  }
  return 'en';
}

export function translate(language, source, values = {}) {
  const text = language === 'en' ? (english.get(source) ?? source) : source;
  return text.replace(/\{(\w+)\}/g, (placeholder, key) => values[key] ?? placeholder);
}
