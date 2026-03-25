// Grebbans Handover — code.js
// Reads variable collections, sends to UI for selection, then draws colour swatches into a Figma frame

figma.showUI(__html__, { width: 480, height: 560, themeColors: true });

// ─── Step 1: On open, read all collections and send to UI ─────────────────────
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
      modes: col.modes.map(function(m) { return m.name; })
    };
  }).filter(function(c) { return c.colorCount > 0; }); // only show collections that have colours

  figma.ui.postMessage({ type: 'collections', data: summary });
})();

// ─── Step 2: Receive selected collection IDs, build frames ───────────────────
figma.ui.onmessage = async function(msg) {
  if (msg.type === 'build') {
    await buildFrames(msg.collectionIds);
    figma.ui.postMessage({ type: 'done' });
  }
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

async function buildFrames(collectionIds) {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

  // Remove existing handover frames
  var existing = figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /');
  });
  existing.forEach(function(f) { f.remove(); });

  var xOffset = 0;
  var GAP = 48;

  for (var c = 0; c < collectionIds.length; c++) {
    figma.ui.postMessage({ type: 'progress', step: c, total: collectionIds.length, name: '' });

    var col = figma.variables.getVariableCollectionById(collectionIds[c]);
    if (!col) continue;

    figma.ui.postMessage({ type: 'progress', step: c, total: collectionIds.length, name: col.name });

    var frame = await buildCollectionFrame(col);
    frame.x = xOffset;
    frame.y = 0;
    figma.currentPage.appendChild(frame);
    xOffset += frame.width + GAP;
  }

  // Zoom to fit
  figma.viewport.scrollAndZoomIntoView(
    figma.currentPage.findAll(function(n) {
      return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /');
    })
  );
}

async function buildCollectionFrame(col) {
  var modeId = col.defaultModeId;

  // Collect colour variables, group by path prefix
  var groups = {};
  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;

    var parts = variable.name.split('/');
    var group = parts.length > 1 ? parts.slice(0, -1).join(' / ') : '—';
    var rawVal = variable.valuesByMode[modeId];

    // Resolve aliases
    if (rawVal && rawVal.type === 'VARIABLE_ALIAS') {
      var resolved = figma.variables.getVariableById(rawVal.id);
      if (resolved) rawVal = resolved.valuesByMode[modeId];
    }

    if (!rawVal || typeof rawVal !== 'object' || !('r' in rawVal)) continue;

    if (!groups[group]) groups[group] = [];
    groups[group].push({
      name: parts[parts.length - 1],
      fullName: variable.name,
      r: rawVal.r, g: rawVal.g, b: rawVal.b, a: rawVal.a
    });
  }

  // ── Layout constants ──
  var SWATCH_W = 160;
  var SWATCH_H = 56;
  var LABEL_H  = 32;
  var COL_GAP  = 12;
  var ROW_GAP  = 8;
  var GROUP_GAP = 24;
  var PAD      = 24;
  var COLS     = 3;

  // Outer frame
  var outerFrame = figma.createFrame();
  outerFrame.name = '◈ Grebbans / ' + col.name;
  outerFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
  outerFrame.cornerRadius = 16;
  outerFrame.clipsContent = true;

  var y = PAD;

  // Title
  var titleText = figma.createText();
  titleText.characters = col.name;
  titleText.fontName = { family: 'Inter', style: 'Medium' };
  titleText.fontSize = 18;
  titleText.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.05 } }];
  titleText.x = PAD;
  titleText.y = y;
  outerFrame.appendChild(titleText);
  y += 28 + 20;

  var groupKeys = Object.keys(groups);
  for (var gi = 0; gi < groupKeys.length; gi++) {
    var groupName = groupKeys[gi];
    var tokens = groups[groupName];

    // Group label
    if (groupName !== '—') {
      var groupLabel = figma.createText();
      groupLabel.characters = groupName.toUpperCase();
      groupLabel.fontName = { family: 'Inter', style: 'Medium' };
      groupLabel.fontSize = 9;
      groupLabel.letterSpacing = { value: 8, unit: 'PERCENT' };
      groupLabel.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
      groupLabel.x = PAD;
      groupLabel.y = y;
      outerFrame.appendChild(groupLabel);
      y += 18 + 8;
    }

    // Swatches grid
    var col_i = 0;
    var row_y = y;
    for (var ti = 0; ti < tokens.length; ti++) {
      var token = tokens[ti];
      var col_x = PAD + col_i * (SWATCH_W + COL_GAP);

      // Swatch card
      var card = figma.createFrame();
      card.name = token.fullName;
      card.resize(SWATCH_W, SWATCH_H + LABEL_H);
      card.x = col_x;
      card.y = row_y;
      card.cornerRadius = 8;
      card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      card.strokes = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
      card.strokeWeight = 1;
      card.clipsContent = true;

      // Colour swatch
      var swatchRect = figma.createRectangle();
      swatchRect.resize(SWATCH_W, SWATCH_H);
      swatchRect.x = 0; swatchRect.y = 0;
      swatchRect.fills = [{
        type: 'SOLID',
        color: { r: token.r, g: token.g, b: token.b },
        opacity: token.a
      }];
      card.appendChild(swatchRect);

      // Checkerboard for transparent swatches
      if (token.a < 1) {
        swatchRect.fills = [
          { type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } },
          { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a }
        ];
      }

      // Name label
      var nameText = figma.createText();
      nameText.characters = token.name;
      nameText.fontName = { family: 'Inter', style: 'Medium' };
      nameText.fontSize = 10;
      nameText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
      nameText.x = 8; nameText.y = SWATCH_H + 6;
      nameText.resize(SWATCH_W - 16, 14);
      nameText.textTruncation = 'ENDING';
      card.appendChild(nameText);

      // Hex label
      var hexStr = rgbToHex(token.r, token.g, token.b);
      var alphaStr = token.a < 1 ? ' · ' + Math.round(token.a * 100) + '%' : '';
      var hexText = figma.createText();
      hexText.characters = hexStr + alphaStr;
      hexText.fontName = { family: 'Inter', style: 'Regular' };
      hexText.fontSize = 9;
      hexText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      hexText.x = 8; hexText.y = SWATCH_H + 18;
      hexText.resize(SWATCH_W - 16, 12);
      hexText.textTruncation = 'ENDING';
      card.appendChild(hexText);

      outerFrame.appendChild(card);

      col_i++;
      if (col_i >= COLS) {
        col_i = 0;
        row_y += SWATCH_H + LABEL_H + ROW_GAP;
      }
    }

    // Advance y past this group
    var rowsUsed = Math.ceil(tokens.length / COLS);
    y = row_y + (SWATCH_H + LABEL_H) + (col_i > 0 ? ROW_GAP : 0) + GROUP_GAP;
    if (col_i === 0) y = row_y + GROUP_GAP;
  }

  y += PAD;

  // Size the outer frame
  var totalWidth = PAD + COLS * SWATCH_W + (COLS - 1) * COL_GAP + PAD;
  outerFrame.resize(totalWidth, y);

  return outerFrame;
}

function rgbToHex(r, g, b) {
  var toH = function(n) { return Math.round(n * 255).toString(16).padStart(2, '0').toUpperCase(); };
  return '#' + toH(r) + toH(g) + toH(b);
}
