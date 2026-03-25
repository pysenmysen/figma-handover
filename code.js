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
      id: col.id,
      name: col.name,
      colorCount: colorCount,
      modes: col.modes.map(function(m) { return { id: m.modeId, name: m.name }; })
    };
  }).filter(function(c) { return c.colorCount > 0; });
  figma.ui.postMessage({ type: 'collections', data: summary, version: VERSION });
})();

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'build') {
    await buildFrames(msg.collectionIds);
    figma.ui.postMessage({ type: 'done' });
  }
  if (msg.type === 'close') figma.closePlugin();
};

// ─── Resolve alias chain ───────────────────────────────────────────────────────
function resolveColor(rawVal, preferredModeId) {
  var val = rawVal;
  var aliasName = null;
  var aliasVariable = null;
  var depth = 0;
  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;
    if (aliasName === null) {
      var p = ref.name.split('/');
      aliasName = p[p.length - 1];
      aliasVariable = ref;
    }
    var refCol = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    var fallback = refCol ? refCol.defaultModeId : null;
    val = ref.valuesByMode[preferredModeId] || (fallback ? ref.valuesByMode[fallback] : null);
  }
  if (val && typeof val === 'object' && 'r' in val) {
    return { rgba: val, aliasName: aliasName, aliasVariable: aliasVariable };
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
    if (raw && raw.type === 'VARIABLE_ALIAS') aliasCount++;
  }
  return total > 0 && aliasCount / total > 0.5;
}

async function buildFrames(collectionIds) {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

  // Try to load Neue Haas — fall back to Inter if not available
  var titleFont = { family: 'Inter', style: 'Medium' };
  try {
    await figma.loadFontAsync({ family: 'Neue Haas Grotesk Display Pro', style: 'Roman' });
    titleFont = { family: 'Neue Haas Grotesk Display Pro', style: 'Roman' };
  } catch(e) {}

  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /');
  }).forEach(function(f) { f.remove(); });

  // Build one combined frame with all selected collections
  var frame = await buildCombinedFrame(collectionIds, titleFont);
  frame.x = 0;
  frame.y = 0;
  figma.currentPage.appendChild(frame);
  figma.viewport.scrollAndZoomIntoView([frame]);
}

// ══════════════════════════════════════════════════════════════════════════════
// COMBINED FRAME — matches the reference design exactly
// ══════════════════════════════════════════════════════════════════════════════
async function buildCombinedFrame(collectionIds, titleFont) {
  var PAD         = 80;
  var FRAME_W     = 2000;
  var SECTION_GAP = 80;
  var GROUP_GAP   = 40;
  var CARD_W      = 267;
  var CARD_H      = 76; // row height for theme rows
  var CARD_GAP    = 8;
  var SWATCH_SZ   = 44;
  var GROUP_LBL_W = 445;
  var CARDS_PER_ROW = Math.floor((FRAME_W - PAD * 2 - GROUP_LBL_W - 20) / (CARD_W + CARD_GAP));

  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / Style Reference';
  outer.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.3 }];
  outer.cornerRadius = 40;
  outer.clipsContent = false;

  var y = PAD;

  for (var ci = 0; ci < collectionIds.length; ci++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[ci]);
    if (!col) continue;

    figma.ui.postMessage({ type: 'progress', step: ci, total: collectionIds.length, name: col.name });

    // ── Section title ──
    var titleT = figma.createText();
    titleT.characters = col.name;
    titleT.fontName = titleFont;
    titleT.fontSize = 64;
    titleT.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    titleT.x = PAD; titleT.y = y;
    outer.appendChild(titleT);
    y += 80 + 40;

    if (isSemantic(col)) {
      y = await buildThemesSection(outer, col, y, PAD, FRAME_W, CARD_W, CARD_H, CARD_GAP, SWATCH_SZ, GROUP_LBL_W, titleFont);
    } else {
      y = await buildPrimitivesSection(outer, col, y, PAD, FRAME_W, CARD_W, CARD_GAP, SWATCH_SZ, GROUP_LBL_W, CARDS_PER_ROW, titleFont);
    }

    y += SECTION_GAP;
  }

  y += PAD;
  outer.resize(FRAME_W, y);
  return outer;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES SECTION
// group label (left) | wrapping row of cards
// ══════════════════════════════════════════════════════════════════════════════
async function buildPrimitivesSection(outer, col, y, PAD, FRAME_W, CARD_W, CARD_GAP, SWATCH_SZ, GROUP_LBL_W, CARDS_PER_ROW, titleFont) {
  var ROW_H    = 76;
  var ROW_GAP  = 8;
  var GRP_GAP  = 40;
  var CONTENT_X = PAD + GROUP_LBL_W + 20;
  var CONTENT_W = FRAME_W - CONTENT_X - PAD;
  CARDS_PER_ROW = Math.floor((CONTENT_W + CARD_GAP) / (CARD_W + CARD_GAP));

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
    var group = parts.length > 1 ? parts[parts.length - 2] : '—';
    var groupLabel = group.charAt(0).toUpperCase() + group.slice(1);
    if (!groups[group]) { groups[group] = { label: groupLabel, tokens: [] }; groupOrder.push(group); }
    groups[group].tokens.push({
      name: parts[parts.length - 1],
      fullName: variable.name,
      variableId: variable.id,
      r: resolved.rgba.r, g: resolved.rgba.g,
      b: resolved.rgba.b, a: resolved.rgba.a
    });
  }

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var gKey = groupOrder[gi];
    var g = groups[gKey];
    var tokens = g.tokens;
    var numRows = Math.ceil(tokens.length / CARDS_PER_ROW);
    var groupH = numRows * ROW_H + (numRows - 1) * ROW_GAP;

    // Group label — vertically centered
    if (g.label !== '—') {
      var glbl = figma.createText();
      glbl.characters = g.label;
      glbl.fontName = titleFont;
      glbl.fontSize = 32;
      glbl.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.5 }];
      glbl.x = PAD;
      glbl.y = y + (groupH - 35) / 2;
      outer.appendChild(glbl);
    }

    var col_i = 0;
    var row_y = y;

    for (var ti = 0; ti < tokens.length; ti++) {
      var token = tokens[ti];
      var card = makeColorCard(token.fullName, CARD_W, ROW_H, token, SWATCH_SZ);
      card.x = CONTENT_X + col_i * (CARD_W + CARD_GAP);
      card.y = row_y;

      // Bind variable to swatch
      try {
        var sw = card.findOne(function(n) { return n.name === 'swatch'; });
        if (sw) {
          var bf = figma.variables.setBoundVariableForPaint(
            { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a },
            'color',
            figma.variables.getVariableById(token.variableId)
          );
          sw.fills = [bf];
        }
      } catch(e) {}

      outer.appendChild(card);
      col_i++;
      if (col_i >= CARDS_PER_ROW) { col_i = 0; row_y += ROW_H + ROW_GAP; }
    }

    y = (col_i === 0 ? row_y : row_y + ROW_H) + GRP_GAP;
  }

  return y;
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES SECTION
// Header row: Semantic | Mode1 | Mode2 ...
// Each token row: name card | mode1 card (swatch + primitive) | mode2 card ...
// ══════════════════════════════════════════════════════════════════════════════
async function buildThemesSection(outer, col, y, PAD, FRAME_W, CARD_W, CARD_H, CARD_GAP, SWATCH_SZ, GROUP_LBL_W, titleFont) {
  var ROW_H     = 76;
  var ROW_GAP   = 8;
  var HDR_GAP   = 16;
  var modes     = col.modes;
  var TOKEN_W   = GROUP_LBL_W; // semantic name col same width as group label col
  var CONTENT_X = PAD + TOKEN_W + 20;
  var AVAIL_W   = FRAME_W - CONTENT_X - PAD;
  // Each mode gets equal width
  var MODE_W    = Math.floor((AVAIL_W - (modes.length - 1) * CARD_GAP) / modes.length);

  // Column headers
  var semHdr = figma.createText();
  semHdr.characters = 'Semantic';
  semHdr.fontName = titleFont;
  semHdr.fontSize = 32;
  semHdr.fills = [{ type: 'SOLID', color: { r: 0.35, g: 0.35, b: 0.35 } }];
  semHdr.x = PAD; semHdr.y = y;
  outer.appendChild(semHdr);

  for (var mi = 0; mi < modes.length; mi++) {
    var mHdr = figma.createText();
    mHdr.characters = modes[mi].name;
    mHdr.fontName = titleFont;
    mHdr.fontSize = 32;
    mHdr.fills = [{ type: 'SOLID', color: { r: 0.35, g: 0.35, b: 0.35 } }];
    mHdr.x = CONTENT_X + mi * (MODE_W + CARD_GAP);
    mHdr.y = y;
    outer.appendChild(mHdr);
  }

  y += 48 + HDR_GAP;

  // Token rows
  for (var ti = 0; ti < col.variableIds.length; ti++) {
    var variable = figma.variables.getVariableById(col.variableIds[ti]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;

    var parts = variable.name.split('/');
    var shortName = parts[parts.length - 1];
    var cssName = '--' + variable.name.replace(/\//g, '-').toLowerCase();

    // Semantic name card
    var nameCard = figma.createFrame();
    nameCard.name = variable.name;
    nameCard.resize(TOKEN_W, ROW_H);
    nameCard.x = PAD; nameCard.y = y;
    nameCard.cornerRadius = 8;
    nameCard.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    nameCard.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.08 }];
    nameCard.strokeWeight = 1;

    var nt = figma.createText();
    nt.characters = cssName;
    nt.fontName = { family: 'Inter', style: 'Regular' };
    nt.fontSize = 13;
    nt.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    nt.x = 16; nt.y = (ROW_H - 16) / 2;
    nt.resize(TOKEN_W - 32, 16);
    nt.textTruncation = 'ENDING';
    nameCard.appendChild(nt);
    outer.appendChild(nameCard);

    // One card per mode
    for (var mi2 = 0; mi2 < modes.length; mi2++) {
      var mode = modes[mi2];
      var raw = variable.valuesByMode[mode.id];
      var resolved = resolveColor(raw, mode.id);
      if (!resolved) continue;

      var token = {
        name: resolved.aliasName || shortName,
        fullName: variable.name,
        variableId: variable.id,
        r: resolved.rgba.r, g: resolved.rgba.g,
        b: resolved.rgba.b, a: resolved.rgba.a,
        isThemeCard: true,
        primitiveName: resolved.aliasName
      };

      var modeCard = makeColorCard(variable.name + ' / ' + mode.name, MODE_W, ROW_H, token, SWATCH_SZ);
      modeCard.x = CONTENT_X + mi2 * (MODE_W + CARD_GAP);
      modeCard.y = y;

      // Bind variable to swatch
      try {
        var sw2 = modeCard.findOne(function(n) { return n.name === 'swatch'; });
        if (sw2) {
          var bf2 = figma.variables.setBoundVariableForPaint(
            { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a },
            'color',
            figma.variables.getVariableById(token.variableId)
          );
          sw2.fills = [bf2];
        }
      } catch(e) {}

      outer.appendChild(modeCard);
    }

    y += ROW_H + ROW_GAP;
  }

  return y;
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED: make a colour card
// For primitives: swatch | --name | # HEX | alpha%
// For themes: swatch | primitive-name
// ══════════════════════════════════════════════════════════════════════════════
function makeColorCard(name, cardW, cardH, token, swatchSz) {
  var card = figma.createFrame();
  card.name = name;
  card.resize(cardW, cardH);
  card.cornerRadius = 8;
  card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  card.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.08 }];
  card.strokeWeight = 1;
  card.clipsContent = false;

  var PAD_IN = 16;

  // Swatch container (with border, matches reference 44x44)
  var swatchWrap = figma.createFrame();
  swatchWrap.name = 'swatch-wrap';
  swatchWrap.resize(swatchSz, swatchSz);
  swatchWrap.x = PAD_IN; swatchWrap.y = (cardH - swatchSz) / 2;
  swatchWrap.cornerRadius = 3;
  swatchWrap.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.12 }];
  swatchWrap.strokeWeight = 1;
  swatchWrap.fills = [];
  swatchWrap.clipsContent = true;

  // Inner colour fill
  var swatchInner = figma.createRectangle();
  swatchInner.name = 'swatch';
  swatchInner.resize(swatchSz - 5, swatchSz - 5);
  swatchInner.x = 2; swatchInner.y = 2;
  swatchInner.cornerRadius = 2;

  if (token.a < 1) {
    swatchInner.fills = [
      { type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } },
      { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a }
    ];
  } else {
    swatchInner.fills = [{ type: 'SOLID', color: { r: token.r, g: token.g, b: token.b } }];
  }
  swatchWrap.appendChild(swatchInner);
  card.appendChild(swatchWrap);

  var textX = PAD_IN + swatchSz + 16;
  var textW = cardW - textX - PAD_IN;

  if (token.isThemeCard) {
    // Theme card: just show primitive name
    var primT = figma.createText();
    primT.characters = '--' + (token.primitiveName || token.name);
    primT.fontName = { family: 'Inter', style: 'Regular' };
    primT.fontSize = 13;
    primT.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    primT.x = textX; primT.y = (cardH - 16) / 2;
    primT.resize(textW, 16);
    primT.textTruncation = 'ENDING';
    card.appendChild(primT);
  } else {
    // Primitive card: --name on top, hex + alpha below
    var nameT = figma.createText();
    var cssName = '--' + token.fullName.replace(/\//g, '-').toLowerCase();
    nameT.characters = cssName;
    nameT.fontName = { family: 'Inter', style: 'Regular' };
    nameT.fontSize = 13;
    nameT.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    nameT.x = textX; nameT.y = (cardH - 34) / 2;
    nameT.resize(textW, 16);
    nameT.textTruncation = 'ENDING';
    card.appendChild(nameT);

    // Hex + alpha row
    var hex = '# ' + rgbToHex(token.r, token.g, token.b).replace('#', '');
    var hexT = figma.createText();
    hexT.characters = hex;
    hexT.fontName = { family: 'Inter', style: 'Regular' };
    hexT.fontSize = 13;
    hexT.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
    hexT.x = textX; hexT.y = (cardH - 34) / 2 + 18;
    card.appendChild(hexT);

    if (token.a < 1) {
      var alphaT = figma.createText();
      alphaT.characters = Math.round(token.a * 100) + '%';
      alphaT.fontName = { family: 'Inter', style: 'Regular' };
      alphaT.fontSize = 13;
      alphaT.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
      alphaT.x = cardW - PAD_IN - 36; alphaT.y = (cardH - 34) / 2 + 18;
      card.appendChild(alphaT);
    }
  }

  return card;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(function(n) {
    return Math.round(n * 255).toString(16).padStart(2, '0').toUpperCase();
  }).join('');
}
