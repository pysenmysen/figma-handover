// Grebbans Handover — code.js v0.4

var VERSION = '0.4';

figma.showUI(__html__, { width: 480, height: 560, themeColors: true });

(async function init() {
  var collections = figma.variables.getLocalVariableCollections();
  var summary = collections.map(function(col) {
    var modeId = col.defaultModeId;
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
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// ─── Resolve alias chain → returns { rgba, aliasName } ───────────────────────
function resolveColor(rawVal, preferredModeId) {
  var val = rawVal;
  var aliasName = null;
  var depth = 0;

  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;
    // Capture the first alias name (the direct reference, e.g. "col-base-black")
    if (aliasName === null) {
      var parts = ref.name.split('/');
      aliasName = parts[parts.length - 1];
    }
    var refCol = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    var fallbackMode = refCol ? refCol.defaultModeId : null;
    val = ref.valuesByMode[preferredModeId] || (fallbackMode ? ref.valuesByMode[fallbackMode] : null);
  }

  if (val && typeof val === 'object' && 'r' in val) {
    return { rgba: val, aliasName: aliasName };
  }
  return null;
}

// ─── Detect if a collection is "semantic" (aliases only, no raw values) ───────
function isSemanticCollection(col) {
  var modeId = col.defaultModeId;
  var aliasCount = 0;
  var total = 0;
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

  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /');
  }).forEach(function(f) { f.remove(); });

  var xOffset = 0;
  var GAP = 48;

  for (var c = 0; c < collectionIds.length; c++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[c]);
    if (!col) continue;

    figma.ui.postMessage({ type: 'progress', step: c, total: collectionIds.length, name: col.name });

    var isSemantic = isSemanticCollection(col);
    var frame;

    if (isSemantic && col.modes.length > 1) {
      // Multi-mode semantic → one combined frame with all modes as columns
      frame = await buildSemanticMultiModeFrame(col);
    } else if (isSemantic) {
      // Single-mode semantic → token list layout
      frame = await buildSemanticFrame(col, col.modes[0].modeId, '◈ Grebbans / ' + col.name);
    } else {
      // Primitives → swatch grid
      frame = await buildSwatchFrame(col, col.modes[0].modeId, '◈ Grebbans / ' + col.name);
    }

    frame.x = xOffset;
    frame.y = 0;
    figma.currentPage.appendChild(frame);
    xOffset += frame.width + GAP;
  }

  figma.viewport.scrollAndZoomIntoView(
    figma.currentPage.findAll(function(n) {
      return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /');
    })
  );
}

// ─── SWATCH FRAME (Primitives) ────────────────────────────────────────────────
async function buildSwatchFrame(col, modeId, frameName) {
  var SWATCH_W = 160;
  var SWATCH_H = 64;
  var LABEL_H  = 36;
  var COL_GAP  = 12;
  var ROW_GAP  = 8;
  var GROUP_GAP = 28;
  var PAD      = 24;
  var COLS     = 3;

  var groups = {};
  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;
    var raw = variable.valuesByMode[modeId];
    var resolved = resolveColor(raw, modeId);
    if (!resolved) continue;
    var parts = variable.name.split('/');
    var group = parts.length > 1 ? parts.slice(0, -1).join(' / ') : '—';
    if (!groups[group]) groups[group] = [];
    groups[group].push({
      name: parts[parts.length - 1],
      fullName: variable.name,
      variableId: variable.id,
      r: resolved.rgba.r, g: resolved.rgba.g,
      b: resolved.rgba.b, a: resolved.rgba.a
    });
  }

  var outer = figma.createFrame();
  outer.name = frameName;
  outer.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
  outer.cornerRadius = 16;
  outer.clipsContent = true;

  var y = PAD;
  var titleT = figma.createText();
  titleT.characters = frameName.replace('◈ Grebbans / ', '');
  titleT.fontName = { family: 'Inter', style: 'Medium' };
  titleT.fontSize = 18;
  titleT.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.05 } }];
  titleT.x = PAD; titleT.y = y;
  outer.appendChild(titleT);
  y += 32 + 16;

  var groupKeys = Object.keys(groups);
  for (var gi = 0; gi < groupKeys.length; gi++) {
    var groupName = groupKeys[gi];
    var tokens = groups[groupName];

    if (groupName !== '—') {
      var lbl = figma.createText();
      lbl.characters = groupName.toUpperCase();
      lbl.fontName = { family: 'Inter', style: 'Medium' };
      lbl.fontSize = 9;
      lbl.letterSpacing = { value: 8, unit: 'PERCENT' };
      lbl.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      lbl.x = PAD; lbl.y = y;
      outer.appendChild(lbl);
      y += 18 + 8;
    }

    var col_i = 0;
    var row_y = y;

    for (var ti = 0; ti < tokens.length; ti++) {
      var token = tokens[ti];
      var card = figma.createFrame();
      card.name = token.fullName;
      card.resize(SWATCH_W, SWATCH_H + LABEL_H);
      card.x = PAD + col_i * (SWATCH_W + COL_GAP);
      card.y = row_y;
      card.cornerRadius = 8;
      card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      card.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
      card.strokeWeight = 1;
      card.clipsContent = true;

      // Swatch rect — apply actual variable fill binding
      var sw = figma.createRectangle();
      sw.name = 'swatch';
      sw.resize(SWATCH_W, SWATCH_H);
      sw.x = 0; sw.y = 0;

      // Apply the variable as a bound fill
      var boundFill = figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a },
        'color',
        figma.variables.getVariableById(token.variableId)
      );
      sw.fills = [boundFill];
      card.appendChild(sw);

      // Name
      var nt = figma.createText();
      nt.characters = token.name;
      nt.fontName = { family: 'Inter', style: 'Medium' };
      nt.fontSize = 10;
      nt.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
      nt.x = 8; nt.y = SWATCH_H + 7;
      nt.resize(SWATCH_W - 16, 14);
      nt.textTruncation = 'ENDING';
      card.appendChild(nt);

      // Hex
      var hex = rgbToHex(token.r, token.g, token.b);
      var alphaStr = token.a < 1 ? ' · ' + Math.round(token.a * 100) + '%' : '';
      var ht = figma.createText();
      ht.characters = hex + alphaStr;
      ht.fontName = { family: 'Inter', style: 'Regular' };
      ht.fontSize = 9;
      ht.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
      ht.x = 8; ht.y = SWATCH_H + 20;
      ht.resize(SWATCH_W - 16, 12);
      ht.textTruncation = 'ENDING';
      card.appendChild(ht);

      outer.appendChild(card);
      col_i++;
      if (col_i >= COLS) { col_i = 0; row_y += SWATCH_H + LABEL_H + ROW_GAP; }
    }

    y = (col_i === 0 ? row_y : row_y + SWATCH_H + LABEL_H) + GROUP_GAP;
  }

  y += PAD;
  outer.resize(PAD + COLS * SWATCH_W + (COLS - 1) * COL_GAP + PAD, y);
  return outer;
}

// ─── SEMANTIC SINGLE MODE (token list, 2 columns) ─────────────────────────────
async function buildSemanticFrame(col, modeId, frameName) {
  var tokens = getSemanticTokens(col, modeId);
  return buildSemanticLayout([{ name: frameName.replace('◈ Grebbans / ', ''), tokens: tokens }], frameName);
}

// ─── SEMANTIC MULTI MODE (all modes in one frame) ─────────────────────────────
async function buildSemanticMultiModeFrame(col) {
  var frameName = '◈ Grebbans / ' + col.name;
  var modeGroups = col.modes.map(function(m) {
    return { name: m.name, tokens: getSemanticTokens(col, m.modeId) };
  });
  return buildSemanticLayout(modeGroups, frameName);
}

function getSemanticTokens(col, modeId) {
  var tokens = [];
  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;
    var raw = variable.valuesByMode[modeId];
    var resolved = resolveColor(raw, modeId);
    if (!resolved) continue;
    var parts = variable.name.split('/');
    tokens.push({
      name: parts[parts.length - 1],
      fullName: variable.name,
      variableId: variable.id,
      aliasName: resolved.aliasName,
      r: resolved.rgba.r, g: resolved.rgba.g,
      b: resolved.rgba.b, a: resolved.rgba.a
    });
  }
  return tokens;
}

async function buildSemanticLayout(modeGroups, frameName) {
  var PAD       = 24;
  var ROW_H     = 44;
  var ROW_GAP   = 6;
  var SWATCH_SZ = 28;
  var COL_W     = 260;
  var COL_GAP   = 20;
  var COLS      = 2;
  var numModes  = modeGroups.length;

  // Total frame width: PAD + numModes * (COLS * COL_W + (COLS-1) * COL_GAP) + (numModes-1) * divider + PAD
  var MODE_W    = COLS * COL_W + (COLS - 1) * COL_GAP;
  var MODE_GAP  = 32;
  var totalW    = PAD + numModes * MODE_W + (numModes - 1) * MODE_GAP + PAD;

  var outer = figma.createFrame();
  outer.name = frameName;
  outer.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
  outer.cornerRadius = 16;
  outer.clipsContent = true;

  var y = PAD;

  // Title
  var titleT = figma.createText();
  titleT.characters = frameName.replace('◈ Grebbans / ', '');
  titleT.fontName = { family: 'Inter', style: 'Medium' };
  titleT.fontSize = 18;
  titleT.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.05 } }];
  titleT.x = PAD; titleT.y = y;
  outer.appendChild(titleT);
  y += 32 + 16;

  var maxRows = 0;
  for (var mi = 0; mi < numModes; mi++) {
    var mg = modeGroups[mi];
    var modeX = PAD + mi * (MODE_W + MODE_GAP);

    // Mode label
    var modeLbl = figma.createText();
    modeLbl.characters = mg.name;
    modeLbl.fontName = { family: 'Inter', style: 'Medium' };
    modeLbl.fontSize = 11;
    modeLbl.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
    modeLbl.x = modeX; modeLbl.y = y;
    outer.appendChild(modeLbl);

    // Column headers
    var hdrY = y + 20;
    var headers = ['Semantic', 'Primitive'];
    for (var h = 0; h < headers.length; h++) {
      var hdr = figma.createText();
      hdr.characters = headers[h].toUpperCase();
      hdr.fontName = { family: 'Inter', style: 'Medium' };
      hdr.fontSize = 9;
      hdr.letterSpacing = { value: 8, unit: 'PERCENT' };
      hdr.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
      hdr.x = modeX + h * (COL_W + COL_GAP); hdr.y = hdrY;
      outer.appendChild(hdr);
    }

    var rowY = hdrY + 20;

    for (var ti = 0; ti < mg.tokens.length; ti++) {
      var token = mg.tokens[ti];

      // Semantic column — swatch + name
      var semCard = figma.createFrame();
      semCard.name = token.fullName;
      semCard.resize(COL_W, ROW_H);
      semCard.x = modeX; semCard.y = rowY;
      semCard.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      semCard.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
      semCard.strokeWeight = 1;
      semCard.cornerRadius = 6;
      semCard.clipsContent = false;

      // Swatch circle with variable binding
      var dot = figma.createEllipse();
      dot.name = 'swatch';
      dot.resize(SWATCH_SZ, SWATCH_SZ);
      dot.x = 8; dot.y = (ROW_H - SWATCH_SZ) / 2;

      var boundFill = figma.variables.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a },
        'color',
        figma.variables.getVariableById(token.variableId)
      );
      dot.fills = [boundFill];
      dot.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
      dot.strokeWeight = 1;
      semCard.appendChild(dot);

      var semName = figma.createText();
      semName.characters = token.name;
      semName.fontName = { family: 'Inter', style: 'Medium' };
      semName.fontSize = 11;
      semName.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
      semName.x = SWATCH_SZ + 16; semName.y = (ROW_H - 14) / 2;
      semName.resize(COL_W - SWATCH_SZ - 24, 14);
      semName.textTruncation = 'ENDING';
      semCard.appendChild(semName);
      outer.appendChild(semCard);

      // Primitive column — swatch + alias name
      var primCard = figma.createFrame();
      primCard.name = token.fullName + ' (primitive)';
      primCard.resize(COL_W, ROW_H);
      primCard.x = modeX + COL_W + COL_GAP; primCard.y = rowY;
      primCard.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      primCard.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
      primCard.strokeWeight = 1;
      primCard.cornerRadius = 6;
      primCard.clipsContent = false;

      // Primitive swatch (resolved colour, no binding)
      var primDot = figma.createEllipse();
      primDot.resize(SWATCH_SZ, SWATCH_SZ);
      primDot.x = 8; primDot.y = (ROW_H - SWATCH_SZ) / 2;
      primDot.fills = token.a < 1
        ? [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } },
           { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a }]
        : [{ type: 'SOLID', color: { r: token.r, g: token.g, b: token.b } }];
      primDot.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
      primDot.strokeWeight = 1;
      primCard.appendChild(primDot);

      var primLabel = figma.createText();
      primLabel.characters = token.aliasName || rgbToHex(token.r, token.g, token.b);
      primLabel.fontName = { family: 'Inter', style: 'Regular' };
      primLabel.fontSize = 11;
      primLabel.fills = [{ type: 'SOLID', color: { r: 0.35, g: 0.35, b: 0.35 } }];
      primLabel.x = SWATCH_SZ + 16; primLabel.y = (ROW_H - 14) / 2;
      primLabel.resize(COL_W - SWATCH_SZ - 24, 14);
      primLabel.textTruncation = 'ENDING';
      primCard.appendChild(primLabel);
      outer.appendChild(primCard);

      rowY += ROW_H + ROW_GAP;
    }

    var rowsThisMode = mg.tokens.length;
    if (rowsThisMode > maxRows) maxRows = rowsThisMode;
  }

  var totalH = y + 20 + 20 + maxRows * (ROW_H + ROW_GAP) + PAD;
  outer.resize(totalW, totalH);
  return outer;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(function(n) {
    return Math.round(n * 255).toString(16).padStart(2, '0').toUpperCase();
  }).join('');
}
