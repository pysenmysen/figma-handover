# Figma Handover Plugin — Claude Code Reference

## What this is
A Figma plugin that auto-generates style sheet documentation frames and component handover frames directly on the Figma canvas. Built for Grebban's e-commerce template projects. Enables Claude MCP to read design tokens, styles and component specs without manual JSON exports.

## Repo
`github.com/pysenmysen/figma-handover`
Local: `~/code/figma-handover`

---

## Build system
Source files live in `src/`. `code.js` is **auto-generated** — never edit it directly.

```
node build.js   ← run this after every src/ change before pushing
```

Build order (`build.js`):
1. `src/config.js`
2. `src/helpers.js`
3. `src/colours.js`
4. `src/typography.js`
5. `src/grid.js`
6. `src/documentation.js`
7. `src/main.js`

Push workflow: edit `src/` → `node build.js` → verify syntax → `git push`.

---

## File structure
```
figma-handover/
├── src/
│   ├── config.js         constants: VERSION, FRAME_W, CONTENT_W, WRAP_W, KEYS
│   ├── helpers.js        shared utils: frame helpers, colour utils, layout configs
│   ├── colours.js        Colours module (Primitives, Themes, Gradients, Effects)
│   ├── typography.js     Typography module
│   ├── grid.js           Grid module + breakpoint config/text
│   ├── documentation.js  Documentation tab actions
│   └── main.js           init(), message handler, router
├── build.js              concatenation script
├── code.js               AUTO-GENERATED output (Figma reads this)
├── ui.html               plugin UI
├── manifest.json         plugin name: "Figma Handover"
└── package.json          version only
```

---

## Key constants (src/config.js)
| Constant | Value | Meaning |
|---|---|---|
| `FRAME_W` | 1504 | Width of all outer doc frames |
| `CONTENT_W` | 1164 | Width of content area (FRAME_W - 320 - 20) |
| `WRAP_W` | 580 | Width of wrapped card grids |

## Component keys (src/config.js → KEYS)
All from Core Third Party Library (`vFbBIGOebhZjJmt4blVwLi`):
- `docModule` — `📋 Doc/Default` (the dark doc panel, used everywhere)
- `colourPrimitive` — primitive colour swatch card
- `themesCol` — theme column wrapper
- `themesColour` — individual theme colour cell
- `gradientCard` — gradient display card
- `effectCard` — effect display card
- `sectionOther` — `Slots/Other`
- `typographyStyle` — `Typography/Style Type=Primary`
- `typographySlot` — `Slots/Typography`
- `slotsGrid` — `Slots/Grid`

---

## Shared helpers (src/helpers.js)

### Layout frame configurators
Always call these on existing frames too (not just new ones). Sets layout modes and sizing correctly — **resize() must be called BEFORE setting primaryAxisSizingMode/counterAxisSizingMode**.

```js
configDocRows(frame, width, gap)   // VERTICAL, fixed width, hug height. Default gap 4px.
configDocCol(frame, width, gap)    // HORIZONTAL, fixed width, hug height. Default gap 4px.
configDocWrap(frame, width)        // HORIZONTAL+WRAP, fixed width, hug height. Gap 4/4px.
```

Outer wrappers (Doc/Colour, Doc/Typography, Doc/Grid) use `gap=16`.
DocCol frames between Doc/Default and content use `gap=16`.
Inner content frames use default `gap=4`.

### Other helpers
```js
findExistingFrame(name)            // searches page + sections by frame name
getOrCreateFrame(name)             // find or create on page, clears children
getOrCreateSubFrame(parent, name)  // find or create inside parent, returns {frame, isNew}
clearChildren(frame)               // removes all children
clearLegacyFrames(outer)           // removes FRAME children, keeps INSTANCE (Doc/Default)
ensureDocPanel(outer, props)       // creates Doc/Default at index 0 if missing
resolveColor(raw, modeId)          // resolves VARIABLE_ALIAS chains to rgba
findCssVariable(cssName)           // finds local variable by CSS name (e.g. '--ui-bg-background')
placeFrame(frame)                  // scrolls viewport to frame
```

---

## Modules

### Colours (src/colours.js)
Generates `Doc/Colour` (VERTICAL wrapper, 1504px, 16px gap) containing:
- **Primitives** — DocCol: Doc/Default + DocRows of DocWrap swatch groups
- **Themes** — DocCol: Doc/Default + DocCol of mode columns
- **Gradients** — DocCol: Doc/Default + DocWrap of gradient cards (580px)
- **Effects** — DocCol: Doc/Default + DocWrap of effect cards (580px)

Source: `figma.variables.getLocalVariableCollections()` + `figma.getLocalPaintStyles()` + `figma.getLocalEffectStyles()`

### Typography (src/typography.js)
Generates `Doc/Typography` (VERTICAL wrapper, 1504px, 16px gap) containing one DocCol per group (Primary, Secondary, Misc):
- Doc/Default with font family + weights in Slots/Typography
- DocRows of type style cards (Misc uses DocWrap at 580px instead)

Source: `figma.getLocalTextStyles()`

### Grid (src/grid.js)
Generates `Doc/Grid` (VERTICAL wrapper, 1504px, 16px gap) containing one DocCol per breakpoint:
- Doc/Default with Slots/Grid (columns/margin/gutter) + Slots/Other
- GridFrame: HORIZONTAL auto-layout, padding=margin, gap=gutter, Column01..ColumnNN rects at 50% opacity bound to `--col-semantic-red`

Source: `figma.getLocalGridStyles()` (named layout guide styles, not frame scanning)

Breakpoint display widths: Mob=360px, Tab=768px, Desk+Wide=fill (layoutGrow=1)
Background bound to `--ui-bg-background` variable, falls back to white.

Breakpoint config (all editable at top of grid.js):
- `GRID_BP_LABELS`, `GRID_BP_RANGES`, `GRID_BP_WIDTHS`, `GRID_BP_PURPOSES`

### Documentation (src/documentation.js)

**Apply component styling** (`styleSelectedFrames`)
Applies to selected COMPONENT_SET, COMPONENT, FRAME or GROUP:
- Fill: `rgba(138, 56, 245, 0.15)` purple tint
- Stroke: `#8A38F5` dashed (1px, dash 10, gap 5)
- Corner radius: 12px
- Layout: VERTICAL auto-layout, padding 32px all, gap 10px, hug both axes

**Set icon size variant** (`applyIconSize`)
Maps selected instance/component pixel width to Size variant:
- 8px → `xs`, 12px → `sm`, 16px → `md`, 20px → `lg`, 24px → `xl`
- On instances: `setProperties({ 'Size': value })`
- On component variants: renames variant string (e.g. `Size=md`)

Size map is `ICON_SIZE_MAP` array at top of documentation.js — edit per project.

---

## Plugin UI (ui.html)
Two tabs: **Style sheet** | **Documentation**
- Style sheet: lists Colours/Typography/Grid with Generate/Update buttons + Generate all footer
- Documentation: live selection display (updates on `selectionchange`) + action cards

Window: 380×480px. Generate all button hidden on Documentation tab.

UI → plugin messages:
- `build` + `id` — build single item
- `build-all` + `ids[]` — build all stylesheet items sequentially
- `style-frames` — apply component styling to selection
- `apply-icon-size` — set Size variant from pixel dimensions

Plugin → UI messages:
- `init` + `items[]` + `version` — startup
- `progress` + `name` — sub-item progress during build
- `done` (+ `all: true` for build-all) — completed
- `error` + `message` — failure
- `selection` + `items[]` — canvas selection changed
- `style-done` + `count` — styling applied
- `size-done` + `updated` + `skipped` — icon sizing applied

---

## Critical Figma API rules
1. **`resize()` before setting sizing modes** — setting `primaryAxisSizingMode = 'AUTO'` then calling `resize()` will lock the height. Always `resize()` first.
2. **`clearLegacyFrames()` before `getOrCreateSubFrame()`** — prevents duplicate content frames on update runs.
3. **No non-ASCII characters** — Figma's plugin sandbox rejects any char above ASCII 127. No em dashes, no box drawing chars, no emojis in JS source.
4. **No template literals (backticks)** — not supported in the plugin sandbox.
5. **No optional chaining (`?.`)** — not supported.
6. **`figma.variables.getLocalVariables()`** — only returns variables from the current file. External library variables (e.g. Core library) are not accessible.
7. **`ensureDocPanel` checks `outer.children[0]` directly** — never use `findOne` for this as it recurses into card instances and gives false positives.

## Figma file references
- **Tyngre Internal** (primary): `hOfLNXG93QJ7u9VCWLrfMU`
- **E-commerce Project Template**: `MujvgwKyQhwTmHgpTAL4DW`
- **Core Third Party Library**: `vFbBIGOebhZjJmt4blVwLi`

---

## Planned / not yet built
- **Static handover** — select icon component set → generates Doc/Default + wrapped grid of variant instances with names (stripped of `Icon/` prefix) above each
- **Component/Module/Page doc types** — slot presets per type, placed next to selected component on canvas
- Frame naming convention for MCP: `Doc -- [ComponentName]`
- Slots not yet wired: `Slots/Interaction`, `Slots/Datapoints`, `Slots/TapTarget`, `Slots/Animation`
