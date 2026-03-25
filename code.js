// Grebbans Handover — code.js v0.7

var VERSION = '0.7';

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
  if (msg.type === 'build') { await buildFrames(msg.collectionIds); figma.ui.postMessage({ type: 'done' }); }
  if (msg.type === 'close') figma.closePlugin();
};

// ─── Resolve alias chain ──────────────────────────────────────────────────────
function resolveColor(rawVal, preferredModeId) {
  var val = rawVal;
  var aliasName = null;
  var aliasVariable = null;
  var depth = 0;
  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;
    if (aliasName === null) { aliasName = ref.name; aliasVariable = ref; }
    var refCol = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    var fallback = refCol ? refCol.defaultModeId : null;
    val = ref.valuesByMode[preferredModeId] || (fallback ? ref.valuesByMode[fallback] : null);
  }
  if (val && typeof val === 'object' && 'r' in val) return { rgba: val, aliasName: aliasName, aliasVariable: aliasVariable };
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

async function buildFrames(collectionIds) {
  var fonts = [
    { family: 'Neue Haas Grotesk Display Pro', style: 'Regular' },
    { family: 'Neue Haas Grotesk Display Pro', style: 'Medium' },
    { family: 'Inter', style: 'Regular' },
    { family: 'Inter', style: 'Medium' }
  ];
  for (var fi = 0; fi < fonts.length; fi++) {
    try { await figma.loadFontAsync(fonts[fi]); } catch(e) {}
  }

  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /');
  }).forEach(function(f) { f.remove(); });

  var xOffset = 0;
  var GAP = 80;

  for (var c = 0; c < collectionIds.length; c++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[c]);
    if (!col) continue;
    figma.ui.postMessage({ type: 'progress', step: c, total: collectionIds.length, name: col.name });
    var frame = isSemantic(col) ? await buildThemesFrame(col) : await buildPrimitivesFrame(col);
    frame.x = xOffset; frame.y = 0;
    figma.currentPage.appendChild(frame);
    xOffset += frame.width + GAP;
  }

  figma.viewport.scrollAndZoomIntoView(
    figma.currentPage.findAll(function(n) { return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /'); })
  );
}

function getFont(style) {
  return { family: 'Neue Haas Grotesk Display Pro', style: style || 'Regular' };
}

function solidFill(r, g, b, a) {
  var fill = { type: 'SOLID', color: { r: r, g: g, b: b } };
  if (a !== undefined && a < 1) fill.opacity = a;
  return fill;
}

function makeText(chars, size, r, g, b, a, style, align) {
  var t = figma.createText();
  t.fontName = getFont(style || 'Regular');
  t.fontSize = size;
  t.characters = chars;
  t.fills = [solidFill(r || 0, g || 0, b || 0, a !== undefined ? a : 1)];
  if (align === 'right') t.textAlignHorizontal = 'RIGHT';
  return t;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// Matches reference: group label left (445px) | token cards wrap right
// Card: 267px wide, swatch 44×44 + token name + hex + alpha
// ══════════════════════════════════════════════════════════════════════════════
async function buildPrimitivesFrame(col) {
  var OUTER_PAD  = 80;
  var FRAME_W    = 2000;
  var LABEL_W    = 445;
  var GROUP_GAP  = 40;
  var ROW_GAP    = 20;
  var CARD_W     = 267.6;
  var CARD_GAP   = 8;
  var SWATCH_SZ  = 44;
  var SWATCH_PAD = 2.4;
  var CARD_H     = 76; // 16 pad top + 44 swatch + 16 pad bottom

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
      fullName: variable.name,
      variableId: variable.id,
      r: resolved.rgba.r, g: resolved.rgba.g, b: resolved.rgba.b, a: resolved.rgba.a
    });
  }

  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / ' + col.name;
  outer.fills = [solidFill(1, 1, 1, 0.3)];
  outer.cornerRadius = 40;
  outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 80;
  outer.paddingLeft = outer.paddingRight = OUTER_PAD;
  outer.paddingTop = outer.paddingBottom = OUTER_PAD;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'FIXED';
  outer.resize(FRAME_W, 100);

  // Title
  var title = makeText(col.name, 64, 0, 0, 0, 1, 'Regular');
  title.letterSpacing = { value: -1, unit: 'PERCENT' };
  title.layoutAlign = 'STRETCH';
  outer.appendChild(title);

  // Groups container
  var groupsContainer = figma.createFrame();
  groupsContainer.fills = [];
  groupsContainer.layoutMode = 'VERTICAL';
  groupsContainer.itemSpacing = GROUP_GAP;
  groupsContainer.primaryAxisSizingMode = 'AUTO';
  groupsContainer.counterAxisSizingMode = 'FIXED';
  groupsContainer.layoutAlign = 'STRETCH';
  outer.appendChild(groupsContainer);

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var gKey = groupOrder[gi];
    var g = groups[gKey];

    var row = figma.createFrame();
    row.fills = [];
    row.layoutMode = 'HORIZONTAL';
    row.itemSpacing = ROW_GAP;
    row.primaryAxisSizingMode = 'AUTO';
    row.counterAxisSizingMode = 'FIXED';
    row.layoutAlign = 'STRETCH';
    row.counterAxisAlignItems = 'MIN';
    groupsContainer.appendChild(row);

    // Group label
    var labelFrame = figma.createFrame();
    labelFrame.fills = [];
    labelFrame.resize(LABEL_W, 20);
    labelFrame.layoutMode = 'NONE';
    var labelT = makeText(g.label === '—' ? '' : g.label, 32, 0, 0, 0, 0.5);
    labelT.x = 0; labelT.y = 0;
    labelT.resize(LABEL_W, 40);
    labelFrame.appendChild(labelT);
    labelFrame.layoutAlign = 'INHERIT';
    labelFrame.layoutGrow = 0;
    row.appendChild(labelFrame);

    // Cards container (wrapping)
    var cardsWrap = figma.createFrame();
    cardsWrap.fills = [];
    cardsWrap.layoutMode = 'HORIZONTAL';
    cardsWrap.layoutWrap = 'WRAP';
    cardsWrap.itemSpacing = CARD_GAP;
    cardsWrap.counterAxisSpacing = CARD_GAP;
    cardsWrap.primaryAxisSizingMode = 'FIXED';
    cardsWrap.counterAxisSizingMode = 'AUTO';
    cardsWrap.layoutGrow = 1;
    cardsWrap.layoutAlign = 'INHERIT';
    row.appendChild(cardsWrap);

    for (var ti = 0; ti < g.tokens.length; ti++) {
      var token = g.tokens[ti];
      var card = figma.createFrame();
      card.name = token.fullName;
      card.fills = [solidFill(1, 1, 1, 1)];
      card.cornerRadius = 8;
      card.layoutMode = 'HORIZONTAL';
      card.itemSpacing = 16;
      card.paddingLeft = card.paddingRight = 16;
      card.paddingTop = card.paddingBottom = 16;
      card.primaryAxisSizingMode = 'FIXED';
      card.counterAxisSizingMode = 'AUTO';
      card.counterAxisAlignItems = 'CENTER';
      card.resize(CARD_W, CARD_H);
      cardsWrap.appendChild(card);

      // Swatch outer (border + checkerboard)
      var swatchOuter = figma.createFrame();
      swatchOuter.name = 'Color';
      swatchOuter.resize(SWATCH_SZ, SWATCH_SZ);
      swatchOuter.cornerRadius = SWATCH_PAD;
      swatchOuter.fills = [];
      swatchOuter.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      swatchOuter.strokeWeight = 1;
      swatchOuter.layoutMode = 'VERTICAL';
      swatchOuter.itemSpacing = 6;
      swatchOuter.paddingLeft = swatchOuter.paddingRight = SWATCH_PAD;
      swatchOuter.paddingTop = swatchOuter.paddingBottom = SWATCH_PAD;
      swatchOuter.primaryAxisSizingMode = 'FIXED';
      swatchOuter.counterAxisSizingMode = 'FIXED';
      swatchOuter.layoutAlign = 'INHERIT';
      swatchOuter.flexGrow = 0;
      card.appendChild(swatchOuter);

      // Inner swatch with variable binding
      var swatchInner = figma.createFrame();
      swatchInner.name = 'Color';
      swatchInner.cornerRadius = 1;
      swatchInner.primaryAxisSizingMode = 'FIXED';
      swatchInner.counterAxisSizingMode = 'FIXED';
      swatchInner.layoutAlign = 'STRETCH';
      swatchInner.layoutGrow = 1;
      try {
        var bf = figma.variables.setBoundVariableForPaint(
          solidFill(token.r, token.g, token.b, token.a),
          'color',
          figma.variables.getVariableById(token.variableId)
        );
        swatchInner.fills = [bf];
      } catch(e) {
        swatchInner.fills = [solidFill(token.r, token.g, token.b, token.a)];
      }
      swatchOuter.appendChild(swatchInner);

      // Text column
      var textCol = figma.createFrame();
      textCol.fills = [];
      textCol.layoutMode = 'VERTICAL';
      textCol.itemSpacing = 8;
      textCol.primaryAxisSizingMode = 'AUTO';
      textCol.counterAxisSizingMode = 'FIXED';
      textCol.layoutGrow = 1;
      textCol.layoutAlign = 'INHERIT';
      card.appendChild(textCol);

      // Token name
      var nameT = makeText(token.name, 16, 0.1, 0.1, 0.1, 1, 'Regular');
      nameT.letterSpacing = { value: -2, unit: 'PERCENT' };
      nameT.layoutAlign = 'STRETCH';
      nameT.textAutoResize = 'HEIGHT';
      textCol.appendChild(nameT);

      // Hex + alpha row
      var hexRow = figma.createFrame();
      hexRow.fills = [];
      hexRow.layoutMode = 'HORIZONTAL';
      hexRow.itemSpacing = 0;
      hexRow.primaryAxisSizingMode = 'FIXED';
      hexRow.counterAxisSizingMode = 'AUTO';
      hexRow.layoutAlign = 'STRETCH';
      hexRow.primaryAxisAlignItems = 'SPACE_BETWEEN';
      textCol.appendChild(hexRow);

      var hex = rgbToHex(token.r, token.g, token.b);
      var hexT = makeText('# ' + hex.replace('#', ''), 16, 0.55, 0.55, 0.55, 1, 'Regular');
      hexT.letterSpacing = { value: -2, unit: 'PERCENT' };
      hexT.layoutAlign = 'INHERIT';
      hexT.textAutoResize = 'WIDTH_AND_HEIGHT';
      hexRow.appendChild(hexT);

      if (token.a < 1) {
        var alphaT = makeText(Math.round(token.a * 100) + '%', 16, 0.55, 0.55, 0.55, 1, 'Regular');
        alphaT.textAlignHorizontal = 'RIGHT';
        alphaT.textAutoResize = 'WIDTH_AND_HEIGHT';
        hexRow.appendChild(alphaT);
      }
    }
  }

  outer.primaryAxisSizingMode = 'AUTO';
  return outer;
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES
// Layout: Semantic col (445px) | one col per mode (fill)
// Row: semantic token name | swatch + primitive name per mode
// ══════════════════════════════════════════════════════════════════════════════
async function buildThemesFrame(col) {
  var OUTER_PAD  = 80;
  var FRAME_W    = 2000;
  var SEMANTIC_W = 445;
  var ROW_GAP    = 20;
  var MODE_GAP   = 20;
  var ROW_H      = 76;
  var SWATCH_SZ  = 44;
  var SWATCH_PAD = 2.4;

  var modes = col.modes;

  // Collect tokens
  var tokens = [];
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var parts = v.name.split('/');
    tokens.push({ name: '--' + v.name.replace(/\//g, '-').toLowerCase(), fullName: v.name, variableId: v.id });
  }

  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / ' + col.name;
  outer.fills = [solidFill(1, 1, 1, 0.3)];
  outer.cornerRadius = 40;
  outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 80;
  outer.paddingLeft = outer.paddingRight = OUTER_PAD;
  outer.paddingTop = outer.paddingBottom = OUTER_PAD;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'FIXED';
  outer.resize(FRAME_W, 100);

  // Title
  var title = makeText(col.name, 64, 0, 0, 0, 1, 'Regular');
  title.letterSpacing = { value: -1, unit: 'PERCENT' };
  title.layoutAlign = 'STRETCH';
  outer.appendChild(title);

  // Header row: blank | mode names
  var hdrRow = figma.createFrame();
  hdrRow.fills = [];
  hdrRow.layoutMode = 'HORIZONTAL';
  hdrRow.itemSpacing = MODE_GAP;
  hdrRow.primaryAxisSizingMode = 'FIXED';
  hdrRow.counterAxisSizingMode = 'AUTO';
  hdrRow.layoutAlign = 'STRETCH';
  outer.appendChild(hdrRow);

  // "Semantic" header
  var semHdr = figma.createFrame();
  semHdr.fills = [];
  semHdr.resize(SEMANTIC_W, 36);
  semHdr.layoutMode = 'NONE';
  var semHdrT = makeText('Semantic', 32, 0.35, 0.35, 0.35, 1, 'Regular');
  semHdrT.x = 0; semHdrT.y = 0;
  semHdr.appendChild(semHdrT);
  semHdr.layoutAlign = 'INHERIT';
  semHdr.layoutGrow = 0;
  hdrRow.appendChild(semHdr);

  for (var mi = 0; mi < modes.length; mi++) {
    var modeHdrFrame = figma.createFrame();
    modeHdrFrame.fills = [];
    modeHdrFrame.layoutAlign = 'INHERIT';
    modeHdrFrame.layoutGrow = 1;
    modeHdrFrame.layoutMode = 'NONE';
    modeHdrFrame.primaryAxisSizingMode = 'FIXED';
    modeHdrFrame.counterAxisSizingMode = 'AUTO';
    var mHdrT = makeText(modes[mi].name, 32, 0.35, 0.35, 0.35, 1, 'Regular');
    mHdrT.x = 0; mHdrT.y = 0;
    modeHdrFrame.appendChild(mHdrT);
    hdrRow.appendChild(modeHdrFrame);
  }

  // Rows container
  var rowsContainer = figma.createFrame();
  rowsContainer.fills = [];
  rowsContainer.layoutMode = 'VERTICAL';
  rowsContainer.itemSpacing = MODE_GAP;
  rowsContainer.primaryAxisSizingMode = 'AUTO';
  rowsContainer.counterAxisSizingMode = 'FIXED';
  rowsContainer.layoutAlign = 'STRETCH';
  outer.appendChild(rowsContainer);

  for (var ti = 0; ti < tokens.length; ti++) {
    var token = tokens[ti];
    var variable = figma.variables.getVariableById(token.variableId);
    if (!variable) continue;

    var row = figma.createFrame();
    row.name = token.fullName;
    row.fills = [];
    row.layoutMode = 'HORIZONTAL';
    row.itemSpacing = MODE_GAP;
    row.primaryAxisSizingMode = 'FIXED';
    row.counterAxisSizingMode = 'AUTO';
    row.counterAxisAlignItems = 'CENTER';
    row.layoutAlign = 'STRETCH';
    rowsContainer.appendChild(row);

    // Semantic name card
    var semCard = figma.createFrame();
    semCard.fills = [solidFill(1, 1, 1, 1)];
    semCard.cornerRadius = 8;
    semCard.layoutMode = 'HORIZONTAL';
    semCard.itemSpacing = 20;
    semCard.paddingLeft = semCard.paddingRight = 20;
    semCard.paddingTop = semCard.paddingBottom = 20;
    semCard.primaryAxisSizingMode = 'FIXED';
    semCard.counterAxisSizingMode = 'AUTO';
    semCard.counterAxisAlignItems = 'CENTER';
    semCard.resize(SEMANTIC_W, ROW_H);
    semCard.layoutAlign = 'INHERIT';
    semCard.layoutGrow = 0;
    row.appendChild(semCard);

    var semNameT = makeText(token.name, 24, 0, 0, 0, 1, 'Regular');
    semNameT.letterSpacing = { value: -2, unit: 'PERCENT' };
    semNameT.layoutAlign = 'INHERIT';
    semNameT.layoutGrow = 1;
    semNameT.textAutoResize = 'HEIGHT';
    semCard.appendChild(semNameT);

    // One card per mode
    for (var mi2 = 0; mi2 < modes.length; mi2++) {
      var mode = modes[mi2];
      var raw = variable.valuesByMode[mode.id];
      var resolved = resolveColor(raw, mode.id);

      var modeCard = figma.createFrame();
      modeCard.name = token.fullName + ' / ' + mode.name;
      modeCard.fills = [solidFill(1, 1, 1, 1)];
      modeCard.cornerRadius = 8;
      modeCard.layoutMode = 'HORIZONTAL';
      modeCard.itemSpacing = 16;
      modeCard.paddingLeft = modeCard.paddingRight = 16;
      modeCard.paddingTop = modeCard.paddingBottom = 16;
      modeCard.primaryAxisSizingMode = 'FIXED';
      modeCard.counterAxisSizingMode = 'AUTO';
      modeCard.counterAxisAlignItems = 'CENTER';
      modeCard.layoutAlign = 'INHERIT';
      modeCard.layoutGrow = 1;
      row.appendChild(modeCard);

      if (!resolved) {
        var emptyT = makeText('—', 16, 0.6, 0.6, 0.6, 1);
        modeCard.appendChild(emptyT);
        continue;
      }

      // Swatch
      var swOuter = figma.createFrame();
      swOuter.name = 'Color';
      swOuter.resize(SWATCH_SZ, SWATCH_SZ);
      swOuter.cornerRadius = SWATCH_PAD;
      swOuter.fills = [];
      swOuter.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      swOuter.strokeWeight = 1;
      swOuter.layoutMode = 'VERTICAL';
      swOuter.paddingLeft = swOuter.paddingRight = SWATCH_PAD;
      swOuter.paddingTop = swOuter.paddingBottom = SWATCH_PAD;
      swOuter.primaryAxisSizingMode = 'FIXED';
      swOuter.counterAxisSizingMode = 'FIXED';
      swOuter.layoutAlign = 'INHERIT';
      swOuter.layoutGrow = 0;
      modeCard.appendChild(swOuter);

      var swInner = figma.createFrame();
      swInner.name = 'Color';
      swInner.cornerRadius = 1;
      swInner.layoutAlign = 'STRETCH';
      swInner.layoutGrow = 1;
      swInner.primaryAxisSizingMode = 'FIXED';
      swInner.counterAxisSizingMode = 'FIXED';
      try {
        var bf2 = figma.variables.setBoundVariableForPaint(
          solidFill(resolved.rgba.r, resolved.rgba.g, resolved.rgba.b, resolved.rgba.a),
          'color', figma.variables.getVariableById(token.variableId)
        );
        swInner.fills = [bf2];
      } catch(e) {
        swInner.fills = [solidFill(resolved.rgba.r, resolved.rgba.g, resolved.rgba.b, resolved.rgba.a)];
      }
      swOuter.appendChild(swInner);

      // Primitive name
      var primParts = (resolved.aliasName || '').split('/');
      var primShort = '--' + (resolved.aliasName || '').replace(/\//g, '-').toLowerCase();
      var primT = makeText(primShort || rgbToHex(resolved.rgba.r, resolved.rgba.g, resolved.rgba.b), 16, 0.1, 0.1, 0.1);
      primT.letterSpacing = { value: -2, unit: 'PERCENT' };
      primT.layoutAlign = 'INHERIT';
      primT.layoutGrow = 1;
      primT.textAutoResize = 'HEIGHT';
      modeCard.appendChild(primT);
    }
  }

  outer.primaryAxisSizingMode = 'AUTO';
  return outer;
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(function(n){ return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase(); }).join('');
}
