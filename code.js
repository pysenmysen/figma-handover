// Grebbans Handover — code.js v0.8

var VERSION = '0.8';

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
    val = ref.valuesByMode[preferredModeId] || (fallback ? ref.valuesByMode[fallback] : null);
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
    if (raw && raw.type === 'VARIABLE_ALIAS') aliasCount++;
  }
  return total > 0 && aliasCount / total > 0.5;
}

// ─── Font helpers ──────────────────────────────────────────────────────────────
var FONT = 'Neue Haas Grotesk Display Pro';
var FONT_FALLBACK = 'Inter';
var usedFont = FONT;

async function loadFonts() {
  try { await figma.loadFontAsync({ family: FONT, style: 'Roman' }); usedFont = FONT; return; } catch(e) {}
  try { await figma.loadFontAsync({ family: FONT, style: 'Regular' }); usedFont = FONT; return; } catch(e) {}
  try { await figma.loadFontAsync({ family: FONT_FALLBACK, style: 'Regular' }); usedFont = FONT_FALLBACK; } catch(e) {}
}

function txt(chars, size, r, g, b, a, align) {
  var t = figma.createText();
  var style = 'Regular';
  try { t.fontName = { family: usedFont, style: style }; } catch(e) { t.fontName = { family: FONT_FALLBACK, style: 'Regular' }; }
  t.fontSize = size;
  t.fills = [{ type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 }, opacity: a !== undefined ? a : 1 }];
  t.characters = chars;
  if (align) t.textAlignHorizontal = align;
  return t;
}

function solid(r, g, b, a) {
  var f = { type: 'SOLID', color: { r: r, g: g, b: b } };
  if (a !== undefined && a < 1) f.opacity = a;
  return f;
}

function setLayout(frame, opts) {
  frame.layoutMode = opts.mode || 'VERTICAL';
  if (opts.gap !== undefined) frame.itemSpacing = opts.gap;
  if (opts.padAll !== undefined) { frame.paddingLeft = frame.paddingRight = frame.paddingTop = frame.paddingBottom = opts.padAll; }
  if (opts.padH !== undefined) { frame.paddingLeft = frame.paddingRight = opts.padH; }
  if (opts.padV !== undefined) { frame.paddingTop = frame.paddingBottom = opts.padV; }
  frame.primaryAxisSizingMode = opts.primarySize || 'AUTO';
  frame.counterAxisSizingMode = opts.counterSize || 'AUTO';
  if (opts.align) frame.counterAxisAlignItems = opts.align;
  if (opts.wrap) frame.layoutWrap = 'WRAP';
  if (opts.counterGap) frame.counterAxisSpacing = opts.counterGap;
  if (opts.justify) frame.primaryAxisAlignItems = opts.justify;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN BUILD — one frame, primitives then themes
// ══════════════════════════════════════════════════════════════════════════════
async function buildFrame(collectionIds) {
  await loadFonts();

  // Remove existing
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Grebbans / Colours';
  }).forEach(function(f) { f.remove(); });

  // Outer frame — matches reference exactly
  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / Colours';
  outer.fills = [solid(1, 1, 1, 0.3)];
  outer.cornerRadius = 40;
  outer.clipsContent = false;
  setLayout(outer, { mode: 'VERTICAL', gap: 80, padAll: 80, primarySize: 'AUTO', counterSize: 'FIXED' });
  outer.resize(2000, 100);

  for (var ci = 0; ci < collectionIds.length; ci++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[ci]);
    if (!col) continue;
    figma.ui.postMessage({ type: 'progress', step: ci, total: collectionIds.length, name: col.name });

    if (isSemantic(col)) {
      appendThemesSection(outer, col);
    } else {
      appendPrimitivesSection(outer, col);
    }
  }

  outer.primaryAxisSizingMode = 'AUTO';
  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES SECTION
// ══════════════════════════════════════════════════════════════════════════════
function appendPrimitivesSection(outer, col) {
  // Section title
  var titleT = txt(col.name, 64, 0, 0, 0, 1);
  titleT.letterSpacing = { value: -1, unit: 'PERCENT' };
  titleT.layoutAlign = 'STRETCH';
  titleT.textAutoResize = 'HEIGHT';
  outer.appendChild(titleT);

  // Groups container
  var groupsCont = figma.createFrame();
  groupsCont.name = 'groups';
  groupsCont.fills = [];
  setLayout(groupsCont, { mode: 'VERTICAL', gap: 40, primarySize: 'AUTO', counterSize: 'FIXED' });
  groupsCont.layoutAlign = 'STRETCH';
  outer.appendChild(groupsCont);

  // Group tokens
  var groups = {};
  var groupOrder = [];
  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;
    var raw = variable.valuesByMode[col.defaultModeId];
    var resolved = resolveColor(raw, col.defaultModeId);
    if (!resolved) continue;
    var parts = variable.name.split('/');
    var groupKey = parts.length > 1 ? parts.slice(0, -1).join('/') : '—';
    var groupLabel = parts.length > 1 ? parts[parts.length - 2] : '—';
    groupLabel = groupLabel.charAt(0).toUpperCase() + groupLabel.slice(1);
    if (!groups[groupKey]) { groups[groupKey] = { label: groupLabel, tokens: [] }; groupOrder.push(groupKey); }
    groups[groupKey].tokens.push({
      name: '--' + variable.name.replace(/\//g, '-').toLowerCase(),
      fullName: variable.name, variableId: variable.id,
      r: resolved.rgba.r, g: resolved.rgba.g, b: resolved.rgba.b, a: resolved.rgba.a
    });
  }

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var g = groups[groupOrder[gi]];

    // Row: label + cards
    var row = figma.createFrame();
    row.name = g.label;
    row.fills = [];
    setLayout(row, { mode: 'HORIZONTAL', gap: 20, primarySize: 'AUTO', counterSize: 'FIXED', align: 'MIN' });
    row.layoutAlign = 'STRETCH';
    groupsCont.appendChild(row);

    // Label (fixed 445px)
    var labelT = txt(g.label === '—' ? '' : g.label, 32, 0, 0, 0, 0.5);
    labelT.resize(445, 40);
    labelT.textAutoResize = 'HEIGHT';
    labelT.layoutAlign = 'INHERIT';
    labelT.layoutGrow = 0;
    row.appendChild(labelT);

    // Cards wrap
    var cardsWrap = figma.createFrame();
    cardsWrap.name = 'cards';
    cardsWrap.fills = [];
    setLayout(cardsWrap, { mode: 'HORIZONTAL', gap: 8, counterGap: 8, primarySize: 'FIXED', counterSize: 'AUTO', wrap: true });
    cardsWrap.layoutGrow = 1;
    cardsWrap.layoutAlign = 'INHERIT';
    row.appendChild(cardsWrap);

    for (var ti = 0; ti < g.tokens.length; ti++) {
      var token = g.tokens[ti];
      var card = makeTokenCard(token);
      cardsWrap.appendChild(card);
    }
  }
}

function makeTokenCard(token) {
  var card = figma.createFrame();
  card.name = token.fullName;
  card.fills = [solid(1, 1, 1, 1)];
  card.cornerRadius = 8;
  setLayout(card, { mode: 'HORIZONTAL', gap: 16, padH: 16, padV: 16, primarySize: 'FIXED', counterSize: 'AUTO', align: 'CENTER' });
  card.resize(267.6, 76);

  // Swatch outer (44×44, 2.4px pad, 1px stroke)
  var swOuter = figma.createFrame();
  swOuter.name = 'Color';
  swOuter.fills = [];
  swOuter.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  swOuter.strokeWeight = 1;
  swOuter.cornerRadius = 2.4;
  setLayout(swOuter, { mode: 'VERTICAL', padAll: 2.4, primarySize: 'FIXED', counterSize: 'FIXED' });
  swOuter.resize(44, 44);
  swOuter.layoutAlign = 'INHERIT';
  swOuter.layoutGrow = 0;
  card.appendChild(swOuter);

  // Swatch inner with variable binding
  var swInner = figma.createFrame();
  swInner.name = 'Color';
  swInner.cornerRadius = 1;
  swInner.layoutAlign = 'STRETCH';
  swInner.layoutGrow = 1;
  swInner.primaryAxisSizingMode = 'FIXED';
  swInner.counterAxisSizingMode = 'FIXED';
  try {
    var bf = figma.variables.setBoundVariableForPaint(
      solid(token.r, token.g, token.b, token.a), 'color',
      figma.variables.getVariableById(token.variableId)
    );
    swInner.fills = [bf];
  } catch(e) { swInner.fills = [solid(token.r, token.g, token.b, token.a)]; }
  swOuter.appendChild(swInner);

  // Text column
  var textCol = figma.createFrame();
  textCol.name = 'text';
  textCol.fills = [];
  setLayout(textCol, { mode: 'VERTICAL', gap: 8, primarySize: 'AUTO', counterSize: 'FIXED' });
  textCol.layoutGrow = 1;
  textCol.layoutAlign = 'INHERIT';
  card.appendChild(textCol);

  // Token name
  var nameT = txt(token.name, 16, 0.1, 0.1, 0.1, 1);
  nameT.letterSpacing = { value: -2, unit: 'PERCENT' };
  nameT.layoutAlign = 'STRETCH';
  nameT.textAutoResize = 'HEIGHT';
  textCol.appendChild(nameT);

  // Hex row
  var hexRow = figma.createFrame();
  hexRow.name = 'hex';
  hexRow.fills = [];
  setLayout(hexRow, { mode: 'HORIZONTAL', gap: 0, primarySize: 'FIXED', counterSize: 'AUTO', justify: 'SPACE_BETWEEN' });
  hexRow.layoutAlign = 'STRETCH';
  textCol.appendChild(hexRow);

  var hex = rgbToHex(token.r, token.g, token.b);
  var hexT = txt('# ' + hex.replace('#', ''), 16, 0.55, 0.55, 0.55, 1);
  hexT.letterSpacing = { value: -2, unit: 'PERCENT' };
  hexT.textAutoResize = 'WIDTH_AND_HEIGHT';
  hexRow.appendChild(hexT);

  if (token.a < 1) {
    var alphaT = txt(Math.round(token.a * 100) + '%', 16, 0.55, 0.55, 0.55, 1);
    alphaT.textAlignHorizontal = 'RIGHT';
    alphaT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hexRow.appendChild(alphaT);
  }

  return card;
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES SECTION
// ══════════════════════════════════════════════════════════════════════════════
function appendThemesSection(outer, col) {
  var modes = col.modes;

  // Section title
  var titleT = txt(col.name, 64, 0, 0, 0, 1);
  titleT.letterSpacing = { value: -1, unit: 'PERCENT' };
  titleT.layoutAlign = 'STRETCH';
  titleT.textAutoResize = 'HEIGHT';
  outer.appendChild(titleT);

  // Themes container
  var themesCont = figma.createFrame();
  themesCont.name = 'themes';
  themesCont.fills = [];
  setLayout(themesCont, { mode: 'VERTICAL', gap: 40, primarySize: 'AUTO', counterSize: 'FIXED' });
  themesCont.layoutAlign = 'STRETCH';
  outer.appendChild(themesCont);

  // Header row — matches layout_LGQ3KZ: row, 20px gap, 1840px fixed
  var hdrRow = figma.createFrame();
  hdrRow.name = 'headers';
  hdrRow.fills = [];
  setLayout(hdrRow, { mode: 'HORIZONTAL', gap: 20, primarySize: 'FIXED', counterSize: 'AUTO' });
  hdrRow.layoutAlign = 'STRETCH';
  themesCont.appendChild(hdrRow);

  // Semantic header (445px fixed)
  var semHdrT = txt('Semantic', 32, 0.35, 0.35, 0.35, 1);
  semHdrT.resize(445, 36);
  semHdrT.textAutoResize = 'HEIGHT';
  semHdrT.layoutAlign = 'INHERIT';
  semHdrT.layoutGrow = 0;
  hdrRow.appendChild(semHdrT);

  for (var mi = 0; mi < modes.length; mi++) {
    var mHdrT = txt(modes[mi].name, 32, 0.35, 0.35, 0.35, 1);
    mHdrT.textAutoResize = 'WIDTH_AND_HEIGHT';
    mHdrT.layoutAlign = 'INHERIT';
    mHdrT.layoutGrow = 1;
    hdrRow.appendChild(mHdrT);
  }

  // Rows container
  var rowsCont = figma.createFrame();
  rowsCont.name = 'rows';
  rowsCont.fills = [];
  setLayout(rowsCont, { mode: 'VERTICAL', gap: 20, primarySize: 'AUTO', counterSize: 'FIXED' });
  rowsCont.layoutAlign = 'STRETCH';
  themesCont.appendChild(rowsCont);

  // Collect tokens
  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;

    var parts = variable.name.split('/');
    var tokenDisplayName = '--' + variable.name.replace(/\//g, '-').toLowerCase();

    // Full row: semantic card + one card per mode
    var row = figma.createFrame();
    row.name = variable.name;
    row.fills = [];
    setLayout(row, { mode: 'HORIZONTAL', gap: 20, primarySize: 'FIXED', counterSize: 'FIXED', align: 'CENTER' });
    row.layoutAlign = 'STRETCH';
    rowsCont.appendChild(row);

    // Semantic card (445px, matches layout_24DX19)
    var semCard = figma.createFrame();
    semCard.name = 'semantic';
    semCard.fills = [solid(1, 1, 1, 1)];
    semCard.cornerRadius = 8;
    setLayout(semCard, { mode: 'HORIZONTAL', gap: 20, padAll: 20, primarySize: 'FIXED', counterSize: 'FIXED', align: 'CENTER' });
    semCard.resize(445, 76);
    semCard.layoutAlign = 'INHERIT';
    semCard.layoutGrow = 0;
    row.appendChild(semCard);

    var semNameT = txt(tokenDisplayName, 24, 0, 0, 0, 1);
    semNameT.letterSpacing = { value: -2, unit: 'PERCENT' };
    semNameT.layoutAlign = 'INHERIT';
    semNameT.layoutGrow = 1;
    semNameT.textAutoResize = 'HEIGHT';
    semCard.appendChild(semNameT);

    // One card per mode (matches layout_H4DG0S: row, fill, 16px padding, 16px gap)
    for (var mi2 = 0; mi2 < modes.length; mi2++) {
      var mode = modes[mi2];
      var raw = variable.valuesByMode[mode.id];
      var resolved = resolveColor(raw, mode.id);

      var modeCard = figma.createFrame();
      modeCard.name = mode.name;
      modeCard.fills = [solid(1, 1, 1, 1)];
      modeCard.cornerRadius = 8;
      setLayout(modeCard, { mode: 'HORIZONTAL', gap: 16, padAll: 16, primarySize: 'FIXED', counterSize: 'FIXED', align: 'CENTER' });
      modeCard.resize(445, 76); // will be updated by flex grow
      modeCard.layoutAlign = 'INHERIT';
      modeCard.layoutGrow = 1;
      row.appendChild(modeCard);

      if (!resolved) {
        var dashT = txt('—', 16, 0.6, 0.6, 0.6, 1);
        dashT.textAutoResize = 'WIDTH_AND_HEIGHT';
        modeCard.appendChild(dashT);
        continue;
      }

      // Swatch
      var swO = figma.createFrame();
      swO.name = 'Color';
      swO.fills = [];
      swO.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      swO.strokeWeight = 1;
      swO.cornerRadius = 2.4;
      setLayout(swO, { mode: 'VERTICAL', padAll: 2.4, primarySize: 'FIXED', counterSize: 'FIXED' });
      swO.resize(44, 44);
      swO.layoutAlign = 'INHERIT';
      swO.layoutGrow = 0;
      modeCard.appendChild(swO);

      var swI = figma.createFrame();
      swI.name = 'Color';
      swI.cornerRadius = 1;
      swI.layoutAlign = 'STRETCH';
      swI.layoutGrow = 1;
      swI.primaryAxisSizingMode = 'FIXED';
      swI.counterAxisSizingMode = 'FIXED';
      try {
        var bf2 = figma.variables.setBoundVariableForPaint(
          solid(resolved.rgba.r, resolved.rgba.g, resolved.rgba.b, resolved.rgba.a),
          'color', figma.variables.getVariableById(variable.id)
        );
        swI.fills = [bf2];
      } catch(e) { swI.fills = [solid(resolved.rgba.r, resolved.rgba.g, resolved.rgba.b, resolved.rgba.a)]; }
      swO.appendChild(swI);

      // Primitive name
      var primName = '--' + (resolved.aliasName || '').replace(/\//g, '-').toLowerCase();
      if (!resolved.aliasName) primName = rgbToHex(resolved.rgba.r, resolved.rgba.g, resolved.rgba.b);
      var primT = txt(primName, 16, 0.1, 0.1, 0.1, 1);
      primT.letterSpacing = { value: -2, unit: 'PERCENT' };
      primT.layoutAlign = 'INHERIT';
      primT.layoutGrow = 1;
      primT.textAutoResize = 'HEIGHT';
      modeCard.appendChild(primT);
    }
  }
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(function(n){ return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase(); }).join('');
}
