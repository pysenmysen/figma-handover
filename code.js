// Grebbans Handover — code.js v1.1

var VERSION = '1.1';

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
  if (msg.type === 'build') { await buildFrame(msg.collectionIds); figma.ui.postMessage({ type: 'done' }); }
  if (msg.type === 'close') figma.closePlugin();
};

// ─── Resolve alias ─────────────────────────────────────────────────────────────
function resolveColor(rawVal, preferredModeId) {
  var val = rawVal;
  var aliasName = null;
  var depth = 0;
  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;
    if (aliasName === null) aliasName = ref.name;
    var refCol = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    var fallback = refCol ? refCol.defaultModeId : null;
    val = ref.valuesByMode[preferredModeId]
       || (fallback ? ref.valuesByMode[fallback] : null)
       || ref.valuesByMode[Object.keys(ref.valuesByMode)[0]];
  }
  if (val && typeof val === 'object' && 'r' in val) return { rgba: val, aliasName: aliasName };
  return null;
}

function isSemantic(col) {
  var modeId = col.defaultModeId;
  var aliasCount = 0, total = 0;
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    total++;
    var raw = v.valuesByMode[modeId];
    if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') aliasCount++;
  }
  return total > 0 && aliasCount / total > 0.5;
}

// ─── Font — load Inter first (guaranteed), then try Neue Haas ─────────────────
var F = 'Inter';

async function loadFonts() {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  F = 'Inter';
}

function T(chars, size, r, g, b, a, align) {
  var t = figma.createText();
  try { t.fontName = { family: F, style: F === 'Neue Haas Grotesk Display Pro' ? 'Roman' : 'Regular' }; }
  catch(e) { t.fontName = { family: 'Inter', style: 'Regular' }; }
  t.fontSize = size;
  t.characters = String(chars);
  var fill = { type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 } };
  if (a !== undefined && a < 1) fill.opacity = a;
  t.fills = [fill];
  if (align) t.textAlignHorizontal = align;
  return t;
}

function S(r, g, b, a) {
  var f = { type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 } };
  if (a !== undefined && a < 1) f.opacity = a;
  return f;
}

function hex(r, g, b) {
  return '#' + [r,g,b].map(function(n){ return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase(); }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function buildFrame(collectionIds) {
  await loadFonts();

  // Remove existing
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Grebbans / Colours';
  }).forEach(function(f) { f.remove(); });

  // Outer: column, 16px gap, hug — matches layout_PTBTB3 exactly
  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / Colours';
  outer.fills = [];
  outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 16;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'AUTO';

  for (var ci = 0; ci < collectionIds.length; ci++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[ci]);
    if (!col || isSemantic(col)) continue;
    figma.ui.postMessage({ type: 'progress', step: ci, total: collectionIds.length, name: col.name });
    buildPrimitives(outer, col);
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES — matches node 205-4312 exactly
// ══════════════════════════════════════════════════════════════════════════════
function buildPrimitives(outer, col) {
  // Group tokens by variable path prefix
  var groups = {}, order = [];
  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;
    var modeId = col.defaultModeId;
    var raw = variable.valuesByMode[modeId];
    if (!raw) { var ks = Object.keys(variable.valuesByMode); if(ks.length) raw = variable.valuesByMode[ks[0]]; }
    var res = raw ? resolveColor(raw, modeId) : null;
    if (!res) continue;

    var parts = variable.name.split('/');
    var gKey = parts.length > 1 ? parts.slice(0, -1).join('/') : '__root__';
    if (!groups[gKey]) { groups[gKey] = { parts: parts.length > 1 ? parts.slice(0,-1) : [], tokens: [] }; order.push(gKey); }
    groups[gKey].tokens.push({
      name: '--' + variable.name.replace(/\//g, '-').toLowerCase(),
      fullName: variable.name, variableId: variable.id,
      r: res.rgba.r, g: res.rgba.g, b: res.rgba.b, a: res.rgba.a
    });
  }

  for (var gi = 0; gi < order.length; gi++) {
    var g = groups[order[gi]];

    // VaribleGroup: column, stretch, 12px gap — layout_IJU49J
    var gf = figma.createFrame();
    gf.name = 'VaribleGroup';
    gf.fills = [];
    gf.layoutMode = 'VERTICAL';
    gf.itemSpacing = 12;
    gf.primaryAxisSizingMode = 'AUTO';
    gf.counterAxisSizingMode = 'AUTO';
    gf.layoutAlign = 'STRETCH';
    outer.appendChild(gf);

    // GroupNameContainer: row, center, 4px gap — layout_AHNISF
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

    // Group name parts (hug each, rgba(0,0,0,0.5))
    var nameParts = g.parts.length > 0 ? g.parts : [col.name];
    for (var pi = 0; pi < nameParts.length; pi++) {
      var pt = T(nameParts[pi], 16, 0, 0, 0, 0.5);
      pt.textAutoResize = 'WIDTH_AND_HEIGHT';
      gnc.appendChild(pt);
      if (pi < nameParts.length - 1) {
        var sep = T('/', 16, 0, 0, 0, 0.5);
        sep.textAutoResize = 'WIDTH_AND_HEIGHT';
        gnc.appendChild(sep);
      }
    }

    // Varibles: row, wrap, 4px gap, fill — layout_J5WQF1
    var vf = figma.createFrame();
    vf.name = 'Varibles';
    vf.fills = [];
    vf.layoutMode = 'HORIZONTAL';
    vf.layoutWrap = 'WRAP';
    vf.itemSpacing = 4;
    vf.primaryAxisSizingMode = 'AUTO';
    vf.counterAxisSizingMode = 'AUTO';
    vf.layoutAlign = 'STRETCH';
    gf.appendChild(vf);

    for (var ti = 0; ti < g.tokens.length; ti++) {
      vf.appendChild(makeCard(g.tokens[ti]));
    }
  }
}

function makeCard(token) {
  var hasAlpha = token.a < 0.99;

  // Varible: 229.6px fixed, row, wrap, 12px gap, 16px pad, rgba(255,255,255,0.8), 20px radius — layout_SIJG82
  var card = figma.createFrame();
  card.name = 'Varible';
  card.fills = [S(1, 1, 1, 0.8)];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.layoutWrap = 'WRAP';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO';
  card.counterAxisAlignItems = 'CENTER';
  card.resize(229.6, 58);

  // Color outer: 26×26, 4px pad, rgba(0,0,0,0.5) stroke, 4px radius — layout_THLYSZ
  var so = figma.createFrame();
  so.name = 'Color'; so.fills = [];
  so.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 0.5 } }];
  so.strokeWeight = 1;
  so.cornerRadius = 4;
  so.layoutMode = 'VERTICAL';
  so.primaryAxisAlignItems = 'SPACE_BETWEEN';
  so.counterAxisAlignItems = 'STRETCH';
  so.paddingLeft = so.paddingRight = so.paddingTop = so.paddingBottom = 4;
  so.primaryAxisSizingMode = 'FIXED';
  so.counterAxisSizingMode = 'FIXED';
  so.resize(26, 26);
  so.layoutAlign = 'INHERIT'; so.layoutGrow = 0;
  card.appendChild(so);

  // Color inner: fill, 2px radius, variable binding — layout_N06V5G
  var si = figma.createFrame();
  si.name = 'Color'; si.cornerRadius = 2;
  si.layoutAlign = 'STRETCH'; si.layoutGrow = 1;
  si.primaryAxisSizingMode = 'FIXED'; si.counterAxisSizingMode = 'FIXED';
  var colorFill = S(token.r, token.g, token.b, token.a);
  try {
    var bf = figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(token.variableId));
    si.fills = hasAlpha ? [S(0.85, 0.85, 0.85), bf] : [bf];
  } catch(e) {
    si.fills = hasAlpha ? [S(0.85, 0.85, 0.85), colorFill] : [colorFill];
  }
  so.appendChild(si);

  // NameHex: column, center, 8px gap, fill — layout_E739GH / layout_O6K7LL
  var nh = figma.createFrame();
  nh.name = 'NameHex'; nh.fills = [];
  nh.layoutMode = 'VERTICAL';
  nh.counterAxisAlignItems = 'STRETCH';
  nh.primaryAxisAlignItems = 'CENTER';
  nh.itemSpacing = 8;
  nh.primaryAxisSizingMode = 'AUTO';
  nh.counterAxisSizingMode = 'FIXED';
  nh.layoutGrow = 1; nh.layoutAlign = 'INHERIT';
  card.appendChild(nh);

  // Variable name — fill, 12px #000
  var nameT = T(token.name, 12, 0, 0, 0, 1);
  nameT.letterSpacing = { value: -1, unit: 'PERCENT' };
  nameT.layoutAlign = 'STRETCH'; nameT.textAutoResize = 'HEIGHT';
  nh.appendChild(nameT);

  var h = hex(token.r, token.g, token.b);

  if (hasAlpha) {
    // Hex+Opacity row: space-between — layout_MUQV50
    var hr = figma.createFrame();
    hr.name = 'Hex+Opacity'; hr.fills = [];
    hr.layoutMode = 'HORIZONTAL';
    hr.primaryAxisAlignItems = 'SPACE_BETWEEN';
    hr.itemSpacing = 8;
    hr.primaryAxisSizingMode = 'FIXED';
    hr.counterAxisSizingMode = 'AUTO';
    hr.layoutAlign = 'STRETCH';
    nh.appendChild(hr);

    var hexT = T(h, 12, 0, 0, 0, 0.5);
    hexT.letterSpacing = { value: -1, unit: 'PERCENT' };
    hexT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(hexT);

    var alphaT = T(Math.round(token.a * 100) + '%', 12, 0, 0, 0, 0.5);
    alphaT.letterSpacing = { value: -1, unit: 'PERCENT' };
    alphaT.textAlignHorizontal = 'RIGHT';
    alphaT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(alphaT);
  } else {
    // Just hex — hug — layout_N5VUGZ
    var hexT2 = T(h, 12, 0, 0, 0, 0.5);
    hexT2.letterSpacing = { value: -1, unit: 'PERCENT' };
    hexT2.textAutoResize = 'WIDTH_AND_HEIGHT';
    nh.appendChild(hexT2);
  }

  return card;
}
