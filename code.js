// Grebbans Handover — code.js v3.0
// Back to Figma variable API, all bugs fixed

var VERSION = '3.0';

figma.showUI(__html__, { width: 480, height: 560, themeColors: true });

(async function init() {
  var collections = figma.variables.getLocalVariableCollections();
  var summary = collections.map(function(col) {
    var colorCount = 0;
    for (var i = 0; i < col.variableIds.length; i++) {
      var v = figma.variables.getVariableById(col.variableIds[i]);
      if (v && v.resolvedType === 'COLOR') colorCount++;
    }
    return {
      id: col.id, name: col.name, colorCount: colorCount,
      modes: col.modes.map(function(m) { return { id: m.modeId, name: m.name }; })
    };
  }).filter(function(c) { return c.colorCount > 0; });
  figma.ui.postMessage({ type: 'collections', data: summary, version: VERSION });
})();

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'build') {
    // Font: timeout after 2s, never hang
    try {
      await Promise.race([
        figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
        new Promise(function(_, r) { setTimeout(r, 2000); })
      ]);
    } catch(e) {}
    try { buildAll(msg.collectionIds); }
    catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    figma.ui.postMessage({ type: 'done' });
  }
  if (msg.type === 'close') figma.closePlugin();
};

// ─── Resolve alias chain to RGBA ──────────────────────────────────────────────
function resolveColor(raw, preferredModeId) {
  var val = raw;
  var aliasName = null;
  var depth = 0;
  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;
    if (!aliasName) aliasName = ref.name;
    var refCol = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    var defMode = refCol ? refCol.defaultModeId : null;
    var modeKeys = Object.keys(ref.valuesByMode);
    val = ref.valuesByMode[preferredModeId]
       || (defMode ? ref.valuesByMode[defMode] : null)
       || (modeKeys.length ? ref.valuesByMode[modeKeys[0]] : null);
  }
  if (val && typeof val === 'object' && 'r' in val) return { rgba: val, aliasName: aliasName };
  return null;
}

function isSemantic(col) {
  var modeId = col.defaultModeId;
  var aliases = 0, total = 0;
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    total++;
    var raw = v.valuesByMode[modeId];
    if (raw && raw.type === 'VARIABLE_ALIAS') aliases++;
  }
  return total > 0 && aliases / total > 0.5;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hex(r, g, b) {
  return '#' + [r, g, b].map(function(n) {
    return Math.round(n * 255).toString(16).padStart(2, '0').toUpperCase();
  }).join('');
}

function T(chars, size, r, g, b, a) {
  var t = figma.createText();
  try { t.fontName = { family: 'Inter', style: 'Regular' }; } catch(e) {}
  t.fontSize = size || 12;
  t.characters = String(chars);
  var fill = { type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 } };
  if (a !== undefined && a < 1) fill.opacity = a;
  t.fills = [fill];
  return t;
}

function F(name, mode, gap) {
  var f = figma.createFrame();
  f.name = name; f.fills = [];
  f.layoutMode = mode || 'VERTICAL';
  if (gap !== undefined) f.itemSpacing = gap;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  return f;
}

// ══════════════════════════════════════════════════════════════════════════════
function buildAll(collectionIds) {
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Grebbans / Colours';
  }).forEach(function(f) { f.remove(); });

  var outer = F('◈ Grebbans / Colours', 'VERTICAL', 16);
  outer.clipsContent = false;

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
// PRIMITIVES — grouped by variable path prefix
// ══════════════════════════════════════════════════════════════════════════════
function buildPrimitives(outer, col) {
  var modeId = col.defaultModeId;
  var groups = {}, order = [];

  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;

    var raw = v.valuesByMode[modeId];
    if (!raw) {
      var ks = Object.keys(v.valuesByMode);
      if (ks.length) raw = v.valuesByMode[ks[0]];
    }
    var res = raw ? resolveColor(raw, modeId) : null;
    if (!res) continue;

    var parts = v.name.split('/');
    // Group key = all path segments except the last
    var gKey = parts.length > 1 ? parts.slice(0, -1).join('/') : '__root__';
    if (!groups[gKey]) { groups[gKey] = { parts: parts.length > 1 ? parts.slice(0,-1) : [col.name], tokens: [] }; order.push(gKey); }

    groups[gKey].tokens.push({
      cssName: '--' + v.name.replace(/\//g, '-').toLowerCase(),
      variableId: v.id,
      hex: hex(res.rgba.r, res.rgba.g, res.rgba.b),
      alpha: Math.round(res.rgba.a * 100) / 100,
      r: res.rgba.r, g: res.rgba.g, b: res.rgba.b
    });
  }

  for (var gi = 0; gi < order.length; gi++) {
    var g = groups[order[gi]];

    // VaribleGroup: vertical, 12px gap
    var gf = F('VaribleGroup', 'VERTICAL', 12);
    gf.layoutAlign = 'STRETCH';
    outer.appendChild(gf);

    // GroupNameContainer: horizontal, 4px gap, center-aligned
    var gnc = F('GroupNameContainer', 'HORIZONTAL', 4);
    gnc.counterAxisAlignItems = 'CENTER';
    gnc.layoutAlign = 'STRETCH';
    gf.appendChild(gnc);

    for (var pi = 0; pi < g.parts.length; pi++) {
      var pt = T(g.parts[pi], 16, 0, 0, 0, 0.5);
      pt.textAutoResize = 'WIDTH_AND_HEIGHT';
      gnc.appendChild(pt);
      if (pi < g.parts.length - 1) {
        var sep = T('/', 16, 0, 0, 0, 0.5);
        sep.textAutoResize = 'WIDTH_AND_HEIGHT';
        gnc.appendChild(sep);
      }
    }

    // Varibles: horizontal wrap, 4px gap
    var vf = F('Varibles', 'HORIZONTAL', 4);
    vf.layoutWrap = 'WRAP';
    vf.layoutAlign = 'STRETCH';
    gf.appendChild(vf);

    for (var ti = 0; ti < g.tokens.length; ti++) {
      vf.appendChild(buildCard(g.tokens[ti]));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD — 229.6×58px, rgba(255,255,255,0.8), 20px radius
// ══════════════════════════════════════════════════════════════════════════════
function buildCard(token) {
  var hasAlpha = token.alpha < 0.99;

  var card = F('Varible', 'HORIZONTAL', 12);
  card.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: 0.8 }];
  card.cornerRadius = 20;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.counterAxisAlignItems = 'CENTER';
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'FIXED';
  card.resize(229.6, 58);

  // Swatch outer: 26×26, no layout, stroke rgba(0,0,0,0.5), 4px radius
  var so = figma.createFrame();
  so.name = 'Color'; so.fills = []; so.layoutMode = 'NONE';
  so.strokes = [{ type: 'SOLID', color: { r:0, g:0, b:0 }, opacity: 0.5 }];
  so.strokeWeight = 1; so.cornerRadius = 4;
  so.resize(26, 26);
  so.layoutAlign = 'INHERIT'; so.layoutGrow = 0;
  card.appendChild(so);

  // Swatch inner: rectangle 18×18 at (4,4) with variable binding
  var si = figma.createRectangle();
  si.name = 'Color'; si.cornerRadius = 2;
  si.resize(18, 18); si.x = 4; si.y = 4;
  var colorFill = { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.alpha };
  if (hasAlpha) {
    try {
      var bf = figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(token.variableId));
      si.fills = [{ type: 'SOLID', color: { r:0.85, g:0.85, b:0.85 } }, bf];
    } catch(e) {
      si.fills = [{ type: 'SOLID', color: { r:0.85, g:0.85, b:0.85 } }, colorFill];
    }
  } else {
    try {
      si.fills = [figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(token.variableId))];
    } catch(e) { si.fills = [colorFill]; }
  }
  so.appendChild(si);

  // NameHex column: vertical, 6px gap, grows to fill
  var nh = F('NameHex', 'VERTICAL', 6);
  nh.counterAxisAlignItems = 'STRETCH';
  nh.primaryAxisAlignItems = 'CENTER';
  nh.layoutGrow = 1; nh.layoutAlign = 'STRETCH';
  card.appendChild(nh);

  var nameT = T(token.cssName, 12, 0, 0, 0, 1);
  nameT.letterSpacing = { value: -1, unit: 'PERCENT' };
  nameT.layoutAlign = 'STRETCH'; nameT.textAutoResize = 'HEIGHT';
  nh.appendChild(nameT);

  if (hasAlpha) {
    var hr = F('Hex+Opacity', 'HORIZONTAL', 0);
    hr.primaryAxisAlignItems = 'SPACE_BETWEEN';
    hr.layoutAlign = 'STRETCH';
    nh.appendChild(hr);

    var hxT = T(token.hex, 12, 0, 0, 0, 0.5);
    hxT.letterSpacing = { value: -1, unit: 'PERCENT' };
    hxT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(hxT);

    var alT = T(Math.round(token.alpha * 100) + '%', 12, 0, 0, 0, 0.5);
    alT.letterSpacing = { value: -1, unit: 'PERCENT' };
    alT.textAlignHorizontal = 'RIGHT'; alT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(alT);
  } else {
    var hxT2 = T(token.hex, 12, 0, 0, 0, 0.5);
    hxT2.letterSpacing = { value: -1, unit: 'PERCENT' };
    hxT2.textAutoResize = 'WIDTH_AND_HEIGHT';
    nh.appendChild(hxT2);
  }

  return card;
}
