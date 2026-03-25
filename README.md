# Grebbans Handover — Figma Plugin

Extracts variables, text styles, effect styles, and grid styles from the active Figma file.
Renders a branded style sheet with side-by-side visual preview and CSS custom properties.

## Setup

```bash
npm install
npm run build
```

Then in Figma:
1. **Plugins → Development → Import plugin from manifest**
2. Select the `manifest.json` in this folder
3. Run the plugin from **Plugins → Development → Grebbans Handover**

## Development

```bash
npm run watch   # TypeScript watch mode
```

After any change to `code.ts`, re-run the plugin in Figma (Cmd+Option+P).
After any change to `ui.html`, run `node scripts/bundle-ui.js` or `npm run build`.

## What gets extracted

| Tab | Source |
|-----|--------|
| Variables | `figma.variables.getLocalVariableCollections()` |
| Text styles | `figma.getLocalTextStyles()` |
| Effects | `figma.getLocalEffectStyles()` |
| Grids | `figma.getLocalGridStyles()` |

### Variable groups
- **core** — text colours, font family
- **sections** — background + status colours with alpha variants
- **radius** — corner radius tokens
- **space** — spacing / gap tokens
- **grid** — layout grid visualisation colours (handover reference only, excluded from CSS output)

## Export
- **Export JSON** button dumps the full extracted payload as `grebbans-tokens.json`
- **Copy** button in the CSS pane copies ready-to-paste CSS custom properties

## Roadmap (for Figma MCP integration)
- [ ] Push extracted tokens directly to MCP context for design prompting
- [ ] Diff mode — highlight tokens changed since last extract
- [ ] Multi-mode support (light/dark variable modes)
- [ ] Component inventory tab
