// Grid module

// Breakpoint config - edit here for project-specific adjustments
var GRID_BP_LABELS  = { Mob: 'Mob (360-768px)',    Tab: 'Tab (768-1280px)',    Desk: 'Desk (1280-1536px)', Wide: 'Wide (1536px+)' };
var GRID_BP_RANGES  = { Mob: '0 - 767',            Tab: '768 - 1279',          Desk: '1280 - 1535',        Wide: '1536+' };
var GRID_BP_WIDTHS  = { Mob: 360, Tab: 768, Desk: null, Wide: null }; // null = fill remaining space
var GRID_BP_PURPOSES = {
  Mob:  'Grid for mobile devices. All units should have the same column count.' +
        '\n\nFor mobile, the design should be scalable to at least 320px for accessibility reasons.' +
        ' Hand over all designs at the same frame size: 360x660px or 390x720px.' +
        '\n\nThis excludes browser and OS UI from the viewport.',
  Tab:  'Grid for tablet viewports.' +
        '\n\nTablet is produced when the project has time for it. Most often desktop scales down gracefully to tablet' +
        ' - verify with the project team whether a dedicated tablet design is needed.' +
        '\n\nIf produced, design at 768x1024px.',
  Desk: 'Primary design viewport. Design at 1280px. Make sure the design is scaleable to 1280x720px as a minimum' +
        ' - desktop can also be designed at 1536x864px if needed, but always verify at the smallest size.' +
        '\n\nContent should sit within the column grid. Define a max-width for content containers in the' +
        ' project stylesheet if content should not stretch to full screen width.',
  Wide: 'Behavior documentation for wide screens (1536px+). No dedicated design is required at this breakpoint' +
        ' - document how existing components and layouts should behave on larger screens.' +
        '\n\nKey patterns to document: which containers have a max-width, which backgrounds span full-width,' +
        ' and how content centers. This is template-level guidance, not project-specific implementation.',
};

async function buildGridAll() {
  await buildGrid();
}

async function buildGrid() {
  var gridStyles = figma.getLocalGridStyles();
  var colStyles = gridStyles.filter(function(gs) {
    return gs.layoutGrids && gs.layoutGrids.some(function(g) { return g.pattern === 'COLUMNS'; });
  });
  if (!colStyles.length) { figma.ui.postMessage({ type: 'error', message: 'No grid styles found in this file.' }); return; }

  // Sort: Mob, Tab, Desk, Wide
  var order = { mob: 1, tab: 2, desk: 3, wide: 4, cinema: 4 };
  colStyles.sort(function(a, b) {
    var an = a.name.toLowerCase(), bn = b.name.toLowerCase();
    var aw = 99, bw = 99;
    Object.keys(order).forEach(function(k) {
      if (an.indexOf(k) !== -1) aw = order[k];
      if (bn.indexOf(k) !== -1) bw = order[k];
    });
    return aw - bw;
  });

  var docComp      = await figma.importComponentByKeyAsync(KEYS.docModule);
  var gridSlotComp = await figma.importComponentByKeyAsync(KEYS.slotsGrid);
  var otherComp    = await figma.importComponentByKeyAsync(KEYS.sectionOther);

  var outer = getOrCreateFrame('Doc/Grid');
  configDocRows(outer, FRAME_W, 16);

  for (var i = 0; i < colStyles.length; i++) {
    var gs = colStyles[i];
    var colGrid = null;
    for (var gi = 0; gi < gs.layoutGrids.length; gi++) {
      if (gs.layoutGrids[gi].pattern === 'COLUMNS') { colGrid = gs.layoutGrids[gi]; break; }
    }
    if (!colGrid) continue;
    var sn = gs.name.toLowerCase();
    var label = sn.indexOf('mob') !== -1 ? 'Mob' : sn.indexOf('tab') !== -1 ? 'Tab' : sn.indexOf('desk') !== -1 ? 'Desk' : 'Wide';
    figma.ui.postMessage({ type: 'progress', name: 'Grid / ' + label });
    await buildGridBreakpoint(outer, colGrid, label, docComp, gridSlotComp, otherComp);
  }
  placeFrame(outer);
}

async function buildGridBreakpoint(outer, colGrid, label, docComp, gridSlotComp, otherComp) {
  var columns = colGrid.count;
  var gutter  = Math.round(colGrid.gutterSize);
  var margin  = Math.round(colGrid.offset);

  var vizW = GRID_BP_WIDTHS[label];
  var isFill = vizW === null;
  if (isFill) vizW = CONTENT_W;

  // Row frame
  var rowFrame = createDocRow(outer, label + 'Grid');

  // Doc panel
  var docInst = docComp.createInstance();
  rowFrame.appendChild(docInst);
  try {
    docInst.setProperties({
      'Epic#134:14':           'Grid',
      'Instance/State#134:16': GRID_BP_LABELS[label] || label,
      'Purpose#134:18':        GRID_BP_PURPOSES[label] || '',
      'Show purpose#227:81':   true,
      'Show sections#226:79':  true,
    });
  } catch(e) {}

  // Sections: Slots/Grid + Slots/Other
  try {
    var sectionsSlot = docInst.findOne(function(n) { return n.name === 'Sections'; });
    if (sectionsSlot) {
      clearChildren(sectionsSlot);
      var gridSlot = gridSlotComp.createInstance();
      sectionsSlot.appendChild(gridSlot);
      try {
        gridSlot.setProperties({
          'Breakpoint#247:118': GRID_BP_RANGES[label] || '',
          'Columns#247:120':    String(columns),
          'Margin#247:122':     margin + 'px',
          'Gutter#247:124':     gutter + 'px',
        });
      } catch(e) {}
      var otherSlot = otherComp.createInstance();
      sectionsSlot.appendChild(otherSlot);
      try { otherSlot.setProperties({ 'Section title#134:20': 'Other' }); } catch(e) {}
      try {
        var bulletT = otherSlot.findOne(function(n) { return n.name === 'BulletList' && n.type === 'TEXT'; });
        if (bulletT) bulletT.characters = 'Text fields and other content may have a max-width constraint.';
      } catch(e) {}
    }
  } catch(e) {}

  // Column visual frame (auto-layout)
  var vizFrame = figma.createFrame();
  vizFrame.name = 'GridFrame';
  vizFrame.clipsContent = false;
  vizFrame.cornerRadius = 8;
  vizFrame.layoutAlign = 'STRETCH';
  vizFrame.primaryAxisSizingMode = 'FIXED';
  vizFrame.counterAxisSizingMode = 'AUTO';
  vizFrame.resize(vizW, 100);
  vizFrame.layoutMode = 'HORIZONTAL';
  vizFrame.paddingLeft = margin; vizFrame.paddingRight = margin;
  vizFrame.paddingTop = 0; vizFrame.paddingBottom = 0;
  vizFrame.itemSpacing = gutter;
  if (isFill) vizFrame.layoutGrow = 1;

  // Background from --ui-bg-background variable
  var bgVar = findCssVariable('--ui-bg-background');
  var bgFill = { type: 'SOLID', color: { r: 1, g: 1, b: 1 } };
  try {
    if (bgVar) {
      var bgCol = figma.variables.getVariableCollectionById(bgVar.variableCollectionId);
      var bgMid = bgCol ? bgCol.defaultModeId : null;
      var rawBg = bgMid ? bgVar.valuesByMode[bgMid] : bgVar.valuesByMode[Object.keys(bgVar.valuesByMode)[0]];
      var resBg = rawBg ? resolveColor(rawBg, bgMid) : null;
      if (resBg) bgFill = { type: 'SOLID', color: { r: resBg.rgba.r, g: resBg.rgba.g, b: resBg.rgba.b } };
      vizFrame.fills = [figma.variables.setBoundVariableForPaint(bgFill, 'color', bgVar)];
    } else { vizFrame.fills = [bgFill]; }
  } catch(e) { vizFrame.fills = [bgFill]; }

  rowFrame.appendChild(vizFrame);

  // Column rects - named Column01, Column02, fill height + equal width
  var redVar = findCssVariable('--col-semantic-red');
  var redFill = { type: 'SOLID', color: { r: 1, g: 0.2, b: 0.2 } };
  if (redVar) {
    try {
      var rc = figma.variables.getVariableCollectionById(redVar.variableCollectionId);
      var rm = rc ? rc.defaultModeId : null;
      var rr = rm ? redVar.valuesByMode[rm] : redVar.valuesByMode[Object.keys(redVar.valuesByMode)[0]];
      var rres = rr ? resolveColor(rr, rm) : null;
      if (rres) redFill = { type: 'SOLID', color: { r: rres.rgba.r, g: rres.rgba.g, b: rres.rgba.b } };
    } catch(e) {}
  }

  for (var ci = 0; ci < columns; ci++) {
    var num = ci + 1;
    var colRect = figma.createRectangle();
    colRect.name = 'Column' + (num < 10 ? '0' : '') + num;
    colRect.opacity = 0.5;
    colRect.layoutGrow = 1;
    colRect.layoutAlign = 'STRETCH';
    colRect.fills = redVar
      ? (function(v, f) { try { return [figma.variables.setBoundVariableForPaint(f, 'color', v)]; } catch(e) { return [f]; } })(redVar, redFill)
      : [redFill];
    vizFrame.appendChild(colRect);
  }
}

// Used in init() to detect which grid breakpoints exist
function detectGridBreakpoints() {
  var bps = [];
  figma.getLocalGridStyles().forEach(function(gs) {
    if (!gs.layoutGrids || !gs.layoutGrids.some(function(g) { return g.pattern === 'COLUMNS'; })) return;
    var n = gs.name.toLowerCase();
    if (n.indexOf('mob') !== -1) bps.push('Mob');
    else if (n.indexOf('tab') !== -1) bps.push('Tab');
    else if (n.indexOf('desk') !== -1) bps.push('Desk');
    else bps.push('Wide');
  });
  return bps;
}
