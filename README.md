# Figma Handover

A Figma plugin for Grebban's e-commerce template projects. Auto-generates style sheet documentation frames (Colours, Typography, Grid) and component handover frames directly on the Figma canvas, so design tokens and component specs can be read by Claude MCP without manual JSON exports.

---

## For designers — install the plugin

The plugin is not published to the Figma Community. To use it, install it locally from this repo. You only need **read access** to the repo — no GitHub write permission required.

### Requirements

- **Figma desktop app** (Mac or Windows). Local plugins do not work in the browser.
- **Git** installed on your machine. If you don't have it, the easiest way on Mac is to run `xcode-select --install` in Terminal.

### One-time setup

1. **Clone the repo** to a folder you'll keep long-term (don't put it in Downloads — you'll need to pull updates from it).

   Open Terminal (Mac) or Git Bash (Windows) and run:

   ```
   cd ~/code              # or wherever you keep code
   git clone https://github.com/grebban/figma-handover-plugin.git
   ```

   If the folder `~/code` doesn't exist, run `mkdir ~/code` first.

2. **Open the Figma desktop app** and open any Figma file.

3. **Import the plugin**:
   - Click the Figma menu (top-left) → **Plugins** → **Development** → **Import plugin from manifest…**
   - In the file picker, navigate to the folder you just cloned (`figma-handover-plugin`) and select **`manifest.json`**.

4. Done. The plugin now appears under **Plugins → Development → Figma Handover** in every Figma file you open.

### Running the plugin

In any Figma file: **Plugins → Development → Figma Handover**. The plugin window opens with two tabs:

- **Style sheet** — generates `Doc/Colour`, `Doc/Typography`, and `Doc/Grid` frames from the file's local variables and styles. Use **Generate all** the first time, then **Update** individual items as the design system changes.
- **Documentation** — per-component actions. Select a component/frame on canvas first, then click the action. Currently supports:
  - **Apply component styling** — adds the purple dashed wrapper (fill, stroke, padding, auto-layout) used on handover frames.
  - **Set icon size variant** — reads the selected instance or variant's pixel width and sets `Size=xs/sm/md/lg/xl` accordingly (8/12/16/20/24px).

### Updating the plugin

When the plugin gets new features or fixes, pull the latest code:

```
cd ~/code/figma-handover-plugin
git pull
```

No re-import needed in Figma. The next time you run the plugin, it picks up the new code automatically.

### Troubleshooting

- **"Import plugin from manifest" is greyed out** — you're in the Figma browser app. Switch to the desktop app.
- **Plugin doesn't appear after import** — close and reopen the Figma desktop app once.
- **"manifest.json not found"** — you selected the wrong folder. The file lives at the top level of the cloned repo, not inside `src/`.
- **Nothing happens when I click Generate** — the file has no local variables or styles defined yet. The plugin reads from `Local variables` and `Local styles` on the current file.
- **Permission error on `git clone`** — you need to be a member of the Grebban GitHub org with read access to this repo. Ask an admin to add you.

---

## For developers

Source lives in `src/`. Figma loads the built `code.js` at the repo root — **never edit `code.js` directly**.

```
node build.js   # concatenates src/*.js into code.js
```

Build order is defined in `build.js`. After every change in `src/`, run `node build.js` before committing so the built output stays in sync.

### File structure

```
figma-handover-plugin/
├── src/
│   ├── config.js         constants: VERSION, FRAME_W, CONTENT_W, KEYS
│   ├── helpers.js        shared utils: frame helpers, colour utils, layout configs
│   ├── colours.js        Colours module (Primitives, Themes, Gradients, Effects)
│   ├── typography.js     Typography module
│   ├── grid.js           Grid module + breakpoint config
│   ├── documentation.js  Documentation tab actions
│   └── main.js           init(), message handler, router
├── build.js              concatenation script
├── code.js               AUTO-GENERATED — do not edit
├── ui.html               plugin UI
├── manifest.json         Figma plugin manifest
└── package.json          version only
```

### Figma sandbox constraints

The Figma plugin sandbox is strict. When editing `src/`:

- No non-ASCII characters in JS source (no em dashes, box drawing, emojis)
- No template literals (backticks)
- No optional chaining (`?.`)
- `resize()` must be called **before** setting `primaryAxisSizingMode` / `counterAxisSizingMode`
- `figma.variables.getLocalVariables()` only returns variables from the current file — external library variables are not accessible
