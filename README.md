# Path Corner Radius · 顶点圆角

Edit individual corners on rectangles, boards and vector paths in Penpot. Pick a vertex in the preview, hold Shift to select several, and type a radius. Edits save automatically and support Penpot’s undo and redo. The plugin interface is in Simplified Chinese.

## Install

Open the plugin manager in the Penpot editor, paste the [manifest URL](https://tykevin.github.io/penpot-path-corner-radius/manifest.json) and choose **Install → Allow**. Open the plugin and select a shape on the canvas.

## Editing corners

- Rectangles and boards use native integer corner radii. Their children and layout are preserved.
- Vector paths support fractional radii on editable corners. The plugin can recognize some existing circular fillets on imported paths. Smooth nodes and open endpoints have no corner to round.
- Enter zero to restore a sharp corner. Oversized radii are limited by the available geometry.
- Use the layer selector to switch between editable shapes in a group.

## Data and permissions

The plugin uses `content:read` to inspect the selection and `content:write` to apply edits. For paths, it stores editable geometry on the shape in the Penpot document. The plugin has no analytics, external API calls, or service of its own. The browser requests the plugin’s static files from GitHub Pages.

## Development

With Node.js 20 or later, run `npm test` and then `npm run build`. The static plugin is built into `dist/`. GitHub Pages serves that directory after tests pass on the main branch.

Released under the [Mozilla Public License 2.0](LICENSE).
