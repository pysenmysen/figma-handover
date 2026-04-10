// Main - plugin entry point, init and message handler

figma.showUI(__html__, { width: 380, height: 480, themeColors: true });

// ============================================================
// INIT
// ============================================================
(async function init() {
  var items = [];

  // Colours
  var colourCols = figma.variables.getLocalVariableCollections().filter(function(col) {
    return col.variableIds.some(function(id) {
      var v = figma.variables.getVariableById(id); return v && v.resolvedType === 'COLOR';
    });
  });
  var gradCount = figma.getLocalPaintStyles().filter(function(s) {
    return s.paints && s.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; });
  }).length;
  var effectCount = figma.getLocalEffectStyles().length;

  if (colourCols.length > 0 || gradCount > 0 || effectCount > 0) {
    var metaParts = colourCols.map(function(c) { return c.name; });
    if (gradCount > 0) metaParts.push('Gradients');
    if (effectCount > 0) metaParts.push('Effects');
    items.push({ id: 'colours', name: 'Colours', tab: 'stylesheet', meta: metaParts.join(' - '), exists: !!findExistingFrame('Doc/Colour') });
  }

  // Typography
  var textStyles = figma.getLocalTextStyles();
  if (textStyles.length > 0) {
    var typoGroups = {}, typoOrder = [];
    textStyles.forEach(function(s) { var g = s.name.split('/')[0]; if (!typoGroups[g]) { typoGroups[g] = true; typoOrder.push(g); } });
    items.push({ id: 'typography', name: 'Typography', tab: 'stylesheet', meta: typoOrder.join(' - '), exists: !!findExistingFrame('Doc/Typography') });
  }

  // Grid
  var gridBps = detectGridBreakpoints();
  if (gridBps.length > 0) {
    items.push({ id: 'grid', name: 'Grid', tab: 'stylesheet', meta: gridBps.join(' - '), exists: !!findExistingFrame('Doc/Grid') });
  }

  figma.ui.postMessage({ type: 'init', items: items, version: VERSION });
})();

// ============================================================
// MESSAGE HANDLER
// ============================================================
figma.ui.onmessage = async function(msg) {
  if (msg.type === 'build') {
    await loadFonts();
    try { await buildTarget(msg.id); } catch(err) { figma.ui.postMessage({ type: 'error', message: String(err) }); return; }
    figma.ui.postMessage({ type: 'done' });
  }
  if (msg.type === 'build-all') {
    await loadFonts();
    var errors = [];
    for (var bi = 0; bi < msg.ids.length; bi++) {
      try { await buildTarget(msg.ids[bi]); }
      catch(err) { errors.push(msg.ids[bi] + ': ' + String(err)); }
    }
    if (errors.length > 0) figma.ui.postMessage({ type: 'error', message: 'Errors: ' + errors.join(' | ') });
    else figma.ui.postMessage({ type: 'done', all: true });
  }
  if (msg.type === 'close') figma.closePlugin();
};

// ============================================================
// ROUTER
// ============================================================
async function buildTarget(id) {
  if (id === 'colours')    { await buildColoursAll();    return; }
  if (id === 'typography') { await buildTypographyAll(); return; }
  if (id === 'grid')       { await buildGridAll();       return; }
}
