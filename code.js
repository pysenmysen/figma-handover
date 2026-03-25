// Grebbans Handover — code.js
// v0.3

var VERSION = '0.3';

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

// ─── Resolve alias chain to a raw RGBA value ──────────────────────────────────
function resolveColor(rawVal, preferredModeId) {
  var val = rawVal;
  var depth = 0;

  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;

    // Get the collection for this referenced variable to find its modes
    var refCol = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    if (!refCol) break;

    // Try preferred mode first, then default mode of the referenced collection
    var nextVal = ref.valuesByMode[preferredModeId];
    if (!nextVal) nextVal = ref.valuesByMode[refCol.defaultModeId];
    val = nextVal;
  }

  // Final check — must be a real RGBA object
  if (val && typeof val === 'object' && 'r' in val && 'g' in val && 'b' in val) {
    return val;
  }
  return null;
}

async function buildFrames(collectionIds) {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

  // Remove existing handover frames
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name.startsWith('◈ Grebbans /');
  }).forEach(function(f) { f.remove(); });

  var xOffset = 0;
  var GAP = 48;

  for (var c = 0; c < collectionIds.length; c++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[c]);
    if (!col) continue;

    figma.ui.postMessage({ type: 'progress', step: c, total: collectionIds.length, name: col.name });

    // One frame per mode
    for (var m = 0; m < col.modes.length; m++) {
      var mode = col.modes[m];
      var frameName = col.modes.length > 1
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
  var SWATCH_W = 160;
  var SWATCH_H = 56;
  var LABEL_H  = 32;
  var COL_GAP  = 12;
  var ROW_GAP  = 8;
  var GROUP_GAP = 24;
  var PAD      = 24;
  var COLS     = 3;

  // Group resolved colours by path prefix
  var groups = {};
  for (var i = 0; i < col.variableIds.length; i++) {
    var variable = figma.variables.getVariableById(col.variableIds[i]);
    if (!variable || variable.resolvedType !== 'COLOR') continue;

    var rawVal = variable.valuesByMode[modeId];
    var resolved = resolveColor(rawVal, modeId);
    if (!resolved) continue;

    var parts = variable.name.split('/');
    var group = parts.length > 1 ? parts.slice(0, -1).join(' / ') : '—';
    if (!groups[group]) groups[group] = [];
    groups[group].push({
      name: parts[parts.length - 1],
      fullName: variable.name,
      r: resolved.r, g: resolved.g, b: resolved.b, a: resolved.a
    });
  }

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
  titleText.x = PAD; titleText.y = y;
  outerFrame.appendChild(titleText);
  y += 28 + 20;

  var groupKeys = Object.keys(groups);

  if (groupKeys.length === 0) {
    var noteText = figma.createText();
    noteText.characters = 'No resolved colours in this mode';
    noteText.fontName = { family: 'Inter', style: 'Regular' };
    noteText.fontSize = 12;
    noteText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    noteText.x = PAD; noteText.y = y;
    outerFrame.appendChild(noteText);
    y += 24 + PAD;
    outerFrame.resize(PAD + COLS * SWATCH_W + (COLS - 1) * COL_GAP + PAD, y);
    return outerFrame;
  }

  for (var gi = 0; gi < groupKeys.length; gi++) {
    var groupName = groupKeys[gi];
    var tokens = groups[groupName];

    if (groupName !== '—') {
      var lbl = figma.createText();
      lbl.characters = groupName.toUpperCase();
      lbl.fontName = { family: 'Inter', style: 'Medium' };
      lbl.fontSize = 9;
      lbl.letterSpacing = { value: 8, unit: 'PERCENT' };
      lbl.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
      lbl.x = PAD; lbl.y = y;
      outerFrame.appendChild(lbl);
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
      card.strokes = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
      card.strokeWeight = 1;
      card.clipsContent = true;

      var sw = figma.createRectangle();
      sw.resize(SWATCH_W, SWATCH_H);
      sw.fills = token.a < 1
        ? [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } },
           { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.a }]
        : [{ type: 'SOLID', color: { r: token.r, g: token.g, b: token.b } }];
      card.appendChild(sw);

      var nt = figma.createText();
      nt.characters = token.name;
      nt.fontName = { family: 'Inter', style: 'Medium' };
      nt.fontSize = 10;
      nt.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
      nt.x = 8; nt.y = SWATCH_H + 6;
      nt.resize(SWATCH_W - 16, 14);
      nt.textTruncation = 'ENDING';
      card.appendChild(nt);

      var hex = rgbToHex(token.r, token.g, token.b);
      var alpha = token.a < 1 ? ' · ' + Math.round(token.a * 100) + '%' : '';
      var ht = figma.createText();
      ht.characters = hex + alpha;
      ht.fontName = { family: 'Inter', style: 'Regular' };
      ht.fontSize = 9;
      ht.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      ht.x = 8; ht.y = SWATCH_H + 18;
      ht.resize(SWATCH_W - 16, 12);
      ht.textTruncation = 'ENDING';
      card.appendChild(ht);

      outerFrame.appendChild(card);

      col_i++;
      if (col_i >= COLS) {
        col_i = 0;
        row_y += SWATCH_H + LABEL_H + ROW_GAP;
      }
    }

    y = (col_i === 0 ? row_y : row_y + SWATCH_H + LABEL_H) + GROUP_GAP;
  }

  y += PAD;
  outerFrame.resize(PAD + COLS * SWATCH_W + (COLS - 1) * COL_GAP + PAD, y);
  return outerFrame;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(function(n) {
    return Math.round(n * 255).toString(16).padStart(2, '0').toUpperCase();
  }).join('');
}
