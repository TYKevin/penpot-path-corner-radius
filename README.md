# Path Corner Radius

English · [简体中文](README.zh-CN.md)

Round one vertex of a vector path while keeping the others sharp. The plugin also edits the native corners of rectangles and boards. In this example, only the tip of the arrow changes, from 0 to 56 px.

![Select the arrow tip, enter 56 px and see the rounded result.](docs/images/corner-walkthrough.png)

## Install

In the Penpot editor, open **Plugins**, paste the [manifest URL](https://tykevin.github.io/penpot-path-corner-radius/manifest.json) and choose **Install → Allow**. Open **Path Corner Radius** and select a shape on the canvas.

## Edit a corner

1. Click a numbered vertex in the preview. Hold **Shift** to select several. For a group, use the layer menu to pick the shape to edit.
2. Enter a radius in pixels. Press **Enter** to save immediately, or pause to save automatically.
3. Enter **0** to restore a sharp corner. You can undo and redo edits in Penpot.

<img src="docs/images/corner-panel.png" alt="English plugin panel showing vertex 3 saved at 56 px." width="410">

## Interface language

The panel follows your browser’s preferred supported language, with English as the fallback. Use the menu at the top of the panel to select **English**, **简体中文** or **Browser language**. When browser storage is available, the panel remembers your choice. Layer names appear exactly as written in your design.

## Supported shapes

- Rectangles and boards use native whole-number radii and retain their children and layout.
- Vector paths support fractional radii at editable corners. Some circular fillets on imported paths can be recognized. Smooth nodes and open endpoints have no corner to round.
- Nearby edges can limit the effective radius. The panel shows the limit and keeps the entered value.

## Data and permissions

The plugin uses `content:read` to read the selection and `content:write` to apply edits. It saves editable path geometry on the shape in your Penpot document. The browser loads static files from GitHub Pages. The plugin has no analytics or external API calls.

## Development

With Node.js 20 or later, run `npm test` and `npm run build`. GitHub Pages deploys the static files in `dist/` after tests pass on the main branch.

[Mozilla Public License 2.0](LICENSE)
