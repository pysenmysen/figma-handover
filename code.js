// Grebbans Handover — code.js v3.2

var VERSION = '3.2';
var FRAME_W = 1504; // outer frame fixed width

figma.showUI(__html__, { width: 480, height: 560, themeColors: true });

(async function init() {
  var collections = figma.variables.getLocalVariableCollections();
  var summary = collections.map(function(col) {
    var colorCount = 0;
    for (var i = 0; i < col.variableIds.length; i++) {
      var v = figma.variables.getVariableById(col.variableIds[i]);
      if (v && v.resolvedType === 'COLOR') colorCount++;
    }
    return { id: col.id, name: col.name, colorCount: colorCount,
      modes: col.modes.map(function(m) { return { id: m.modeId, name: m.name }; }) };
  }).filter(function(c) { return c.colorCount > 0; });
  figma.ui.postMessage({ type: 'collections', data: summary, version: VERSION });
})();

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'build') {
    // Try Neue Haas Grotesk Display Pro (Grebban brand font)
    // Weight 450 = Roman in Neue Haas. Try each style with timeout.
    var fontLoaded = false;
    var nhStyles = ['Regular', 'Roman', '55 Roman', '45 Light'];
    for (var fi = 0; fi < nhStyles.length; fi++) {
      try {
        await Promise.race([
          figma.loadFontAsync({ family: 'Neue Haas Grotesk Display Pro', style: nhStyles[fi] }),
          new Promise(function(_, r) { setTimeout(r, 1500); })
        ]);
        LOADED_FONT = { family: 'Neue Haas Grotesk Display Pro', style: nhStyles[fi] };
        fontLoaded = true;
        break;
      } catch(e) {}
    }
    // Fallback to Inter
    if (!fontLoaded) {
      try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); LOADED_FONT = { family: 'Inter', style: 'Regular' }; } catch(e) {}
    }
    // Find text styles from library
    findTextStyles();
    // Find and load font-family variable
    var fontInfo = findFontVariable();
    if (fontInfo) {
      FONT_VAR = fontInfo.variable;
      try {
        await Promise.race([
          figma.loadFontAsync({ family: fontInfo.family, style: 'Regular' }),
          new Promise(function(_, r) { setTimeout(r, 2000); })
        ]);
      } catch(e) {}
    }
    try { buildAll(msg.collectionIds); }
    catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    figma.ui.postMessage({ type: 'done' });
  }
  if (msg.type === 'close') figma.closePlugin();
};

// ─── Resolve alias ─────────────────────────────────────────────────────────────
function resolveColor(raw, modeId) {
  var val = raw, aliasName = null, depth = 0;
  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;
    if (!aliasName) aliasName = ref.name;
    var rc = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    var def = rc ? rc.defaultModeId : null;
    var keys = Object.keys(ref.valuesByMode);
    val = ref.valuesByMode[modeId] || (def ? ref.valuesByMode[def] : null) || (keys.length ? ref.valuesByMode[keys[0]] : null);
  }
  return (val && typeof val === 'object' && 'r' in val) ? { rgba: val, aliasName: aliasName } : null;
}

// ─── Find font-family string variable ─────────────────────────────────────────
var FONT_VAR = null;
var LOADED_FONT = { family: "Inter", style: "Regular" };

// Text styles from Core + Third Party Library
var STYLE_12 = null;  // 📋 Handover/12_100 — 12px / 100% lh
var STYLE_16 = null;  // 📋 Handover/16_110 — 16px / 110% lh

function findTextStyles() {
  var styles = figma.getLocalTextStyles();
  for (var i = 0; i < styles.length; i++) {
    var s = styles[i];
    if (s.name === '📋 Handover/12_100') STYLE_12 = s.id;
    if (s.name === '📋 Handover/16_110') STYLE_16 = s.id;
  }
}

function findFontVariable() {
  var collections = figma.variables.getLocalVariableCollections();
  for (var ci = 0; ci < collections.length; ci++) {
    var col = collections[ci];
    for (var vi = 0; vi < col.variableIds.length; vi++) {
      var v = figma.variables.getVariableById(col.variableIds[vi]);
      if (v && v.resolvedType === 'STRING') {
        var n = v.name.toLowerCase();
        if (n.includes('font') && n.includes('family')) {
          // Get the actual font family value
          var val = v.valuesByMode[col.defaultModeId];
          if (typeof val === 'string' && val.length > 0) {
            return { variable: v, family: val };
          }
        }
      }
    }
  }
  return null;
}

function isSemantic(col) {
  var modeId = col.defaultModeId, a = 0, t = 0;
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    t++;
    var raw = v.valuesByMode[modeId];
    if (raw && raw.type === 'VARIABLE_ALIAS') a++;
  }
  return t > 0 && a / t > 0.5;
}

function toHex(r, g, b) {
  return '#' + [r,g,b].map(function(n){ return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase(); }).join('');
}

function makeText(chars, size, r, g, b, a, rightAlign) {
  var t = figma.createText();
  try { t.fontName = LOADED_FONT; } catch(e) {
    try { t.fontName = { family: 'Inter', style: 'Regular' }; } catch(e2) {}
  }
  t.fontSize = size;
  // Exact specs from reference: -1% tracking, 121% line height
  t.letterSpacing = { value: -1, unit: 'PERCENT' };
  if (rightAlign) t.textAlignHorizontal = 'RIGHT';
  t.characters = String(chars);
  var fill = { type: 'SOLID', color: { r:r||0, g:g||0, b:b||0 } };
  if (a !== undefined && a < 1) fill.opacity = a;
  t.fills = [fill];
  return t;
}

// ══════════════════════════════════════════════════════════════════════════════
function buildAll(collectionIds) {
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Grebbans / Colours';
  }).forEach(function(f) { f.remove(); });

  // Outer: FIXED width, column, hug height
  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / Colours'; // updated per collection below
  outer.fills = [];
  outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 16;
  outer.paddingLeft = outer.paddingRight = outer.paddingTop = outer.paddingBottom = 0;
  outer.primaryAxisSizingMode = 'AUTO';  // hug height
  outer.counterAxisSizingMode = 'FIXED'; // fixed width
  outer.resize(FRAME_W, 100);            // height will auto-expand

  var colCount = 0;
  for (var ci = 0; ci < collectionIds.length; ci++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[ci]);
    if (!col || isSemantic(col)) continue;
    figma.ui.postMessage({ type: 'progress', step: ci, total: collectionIds.length, name: col.name });
    if (colCount === 0) outer.name = col.name;
    buildPrimitives(outer, col);
    colCount++;
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

// ══════════════════════════════════════════════════════════════════════════════
function buildPrimitives(outer, col) {
  var modeId = col.defaultModeId;
  var groups = {}, order = [];

  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var raw = v.valuesByMode[modeId] || v.valuesByMode[Object.keys(v.valuesByMode)[0]];
    var res = raw ? resolveColor(raw, modeId) : null;
    if (!res) continue;
    var parts = v.name.split('/');
    // Group by TOP-LEVEL path segment only (e.g. col/base/black → col/base)
    // This merges col/base and col/base/black into one group
    var gKey = parts.length > 1 ? parts.slice(0, 2).join('/') : '__root__';
    var gParts = parts.length > 1 ? parts.slice(0, 2) : [col.name];
    if (!groups[gKey]) {
      groups[gKey] = { parts: gParts, tokens: [] };
      order.push(gKey);
    }
    groups[gKey].tokens.push({
      cssName: '--' + v.name.replace(/\//g,'-').toLowerCase(),
      variableId: v.id,
      hex: toHex(res.rgba.r, res.rgba.g, res.rgba.b),
      alpha: Math.round(res.rgba.a * 100) / 100,
      r: res.rgba.r, g: res.rgba.g, b: res.rgba.b
    });
  }

  for (var gi = 0; gi < order.length; gi++) {
    var g = groups[order[gi]];
    var gf = figma.createFrame();
    gf.name = 'VaribleGroup';
    gf.fills = [];
    gf.layoutMode = 'VERTICAL';
    gf.itemSpacing = 12;
    gf.primaryAxisSizingMode = 'AUTO';
    gf.counterAxisSizingMode = 'FIXED'; // stretch to parent width
    gf.layoutAlign = 'STRETCH';
    outer.appendChild(gf);

    // Group name row
    var gnc = figma.createFrame();
    gnc.name = 'GroupNameContainer';
    gnc.fills = [];
    gnc.layoutMode = 'HORIZONTAL';
    gnc.itemSpacing = 4;
    gnc.counterAxisAlignItems = 'CENTER';
    gnc.primaryAxisSizingMode = 'AUTO';
    gnc.counterAxisSizingMode = 'AUTO';
    gf.appendChild(gnc);

    var nameParts = g.parts;
    for (var pi = 0; pi < nameParts.length; pi++) {
      var pt = makeText(nameParts[pi], 16, 0, 0, 0, 1);
      pt.textAutoResize = 'WIDTH_AND_HEIGHT';
      gnc.appendChild(pt);
      if (pi < nameParts.length - 1) {
        var sep = makeText('/', 16, 0, 0, 0, 1);
        sep.textAutoResize = 'WIDTH_AND_HEIGHT';
        gnc.appendChild(sep);
      }
    }

    // Cards wrap row — FIXED width = parent width, wraps cards
    var vf = figma.createFrame();
    vf.name = 'Varibles';
    vf.fills = [];
    vf.layoutMode = 'HORIZONTAL';
    vf.layoutWrap = 'WRAP';
    vf.itemSpacing = 4;
    vf.counterAxisSpacing = 4;
    vf.primaryAxisSizingMode = 'FIXED';
    vf.counterAxisSizingMode = 'AUTO';
    vf.layoutAlign = 'STRETCH';
    gf.appendChild(vf);

    for (var ti = 0; ti < g.tokens.length; ti++) {
      vf.appendChild(buildCard(g.tokens[ti]));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD: 229.6px wide, hug height, horizontal auto-layout
// ══════════════════════════════════════════════════════════════════════════════
function buildCard(token) {
  var hasAlpha = token.alpha < 0.99;

  // Card: FIXED width, HUG height
  var card = figma.createFrame();
  card.name = 'Varible';
  card.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: 0.8 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.counterAxisAlignItems = 'CENTER';
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO'; // hug height to content
  card.resize(229.6, 58);              // initial height, will hug

  // Swatch outer: 26×26 NONE layout
  var so = figma.createFrame();
  so.name = 'Color'; so.fills = [];
  so.layoutMode = 'NONE';
  so.strokes = [{ type: 'SOLID', color: { r:0, g:0, b:0 }, opacity: 0.5 }];
  so.strokeWeight = 1;
  so.cornerRadius = 4;
  so.resize(26, 26);
  so.layoutAlign = 'INHERIT';
  so.layoutGrow = 0;
  card.appendChild(so);

  // Swatch inner: rect 18×18 at (4,4)
  var si = figma.createRectangle();
  si.name = 'Color'; si.cornerRadius = 2;
  si.resize(18, 18); si.x = 4; si.y = 4;
  var colorFill = { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.alpha };
  try {
    var bf = figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(token.variableId));
    si.fills = hasAlpha ? [{ type: 'SOLID', color: { r:0.85, g:0.85, b:0.85 } }, bf] : [bf];
  } catch(e) {
    si.fills = hasAlpha ? [{ type: 'SOLID', color: { r:0.85, g:0.85, b:0.85 } }, colorFill] : [colorFill];
  }
  so.appendChild(si);

  // Name + hex column: fill remaining width
  var nh = figma.createFrame();
  nh.name = 'NameHex'; nh.fills = [];
  nh.layoutMode = 'VERTICAL';
  nh.itemSpacing = 6;
  nh.primaryAxisSizingMode = 'AUTO';
  nh.counterAxisSizingMode = 'FIXED';
  nh.primaryAxisAlignItems = 'CENTER';
  nh.layoutGrow = 1;
  nh.layoutAlign = 'STRETCH';
  card.appendChild(nh);

  var nameT = makeText(token.cssName, 12, 0, 0, 0, 1);
  nameT.letterSpacing = { value: -1, unit: 'PERCENT' };
  nameT.layoutAlign = 'STRETCH';
  nameT.textAutoResize = 'HEIGHT';
  nh.appendChild(nameT);

  if (hasAlpha) {
    var hr = figma.createFrame();
    hr.name = 'Hex+Opacity'; hr.fills = [];
    hr.layoutMode = 'HORIZONTAL';
    hr.primaryAxisAlignItems = 'SPACE_BETWEEN';
    hr.itemSpacing = 8;
    hr.primaryAxisSizingMode = 'FIXED';
    hr.counterAxisSizingMode = 'AUTO';
    hr.layoutAlign = 'STRETCH';
    nh.appendChild(hr);

    var hT = makeText(token.hex, 12, 0, 0, 0, 0.5);
    hT.letterSpacing = { value: -1, unit: 'PERCENT' };
    hT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(hT);

    var aT = makeText(Math.round(token.alpha * 100) + '%', 12, 0, 0, 0, 0.5, true);
    aT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(aT);
  } else {
    var hT2 = makeText(token.hex, 12, 0, 0, 0, 0.5);
    hT2.letterSpacing = { value: -1, unit: 'PERCENT' };
    hT2.textAutoResize = 'WIDTH_AND_HEIGHT';
    nh.appendChild(hT2);
  }

  return card;
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES — multi-mode collections
// Layout: semantic col | mode1 col | mode2 col | ...
// ══════════════════════════════════════════════════════════════════════════════
function buildThemes(outer, col) {
  var modes = col.modes;
  var modeId = col.defaultModeId;

  // Collect all tokens grouped by path prefix (top 2 segments)
  var groups = {}, groupOrder = [];
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var parts = v.name.split('/');
    var gKey = parts.length > 1 ? parts.slice(0,2).join('/') : '__root__';
    if (!groups[gKey]) { groups[gKey] = { tokens: [] }; groupOrder.push(gKey); }
    groups[gKey].tokens.push(v);
  }

  // Outer themes row: fill, horizontal, 4px gap
  var row = figma.createFrame();
  row.name = col.name;
  row.fills = [];
  row.clipsContent = false;
  row.layoutMode = 'HORIZONTAL';
  row.itemSpacing = 4;
  row.primaryAxisSizingMode = 'FIXED';
  row.counterAxisSizingMode = 'AUTO';
  row.layoutAlign = 'STRETCH';
  outer.appendChild(row);

  // Build one column per mode + semantic column
  // Cols: [semantic] [mode0] [mode1] ...
  var numCols = modes.length + 1;

  // ── Semantic column ──────────────────────────────────────────────────────
  var semCol = figma.createFrame();
  semCol.name = 'Semantic';
  semCol.fills = [];
  semCol.layoutMode = 'VERTICAL';
  semCol.itemSpacing = 4;
  semCol.primaryAxisSizingMode = 'AUTO';
  semCol.counterAxisSizingMode = 'FIXED';
  semCol.layoutGrow = 1;
  semCol.layoutAlign = 'INHERIT';
  row.appendChild(semCol);

  // Semantic header
  buildThemeHeader(semCol, 'Semantic');

  // Semantic rows grouped with separators
  for (var gi = 0; gi < groupOrder.length; gi++) {
    if (gi > 0) buildSeparator(semCol);
    var g = groups[groupOrder[gi]];
    for (var ti = 0; ti < g.tokens.length; ti++) {
      var v = g.tokens[ti];
      var parts = v.name.split('/');
      var cssName = '--' + v.name.replace(/\//g,'-').toLowerCase();
      var rowCard = buildThemeNameCard(cssName, ti % 2 === 0);
      semCol.appendChild(rowCard);
    }
  }

  // ── One column per mode ──────────────────────────────────────────────────
  for (var mi = 0; mi < modes.length; mi++) {
    var mode = modes[mi];
    var modeCol = figma.createFrame();
    modeCol.name = mode.name;
    modeCol.fills = [];
    modeCol.layoutMode = 'VERTICAL';
    modeCol.itemSpacing = 4;
    modeCol.primaryAxisSizingMode = 'AUTO';
    modeCol.counterAxisSizingMode = 'FIXED';
    modeCol.layoutGrow = 1;
    modeCol.layoutAlign = 'INHERIT';
    row.appendChild(modeCol);

    buildThemeHeader(modeCol, mode.name);

    for (var gi2 = 0; gi2 < groupOrder.length; gi2++) {
      if (gi2 > 0) buildSeparator(modeCol);
      var g2 = groups[groupOrder[gi2]];
      for (var ti2 = 0; ti2 < g2.tokens.length; ti2++) {
        var v2 = g2.tokens[ti2];
        var raw = v2.valuesByMode[mode.modeId];
        if (!raw) { var ks = Object.keys(v2.valuesByMode); if(ks.length) raw = v2.valuesByMode[ks[0]]; }
        var res = raw ? resolveColor(raw, mode.modeId) : null;
        var modeCard = buildThemeModeCard(v2, res, ti2 % 2 === 0);
        modeCol.appendChild(modeCard);
      }
    }
  }
}

function buildThemeHeader(parent, label) {
  var hdr = figma.createFrame();
  hdr.name = 'ThemeHeader';
  hdr.fills = [];
  hdr.layoutMode = 'HORIZONTAL';
  hdr.counterAxisAlignItems = 'CENTER';
  hdr.itemSpacing = 4;
  hdr.paddingBottom = 16;
  hdr.primaryAxisSizingMode = 'FIXED';
  hdr.counterAxisSizingMode = 'AUTO';
  hdr.layoutAlign = 'STRETCH';
  parent.appendChild(hdr);

  var t = makeText(label, 12, 0, 0, 0, 0.5);
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  hdr.appendChild(t);
}

function buildSeparator(parent) {
  var sep = figma.createFrame();
  sep.name = 'Seperator';
  sep.fills = [];
  sep.layoutMode = 'HORIZONTAL';
  sep.counterAxisAlignItems = 'CENTER';
  sep.itemSpacing = 4;
  sep.paddingBottom = 12;
  sep.primaryAxisSizingMode = 'FIXED';
  sep.counterAxisSizingMode = 'AUTO';
  sep.resize(10, 28);
  sep.layoutAlign = 'STRETCH';
  parent.appendChild(sep);
}

// Semantic name card — token name only, no swatch
function buildThemeNameCard(cssName, primary) {
  var card = figma.createFrame();
  card.name = 'Colou';
  card.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: primary ? 0.8 : 0.3 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.layoutWrap = 'WRAP';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = 16;
  card.paddingTop = card.paddingBottom = 12;
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO';
  card.counterAxisAlignItems = 'CENTER';
  card.layoutAlign = 'STRETCH';

  var t = makeText(cssName, 12, 0, 0, 0, 1);
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  card.appendChild(t);

  return card;
}

// Mode card — swatch + primitive name
function buildThemeModeCard(variable, res, primary) {
  var card = figma.createFrame();
  card.name = 'Colou';
  card.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: primary ? 0.8 : 0.3 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = 16;
  card.paddingTop = card.paddingBottom = 12;
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO';
  card.counterAxisAlignItems = 'CENTER';
  card.layoutAlign = 'STRETCH';

  if (!res) {
    var dash = makeText('—', 12, 0, 0, 0, 0.4);
    dash.textAutoResize = 'WIDTH_AND_HEIGHT';
    card.appendChild(dash);
    return card;
  }

  // Swatch 26×26
  var so = figma.createFrame();
  so.name = 'Color'; so.fills = [];
  so.layoutMode = 'NONE';
  so.strokes = [{ type: 'SOLID', color: { r:0, g:0, b:0 }, opacity: 0.5 }];
  so.strokeWeight = 1; so.cornerRadius = 4;
  so.resize(26, 26);
  so.layoutAlign = 'INHERIT'; so.layoutGrow = 0;
  card.appendChild(so);

  var si = figma.createRectangle();
  si.name = 'Color'; si.cornerRadius = 2;
  si.resize(18, 18); si.x = 4; si.y = 4;
  var hasAlpha = res.rgba.a < 0.99;
  var colorFill = { type: 'SOLID', color: { r: res.rgba.r, g: res.rgba.g, b: res.rgba.b }, opacity: res.rgba.a };
  try {
    var bf = figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(variable.id));
    si.fills = hasAlpha ? [{ type: 'SOLID', color: { r:0.85, g:0.85, b:0.85 } }, bf] : [bf];
  } catch(e) {
    si.fills = hasAlpha ? [{ type: 'SOLID', color: { r:0.85, g:0.85, b:0.85 } }, colorFill] : [colorFill];
  }
  so.appendChild(si);

  // Primitive name
  var primName = res.aliasName
    ? '--' + res.aliasName.replace(/\//g,'-').toLowerCase()
    : toHex(res.rgba.r, res.rgba.g, res.rgba.b);
  var pt = makeText(primName, 12, 0, 0, 0, 0.7);
  pt.layoutGrow = 1;
  pt.textAutoResize = 'HEIGHT';
  pt.layoutAlign = 'INHERIT';
  card.appendChild(pt);

  return card;
}
