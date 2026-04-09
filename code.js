// Grebbans Handover — code.js v3.2

var VERSION = '3.2';
var FRAME_W = 1164; // outer frame fixed width

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
  // Count styles
  var effectStyles = figma.variables ? figma.getLocalEffectStyles() : [];
  var paintStyles = figma.getLocalPaintStyles ? figma.getLocalPaintStyles() : [];
  var gradientCount = paintStyles.filter(function(s) {
    return s.paints && s.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; });
  }).length;
  var textStyles = figma.getLocalTextStyles ? figma.getLocalTextStyles() : [];
  var hasStyles = (effectStyles.length + gradientCount) > 0;
  var hasTypography = textStyles.length > 0;
  var typographyCount = textStyles.length;
  var styleCount = effectStyles.length + gradientCount;

  // Check if any frames already exist on current page
  var existingFrames = figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && summary.some(function(c) { return n.name === c.name; });
  });
  var hasExisting = existingFrames.length > 0;
  var existingNames = existingFrames.map(function(f) { return f.name; });

  figma.ui.postMessage({ type: 'collections', data: summary, version: VERSION, hasExisting: hasExisting, existingNames: existingNames, hasStyles: hasStyles, styleCount: styleCount, hasTypography: hasTypography, typographyCount: typographyCount });
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
    if (msg.collectionIds && msg.collectionIds.length > 0) {
      try { buildAll(msg.collectionIds); }
      catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    }
    if (msg.buildStyles) {
      try { buildStylesFrame(); }
      catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    }
    if (msg.buildTypography) {
      try { buildTypography(); }
      catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    }
    if (msg.buildStyleTest) {
      try { await buildStyleTest(); }
      catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    }
    if (msg.buildComponentTest) {
      try { await buildComponentTest(); }
      catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    }
    if (msg.buildColourCardTest) {
      try { await buildColourCardTest(); }
      catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    }
    if (msg.updatePrimitives) {
      try { await updatePrimitivesFrame(); }
      catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    }
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
    if (!col) continue;
    figma.ui.postMessage({ type: 'progress', step: ci, total: collectionIds.length, name: col.name });
    if (colCount === 0) outer.name = col.name;
    if (isSemantic(col)) buildThemes(outer, col);
    else buildPrimitives(outer, col);
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
  // Always add checkerboard base for transparency visibility
  var checker = figma.createRectangle();
  checker.name = 'Checker'; checker.cornerRadius = 2;
  checker.resize(18, 18); checker.x = 4; checker.y = 4;
  checker.fills = [{ type: 'SOLID', color: { r:0.85, g:0.85, b:0.85 } }];
  so.appendChild(checker);
  try {
    var bf = figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(token.variableId));
    si.fills = [bf];
  } catch(e) {
    si.fills = [colorFill];
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

  var t = makeText(label, 16, 0, 0, 0, 1);
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
  sep.resize(10, 8);
  sep.layoutAlign = 'STRETCH';
  parent.appendChild(sep);
}

// Semantic name card — token name only, no swatch, fixed 40px height
function buildThemeNameCard(cssName, primary) {
  var card = figma.createFrame();
  card.name = 'Colou';
  card.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: primary ? 0.8 : 0.3 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = 16;
  card.paddingTop = card.paddingBottom = 0;
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'FIXED';
  card.counterAxisAlignItems = 'CENTER';
  card.layoutAlign = 'STRETCH';
  card.resize(10, 40);

  var t = makeText(cssName, 12, 0, 0, 0, 1);
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  card.appendChild(t);

  return card;
}

// Mode card — swatch + primitive name, fixed 40px height
function buildThemeModeCard(variable, res, primary) {
  var card = figma.createFrame();
  card.name = 'Colou';
  card.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: primary ? 0.8 : 0.3 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = 16;
  card.paddingTop = card.paddingBottom = 0;
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'FIXED';
  card.counterAxisAlignItems = 'CENTER';
  card.layoutAlign = 'STRETCH';
  card.resize(10, 40);

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
  so.strokeWeight = 1; so.cornerRadius = 3;
  so.resize(16, 16);
  so.layoutAlign = 'INHERIT'; so.layoutGrow = 0;
  card.appendChild(so);

  var si = figma.createRectangle();
  si.name = 'Color'; si.cornerRadius = 2;
  si.resize(10, 10); si.x = 3; si.y = 3;
  var hasAlpha = res.rgba.a < 0.99;
  var colorFill = { type: 'SOLID', color: { r: res.rgba.r, g: res.rgba.g, b: res.rgba.b }, opacity: res.rgba.a };
  // Always add checkerboard base
  var checker2 = figma.createRectangle();
  checker2.name = 'Checker'; checker2.cornerRadius = 2;
  checker2.resize(10, 10); checker2.x = 3; checker2.y = 3;
  checker2.fills = [{ type: 'SOLID', color: { r:0.85, g:0.85, b:0.85 } }];
  so.appendChild(checker2);
  try {
    var bf = figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(variable.id));
    si.fills = [bf];
  } catch(e) {
    si.fills = [colorFill];
  }
  so.appendChild(si);

  // Primitive name
  var primName = res.aliasName
    ? '--' + res.aliasName.replace(/\//g,'-').toLowerCase()
    : toHex(res.rgba.r, res.rgba.g, res.rgba.b);
  var pt = makeText(primName, 12, 0, 0, 0, 1);
  pt.layoutGrow = 1;
  pt.textAutoResize = 'HEIGHT';
  pt.layoutAlign = 'INHERIT';
  card.appendChild(pt);

  return card;
}


// ══════════════════════════════════════════════════════════════════════════════
// STYLES FRAME — gradients + effects as separate frame
// ══════════════════════════════════════════════════════════════════════════════
function buildStylesFrame() {
  // Remove existing styles frame
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === 'Effects & Gradients';
  }).forEach(function(f) { f.remove(); });

  var effectStyles = figma.getLocalEffectStyles();
  var paintStyles  = figma.getLocalPaintStyles();

  // Group paint styles (gradients) by first path segment
  var groups = {}, groupOrder = [];

  for (var j = 0; j < paintStyles.length; j++) {
    var ps = paintStyles[j];
    var isGradient = ps.paints && ps.paints.some(function(p) {
      return p.type.indexOf('GRADIENT') !== -1;
    });
    if (!isGradient) continue;
    var pparts = ps.name.split('/');
    var pgKey = pparts.length > 1 ? pparts[0] : 'Gradients';
    if (!groups[pgKey]) { groups[pgKey] = { label: pgKey, items: [] }; groupOrder.push(pgKey); }
    groups[pgKey].items.push({
      kind: 'gradient',
      style: ps,
      groupName: pparts.length > 1 ? pparts[1] : '',
      dirName: pparts[pparts.length - 1]
    });
  }

  // Group effect styles by first path segment
  for (var i = 0; i < effectStyles.length; i++) {
    var es = effectStyles[i];
    if (!es.effects || es.effects.length === 0) continue;
    var eparts = es.name.split('/');
    var egKey = eparts[0];
    if (!groups[egKey]) { groups[egKey] = { label: egKey, items: [] }; groupOrder.push(egKey); }
    groups[egKey].items.push({
      kind: 'effect',
      style: es,
      groupName: eparts.length > 1 ? eparts[1] : '',
      dirName: eparts[eparts.length - 1]
    });
  }

  if (groupOrder.length === 0) return;

  // Outer frame: column, 16px gap, 1164px fixed, hug height
  var outer = figma.createFrame();
  outer.name = 'Effects & Gradients';
  outer.fills = [];
  outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 16;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'FIXED';
  outer.resize(FRAME_W, 100);

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var g = groups[groupOrder[gi]];

    // VaribleGroup: column, 12px gap
    var gf = figma.createFrame();
    gf.name = 'VaribleGroup';
    gf.fills = [];
    gf.layoutMode = 'VERTICAL';
    gf.itemSpacing = 12;
    gf.primaryAxisSizingMode = 'AUTO';
    gf.counterAxisSizingMode = 'FIXED';
    gf.layoutAlign = 'STRETCH';
    outer.appendChild(gf);

    // Group name header
    var gnc = figma.createFrame();
    gnc.name = 'GroupNameContainer';
    gnc.fills = [];
    gnc.layoutMode = 'HORIZONTAL';
    gnc.itemSpacing = 4;
    gnc.counterAxisAlignItems = 'CENTER';
    gnc.primaryAxisSizingMode = 'AUTO';
    gnc.counterAxisSizingMode = 'AUTO';
    gnc.layoutAlign = 'STRETCH';
    gf.appendChild(gnc);

    var lbl = makeText(g.label, 16, 0, 0, 0, 1);
    lbl.textAutoResize = 'WIDTH_AND_HEIGHT';
    gnc.appendChild(lbl);

    // Cards wrap: row wrap, fill, 4px gap
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

    for (var ii = 0; ii < g.items.length; ii++) {
      var item = g.items[ii];
      var card = item.kind === 'gradient'
        ? buildStyleGradientCard(item)
        : buildStyleEffectCard(item);
      vf.appendChild(card);
    }
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

// Gradient card — exact match to node 11709-16882
function buildStyleGradientCard(item) {
  // Card: 288px fixed, row, center, 12px gap, 16px padding, rgba(255,255,255,0.8), 20px radius
  var card = figma.createFrame();
  card.name = 'Varible';
  card.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: 0.8 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.counterAxisAlignItems = 'CENTER';
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO'; // hug height
  card.clipsContent = false;
  card.resize(288, 84); // height will expand to fit content

  // Swatch outer: 52×52, COLUMN layout, 4px padding, rgba(0,0,0,0.5) stroke, 4px radius
  var so = figma.createFrame();
  so.name = 'Color';
  so.layoutMode = 'VERTICAL';
  so.primaryAxisAlignItems = 'SPACE_BETWEEN';
  // so.counterAxisAlignItems — MIN is default, no STRETCH needed
  so.paddingLeft = so.paddingRight = so.paddingTop = so.paddingBottom = 4;
  so.itemSpacing = 6;
  so.fills = [];
  so.strokes = [{ type: 'SOLID', color: { r:0, g:0, b:0 }, opacity: 0.5 }];
  so.strokeWeight = 1; so.cornerRadius = 4;
  so.primaryAxisSizingMode = 'FIXED';
  so.counterAxisSizingMode = 'FIXED';
  so.resize(52, 52);
  so.layoutAlign = 'INHERIT'; so.layoutGrow = 0;
  card.appendChild(so);

  // BG-img: fill × fill inside padding (44×44 effectively)
  var checker = figma.createFrame();
  checker.name = 'BG-img';
  checker.fills = [{ type: 'SOLID', color: { r:0.851, g:0.851, b:0.851 } }];
  checker.layoutMode = 'NONE';
  checker.cornerRadius = 2;
  checker.layoutAlign = 'STRETCH';
  checker.layoutGrow = 1;
  so.appendChild(checker);

  // Gradient Color: absolute positioned at (4, 4), 44×44
  var gradRect = figma.createFrame();
  gradRect.name = 'Color';
  gradRect.layoutMode = 'NONE';
  gradRect.cornerRadius = 2;
  gradRect.resize(44, 44);
  try { gradRect.fills = item.style.paints; }
  catch(e) { gradRect.fills = [{ type: 'SOLID', color: { r:0.8, g:0.8, b:0.8 } }]; }
  so.appendChild(gradRect); // append first, then set absolute
  gradRect.layoutPositioning = 'ABSOLUTE';
  gradRect.x = 4; gradRect.y = 4;

  // NameHex: column, center, stretch, 8px gap, fill width
  var nh = figma.createFrame();
  nh.name = 'NameHex'; nh.fills = [];
  nh.layoutMode = 'VERTICAL';
  nh.itemSpacing = 8;
  nh.primaryAxisSizingMode = 'AUTO';
  nh.counterAxisSizingMode = 'FIXED';
  nh.primaryAxisAlignItems = 'CENTER';
  nh.layoutGrow = 1; nh.layoutAlign = 'STRETCH';
  card.appendChild(nh);

  // GradientName: column, stretch, 4px gap
  var gn = figma.createFrame();
  gn.name = 'GradientName'; gn.fills = [];
  gn.layoutMode = 'VERTICAL'; gn.itemSpacing = 0;
  gn.primaryAxisSizingMode = 'AUTO';
  gn.counterAxisSizingMode = 'FIXED';
  gn.layoutAlign = 'STRETCH';
  nh.appendChild(gn);

  // Group name: NONE layout, fill width, 50% opacity
  if (item.groupName) {
    var grpT = makeText(item.groupName, 12, 0, 0, 0, 0.5);
    grpT.layoutAlign = 'STRETCH';
    grpT.textAutoResize = 'HEIGHT';
    gn.appendChild(grpT);
  }

  // Direction name: NONE layout, fill width, black
  var dirT = makeText(item.dirName, 12, 0, 0, 0, 1);
  dirT.layoutAlign = 'STRETCH';
  dirT.textAutoResize = 'HEIGHT';
  gn.appendChild(dirT);

  // Variable names: NONE layout, fill width, 50% opacity
  var varNames = getGradientVarNames(item.style);
  if (varNames) {
    var varT = makeText(varNames, 12, 0, 0, 0, 0.5);
    varT.letterSpacing = { value: -1, unit: 'PERCENT' };
    varT.layoutAlign = 'STRETCH';
    varT.textAutoResize = 'HEIGHT';
    nh.appendChild(varT);
  }

  return card;
}

// Effect card: circle preview with effect applied
function buildStyleEffectCard(item) {
  var card = figma.createFrame();
  card.name = 'Varible';
  card.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: 0.8 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.counterAxisAlignItems = 'CENTER';
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO'; // hug height
  card.clipsContent = false;
  card.resize(288, 84); // height will expand to fit content
  card.layoutAlign = 'INHERIT';

  // Preview circle
  var preview = figma.createEllipse();
  preview.name = 'Preview';
  preview.resize(44, 44);
  preview.fills = [{ type: 'SOLID', color: { r:0.9, g:0.9, b:0.9 } }];
  try { preview.effects = item.style.effects; } catch(e) {}
  preview.layoutAlign = 'INHERIT';
  preview.layoutGrow = 0;
  card.appendChild(preview);

  // Text col
  var nh = figma.createFrame();
  nh.name = 'NameHex'; nh.fills = [];
  nh.layoutMode = 'VERTICAL';
  nh.itemSpacing = 8;
  nh.primaryAxisSizingMode = 'AUTO';
  nh.counterAxisSizingMode = 'FIXED';
  nh.primaryAxisAlignItems = 'CENTER';
  nh.layoutGrow = 1;
  nh.layoutAlign = 'STRETCH';
  card.appendChild(nh);

  if (item.groupName) {
    var grpT = makeText(item.groupName, 12, 0, 0, 0, 0.5);
    grpT.textAutoResize = 'WIDTH_AND_HEIGHT';
    nh.appendChild(grpT);
  }

  var nameT = makeText(item.dirName, 12, 0, 0, 0, 1);
  nameT.textAutoResize = 'WIDTH_AND_HEIGHT';
  nh.appendChild(nameT);

  var cssVal = effectToCss(item.style.effects);
  if (cssVal) {
    var cssT = makeText(cssVal, 10, 0, 0, 0, 0.5);
    cssT.letterSpacing = { value: -1, unit: 'PERCENT' };
    cssT.layoutAlign = 'STRETCH';
    cssT.textAutoResize = 'HEIGHT';
    nh.appendChild(cssT);
  }

  return card;
}

function getGradientVarNames(paintStyle) {
  // Try to extract colour stop variable names if bound
  var names = [];
  try {
    var paints = paintStyle.paints;
    for (var i = 0; i < paints.length; i++) {
      var p = paints[i];
      if (p.gradientStops) {
        for (var s = 0; s < p.gradientStops.length; s++) {
          var stop = p.gradientStops[s];
          if (stop.boundVariables && stop.boundVariables.color) {
            var v = figma.variables.getVariableById(stop.boundVariables.color.id);
            if (v) names.push('--' + v.name.replace(/\//g,'-').toLowerCase());
          }
        }
      }
    }
  } catch(e) {}
  return names.length ? names.join('\n') : null;
}

function effectToCss(effects) {
  var parts = [];
  for (var i = 0; i < effects.length; i++) {
    var e = effects[i];
    if (!e.visible) continue;
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      var c = e.color;
      var inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
      var rgba = 'rgba(' + Math.round(c.r*255) + ',' + Math.round(c.g*255) + ',' + Math.round(c.b*255) + ',' + Math.round(c.a*100)/100 + ')';
      parts.push(inset + e.offset.x + 'px ' + e.offset.y + 'px ' + e.radius + 'px ' + rgba);
    } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
      parts.push('blur(' + e.radius + 'px)');
    }
  }
  return parts.join(', ');
}

// ══════════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY — local text styles grouped by path prefix
// ══════════════════════════════════════════════════════════════════════════════
function buildTypography() {
  // Remove existing
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === 'Typography';
  }).forEach(function(f) { f.remove(); });

  var textStyles = figma.getLocalTextStyles();
  if (!textStyles.length) return;

  // Group by first path segment
  var groups = {}, groupOrder = [];
  for (var i = 0; i < textStyles.length; i++) {
    var s = textStyles[i];
    var parts = s.name.split('/');
    var gKey = parts[0];
    if (!groups[gKey]) { groups[gKey] = { styles: [] }; groupOrder.push(gKey); }
    groups[gKey].styles.push(s);
  }

  // Outer: column, 16px gap, 1164px fixed
  var outer = figma.createFrame();
  outer.name = 'Typography';
  outer.fills = [];
  outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 16;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'FIXED';
  outer.resize(FRAME_W, 100);

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var gKey = groupOrder[gi];
    var g = groups[gKey];

    // Section row: doc panel + styles column
    var secRow = figma.createFrame();
    secRow.name = gKey;
    secRow.fills = [];
    secRow.layoutMode = 'HORIZONTAL';
    secRow.itemSpacing = 16;
    secRow.primaryAxisSizingMode = 'FIXED';
    secRow.counterAxisSizingMode = 'AUTO';
    secRow.layoutAlign = 'STRETCH';
    outer.appendChild(secRow);

    // ── Doc panel (320px, #272727) ────────────────────────────────────────
    var doc = figma.createFrame();
    doc.name = 'Doc';
    doc.fills = [{ type: 'SOLID', color: { r:0.153, g:0.153, b:0.153 } }];
    doc.cornerRadius = 20;
    doc.effects = [{ type:'INNER_SHADOW', color:{r:1,g:1,b:1,a:0.05}, offset:{x:0,y:0}, radius:4, spread:1, visible:true, blendMode:'NORMAL' }];
    doc.layoutMode = 'VERTICAL';
    doc.itemSpacing = 0;
    doc.paddingLeft = doc.paddingRight = doc.paddingTop = doc.paddingBottom = 16;
    doc.primaryAxisSizingMode = 'AUTO';
    doc.counterAxisSizingMode = 'FIXED';
    doc.resize(320, 100);
    doc.layoutAlign = 'STRETCH';
    secRow.appendChild(doc);

    // Header: "Typography" (70% white) + group name (white)
    var hdr = figma.createFrame();
    hdr.name = 'Header'; hdr.fills = [];
    hdr.layoutMode = 'VERTICAL'; hdr.itemSpacing = 0;
    hdr.paddingBottom = 16;
    hdr.primaryAxisSizingMode = 'AUTO';
    hdr.counterAxisSizingMode = 'FIXED'; hdr.layoutAlign = 'STRETCH';
    doc.appendChild(hdr);

    var epicT = makeText('Typography', 16, 1, 1, 1, 0.7);
    epicT.layoutAlign = 'STRETCH'; epicT.textAutoResize = 'HEIGHT';
    hdr.appendChild(epicT);

    var instT = makeText(gKey, 16, 1, 1, 1, 1);
    instT.layoutAlign = 'STRETCH'; instT.textAutoResize = 'HEIGHT';
    hdr.appendChild(instT);

    // Options: font family row
    var opts = figma.createFrame();
    opts.name = 'Options'; opts.fills = [];
    opts.strokes = [{ type:'SOLID', color:{r:1,g:1,b:1}, opacity:0.2 }];
    opts.strokeWeight = 0.5; opts.strokeTopWeight = 0.5;
    opts.strokeBottomWeight = 0; opts.strokeLeftWeight = 0; opts.strokeRightWeight = 0;
    opts.layoutMode = 'VERTICAL'; opts.itemSpacing = 2;
    opts.paddingTop = opts.paddingBottom = 12;
    opts.primaryAxisSizingMode = 'AUTO';
    opts.counterAxisSizingMode = 'FIXED'; opts.layoutAlign = 'STRETCH';
    doc.appendChild(opts);

    // Get font family from first style in group
    var fontFamily = g.styles[0].fontName ? g.styles[0].fontName.family : '—';

    buildDocRow(opts, 'Font family', fontFamily);
    buildDocRow(opts, 'Text transform', 'Regular + Italic');

    // ── TextStyles column (fill) ──────────────────────────────────────────
    var stylesCol = figma.createFrame();
    stylesCol.name = 'TextStyles'; stylesCol.fills = [];
    stylesCol.layoutMode = 'VERTICAL'; stylesCol.itemSpacing = 16;
    stylesCol.primaryAxisSizingMode = 'AUTO';
    stylesCol.counterAxisSizingMode = 'FIXED';
    stylesCol.layoutGrow = 1; stylesCol.layoutAlign = 'INHERIT';
    secRow.appendChild(stylesCol);

    for (var si = 0; si < g.styles.length; si++) {
      stylesCol.appendChild(buildTypographyCard(g.styles[si], gKey));
    }
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

function buildDocRow(parent, label, value) {
  var row = figma.createFrame();
  row.name = 'DataRow'; row.fills = [{ type:'SOLID', color:{r:1,g:1,b:1}, opacity:0.05 }];
  row.cornerRadius = 4;
  row.layoutMode = 'HORIZONTAL';
  row.paddingLeft = row.paddingTop = row.paddingBottom = 4;
  row.paddingRight = 16;
  row.primaryAxisSizingMode = 'FIXED';
  row.counterAxisSizingMode = 'AUTO';
  row.layoutAlign = 'STRETCH';
  parent.appendChild(row);

  var labelT = makeText(label, 10, 1, 1, 1, 0.7);
  labelT.textAutoResize = 'HEIGHT';
  labelT.resize(68, 16);
  row.appendChild(labelT);

  var valT = makeText(value, 10, 1, 1, 1, 1);
  valT.layoutGrow = 1; valT.layoutAlign = 'STRETCH'; valT.textAutoResize = 'HEIGHT';
  row.appendChild(valT);
}

function buildTypographyCard(style, group) {
  // Card: fill width, row, 16px gap, 16px padding, rgba(255,255,255,0.8), 20px radius
  var card = figma.createFrame();
  card.name = style.name;
  card.fills = [{ type:'SOLID', color:{r:1,g:1,b:1}, opacity:0.8 }];
  card.strokes = [{ type:'SOLID', color:{r:1,g:1,b:1}, opacity:0.8 }];
  card.strokeWeight = 1;
  card.cornerRadius = 20;
  card.effects = [{ type:'INNER_SHADOW', color:{r:0,g:0,b:0,a:0.05}, offset:{x:0,y:0}, radius:4, spread:1, visible:true, blendMode:'NORMAL' }];
  card.layoutMode = 'HORIZONTAL';
  card.itemSpacing = 16;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.counterAxisAlignItems = 'CENTER';
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO';
  card.layoutAlign = 'STRETCH';

  // StyleSettings: 288px fixed, row wrap, 2px gap — 4 data pills
  var settings = figma.createFrame();
  settings.name = 'StyleSettings'; settings.fills = [];
  settings.layoutMode = 'HORIZONTAL'; settings.layoutWrap = 'WRAP';
  settings.itemSpacing = 2; settings.counterAxisSpacing = 2;
  settings.primaryAxisSizingMode = 'FIXED'; settings.counterAxisSizingMode = 'AUTO';
  settings.resize(288, 10);
  card.appendChild(settings);

  // 4 spec pills
  var fs = Math.round(style.fontSize) + 'px';
  var lh = style.lineHeight && style.lineHeight.unit === 'PERCENT'
    ? Math.round(style.lineHeight.value) + '%'
    : style.lineHeight && style.lineHeight.unit === 'PIXELS'
    ? Math.round(style.lineHeight.value) + 'px' : '—';
  var wt = style.fontName ? style.fontName.style : 'Regular';
  var ls = style.letterSpacing && style.letterSpacing.unit === 'PERCENT'
    ? Math.round(style.letterSpacing.value) + '%'
    : style.letterSpacing && style.letterSpacing.unit === 'PIXELS'
    ? style.letterSpacing.value + 'px' : '0';

  buildSpecPill(settings, 'Font-size', fs);
  buildSpecPill(settings, 'Line-height', lh);
  buildSpecPill(settings, 'Weight', wt);
  buildSpecPill(settings, 'Letter-spacing', ls);

  // TextStyle preview: fill, text with style applied
  var preview = figma.createText();
  preview.name = 'TextStyle';
  preview.layoutAlign = 'INHERIT'; preview.layoutGrow = 1;
  preview.textAutoResize = 'HEIGHT';

  // Sample text based on font size
  var sample = style.fontSize >= 20
    ? 'Primary\nSecond line'
    : group.toLowerCase().includes('misc') || style.fontSize <= 16
    ? 'Button text'
    : 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

  // Try applying the text style
  try {
    // Load the font first
    var fontName = style.fontName || { family: 'Inter', style: 'Regular' };
    preview.fontName = { family: fontName.family, style: fontName.style };
  } catch(e) {
    try { preview.fontName = { family: 'Inter', style: 'Regular' }; } catch(e2) {}
  }
  preview.characters = sample;
  try { preview.textStyleId = style.id; } catch(e) {
    preview.fontSize = style.fontSize;
  }
  preview.fills = [{ type:'SOLID', color:{r:0,g:0,b:0} }];
  card.appendChild(preview);

  return card;
}

function buildSpecPill(parent, label, value) {
  // Pill: 143px fixed, row, 4px gap, 4px padding, rgba(0,0,0,0.05), 4px radius
  var pill = figma.createFrame();
  pill.name = label; pill.fills = [{ type:'SOLID', color:{r:0,g:0,b:0}, opacity:0.05 }];
  pill.cornerRadius = 4;
  pill.layoutMode = 'HORIZONTAL'; pill.itemSpacing = 4;
  pill.paddingLeft = pill.paddingRight = pill.paddingTop = pill.paddingBottom = 4;
  pill.primaryAxisSizingMode = 'FIXED'; pill.counterAxisSizingMode = 'AUTO';
  pill.resize(143, 10);
  parent.appendChild(pill);

  var lT = makeText(label, 10, 0, 0, 0, 0.5);
  lT.textAutoResize = 'WIDTH_AND_HEIGHT';
  pill.appendChild(lT);

  var vT = makeText(value, 10, 0, 0, 0, 1);
  vT.textAutoResize = 'WIDTH_AND_HEIGHT';
  pill.appendChild(vT);
}


// ══════════════════════════════════════════════════════════════════════════════
// MINI TEST — importStyleByKeyAsync
// Tests if library text styles can be applied to generated text nodes
// ══════════════════════════════════════════════════════════════════════════════
async function buildStyleTest() {
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Style Test';
  }).forEach(function(f) { f.remove(); });

  var outer = figma.createFrame();
  outer.name = '◈ Style Test';
  outer.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
  outer.cornerRadius = 20;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 16;
  outer.paddingLeft = outer.paddingRight = outer.paddingTop = outer.paddingBottom = 24;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'AUTO';

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  var results = [];
  var importedStyle = null;

  // ── Attempt 1: getAvailableSharedStylesAsync (requires teamlibrary permission) ──
  try {
    var sharedStyles = await figma.teamLibrary.getAvailableSharedStylesAsync('TEXT');
    results.push('✓ teamLibrary API works — found ' + sharedStyles.length + ' shared text styles');

    // Find 📋 Handover/12_100
    var target = null;
    for (var i = 0; i < sharedStyles.length; i++) {
      results.push('  · ' + sharedStyles[i].name + ' [' + sharedStyles[i].key + ']');
      if (sharedStyles[i].name === '📋 Handover/12_100') target = sharedStyles[i];
    }

    if (target) {
      results.push('');
      results.push('✓ Found target style: ' + target.name);
      results.push('  key: ' + target.key);

      // Import and apply
      try {
        importedStyle = await figma.importStyleByKeyAsync(target.key);
        results.push('✓ importStyleByKeyAsync succeeded!');
        results.push('  id: ' + importedStyle.id);

        // Create "Hello it might work" with this style
        await figma.loadFontAsync(importedStyle.fontName);
        var hello = figma.createText();
        hello.fontName = importedStyle.fontName;
        hello.characters = 'Hello it might work!';
        hello.textStyleId = importedStyle.id;
        hello.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        hello.textAutoResize = 'WIDTH_AND_HEIGHT';
        outer.appendChild(hello);

        results.push('✓ Text node created with library style applied!');
        results.push('  Check the text node — it should show "📋 Handover/12_100" in the panel');
      } catch(e) {
        results.push('✗ importStyleByKeyAsync failed: ' + String(e));
      }
    } else {
      results.push('✗ 📋 Handover/12_100 not found in shared styles');
    }
  } catch(e) {
    results.push('✗ teamLibrary API failed: ' + String(e));
    results.push('  → Check manifest.json has "teamlibrary" permission');
  }

  // ── Report ──────────────────────────────────────────────────────────────
  for (var ri = 0; ri < results.length; ri++) {
    var rt = figma.createText();
    try { rt.fontName = { family: 'Inter', style: 'Regular' }; } catch(e) {}
    rt.fontSize = 11;
    rt.characters = results[ri] || ' ';
    rt.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    rt.textAutoResize = 'WIDTH_AND_HEIGHT';
    outer.appendChild(rt);
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}


// ══════════════════════════════════════════════════════════════════════════════
// MINI TEST — component instance via importComponentByKeyAsync
// ══════════════════════════════════════════════════════════════════════════════
// Component + slot keys from Core + Third Party Library
// All component keys from Core + Third Party Library
var KEYS = {
  docModule:       '8df1ea68f02f91062978acb1ccbab2cec2e92171', // 📋 Doc/Module State=Default
  sectionOther:    'eb7778ad03fc3564e5b9c25cdeae1743a5233402', // Handover/Section/Other
  sectionOption:   'fcd2f3c2808271c76d581b54e0cea7679c9fee3d', // Handover/Section/Option
  colourPrimitive: '0f4a992b74f79d0754a10487640c165f040cf6be', // 📋 Doc/Colour Type=Primitive
};
// Section title property name (found from mini test)
var SECTION_TITLE_PROP = 'Section title#134:20';

async function buildComponentTest() {
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Component Test';
  }).forEach(function(f) { f.remove(); });

  var outer = figma.createFrame();
  outer.name = '◈ Component Test';
  outer.fills = [];
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 16;
  outer.paddingLeft = outer.paddingRight = outer.paddingTop = outer.paddingBottom = 24;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'AUTO';
  outer.clipsContent = false;

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  var log = [];

  try {
    // Step 1: Import and create Doc/Module instance
    log.push('Step 1: Importing 📋 Doc/Module...');
    var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
    var docInstance = docComp.createInstance();
    docInstance.name = 'Test Doc Panel';
    outer.appendChild(docInstance);
    log.push('✓ Doc/Module instance created');

    // Step 2: Import Handover/Section/Other
    log.push('');
    log.push('Step 2: Importing Handover/Section/Other...');
    var secComp = await figma.importComponentByKeyAsync(KEYS.sectionOther);
    log.push('✓ Section/Other component found: ' + secComp.name);

    // Step 3: Find the slot inside the Doc/Module instance
    log.push('');
    log.push('Step 3: Looking for slot layer inside instance...');
    var slotLayer = docInstance.findOne(function(n) {
      return n.name === 'Sections' || n.name === 'Slot' || n.name.toLowerCase().includes('slot');
    });
    log.push(slotLayer ? '✓ Found slot layer: "' + slotLayer.name + '"' : '✗ No slot layer found by name');

    // Step 4: Try appending a Section/Other instance into the slot
    log.push('');
    log.push('Step 4: Appending Section/Other into slot...');
    var secInstance = secComp.createInstance();
    try {
      if (slotLayer) {
        slotLayer.appendChild(secInstance);
        log.push('✓ appendChild to slot layer succeeded!');
      } else {
        // Try appending directly to the doc instance
        docInstance.appendChild(secInstance);
        log.push('✓ appendChild to doc instance directly');
      }

      // Step 5: Set text on the section
      log.push('');
      log.push('Step 5: Setting section text properties...');
      var secProps = secInstance.componentProperties;
      var secPropNames = Object.keys(secProps);
      log.push('Section properties: ' + secPropNames.join(', '));
      var setProps = {};
      secPropNames.forEach(function(n) {
        if (n.startsWith('Label')) setProps[n] = 'Test label';
        if (n.startsWith('Bullet') || n.startsWith('Content')) setProps[n] = 'This content was set by the plugin!';
      });
      if (Object.keys(setProps).length) {
        secInstance.setProperties(setProps);
        log.push('✓ Section text set!');
      }
    } catch(e) {
      log.push('✗ appendChild failed: ' + String(e));
    }

  } catch(e) {
    log.push('✗ Failed: ' + String(e));
    log.push('  → Is Core + Third Party Library enabled?');
  }

  // Log output
  for (var ri = 0; ri < log.length; ri++) {
    var t = figma.createText();
    try { t.fontName = { family: 'Inter', style: 'Regular' }; } catch(e) {}
    t.fontSize = 11;
    t.characters = log[ri] || ' ';
    t.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    t.textAutoResize = 'WIDTH_AND_HEIGHT';
    outer.appendChild(t);
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}


// ══════════════════════════════════════════════════════════════════════════════
// MINI TEST — one colour card instance using 📋 Doc/Colour component
// Only renders first group of first primitive collection
// ══════════════════════════════════════════════════════════════════════════════
async function buildColourCardTest() {
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Colour Card Test';
  }).forEach(function(f) { f.remove(); });

  var outer = figma.createFrame();
  outer.name = '◈ Colour Card Test';
  outer.fills = [];
  outer.layoutMode = 'HORIZONTAL';
  outer.layoutWrap = 'WRAP';
  outer.itemSpacing = 4;
  outer.counterAxisSpacing = 4;
  outer.primaryAxisSizingMode = 'FIXED';
  outer.counterAxisSizingMode = 'AUTO';
  outer.resize(FRAME_W, 100);
  outer.clipsContent = false;

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  try {
    // Import the colour card component
    var colComp = await figma.importComponentByKeyAsync(KEYS.colourPrimitive);

    // Get first primitive collection, first group of tokens
    var collections = figma.variables.getLocalVariableCollections();
    var primCol = null;
    for (var ci = 0; ci < collections.length; ci++) {
      if (!isSemantic(collections[ci])) { primCol = collections[ci]; break; }
    }
    if (!primCol) throw new Error('No primitive collection found');

    var modeId = primCol.defaultModeId;
    var count = 0;
    var MAX = 8; // just first 8 tokens for the test

    for (var vi = 0; vi < primCol.variableIds.length && count < MAX; vi++) {
      var v = figma.variables.getVariableById(primCol.variableIds[vi]);
      if (!v || v.resolvedType !== 'COLOR') continue;

      var raw = v.valuesByMode[modeId] || v.valuesByMode[Object.keys(v.valuesByMode)[0]];
      var res = raw ? resolveColor(raw, modeId) : null;
      if (!res) continue;

      var hasAlpha = res.rgba.a < 0.99;
      var cssName = '--' + v.name.replace(/\//g, '-').toLowerCase();
      var hexVal = toHex(res.rgba.r, res.rgba.g, res.rgba.b);
      var alphaVal = Math.round(res.rgba.a * 100) + '%';

      // Create instance
      var inst = colComp.createInstance();
      outer.appendChild(inst);

      // Set text nodes
      try {
        var nameNode = inst.findOne(function(n) { return n.name === 'VariantName'; });
        var hexNode  = inst.findOne(function(n) { return n.name === 'Hex'; });
        var opNode   = inst.findOne(function(n) { return n.name === 'Opacity'; });

        if (nameNode) nameNode.characters = cssName;
        if (hexNode)  hexNode.characters  = hexVal;
        if (opNode) {
          if (hasAlpha) {
            opNode.characters = alphaVal;
            opNode.visible = true;
          } else {
            opNode.visible = false;
          }
        }
      } catch(e) { /* text set failed, keep defaults */ }

      // Bind colour variable to the Colour fill frame
      try {
        var colourFrame = inst.findOne(function(n) { return n.name === 'Colour'; });
        if (colourFrame) {
          var colorFill = { type: 'SOLID', color: { r: res.rgba.r, g: res.rgba.g, b: res.rgba.b }, opacity: res.rgba.a };
          var bf = figma.variables.setBoundVariableForPaint(colorFill, 'color', v);
          colourFrame.fills = [bf];
        }
      } catch(e) { /* variable bind failed */ }

      count++;
    }

  } catch(e) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    var errT = figma.createText();
    try { errT.fontName = { family: 'Inter', style: 'Regular' }; } catch(e2) {}
    errT.fontSize = 12;
    errT.characters = 'Error: ' + String(e);
    errT.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    errT.textAutoResize = 'WIDTH_AND_HEIGHT';
    outer.appendChild(errT);
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}


// ══════════════════════════════════════════════════════════════════════════════
// UPDATE PRIMITIVES — targets 📋 Doc/Colour/Primitives inside the stylesheet
// Clears Primitives child, rebuilds with 📋 Doc/Colour component instances
// ══════════════════════════════════════════════════════════════════════════════
async function updatePrimitivesFrame() {
  // Find the stylesheet section
  var section = figma.currentPage.findOne(function(n) {
    return n.type === 'SECTION' && n.name.indexOf('Style sheet') !== -1;
  });
  if (!section) throw new Error('Could not find Style sheet section on this page');

  // Navigate: Colours/Themes → 📋 Doc/Primitives → 📋 Doc/Colour/Primitives → Primitives
  var coloursFrame = section.findOne(function(n) { return n.name === 'Colours/Themes'; });
  if (!coloursFrame) throw new Error('Could not find Colours/Themes frame');

  var docPrimitives = coloursFrame.findOne(function(n) { return n.name === '📋 Doc/Primitives'; });
  if (!docPrimitives) throw new Error('Could not find 📋 Doc/Primitives frame');

  var colourPrimitivesFrame = docPrimitives.findOne(function(n) { return n.name === '📋 Doc/Colour/Primitives'; });
  if (!colourPrimitivesFrame) throw new Error('Could not find 📋 Doc/Colour/Primitives frame');

  // Find the Primitives content frame (NOT the Doc/Module instance)
  var primitivesContent = colourPrimitivesFrame.findOne(function(n) {
    return n.name === 'Primitives' && n.type === 'FRAME';
  });
  if (!primitivesContent) throw new Error('Could not find Primitives content frame');

  // Clear existing content
  while (primitivesContent.children.length > 0) {
    primitivesContent.children[primitivesContent.children.length - 1].remove();
  }

  // Import the 📋 Doc/Colour component
  var colComp = await figma.importComponentByKeyAsync(KEYS.colourPrimitive);

  // Get primitive collections
  var collections = figma.variables.getLocalVariableCollections();
  var primCol = null;
  for (var ci = 0; ci < collections.length; ci++) {
    if (!isSemantic(collections[ci])) { primCol = collections[ci]; break; }
  }
  if (!primCol) throw new Error('No primitive collection found');

  var modeId = primCol.defaultModeId;

  // Group tokens by top 2 path segments
  var groups = {}, groupOrder = [];
  for (var vi = 0; vi < primCol.variableIds.length; vi++) {
    var v = figma.variables.getVariableById(primCol.variableIds[vi]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var raw = v.valuesByMode[modeId] || v.valuesByMode[Object.keys(v.valuesByMode)[0]];
    var res = raw ? resolveColor(raw, modeId) : null;
    if (!res) continue;

    var parts = v.name.split('/');
    var gKey = parts.length > 1 ? parts.slice(0,2).join('/') : '__root__';
    var gParts = parts.length > 1 ? parts.slice(0,2) : [primCol.name];
    if (!groups[gKey]) { groups[gKey] = { parts: gParts, tokens: [] }; groupOrder.push(gKey); }
    groups[gKey].tokens.push({
      cssName: '--' + v.name.replace(/\//g, '-').toLowerCase(),
      variable: v,
      hex: toHex(res.rgba.r, res.rgba.g, res.rgba.b),
      alpha: Math.round(res.rgba.a * 100) / 100
    });
  }

  // Build one VaribleGroup per group
  for (var gi = 0; gi < groupOrder.length; gi++) {
    var g = groups[groupOrder[gi]];

    // VaribleGroup: column, 12px gap, fill
    var gf = figma.createFrame();
    gf.name = 'VaribleGroup';
    gf.fills = [];
    gf.layoutMode = 'VERTICAL';
    gf.itemSpacing = 12;
    gf.primaryAxisSizingMode = 'AUTO';
    gf.counterAxisSizingMode = 'FIXED';
    gf.layoutAlign = 'STRETCH';
    primitivesContent.appendChild(gf);

    // Group name label
    var gnc = figma.createFrame();
    gnc.name = 'GroupNameContainer';
    gnc.fills = [];
    gnc.layoutMode = 'HORIZONTAL';
    gnc.itemSpacing = 4;
    gnc.primaryAxisSizingMode = 'AUTO';
    gnc.counterAxisSizingMode = 'AUTO';
    gf.appendChild(gnc);

    for (var pi = 0; pi < g.parts.length; pi++) {
      var pt = makeText(g.parts[pi], 16, 0, 0, 0, 1);
      pt.textAutoResize = 'WIDTH_AND_HEIGHT';
      gnc.appendChild(pt);
      if (pi < g.parts.length - 1) {
        var sep = makeText('/', 16, 0, 0, 0, 1);
        sep.textAutoResize = 'WIDTH_AND_HEIGHT';
        gnc.appendChild(sep);
      }
    }

    // Varibles wrap: row, wrap, fill, 4px gap
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

    // One 📋 Doc/Colour instance per token
    for (var ti = 0; ti < g.tokens.length; ti++) {
      var token = g.tokens[ti];
      var inst = colComp.createInstance();
      vf.appendChild(inst);

      var hasAlpha = token.alpha < 0.99;

      // Set text nodes
      try {
        var nameNode = inst.findOne(function(n) { return n.name === 'VariantName'; });
        var hexNode  = inst.findOne(function(n) { return n.name === 'Hex'; });
        var opNode   = inst.findOne(function(n) { return n.name === 'Opacity'; });
        if (nameNode) nameNode.characters = token.cssName;
        if (hexNode)  hexNode.characters  = token.hex;
        if (opNode) {
          opNode.visible = hasAlpha;
          if (hasAlpha) opNode.characters = Math.round(token.alpha * 100) + '%';
        }
      } catch(e) {}

      // Bind colour variable to Colour fill frame
      try {
        var colourFrame = inst.findOne(function(n) { return n.name === 'Colour'; });
        if (colourFrame) {
          var colorFill = { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: token.alpha };
          var bf = figma.variables.setBoundVariableForPaint(colorFill, 'color', token.variable);
          colourFrame.fills = [bf];
        }
      } catch(e) {}
    }
  }

  figma.viewport.scrollAndZoomIntoView([colourPrimitivesFrame]);
}
