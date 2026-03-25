// Grebbans Handover — code.js
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
      modes: col.modes.map(function(m) { return m.name; })
    };
  }).filter(function(c) { return c.colorCount > 0; });

  figma.ui.postMessage({ type: 'collections', data: summary });
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

// ─── Resolve a value, following alias chains ──────────────────────────────────
function resolveValue(rawVal, modeId) {
  var MAX_DEPTH = 10;
  var depth = 0;
  var val = rawVal;

  while (val && val.type === 'VARIABLE_ALIAS' && depth < MAX_DEPTH) {
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;
    // Try the requested mode first, fall back to default mode of that variable's collection
    var col = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    var fallbackModeId = col ? col.defaultModeId : null;
    val = ref.valuesByMode[modeId] || (fallbackModeId ? ref.valuesByMode[fallbackModeId] : null);
    depth++;
  }

  return val;
}

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
    var col = figma.variables.getVariableCollectionById(collectionIds[c]);
    if (!col) continue;

    figma.ui.postMessage({ type: 'progress', step: c, total: collectionIds.length, name: col.name });

    // For collections with multiple modes, build one frame per mode
    var modes = col.modes;
    for (var m = 0; m < modes.length; m++) {
      var mode = modes[m];
      var frameName = modes.length > 1
        ? '◈ Grebbans / ' + col.name + ' · ' + mode.name
        : '◈ Grebbans / ' + col.name;

      var frame = await buildCollectionFrame(col, mode.modeId, frameName);
      frame.x = xOffset;
      frame.y = 0;
      figma.currentPage.appendChild(frame);
      xOffset += frame.width + GAP;
    }
  }

  figma.viewport.scrollAndZoomIntoView(
    figma.currentPage.findAll(function(n) {
      return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /');
    })
  );
}

async function buildCollectionFrame(col, modeId, frameName) {
  // Collect colour variables, group by path prefix
  var groups = {};
  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;

    var rawVal = variable.valuesByMode[modeId];
    var resolved = resolveValue(rawVal, modeId);

    if (!resolved || typeof resolved !== 'object' || !('r' in resolved)) continue;

    var parts = variable.name.split('/');
    var group = parts.length > 1 ? parts.slice(0, -1).join(' / ') : '—';

    if (!groups[group]) groups[group] = [];
    groups[group].push({
      name: parts[parts.length - 1],
      fullName: variable.name,
      r: resolved.r, g: resolved.g, b: resolved.b, a: resolved.a
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

  var outerFrame = figma.createFrame();
  outerFrame.name = frameName;
  outerFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
  outerFrame.cornerRadius = 16;
  outerFrame.clipsContent = true;

  var y = PAD;

  // Title
  var titleText = figma.createText();
  titleText.characters = frameName.replace('◈ Grebbans / ', '');
  titleText.fontName = { family: 'Inter', style: 'Medium' };
  titleText.fontSize = 18;
  titleText.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.05 } }];
  titleText.x = PAD;
  titleText.y = y;
  outerFrame.appendChild(titleText);
  y += 28 + 20;

  var groupKeys = Object.keys(groups);

  if (groupKeys.length === 0) {
    // No resolved colours — show a note
    var noteText = figma.createText();
    noteText.characters = 'No resolved colours in this mode';
    noteText.fontName = { family: 'Inter', style: 'Regular' };
    noteText.fontSize = 12;
    noteText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    noteText.x = PAD;
    noteText.y = y;
    outerFrame.appendChild(noteText);
    y += 24 + PAD;
    var totalWidth = PAD + COLS * SWATCH_W + (COLS - 1) * COL_GAP + PAD;
    outerFrame.resize(totalWidth, y);
    return outerFrame;
  }

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

    var col_i = 0;
    var row_y = y;

    for (var ti = 0; ti < tokens.length; ti++) {
      var token = tokens[ti];
      var col_x = PAD + col_i * (SWATCH_W + COL_GAP);

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

      var swatchRect = figma.createRectangle();
      swatchRect.resize(SWATCH_W, SWATCH_H);
      swatchRect.x = 0; swatchRect.y = 0;

      if (token.a < 1) {
        swatchRect.fills = [
          { type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } },
          { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a }
        ];
      } else {
        swatchRect.fills = [{ type: 'SOLID', color: { r: token.r, g: token.g, b: token.b } }];
      }
      card.appendChild(swatchRect);

      var nameText = figma.createText();
      nameText.characters = token.name;
      nameText.fontName = { family: 'Inter', style: 'Medium' };
      nameText.fontSize = 10;
      nameText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
      nameText.x = 8; nameText.y = SWATCH_H + 6;
      nameText.resize(SWATCH_W - 16, 14);
      nameText.textTruncation = 'ENDING';
      card.appendChild(nameText);

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

    var rowsUsed = Math.ceil(tokens.length / COLS);
    if (col_i === 0) {
      y = row_y + GROUP_GAP;
    } else {
      y = row_y + SWATCH_H + LABEL_H + GROUP_GAP;
    }
  }

  y += PAD;
  var totalWidth = PAD + COLS * SWATCH_W + (COLS - 1) * COL_GAP + PAD;
  outerFrame.resize(totalWidth, y);
  return outerFrame;
}

function rgbToHex(r, g, b) {
  var toH = function(n) { return Math.round(n * 255).toString(16).padStart(2, '0').toUpperCase(); };
  return '#' + toH(r) + toH(g) + toH(b);
}
