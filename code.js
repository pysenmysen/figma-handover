// Grebbans Handover — code.js v1.0

var VERSION = '1.0';

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

// ─── Font ──────────────────────────────────────────────────────────────────────
var FONT_FAMILY = 'Inter';

async function loadFonts(collections) {
  // Try to read --font-family string variable
  var customFont = null;
  for (var ci = 0; ci < collections.length; ci++) {
    var col = figma.variables.getVariableCollectionById(collections[ci]);
    if (!col) continue;
    for (var vi = 0; vi < col.variableIds.length; vi++) {
      var v = figma.variables.getVariableById(col.variableIds[vi]);
      if (v && v.resolvedType === 'STRING' && v.name.toLowerCase().includes('font-family')) {
        var val = v.valuesByMode[col.defaultModeId];
        if (typeof val === 'string' && val.length > 0) { customFont = val; break; }
      }
    }
    if (customFont) break;
  }

  // Try custom font first, then Neue Haas, then Inter
  var fontsToTry = [];
  if (customFont) fontsToTry.push({ family: customFont, style: 'Regular' });
  fontsToTry.push({ family: 'Neue Haas Grotesk Display Pro', style: 'Roman' });
  fontsToTry.push({ family: 'Neue Haas Grotesk Display Pro', style: 'Regular' });
  fontsToTry.push({ family: 'Inter', style: 'Regular' });

  for (var fi = 0; fi < fontsToTry.length; fi++) {
    try {
      await figma.loadFontAsync(fontsToTry[fi]);
      FONT_FAMILY = fontsToTry[fi].family;
      return;
    } catch(e) {}
  }
}

function makeText(chars, size, r, g, b, a, align) {
  var t = figma.createText();
  try { t.fontName = { family: FONT_FAMILY, style: 'Regular' }; }
  catch(e) { t.fontName = { family: 'Inter', style: 'Regular' }; }
  t.fontSize = size;
  t.characters = String(chars);
  var fill = { type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 } };
  if (a !== undefined && a < 1) fill.opacity = a;
  t.fills = [fill];
  if (align) t.textAlignHorizontal = align;
  return t;
}

function solid(r, g, b, a) {
  var f = { type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 } };
  if (a !== undefined && a < 1) f.opacity = a;
  return f;
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(function(n){ return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase(); }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN BUILD
// ══════════════════════════════════════════════════════════════════════════════
async function buildFrame(collectionIds) {
  await loadFonts(collectionIds);

  // Remove existing
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Grebbans / Colours';
  }).forEach(function(f) { f.remove(); });

  // Outer wrapper: row, 20px gap, hug height
  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / Colours';
  outer.fills = [];
  outer.layoutMode = 'HORIZONTAL';
  outer.itemSpacing = 20;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'AUTO';
  outer.clipsContent = false;

  // Build sections for each collection
  var primitiveCollections = [];
  var semanticCollections = [];
  for (var ci = 0; ci < collectionIds.length; ci++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[ci]);
    if (!col) continue;
    if (isSemantic(col)) semanticCollections.push(col);
    else primitiveCollections.push(col);
  }

  // For now: primitives only (as requested)
  for (var pi = 0; pi < primitiveCollections.length; pi++) {
    figma.ui.postMessage({ type: 'progress', step: pi, total: collectionIds.length, name: primitiveCollections[pi].name });
    var section = buildPrimitivesSection(primitiveCollections[pi]);
    outer.appendChild(section);
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES SECTION
// Matches: dark doc panel (320px) + light primitives panel (fill)
// ══════════════════════════════════════════════════════════════════════════════
function buildPrimitivesSection(col) {
  // Wrapper: row, hug
  var wrapper = figma.createFrame();
  wrapper.name = col.name;
  wrapper.fills = [];
  wrapper.layoutMode = 'HORIZONTAL';
  wrapper.itemSpacing = 0;
  wrapper.primaryAxisSizingMode = 'AUTO';
  wrapper.counterAxisSizingMode = 'AUTO';
  wrapper.clipsContent = false;

  // ── Left: Doc panel (#272727, 320px) ──
  var docPanel = figma.createFrame();
  docPanel.name = 'ColourPrimitives/Doc';
  docPanel.fills = [{ type: 'SOLID', color: { r: 0.153, g: 0.153, b: 0.153 } }]; // #272727
  docPanel.strokes = [{ type: 'SOLID', color: { r: 0.153, g: 0.153, b: 0.153 } }];
  docPanel.strokeWeight = 1;
  docPanel.cornerRadius = 20;
  docPanel.effects = [{
    type: 'INNER_SHADOW', color: { r: 1, g: 1, b: 1, a: 0.05 },
    offset: { x: 0, y: 0 }, radius: 4, spread: 1, visible: true, blendMode: 'NORMAL'
  }];
  docPanel.layoutMode = 'VERTICAL';
  docPanel.itemSpacing = 0;
  docPanel.paddingLeft = docPanel.paddingRight = docPanel.paddingTop = docPanel.paddingBottom = 16;
  docPanel.primaryAxisSizingMode = 'AUTO';
  docPanel.counterAxisSizingMode = 'FIXED';
  docPanel.resize(320, 100);
  docPanel.layoutAlign = 'STRETCH';
  wrapper.appendChild(docPanel);

  // Header inside doc panel
  var header = figma.createFrame();
  header.name = 'Header';
  header.fills = [];
  header.layoutMode = 'VERTICAL';
  header.itemSpacing = 0;
  header.paddingBottom = 16;
  header.primaryAxisSizingMode = 'AUTO';
  header.counterAxisSizingMode = 'FIXED';
  header.layoutAlign = 'STRETCH';
  docPanel.appendChild(header);

  var epicT = makeText('Colour', 16, 1, 1, 1, 0.7);
  epicT.layoutAlign = 'STRETCH'; epicT.textAutoResize = 'HEIGHT';
  header.appendChild(epicT);

  var instT = makeText(col.name, 16, 1, 1, 1, 1);
  instT.layoutAlign = 'STRETCH'; instT.textAutoResize = 'HEIGHT';
  header.appendChild(instT);

  // Options divider
  var optFrame = figma.createFrame();
  optFrame.name = 'Options';
  optFrame.fills = [];
  optFrame.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 0.2 } }];
  optFrame.strokeWeight = 0.5;
  optFrame.strokeTopWeight = 0.5;
  optFrame.strokeBottomWeight = 0; optFrame.strokeLeftWeight = 0; optFrame.strokeRightWeight = 0;
  optFrame.layoutMode = 'VERTICAL';
  optFrame.paddingTop = optFrame.paddingBottom = 12;
  optFrame.primaryAxisSizingMode = 'AUTO';
  optFrame.counterAxisSizingMode = 'FIXED';
  optFrame.layoutAlign = 'STRETCH';
  docPanel.appendChild(optFrame);

  var detailsT = makeText('Details', 12, 1, 1, 1, 0.7);
  detailsT.layoutAlign = 'STRETCH'; detailsT.textAutoResize = 'HEIGHT';
  optFrame.appendChild(detailsT);

  var descT = makeText('Primitive colours. Not used directly — applied via semantic variables in themes/modes.', 12, 1, 1, 1, 0.7);
  descT.layoutAlign = 'STRETCH'; descT.textAutoResize = 'HEIGHT';
  optFrame.appendChild(descT);

  // ── Right: Primitives content ──
  var primPanel = figma.createFrame();
  primPanel.name = 'Primitives';
  primPanel.fills = [];
  primPanel.layoutMode = 'VERTICAL';
  primPanel.itemSpacing = 16;
  primPanel.primaryAxisSizingMode = 'AUTO';
  primPanel.counterAxisSizingMode = 'AUTO';
  primPanel.clipsContent = false;
  wrapper.appendChild(primPanel);

  // Group tokens by variable path prefix
  var groups = {}, order = [];
  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;
    var raw = variable.valuesByMode[col.defaultModeId];
    if (!raw) { var ks = Object.keys(variable.valuesByMode); if (ks.length) raw = variable.valuesByMode[ks[0]]; }
    var res = raw ? resolveColor(raw, col.defaultModeId) : null;
    if (!res) continue;

    var parts = variable.name.split('/');
    // Group key = everything except last segment
    var gKey = parts.length > 1 ? parts.slice(0, -1).join('/') : '__root__';
    if (!groups[gKey]) { groups[gKey] = { parts: parts.slice(0, -1), tokens: [] }; order.push(gKey); }
    groups[gKey].tokens.push({
      name: '--' + variable.name.replace(/\//g, '-').toLowerCase(),
      fullName: variable.name, variableId: variable.id,
      r: res.rgba.r, g: res.rgba.g, b: res.rgba.b, a: res.rgba.a
    });
  }

  // Build each group
  for (var gi = 0; gi < order.length; gi++) {
    var gKey = order[gi];
    var g = groups[gKey];
    var groupFrame = buildVariableGroup(g, col);
    primPanel.appendChild(groupFrame);
  }

  return wrapper;
}

function buildVariableGroup(g, col) {
  // VaribleGroup: column, 12px gap, fill
  var gf = figma.createFrame();
  gf.name = 'VaribleGroup';
  gf.fills = [];
  gf.layoutMode = 'VERTICAL';
  gf.itemSpacing = 12;
  gf.primaryAxisSizingMode = 'AUTO';
  gf.counterAxisSizingMode = 'AUTO';

  // GroupNameContainer: row, center, 4px gap
  var gnc = figma.createFrame();
  gnc.name = 'GroupNameContainer';
  gnc.fills = [];
  gnc.layoutMode = 'HORIZONTAL';
  gnc.itemSpacing = 4;
  gnc.counterAxisAlignItems = 'CENTER';
  gnc.primaryAxisSizingMode = 'AUTO';
  gnc.counterAxisSizingMode = 'AUTO';
  gf.appendChild(gnc);

  // Group name parts separated by "/"
  var parts = g.parts;
  if (parts.length === 0) parts = ['—'];
  for (var pi = 0; pi < parts.length; pi++) {
    var pt = makeText(parts[pi], 16, 0, 0, 0, 0.5);
    pt.textAutoResize = 'WIDTH_AND_HEIGHT';
    gnc.appendChild(pt);
    if (pi < parts.length - 1) {
      var sep = makeText('/', 16, 0, 0, 0, 0.5);
      sep.textAutoResize = 'WIDTH_AND_HEIGHT';
      gnc.appendChild(sep);
    }
  }

  // Varibles: row, wrap, 4px gap
  var vf = figma.createFrame();
  vf.name = 'Varibles';
  vf.fills = [];
  vf.layoutMode = 'HORIZONTAL';
  vf.layoutWrap = 'WRAP';
  vf.itemSpacing = 4;
  vf.primaryAxisSizingMode = 'AUTO';
  vf.counterAxisSizingMode = 'AUTO';
  gf.appendChild(vf);

  for (var ti = 0; ti < g.tokens.length; ti++) {
    vf.appendChild(buildVariableCard(g.tokens[ti]));
  }

  return gf;
}

function buildVariableCard(token) {
  var hasAlpha = token.a < 0.99;

  // Card: 229.6px wide, row, wrap, 12px gap, 16px padding, rgba(255,255,255,0.8), 20px radius
  var card = figma.createFrame();
  card.name = 'Varible';
  card.fills = [solid(1, 1, 1, 0.8)];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.layoutWrap = 'WRAP';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO';
  card.counterAxisAlignItems = 'CENTER';
  card.resize(229.6, 58);

  // ── Swatch outer: 26×26, 4px padding, rgba(0,0,0,0.5) stroke, 4px radius ──
  var so = figma.createFrame();
  so.name = 'Color';
  so.fills = [];
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
  so.layoutAlign = 'INHERIT';
  so.layoutGrow = 0;
  card.appendChild(so);

  // Swatch inner: fill with variable binding + checkerboard for alpha
  var si = figma.createFrame();
  si.name = 'Color';
  si.cornerRadius = 2;
  si.layoutAlign = 'STRETCH';
  si.layoutGrow = 1;
  si.primaryAxisSizingMode = 'FIXED';
  si.counterAxisSizingMode = 'FIXED';

  var colorFill = solid(token.r, token.g, token.b, token.a);
  if (hasAlpha) {
    // Checkerboard fill underneath, then colour on top
    var checkerFill = { type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } };
    try {
      var boundFill = figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(token.variableId));
      si.fills = [checkerFill, boundFill];
    } catch(e) { si.fills = [checkerFill, colorFill]; }
  } else {
    try {
      var boundFill = figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(token.variableId));
      si.fills = [boundFill];
    } catch(e) { si.fills = [colorFill]; }
  }
  so.appendChild(si);

  // ── NameHex: column, center, 8px gap, fill ──
  var nh = figma.createFrame();
  nh.name = 'NameHex';
  nh.fills = [];
  nh.layoutMode = 'VERTICAL';
  nh.counterAxisAlignItems = 'STRETCH';
  nh.primaryAxisAlignItems = 'CENTER';
  nh.itemSpacing = 8;
  nh.primaryAxisSizingMode = 'AUTO';
  nh.counterAxisSizingMode = 'FIXED';
  nh.layoutGrow = 1;
  nh.layoutAlign = 'INHERIT';
  card.appendChild(nh);

  // Variable name
  var nameT = makeText(token.name, 12, 0, 0, 0, 1);
  nameT.letterSpacing = { value: -1, unit: 'PERCENT' };
  nameT.layoutAlign = 'STRETCH';
  nameT.textAutoResize = 'HEIGHT';
  nh.appendChild(nameT);

  var hex = rgbToHex(token.r, token.g, token.b);

  if (hasAlpha) {
    // Hex + Opacity row: space-between
    var hexRow = figma.createFrame();
    hexRow.name = 'Hex+Opacity';
    hexRow.fills = [];
    hexRow.layoutMode = 'HORIZONTAL';
    hexRow.primaryAxisAlignItems = 'SPACE_BETWEEN';
    hexRow.itemSpacing = 8;
    hexRow.primaryAxisSizingMode = 'FIXED';
    hexRow.counterAxisSizingMode = 'AUTO';
    hexRow.layoutAlign = 'STRETCH';
    nh.appendChild(hexRow);

    var hexT = makeText(hex, 12, 0, 0, 0, 0.5);
    hexT.letterSpacing = { value: -1, unit: 'PERCENT' };
    hexT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hexRow.appendChild(hexT);

    var alphaT = makeText(Math.round(token.a * 100) + '%', 12, 0, 0, 0, 0.5);
    alphaT.letterSpacing = { value: -1, unit: 'PERCENT' };
    alphaT.textAlignHorizontal = 'RIGHT';
    alphaT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hexRow.appendChild(alphaT);
  } else {
    // Just hex
    var hexT2 = makeText(hex, 12, 0, 0, 0, 0.5);
    hexT2.letterSpacing = { value: -1, unit: 'PERCENT' };
    hexT2.textAutoResize = 'WIDTH_AND_HEIGHT';
    nh.appendChild(hexT2);
  }

  return card;
}
