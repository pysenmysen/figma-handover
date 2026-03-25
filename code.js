// Grebbans Handover — code.js v0.6

var VERSION = '0.6';

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

  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /');
  }).forEach(function(f) { f.remove(); });

  var xOffset = 0;
  var GAP = 56;

  for (var c = 0; c < collectionIds.length; c++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[c]);
    if (!col) continue;
    figma.ui.postMessage({ type: 'progress', step: c, total: collectionIds.length, name: col.name });

    var frame = isSemantic(col)
      ? await buildThemesFrame(col)
      : await buildPrimitivesFrame(col);

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

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// Layout: group label (left col) | card: swatch + name + hex [+ alpha]
// ══════════════════════════════════════════════════════════════════════════════
async function buildPrimitivesFrame(col) {
  var PAD        = 32;
  var TITLE_H    = 56;
  var ROW_H      = 44;
  var ROW_GAP    = 6;
  var GROUP_GAP  = 24;
  var SWATCH_SZ  = 24;
  var LEFT_W     = 120;
  var DIVIDER    = 24;
  var CARD_H     = ROW_H;
  var CARD_W     = 220;
  var CARD_GAP   = 8;
  var CARDS_PER_ROW = 3;
  var CONTENT_W  = CARDS_PER_ROW * CARD_W + (CARDS_PER_ROW - 1) * CARD_GAP;
  var FRAME_W    = PAD + LEFT_W + DIVIDER + CONTENT_W + PAD;

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
    var group = parts.length > 1 ? parts.slice(0, -1).join('/') : '—';
    // Friendly group label — last segment of path
    var groupLabel = parts.length > 1 ? parts[parts.length - 2] : '—';
    // Capitalise first letter
    groupLabel = groupLabel.charAt(0).toUpperCase() + groupLabel.slice(1);
    if (!groups[group]) { groups[group] = { label: groupLabel, tokens: [] }; groupOrder.push(group); }
    groups[group].tokens.push({
      name: parts[parts.length - 1],
      fullName: variable.name,
      variableId: variable.id,
      r: resolved.rgba.r, g: resolved.rgba.g,
      b: resolved.rgba.b, a: resolved.rgba.a
    });
  }

  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / ' + col.name;
  outer.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
  outer.cornerRadius = 16;
  outer.clipsContent = false;

  var y = PAD;

  // Title
  var titleT = figma.createText();
  titleT.characters = col.name;
  titleT.fontName = { family: 'Inter', style: 'Medium' };
  titleT.fontSize = 32;
  titleT.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.05 } }];
  titleT.x = PAD; titleT.y = y;
  outer.appendChild(titleT);
  y += TITLE_H + 16;

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var gKey = groupOrder[gi];
    var g = groups[gKey];
    var tokens = g.tokens;
    var rowsNeeded = Math.ceil(tokens.length / CARDS_PER_ROW);
    var groupH = rowsNeeded * ROW_H + (rowsNeeded - 1) * ROW_GAP;

    // Group label — vertically centered in group
    if (g.label !== '—') {
      var glbl = figma.createText();
      glbl.characters = g.label;
      glbl.fontName = { family: 'Inter', style: 'Regular' };
      glbl.fontSize = 13;
      glbl.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } }];
      glbl.x = PAD;
      glbl.y = y + (groupH - 16) / 2;
      outer.appendChild(glbl);
    }

    var col_i = 0;
    var row_y = y;
    var cardsX = PAD + LEFT_W + DIVIDER;

    for (var ti = 0; ti < tokens.length; ti++) {
      var token = tokens[ti];
      var cardX = cardsX + col_i * (CARD_W + CARD_GAP);

      var card = figma.createFrame();
      card.name = token.fullName;
      card.resize(CARD_W, CARD_H);
      card.x = cardX; card.y = row_y;
      card.cornerRadius = 8;
      card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      card.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
      card.strokeWeight = 1;
      card.clipsContent = false;

      // Swatch
      var sw = figma.createRectangle();
      sw.name = 'swatch';
      sw.resize(SWATCH_SZ, SWATCH_SZ);
      sw.x = 10; sw.y = (CARD_H - SWATCH_SZ) / 2;
      sw.cornerRadius = 4;
      try {
        var boundFill = figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a },
          'color',
          figma.variables.getVariableById(token.variableId)
        );
        sw.fills = [boundFill];
      } catch(e) {
        sw.fills = [{ type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a }];
      }
      sw.strokes = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
      sw.strokeWeight = 1;
      card.appendChild(sw);

      // Token name
      var nt = figma.createText();
      nt.characters = '--' + token.fullName.replace(/\//g, '-').toLowerCase();
      nt.fontName = { family: 'Inter', style: 'Regular' };
      nt.fontSize = 10;
      nt.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
      nt.x = SWATCH_SZ + 18; nt.y = (CARD_H - 22) / 2;
      nt.resize(CARD_W - SWATCH_SZ - 28 - 56, 12);
      nt.textTruncation = 'ENDING';
      card.appendChild(nt);

      // Hex
      var hex = rgbToHex(token.r, token.g, token.b);
      var ht = figma.createText();
      ht.characters = '# ' + hex.replace('#', '');
      ht.fontName = { family: 'Inter', style: 'Regular' };
      ht.fontSize = 10;
      ht.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
      ht.x = CARD_W - 54; ht.y = (CARD_H - 12) / 2;
      ht.resize(40, 12);
      card.appendChild(ht);

      // Alpha (if < 1)
      if (token.a < 1) {
        var at = figma.createText();
        at.characters = Math.round(token.a * 100) + '%';
        at.fontName = { family: 'Inter', style: 'Regular' };
        at.fontSize = 10;
        at.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
        at.x = CARD_W - 34; at.y = (CARD_H - 12) / 2;
        at.resize(28, 12);
        card.appendChild(at);
        // Shift hex left
        ht.x = CARD_W - 88;
        ht.resize(40, 12);
      }

      outer.appendChild(card);
      col_i++;
      if (col_i >= CARDS_PER_ROW) { col_i = 0; row_y += ROW_H + ROW_GAP; }
    }

    y = (col_i === 0 ? row_y : row_y + ROW_H) + GROUP_GAP;
  }

  y += PAD;
  outer.resize(FRAME_W, y);
  return outer;
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES
// Layout: token name col | mode1 (swatch + primitive name) | mode2 | mode3...
// ══════════════════════════════════════════════════════════════════════════════
async function buildThemesFrame(col) {
  var PAD       = 32;
  var TITLE_H   = 56;
  var ROW_H     = 44;
  var ROW_GAP   = 6;
  var SWATCH_SZ = 24;
  var TOKEN_COL_W = 160; // left col: semantic token name
  var THEME_COL_W = 200; // per-mode col: swatch + primitive name
  var COL_GAP   = 16;
  var modes     = col.modes;
  var FRAME_W   = PAD + TOKEN_COL_W + COL_GAP + modes.length * (THEME_COL_W + COL_GAP) + PAD;

  // Collect all token names (from default mode)
  var tokenNames = [];
  var tokenMap = {}; // name -> variableId
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    tokenNames.push(v.name);
    tokenMap[v.name] = v.id;
  }

  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / ' + col.name;
  outer.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
  outer.cornerRadius = 16;
  outer.clipsContent = false;

  var y = PAD;

  // Title
  var titleT = figma.createText();
  titleT.characters = col.name;
  titleT.fontName = { family: 'Inter', style: 'Medium' };
  titleT.fontSize = 32;
  titleT.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.05 } }];
  titleT.x = PAD; titleT.y = y;
  outer.appendChild(titleT);
  y += TITLE_H + 8;

  // Column headers
  var hdrY = y;

  // "Semantic" header
  var semHdr = figma.createText();
  semHdr.characters = 'Semantic';
  semHdr.fontName = { family: 'Inter', style: 'Medium' };
  semHdr.fontSize = 10;
  semHdr.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
  semHdr.x = PAD; semHdr.y = hdrY;
  outer.appendChild(semHdr);

  // Mode headers
  for (var mi = 0; mi < modes.length; mi++) {
    var modeHdr = figma.createText();
    modeHdr.characters = modes[mi].name;
    modeHdr.fontName = { family: 'Inter', style: 'Medium' };
    modeHdr.fontSize = 10;
    modeHdr.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
    modeHdr.x = PAD + TOKEN_COL_W + COL_GAP + mi * (THEME_COL_W + COL_GAP);
    modeHdr.y = hdrY;
    outer.appendChild(modeHdr);
  }

  y += 24;

  // Rows
  for (var ti = 0; ti < tokenNames.length; ti++) {
    var tokenName = tokenNames[ti];
    var varId = tokenMap[tokenName];
    var variable = figma.variables.getVariableById(varId);
    if (!variable) continue;
    var nameParts = tokenName.split('/');
    var shortName = nameParts[nameParts.length - 1];

    // Token name card (left col)
    var nameCard = figma.createFrame();
    nameCard.name = tokenName;
    nameCard.resize(TOKEN_COL_W, ROW_H);
    nameCard.x = PAD; nameCard.y = y;
    nameCard.cornerRadius = 8;
    nameCard.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    nameCard.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
    nameCard.strokeWeight = 1;

    var nameT = figma.createText();
    nameT.characters = '--' + tokenName.replace(/\//g, '-').toLowerCase();
    nameT.fontName = { family: 'Inter', style: 'Regular' };
    nameT.fontSize = 10;
    nameT.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    nameT.x = 10; nameT.y = (ROW_H - 12) / 2;
    nameT.resize(TOKEN_COL_W - 20, 12);
    nameT.textTruncation = 'ENDING';
    nameCard.appendChild(nameT);
    outer.appendChild(nameCard);

    // One card per mode
    for (var mi2 = 0; mi2 < modes.length; mi2++) {
      var mode = modes[mi2];
      var raw = variable.valuesByMode[mode.id];
      var resolved = resolveColor(raw, mode.id);
      if (!resolved) continue;

      var modeCard = figma.createFrame();
      modeCard.name = tokenName + ' / ' + mode.name;
      modeCard.resize(THEME_COL_W, ROW_H);
      modeCard.x = PAD + TOKEN_COL_W + COL_GAP + mi2 * (THEME_COL_W + COL_GAP);
      modeCard.y = y;
      modeCard.cornerRadius = 8;
      modeCard.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      modeCard.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
      modeCard.strokeWeight = 1;
      modeCard.clipsContent = false;

      // Swatch with variable binding
      var dot = figma.createRectangle();
      dot.name = 'swatch';
      dot.resize(SWATCH_SZ, SWATCH_SZ);
      dot.x = 10; dot.y = (ROW_H - SWATCH_SZ) / 2;
      dot.cornerRadius = 4;
      try {
        var bf = figma.variables.setBoundVariableForPaint(
          { type: 'SOLID', color: { r: resolved.rgba.r, g: resolved.rgba.g, b: resolved.rgba.b }, opacity: resolved.rgba.a },
          'color',
          figma.variables.getVariableById(varId)
        );
        dot.fills = [bf];
      } catch(e) {
        dot.fills = [{ type: 'SOLID', color: { r: resolved.rgba.r, g: resolved.rgba.g, b: resolved.rgba.b } }];
      }
      dot.strokes = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
      dot.strokeWeight = 1;
      modeCard.appendChild(dot);

      // Primitive name
      var primT = figma.createText();
      primT.characters = resolved.aliasName || rgbToHex(resolved.rgba.r, resolved.rgba.g, resolved.rgba.b);
      primT.fontName = { family: 'Inter', style: 'Regular' };
      primT.fontSize = 10;
      primT.fills = [{ type: 'SOLID', color: { r: 0.35, g: 0.35, b: 0.35 } }];
      primT.x = SWATCH_SZ + 18; primT.y = (ROW_H - 12) / 2;
      primT.resize(THEME_COL_W - SWATCH_SZ - 28, 12);
      primT.textTruncation = 'ENDING';
      modeCard.appendChild(primT);

      outer.appendChild(modeCard);
    }

    y += ROW_H + ROW_GAP;
  }

  y += PAD;
  outer.resize(FRAME_W, y);
  return outer;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(function(n) {
    return Math.round(n * 255).toString(16).padStart(2, '0').toUpperCase();
  }).join('');
}
