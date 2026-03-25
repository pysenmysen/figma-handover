// Grebbans Handover — code.js v0.9

var VERSION = '0.9';

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

// ─── Resolve alias chain to actual RGBA ───────────────────────────────────────
// Key insight: we must walk the alias chain using EACH variable's OWN collection's
// default mode, not the caller's mode. Only the first hop needs the preferred mode.
function resolveColor(rawVal, preferredModeId) {
  var val = rawVal;
  var aliasName = null;
  var depth = 0;

  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;

    // Capture alias name on first hop
    if (aliasName === null) aliasName = ref.name;

    // Look up value: try preferred mode first, then all available modes
    var found = ref.valuesByMode[preferredModeId];

    // If not found with preferred mode, try the ref variable's own collection's default
    if (!found) {
      var refCol = figma.variables.getVariableCollectionById(ref.variableCollectionId);
      if (refCol) found = ref.valuesByMode[refCol.defaultModeId];
    }

    // If still not found, just take the first available mode
    if (!found) {
      var modeKeys = Object.keys(ref.valuesByMode);
      if (modeKeys.length > 0) found = ref.valuesByMode[modeKeys[0]];
    }

    val = found;
  }

  if (val && typeof val === 'object' && 'r' in val && 'g' in val && 'b' in val) {
    return { rgba: val, aliasName: aliasName };
  }
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

// ─── Font ──────────────────────────────────────────────────────────────────────
var FONT = 'Neue Haas Grotesk Display Pro';
var FONT_FB = 'Inter';
var F = FONT;

async function loadFonts() {
  // Load Inter as reliable fallback first, then try Neue Haas
  try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); F = 'Inter'; } catch(e) {}
  try { await figma.loadFontAsync({ family: FONT, style: 'Roman' }); F = FONT; return; } catch(e) {}
  try { await figma.loadFontAsync({ family: FONT, style: 'Regular' }); F = FONT; return; } catch(e) {}
}

function txt(chars, size, r, g, b, a) {
  var t = figma.createText();
  try { t.fontName = { family: F, style: 'Regular' }; } catch(e) { t.fontName = { family: 'Inter', style: 'Regular' }; }
  t.fontSize = size || 16;
  t.fills = [{ type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 }, opacity: (a !== undefined ? a : 1) }];
  t.characters = String(chars);
  return t;
}

function solid(r, g, b, a) {
  var f = { type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 } };
  if (a !== undefined && a < 1) f.opacity = a;
  return f;
}

function frame(name, mode, gap, padAll, primarySize, counterSize) {
  var f = figma.createFrame();
  f.name = name || 'frame';
  f.fills = [];
  f.layoutMode = mode || 'VERTICAL';
  if (gap !== undefined) f.itemSpacing = gap;
  if (padAll !== undefined) { f.paddingLeft = f.paddingRight = f.paddingTop = f.paddingBottom = padAll; }
  f.primaryAxisSizingMode = primarySize || 'AUTO';
  f.counterAxisSizingMode = counterSize || 'AUTO';
  return f;
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(function(n){ return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase(); }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function buildFrame(collectionIds) {
  await loadFonts();

  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Grebbans / Colours';
  }).forEach(function(f) { f.remove(); });

  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / Colours';
  outer.fills = [solid(1, 1, 1, 0.3)];
  outer.cornerRadius = 40;
  outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 80;
  outer.paddingLeft = outer.paddingRight = 80;
  outer.paddingTop = outer.paddingBottom = 80;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'FIXED';
  outer.resize(2000, 200);

  for (var ci = 0; ci < collectionIds.length; ci++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[ci]);
    if (!col) continue;
    figma.ui.postMessage({ type: 'progress', step: ci, total: collectionIds.length, name: col.name });

    if (isSemantic(col)) {
      buildThemes(outer, col);
    } else {
      buildPrimitives(outer, col);
    }
  }

  outer.primaryAxisSizingMode = 'AUTO';
  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════
function buildPrimitives(outer, col) {
  // Title
  var t = txt(col.name, 64, 0, 0, 0, 1);
  t.letterSpacing = { value: -1, unit: 'PERCENT' };
  t.layoutAlign = 'STRETCH'; t.textAutoResize = 'HEIGHT';
  outer.appendChild(t);

  // Groups container
  var gc = frame('groups', 'VERTICAL', 40, 0, 'AUTO', 'FIXED');
  gc.layoutAlign = 'STRETCH';
  outer.appendChild(gc);

  // Group by path prefix
  var groups = {}, order = [];
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var raw = v.valuesByMode[col.defaultModeId];
    var res = resolveColor(raw, col.defaultModeId);
    if (!res) continue;
    var parts = v.name.split('/');
    var gKey = parts.length > 1 ? parts.slice(0,-1).join('/') : '__root__';
    var gLabel = parts.length > 1 ? parts[parts.length-2] : col.name;
    gLabel = gLabel.charAt(0).toUpperCase() + gLabel.slice(1);
    if (!groups[gKey]) { groups[gKey] = { label: gLabel, tokens: [] }; order.push(gKey); }
    groups[gKey].tokens.push({
      name: '--' + v.name.replace(/\//g,'-').toLowerCase(),
      fullName: v.name, variableId: v.id,
      r: res.rgba.r, g: res.rgba.g, b: res.rgba.b, a: res.rgba.a
    });
  }

  for (var gi = 0; gi < order.length; gi++) {
    var g = groups[order[gi]];
    var row = frame(g.label, 'HORIZONTAL', 20, 0, 'AUTO', 'FIXED');
    row.layoutAlign = 'STRETCH';
    row.counterAxisAlignItems = 'MIN';
    gc.appendChild(row);

    // Label col (445px fixed)
    var lbl = txt(g.label, 32, 0, 0, 0, 0.5);
    lbl.resize(445, 40); lbl.textAutoResize = 'HEIGHT';
    lbl.layoutAlign = 'INHERIT'; lbl.layoutGrow = 0;
    row.appendChild(lbl);

    // Cards wrap
    var cw = frame('cards', 'HORIZONTAL', 8, 0, 'FIXED', 'AUTO');
    cw.layoutWrap = 'WRAP'; cw.counterAxisSpacing = 8;
    cw.layoutGrow = 1; cw.layoutAlign = 'INHERIT';
    row.appendChild(cw);

    for (var ti = 0; ti < g.tokens.length; ti++) {
      cw.appendChild(makeSwatchCard(g.tokens[ti]));
    }
  }
}

function makeSwatchCard(token) {
  // Card: 267.6px × hug, row, 16px gap, 16px pad
  var card = figma.createFrame();
  card.name = token.fullName;
  card.fills = [solid(1,1,1,1)];
  card.cornerRadius = 8;
  card.layoutMode = 'HORIZONTAL';
  card.itemSpacing = 16;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO';
  card.counterAxisAlignItems = 'CENTER';
  card.resize(267.6, 76);

  // Swatch outer: 44×44, 2.4px pad, 1px black stroke
  var so = figma.createFrame();
  so.name = 'Color'; so.fills = [];
  so.strokes = [{ type: 'SOLID', color: {r:0,g:0,b:0} }]; so.strokeWeight = 1;
  so.cornerRadius = 2.4;
  so.layoutMode = 'VERTICAL';
  so.paddingLeft = so.paddingRight = so.paddingTop = so.paddingBottom = 2.4;
  so.primaryAxisSizingMode = 'FIXED'; so.counterAxisSizingMode = 'FIXED';
  so.resize(44, 44);
  so.layoutAlign = 'INHERIT'; so.layoutGrow = 0;
  card.appendChild(so);

  // Swatch inner with variable binding
  var si = figma.createFrame();
  si.name = 'Color'; si.cornerRadius = 1;
  si.layoutAlign = 'STRETCH'; si.layoutGrow = 1;
  si.primaryAxisSizingMode = 'FIXED'; si.counterAxisSizingMode = 'FIXED';
  try {
    si.fills = [figma.variables.setBoundVariableForPaint(
      solid(token.r, token.g, token.b, token.a), 'color',
      figma.variables.getVariableById(token.variableId)
    )];
  } catch(e) { si.fills = [solid(token.r, token.g, token.b, token.a)]; }
  so.appendChild(si);

  // Text col
  var tc = frame('text', 'VERTICAL', 8, 0, 'AUTO', 'FIXED');
  tc.layoutGrow = 1; tc.layoutAlign = 'INHERIT';
  card.appendChild(tc);

  var nt = txt(token.name, 16, 0.1, 0.1, 0.1, 1);
  nt.letterSpacing = { value: -2, unit: 'PERCENT' };
  nt.layoutAlign = 'STRETCH'; nt.textAutoResize = 'HEIGHT';
  tc.appendChild(nt);

  // Hex + alpha
  var hr = frame('hex', 'HORIZONTAL', 0, 0, 'FIXED', 'AUTO');
  hr.primaryAxisAlignItems = 'SPACE_BETWEEN';
  hr.layoutAlign = 'STRETCH';
  tc.appendChild(hr);

  var hexT = txt('# ' + rgbToHex(token.r,token.g,token.b).replace('#',''), 16, 0.55,0.55,0.55,1);
  hexT.letterSpacing = { value: -2, unit: 'PERCENT' };
  hexT.textAutoResize = 'WIDTH_AND_HEIGHT';
  hr.appendChild(hexT);

  if (token.a < 1) {
    var at = txt(Math.round(token.a*100)+'%', 16, 0.55,0.55,0.55,1);
    at.textAlignHorizontal = 'RIGHT'; at.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(at);
  }

  return card;
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES
// ══════════════════════════════════════════════════════════════════════════════
function buildThemes(outer, col) {
  var modes = col.modes;

  // Title
  var t = txt(col.name, 64, 0, 0, 0, 1);
  t.letterSpacing = { value: -1, unit: 'PERCENT' };
  t.layoutAlign = 'STRETCH'; t.textAutoResize = 'HEIGHT';
  outer.appendChild(t);

  // Themes container
  var tc = frame('themes', 'VERTICAL', 40, 0, 'AUTO', 'FIXED');
  tc.layoutAlign = 'STRETCH';
  outer.appendChild(tc);

  // Header row (1840px fixed = 2000 - 80 - 80)
  var hdr = frame('headers', 'HORIZONTAL', 20, 0, 'FIXED', 'AUTO');
  hdr.resize(1840, 40);
  hdr.layoutAlign = 'STRETCH';
  tc.appendChild(hdr);

  // "Semantic" header (445px fixed)
  var sh = txt('Semantic', 32, 0.35,0.35,0.35,1);
  sh.resize(445, 36); sh.textAutoResize = 'HEIGHT';
  sh.layoutAlign = 'INHERIT'; sh.layoutGrow = 0;
  hdr.appendChild(sh);

  for (var mi = 0; mi < modes.length; mi++) {
    var mh = txt(modes[mi].name, 32, 0.35,0.35,0.35,1);
    mh.textAutoResize = 'WIDTH_AND_HEIGHT';
    mh.layoutAlign = 'INHERIT'; mh.layoutGrow = 1;
    hdr.appendChild(mh);
  }

  // Token rows
  var rowsCont = frame('rows', 'VERTICAL', 20, 0, 'AUTO', 'FIXED');
  rowsCont.layoutAlign = 'STRETCH';
  tc.appendChild(rowsCont);

  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;

    var vParts = variable.name.split('/');
    var tokenName = '--' + variable.name.replace(/\//g,'-').toLowerCase();

    // Full row
    var row = frame(variable.name, 'HORIZONTAL', 20, 0, 'FIXED', 'FIXED');
    row.resize(1840, 76);
    row.counterAxisAlignItems = 'CENTER';
    row.layoutAlign = 'STRETCH';
    rowsCont.appendChild(row);

    // Semantic card (445px)
    var semCard = figma.createFrame();
    semCard.name = 'semantic';
    semCard.fills = [solid(1,1,1,1)];
    semCard.cornerRadius = 8;
    semCard.layoutMode = 'HORIZONTAL';
    semCard.itemSpacing = 20;
    semCard.paddingLeft = semCard.paddingRight = semCard.paddingTop = semCard.paddingBottom = 20;
    semCard.primaryAxisSizingMode = 'FIXED';
    semCard.counterAxisSizingMode = 'FIXED';
    semCard.counterAxisAlignItems = 'CENTER';
    semCard.resize(445, 76);
    semCard.layoutAlign = 'INHERIT'; semCard.layoutGrow = 0;
    row.appendChild(semCard);

    var snT = txt(tokenName, 24, 0,0,0,1);
    snT.letterSpacing = { value: -2, unit: 'PERCENT' };
    snT.layoutAlign = 'INHERIT'; snT.layoutGrow = 1; snT.textAutoResize = 'HEIGHT';
    semCard.appendChild(snT);

    // Mode cards
    for (var mi2 = 0; mi2 < modes.length; mi2++) {
      var mode = modes[mi2];
      // Get raw value for this specific mode
      var raw = variable.valuesByMode[mode.id];
      var res = resolveColor(raw, mode.id);

      var mc = figma.createFrame();
      mc.name = mode.name;
      mc.fills = [solid(1,1,1,1)];
      mc.cornerRadius = 8;
      mc.layoutMode = 'HORIZONTAL';
      mc.itemSpacing = 16;
      mc.paddingLeft = mc.paddingRight = mc.paddingTop = mc.paddingBottom = 16;
      mc.primaryAxisSizingMode = 'FIXED';
      mc.counterAxisSizingMode = 'FIXED';
      mc.counterAxisAlignItems = 'CENTER';
      mc.layoutAlign = 'INHERIT'; mc.layoutGrow = 1;
      row.appendChild(mc);

      if (!res) {
        // Show dash — no resolved colour
        var dT = txt('—', 16, 0.6,0.6,0.6,1);
        dT.textAutoResize = 'WIDTH_AND_HEIGHT';
        mc.appendChild(dT);
        continue;
      }

      // Swatch outer
      var so2 = figma.createFrame();
      so2.name = 'Color'; so2.fills = [];
      so2.strokes = [{ type: 'SOLID', color: {r:0,g:0,b:0} }]; so2.strokeWeight = 1;
      so2.cornerRadius = 2.4;
      so2.layoutMode = 'VERTICAL';
      so2.paddingLeft = so2.paddingRight = so2.paddingTop = so2.paddingBottom = 2.4;
      so2.primaryAxisSizingMode = 'FIXED'; so2.counterAxisSizingMode = 'FIXED';
      so2.resize(44, 44);
      so2.layoutAlign = 'INHERIT'; so2.layoutGrow = 0;
      mc.appendChild(so2);

      var si2 = figma.createFrame();
      si2.name = 'Color'; si2.cornerRadius = 1;
      si2.layoutAlign = 'STRETCH'; si2.layoutGrow = 1;
      si2.primaryAxisSizingMode = 'FIXED'; si2.counterAxisSizingMode = 'FIXED';
      // Bind to variable with the correct mode
      try {
        si2.fills = [figma.variables.setBoundVariableForPaint(
          solid(res.rgba.r, res.rgba.g, res.rgba.b, res.rgba.a || 1),
          'color', figma.variables.getVariableById(variable.id)
        )];
      } catch(e) { si2.fills = [solid(res.rgba.r, res.rgba.g, res.rgba.b, res.rgba.a || 1)]; }
      so2.appendChild(si2);

      // Primitive name
      var primName = res.aliasName
        ? '--' + res.aliasName.replace(/\//g,'-').toLowerCase()
        : rgbToHex(res.rgba.r, res.rgba.g, res.rgba.b);

      var pT = txt(primName, 16, 0.1,0.1,0.1,1);
      pT.letterSpacing = { value: -2, unit: 'PERCENT' };
      pT.layoutAlign = 'INHERIT'; pT.layoutGrow = 1; pT.textAutoResize = 'HEIGHT';
      mc.appendChild(pT);
    }
  }
}
