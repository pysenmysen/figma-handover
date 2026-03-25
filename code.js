// Grebbans Handover — code.js v0.8

var VERSION = '0.8';
var FONT = { family: 'Inter', style: 'Regular' };
var FONT_MED = { family: 'Inter', style: 'Medium' };

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

async function buildFrames(collectionIds) {
  // Try Neue Haas, fall back to Inter
  try {
    await figma.loadFontAsync({ family: 'Neue Haas Grotesk Display Pro', style: 'Regular' });
    FONT = { family: 'Neue Haas Grotesk Display Pro', style: 'Regular' };
    FONT_MED = { family: 'Neue Haas Grotesk Display Pro', style: 'Medium' };
  } catch(e) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sf(r, g, b, a) {
  var f = { type: 'SOLID', color: { r: r, g: g, b: b } };
  if (a !== undefined && a < 1) f.opacity = a;
  return f;
}

function txt(chars, size, col, fontStyle) {
  var t = figma.createText();
  t.fontName = fontStyle === 'medium' ? FONT_MED : FONT;
  t.fontSize = size;
  t.characters = chars;
  t.fills = col ? [sf(col[0], col[1], col[2], col[3])] : [sf(0,0,0,1)];
  return t;
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(function(n){ return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase(); }).join('');
}

function bindSwatch(node, variableId, r, g, b, a) {
  try {
    var v = figma.variables.getVariableById(variableId);
    if (v) {
      node.fills = [figma.variables.setBoundVariableForPaint(sf(r,g,b,a), 'color', v)];
      return;
    }
  } catch(e) {}
  node.fills = [sf(r,g,b,a)];
}

// ─── Swatch card component ────────────────────────────────────────────────────
function makeSwatchCard(token, w) {
  // Card: white bg, border, 8px radius, row layout
  var SWATCH = 44, PAD = 16, GAP = 16, H = 76;
  var card = figma.createFrame();
  card.name = token.fullName;
  card.resize(w, H);
  card.cornerRadius = 8;
  card.fills = [sf(1,1,1)];
  card.strokes = [sf(0.88, 0.88, 0.88)];
  card.strokeWeight = 1;

  // Swatch outer (border + inner)
  var swOut = figma.createFrame();
  swOut.resize(SWATCH, SWATCH);
  swOut.cornerRadius = 2.4;
  swOut.fills = [];
  swOut.strokes = [sf(0,0,0)];
  swOut.strokeWeight = 1;
  swOut.x = PAD; swOut.y = (H - SWATCH) / 2;
  var swIn = figma.createRectangle();
  swIn.resize(SWATCH - 4.8, SWATCH - 4.8);
  swIn.x = 2.4; swIn.y = 2.4;
  swIn.cornerRadius = 1;
  bindSwatch(swIn, token.variableId, token.r, token.g, token.b, token.a);
  swOut.appendChild(swIn);
  card.appendChild(swOut);

  // Token name
  var nameT = txt(token.name, 12, [0.1,0.1,0.1,1]);
  nameT.x = PAD + SWATCH + GAP;
  nameT.y = (H - 32) / 2;
  nameT.resize(w - PAD - SWATCH - GAP - 70 - PAD, 14);
  nameT.textTruncation = 'ENDING';
  card.appendChild(nameT);

  // Hex
  var hex = rgbToHex(token.r, token.g, token.b);
  var hexT = txt('# ' + hex.replace('#',''), 12, [0.55,0.55,0.55,1]);
  hexT.textAlignHorizontal = 'RIGHT';
  hexT.textAutoResize = 'WIDTH_AND_HEIGHT';
  hexT.x = w - PAD - 60;
  hexT.y = (H - 14) / 2;
  card.appendChild(hexT);

  // Alpha
  if (token.a < 1) {
    var aT = txt(Math.round(token.a*100)+'%', 12, [0.55,0.55,0.55,1]);
    aT.textAlignHorizontal = 'RIGHT';
    aT.textAutoResize = 'WIDTH_AND_HEIGHT';
    aT.x = w - PAD - 28;
    aT.y = (H - 14) / 2;
    hexT.x = w - PAD - 94;
    card.appendChild(aT);
  }

  return card;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════
async function buildPrimitivesFrame(col) {
  var PAD = 80, FRAME_W = 2000, LABEL_W = 140;
  var CARD_W = 267, CARD_GAP = 8, CARDS_PER_ROW = 6;
  var ROW_GAP = 8, GROUP_GAP = 32;
  var CONTENT_X = PAD + LABEL_W + 24;
  var CONTENT_W = FRAME_W - CONTENT_X - PAD;

  // Group tokens
  var groups = {}, groupOrder = [];
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var raw = v.valuesByMode[col.defaultModeId];
    var res = resolveColor(raw, col.defaultModeId);
    if (!res) continue;
    var parts = v.name.split('/');
    var gKey = parts.length > 1 ? parts.slice(0,-1).join('/') : '—';
    var gLabel = parts.length > 1 ? parts[parts.length-2] : '—';
    gLabel = gLabel.charAt(0).toUpperCase() + gLabel.slice(1);
    if (!groups[gKey]) { groups[gKey] = { label: gLabel, tokens: [] }; groupOrder.push(gKey); }
    groups[gKey].tokens.push({
      name: '--' + v.name.replace(/\//g,'-').toLowerCase(),
      fullName: v.name, variableId: v.id,
      r: res.rgba.r, g: res.rgba.g, b: res.rgba.b, a: res.rgba.a
    });
  }

  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / ' + col.name;
  outer.fills = [sf(1,1,1,0.3)];
  outer.cornerRadius = 40;
  outer.clipsContent = false;
  outer.resize(FRAME_W, 100);

  var y = PAD;

  // Title
  var titleT = txt(col.name, 64, [0,0,0,1]);
  titleT.x = PAD; titleT.y = y;
  titleT.textAutoResize = 'WIDTH_AND_HEIGHT';
  outer.appendChild(titleT);
  y += 80 + 40;

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var g = groups[groupOrder[gi]];
    var tokens = g.tokens;
    var rowsNeeded = Math.ceil(tokens.length / CARDS_PER_ROW);
    var groupH = rowsNeeded * 76 + (rowsNeeded-1) * ROW_GAP;

    // Group label
    if (g.label !== '—') {
      var lT = txt(g.label, 16, [0,0,0,0.5]);
      lT.x = PAD; lT.y = y + (groupH - 18) / 2;
      lT.textAutoResize = 'WIDTH_AND_HEIGHT';
      outer.appendChild(lT);
    }

    var col_i = 0, row_y = y;
    for (var ti = 0; ti < tokens.length; ti++) {
      var token = tokens[ti];
      var card = makeSwatchCard(token, CARD_W);
      card.x = CONTENT_X + col_i * (CARD_W + CARD_GAP);
      card.y = row_y;
      outer.appendChild(card);
      col_i++;
      if (col_i >= CARDS_PER_ROW) { col_i = 0; row_y += 76 + ROW_GAP; }
    }
    y = (col_i === 0 ? row_y : row_y + 76) + GROUP_GAP;
  }

  y += PAD;
  outer.resize(FRAME_W, y);
  return outer;
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES
// Columns: Semantic (fixed) | Mode1 | Mode2 | Mode3...
// Each mode col: swatch + primitive name
// ══════════════════════════════════════════════════════════════════════════════
async function buildThemesFrame(col) {
  var PAD = 80;
  var SEMANTIC_W = 380;
  var MODE_W = 380;
  var COL_GAP = 20;
  var ROW_H = 76, ROW_GAP = 8;
  var SWATCH = 44, SWATCH_PAD = 2.4;
  var modes = col.modes;
  var FRAME_W = PAD + SEMANTIC_W + COL_GAP + modes.length * (MODE_W + COL_GAP) - COL_GAP + PAD;

  // Collect tokens
  var tokens = [];
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    tokens.push({ name: '--' + v.name.replace(/\//g,'-').toLowerCase(), fullName: v.name, variableId: v.id });
  }

  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / ' + col.name;
  outer.fills = [sf(1,1,1,0.3)];
  outer.cornerRadius = 40;
  outer.clipsContent = false;
  outer.resize(FRAME_W, 100);

  var y = PAD;

  // Title
  var titleT = txt(col.name, 64, [0,0,0,1]);
  titleT.x = PAD; titleT.y = y;
  titleT.textAutoResize = 'WIDTH_AND_HEIGHT';
  outer.appendChild(titleT);
  y += 80 + 40;

  // Column headers
  var semHdrT = txt('Semantic', 20, [0.35,0.35,0.35,1]);
  semHdrT.x = PAD; semHdrT.y = y;
  semHdrT.textAutoResize = 'WIDTH_AND_HEIGHT';
  outer.appendChild(semHdrT);

  for (var mi = 0; mi < modes.length; mi++) {
    var mHdrT = txt(modes[mi].name, 20, [0.35,0.35,0.35,1]);
    mHdrT.x = PAD + SEMANTIC_W + COL_GAP + mi * (MODE_W + COL_GAP);
    mHdrT.y = y;
    mHdrT.textAutoResize = 'WIDTH_AND_HEIGHT';
    outer.appendChild(mHdrT);
  }
  y += 32;

  // Rows
  for (var ti = 0; ti < tokens.length; ti++) {
    var token = tokens[ti];
    var variable = figma.variables.getVariableById(token.variableId);
    if (!variable) continue;

    // Semantic card
    var semCard = figma.createFrame();
    semCard.name = token.fullName;
    semCard.resize(SEMANTIC_W, ROW_H);
    semCard.x = PAD; semCard.y = y;
    semCard.cornerRadius = 8;
    semCard.fills = [sf(1,1,1)];
    semCard.strokes = [sf(0.88,0.88,0.88)];
    semCard.strokeWeight = 1;
    var semT = txt(token.name, 13, [0,0,0,1]);
    semT.x = 16; semT.y = (ROW_H - 16) / 2;
    semT.resize(SEMANTIC_W - 32, 16);
    semT.textTruncation = 'ENDING';
    semCard.appendChild(semT);
    outer.appendChild(semCard);

    // Mode cards
    for (var mi2 = 0; mi2 < modes.length; mi2++) {
      var mode = modes[mi2];
      var raw = variable.valuesByMode[mode.id];
      var res = resolveColor(raw, mode.id);

      var modeCard = figma.createFrame();
      modeCard.name = token.fullName + ' / ' + mode.name;
      modeCard.resize(MODE_W, ROW_H);
      modeCard.x = PAD + SEMANTIC_W + COL_GAP + mi2 * (MODE_W + COL_GAP);
      modeCard.y = y;
      modeCard.cornerRadius = 8;
      modeCard.fills = [sf(1,1,1)];
      modeCard.strokes = [sf(0.88,0.88,0.88)];
      modeCard.strokeWeight = 1;
      outer.appendChild(modeCard);

      if (!res) {
        var noT = txt('—', 13, [0.6,0.6,0.6,1]);
        noT.x = 16; noT.y = (ROW_H-16)/2;
        modeCard.appendChild(noT);
        continue;
      }

      // Swatch
      var swOut = figma.createFrame();
      swOut.resize(SWATCH, SWATCH);
      swOut.cornerRadius = SWATCH_PAD;
      swOut.fills = [];
      swOut.strokes = [sf(0,0,0)];
      swOut.strokeWeight = 1;
      swOut.x = 16; swOut.y = (ROW_H-SWATCH)/2;
      var swIn = figma.createRectangle();
      swIn.resize(SWATCH - SWATCH_PAD*2, SWATCH - SWATCH_PAD*2);
      swIn.x = SWATCH_PAD; swIn.y = SWATCH_PAD;
      swIn.cornerRadius = 1;
      bindSwatch(swIn, token.variableId, res.rgba.r, res.rgba.g, res.rgba.b, res.rgba.a);
      swOut.appendChild(swIn);
      modeCard.appendChild(swOut);

      // Primitive name
      var primName = '--' + (res.aliasName || '').replace(/\//g,'-').toLowerCase();
      var primT = txt(primName || '—', 13, [0.15,0.15,0.15,1]);
      primT.x = 16 + SWATCH + 12;
      primT.y = (ROW_H-16)/2;
      primT.resize(MODE_W - 16 - SWATCH - 12 - 16, 16);
      primT.textTruncation = 'ENDING';
      modeCard.appendChild(primT);
    }
    y += ROW_H + ROW_GAP;
  }

  y += PAD;
  outer.resize(FRAME_W, y);
  return outer;
}
