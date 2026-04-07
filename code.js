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
