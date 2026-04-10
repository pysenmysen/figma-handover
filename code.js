// Grebbans Handover - v9.0

var VERSION = '9.3';
var FRAME_W = 1504;
var GRID_W  = 1616; // 320 doc + 16 gap + 1280 desk grid

var KEYS = {
  docModule:       '8df1ea68f02f91062978acb1ccbab2cec2e92171',
  colourPrimitive: '0f4a992b74f79d0754a10487640c165f040cf6be',
  themesCol:       'f48bb2051c1b4c248bbc418baa56ac87e7d0a2ee',
  themesColour:    '9bebe09dc4b4b52bd9771525f9ce437ebc3f014c',
  gradientCard:    '6999639649f183fd91d2648853a74606c765c2b6',
  effectCard:      'a5208d18e7106e3133b9c8cad9fbf2d72138864a',
  sectionOther:    'eb7778ad03fc3564e5b9c25cdeae1743a5233402',
  typographyStyle: '39f846162ae664e4774bb26add863e258b437bb1',
  typographySlot:  'e0f20829328d45fb0f5de235069bef08a808bca5',
  slotsGrid:       'b0abdcf55797a8770b650c170c96a0e3e32e6f72',
};

figma.showUI(__html__, { width: 480, height: 640, themeColors: true });

// ============================================================
// INIT
// ============================================================
(async function init() {
  var items = [];

  // --- COLOURS ---
  var collections = figma.variables.getLocalVariableCollections();
  var colourCols = collections.filter(function(col) {
    return col.variableIds.some(function(id) {
      var v = figma.variables.getVariableById(id);
      return v && v.resolvedType === 'COLOR';
    });
  });
  var paintStyles = figma.getLocalPaintStyles();
  var gradCount = paintStyles.filter(function(s) {
    return s.paints && s.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; });
  }).length;
  var effectStyles = figma.getLocalEffectStyles();

  if (colourCols.length > 0 || gradCount > 0 || effectStyles.length > 0) {
    var metaParts = colourCols.map(function(c) { return c.name; });
    if (gradCount > 0) metaParts.push('Gradients');
    if (effectStyles.length > 0) metaParts.push('Effects');
    var anyColourExists = colourCols.some(function(col) {
      return !!findExistingFrame('Doc/' + col.name);
    }) || !!findExistingFrame('Doc/Gradients') || !!findExistingFrame('Doc/Effects');
    items.push({
      id: 'colours', name: 'Colours', tab: 'stylesheet',
      meta: metaParts.join(' - '), exists: anyColourExists
    });
  }

  // --- TYPOGRAPHY ---
  var textStyles = figma.getLocalTextStyles();
  if (textStyles.length > 0) {
    var typoGroups = {}, typoOrder = [];
    textStyles.forEach(function(s) {
      var g = s.name.split('/')[0];
      if (!typoGroups[g]) { typoGroups[g] = true; typoOrder.push(g); }
    });
    items.push({
      id: 'typography', name: 'Typography', tab: 'stylesheet',
      meta: typoOrder.join(' - '), exists: !!findExistingFrame('Doc/Typography')
    });
  }

  // --- GRID ---
  var gridBps = detectGridBreakpoints();
  if (gridBps.length > 0) {
    items.push({
      id: 'grid', name: 'Grid', tab: 'stylesheet',
      meta: gridBps.join(' - '), exists: !!findExistingFrame('Doc/Grid')
    });
  }

  figma.ui.postMessage({ type: 'init', items: items, version: VERSION });
})();

function detectGridBreakpoints() {
  var bps = [];
  var gridStyles = figma.getLocalGridStyles();
  gridStyles.forEach(function(gs) {
    if (!gs.layoutGrids || !gs.layoutGrids.some(function(g) { return g.pattern === 'COLUMNS'; })) return;
    var n = gs.name.toLowerCase();
    if (n.indexOf('mob') !== -1) bps.push('Mob');
    else if (n.indexOf('tab') !== -1) bps.push('Tab');
    else if (n.indexOf('desk') !== -1) bps.push('Desk');
    else bps.push('Wide');
  });
  return bps;
}

// ============================================================
// MESSAGE HANDLER
// ============================================================
figma.ui.onmessage = async function(msg) {
  if (msg.type === 'build') {
    await loadFonts();
    try {
      await buildTarget(msg.id);
    } catch(err) {
      figma.ui.postMessage({ type: 'error', message: String(err) });
      return;
    }
    figma.ui.postMessage({ type: 'done' });
  }
  if (msg.type === 'close') figma.closePlugin();
};

// ============================================================
// ROUTER
// ============================================================
async function buildTarget(id) {
  if (id === 'colours')    { await buildColoursAll(); return; }
  if (id === 'typography') { await buildTypographyAll(); return; }
  if (id === 'grid')       { await buildGridAll(); return; }
}

// ============================================================
// SHARED HELPERS
// ============================================================
var LOADED_FONT = { family: 'Inter', style: 'Regular' };

async function loadFonts() {
  var nhStyles = ['Regular', 'Roman', '55 Roman'];
  for (var fi = 0; fi < nhStyles.length; fi++) {
    try {
      await Promise.race([
        figma.loadFontAsync({ family: 'Neue Haas Grotesk Display Pro', style: nhStyles[fi] }),
        new Promise(function(_, r) { setTimeout(r, 1500); })
      ]);
      LOADED_FONT = { family: 'Neue Haas Grotesk Display Pro', style: nhStyles[fi] };
      return;
    } catch(e) {}
  }
  try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); LOADED_FONT = { family: 'Inter', style: 'Regular' }; } catch(e) {}
}

function toHex(r, g, b) {
  return '#' + [r,g,b].map(function(n){ return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase(); }).join('');
}

function resolveColor(raw, modeId) {
  var val = raw, aliasName = null, depth = 0;
  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;
    if (!aliasName) aliasName = ref.name;
    var rc = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    var def = rc ? rc.defaultModeId : null;
    var keys = Object.keys(ref.valuesByMode);
    val = ref.valuesByMode[modeId] || (def ? ref.valuesByMode[def] : null) || (keys.length ? ref.valuesByMode[keys[0]] : null);
  }
  return (val && typeof val === 'object' && 'r' in val) ? { rgba: val, aliasName: aliasName } : null;
}

function isSemantic(col) {
  var modeId = col.defaultModeId, a = 0, t = 0;
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    t++;
    var raw = v.valuesByMode[modeId];
    if (raw && raw.type === 'VARIABLE_ALIAS') a++;
  }
  return t > 0 && a / t > 0.5;
}

function findExistingFrame(name) {
  for (var i = 0; i < figma.currentPage.children.length; i++) {
    var n = figma.currentPage.children[i];
    if (n.type === 'FRAME' && n.name === name) return n;
    if (n.type === 'SECTION') {
      for (var j = 0; j < n.children.length; j++) {
        var c = n.children[j];
        if (c.type === 'FRAME' && c.name === name) return c;
        if (c.type === 'FRAME' && c.children) {
          for (var k = 0; k < c.children.length; k++) {
            if (c.children[k].type === 'FRAME' && c.children[k].name === name) return c.children[k];
          }
        }
      }
    }
  }
  return null;
}

function clearFrame(frame) {
  while (frame.children.length > 0) frame.children[frame.children.length - 1].remove();
}

function getOrCreateFrame(name) {
  var existing = findExistingFrame(name);
  if (existing) { clearFrame(existing); return existing; }
  var frame = figma.createFrame();
  frame.name = name;
  figma.currentPage.appendChild(frame);
  return frame;
}

function placeFrame(frame) {
  figma.viewport.scrollAndZoomIntoView([frame]);
}


function findCssVariable(cssName) {
  var target = cssName.replace(/^--/, '');
  var allVars = figma.variables.getLocalVariables();
  for (var i = 0; i < allVars.length; i++) {
    var v = allVars[i];
    if (v.resolvedType !== 'COLOR') continue;
    var vCss = v.name.split('/').join('-').toLowerCase();
    if (vCss === target) return v;
  }
  return null;
}
// ============================================================
// COLOURS MODULE
// ============================================================
async function buildColoursAll() {
  var collections = figma.variables.getLocalVariableCollections();
  for (var i = 0; i < collections.length; i++) {
    var col = collections[i];
    var hasColor = col.variableIds.some(function(id) {
      var v = figma.variables.getVariableById(id);
      return v && v.resolvedType === 'COLOR';
    });
    if (!hasColor) continue;
    figma.ui.postMessage({ type: 'progress', name: col.name });
    if (isSemantic(col)) await buildThemesFrame(col);
    else await buildPrimitivesFrame(col);
  }
  var paintStyles = figma.getLocalPaintStyles();
  var gradients = paintStyles.filter(function(s) {
    return s.paints && s.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; });
  });
  if (gradients.length > 0) {
    figma.ui.postMessage({ type: 'progress', name: 'Gradients' });
    await buildGradientsFrame();
  }
  var effectStyles = figma.getLocalEffectStyles();
  if (effectStyles.length > 0) {
    figma.ui.postMessage({ type: 'progress', name: 'Effects' });
    await buildEffectsFrame();
  }
}

async function buildPrimitivesFrame(col) {
  var OUTER_NAME = 'Doc/' + col.name;
  var colComp = await figma.importComponentByKeyAsync(KEYS.colourPrimitive);

  var outer = findExistingFrame(OUTER_NAME);
  var isNew = !outer;
  if (isNew) { outer = figma.createFrame(); outer.name = OUTER_NAME; figma.currentPage.appendChild(outer); }
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'HORIZONTAL'; outer.itemSpacing = 20;
  if (isNew) { outer.primaryAxisSizingMode = 'FIXED'; outer.counterAxisSizingMode = 'AUTO'; outer.resize(FRAME_W, 100); }

  if (isNew) {
    try {
      var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
      var docInst = docComp.createInstance();
      outer.appendChild(docInst);
      var docProps = {
        'Epic#134:14': 'Colour',
        'Instance/State#134:16': col.name,
        'Purpose#134:18': 'Primitive colour tokens. Not used directly in project files - applied via semantic variables in themes/modes.',
      };
      try {
        var instProps = docInst.componentProperties;
        Object.keys(instProps).forEach(function(k) {
          if (instProps[k].type === 'BOOLEAN') {
            var kl = k.toLowerCase();
            if (kl.indexOf('section') !== -1 || kl.indexOf('data') !== -1) docProps[k] = false;
          }
        });
      } catch(e2) {}
      docInst.setProperties(docProps);
    } catch(e) {}
  }

  var primContent = outer.findOne(function(n) { return n.name === 'Primitives' && n.type === 'FRAME'; });
  if (!primContent) { primContent = figma.createFrame(); primContent.name = 'Primitives'; outer.appendChild(primContent); }
  while (primContent.children.length > 0) primContent.children[primContent.children.length-1].remove();
  primContent.fills = []; primContent.clipsContent = false;
  primContent.layoutMode = 'VERTICAL'; primContent.itemSpacing = 16;
  var primW = FRAME_W - 320 - 20;
  primContent.resize(primW, 100);
  primContent.primaryAxisSizingMode = 'AUTO'; primContent.counterAxisSizingMode = 'FIXED';

  var modeId = col.defaultModeId;
  var groups = {}, groupOrder = [];
  for (var vi = 0; vi < col.variableIds.length; vi++) {
    var v = figma.variables.getVariableById(col.variableIds[vi]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var raw = v.valuesByMode[modeId] || v.valuesByMode[Object.keys(v.valuesByMode)[0]];
    var res = raw ? resolveColor(raw, modeId) : null;
    if (!res) continue;
    var parts = v.name.split('/');
    var gKey = parts.length > 1 ? parts.slice(0,2).join('/') : '__root__';
    if (!groups[gKey]) { groups[gKey] = { tokens: [] }; groupOrder.push(gKey); }
    groups[gKey].tokens.push({
      cssName: '--' + v.name.replace(/\//g, '-').toLowerCase(),
      variable: v, hex: toHex(res.rgba.r, res.rgba.g, res.rgba.b),
      alpha: Math.round(res.rgba.a * 100) / 100,
      r: res.rgba.r, g: res.rgba.g, b: res.rgba.b
    });
  }

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var g = groups[groupOrder[gi]];
    var gf = figma.createFrame();
    gf.name = 'VaribleGroup'; gf.fills = [];
    gf.layoutMode = 'VERTICAL'; gf.itemSpacing = 12;
    gf.primaryAxisSizingMode = 'AUTO'; gf.counterAxisSizingMode = 'FIXED';
    gf.layoutAlign = 'STRETCH';
    primContent.appendChild(gf);

    var vf = figma.createFrame();
    vf.name = 'Varibles'; vf.fills = [];
    vf.layoutMode = 'HORIZONTAL'; vf.layoutWrap = 'WRAP';
    vf.itemSpacing = 4; vf.counterAxisSpacing = 4;
    vf.primaryAxisSizingMode = 'FIXED'; vf.counterAxisSizingMode = 'AUTO';
    vf.layoutAlign = 'STRETCH';
    gf.appendChild(vf);

    for (var ti = 0; ti < g.tokens.length; ti++) {
      var token = g.tokens[ti];
      var inst = colComp.createInstance();
      vf.appendChild(inst);
      var hasAlpha = token.alpha < 0.99;
      try {
        inst.setProperties({
          'VariantName#221:77': token.cssName,
          'Hex#221:71': token.hex,
          'Show Opacity#221:75': hasAlpha,
          'Opacity#221:73': Math.round(token.alpha * 100) + '%'
        });
      } catch(e) {}
      try {
        var colourFrame = inst.findOne(function(n) { return n.name === 'Colour'; });
        if (colourFrame) {
          var colorFill = { type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.alpha };
          colourFrame.fills = [figma.variables.setBoundVariableForPaint(colorFill, 'color', token.variable)];
        }
      } catch(e) {}
    }
  }
  placeFrame(outer);
}

async function buildThemesFrame(col) {
  var OUTER_NAME = 'Doc/' + col.name;
  var colComp    = await figma.importComponentByKeyAsync(KEYS.themesCol);
  var colourComp = await figma.importComponentByKeyAsync(KEYS.themesColour);

  var outer = findExistingFrame(OUTER_NAME);
  var isNew = !outer;
  if (isNew) { outer = figma.createFrame(); outer.name = OUTER_NAME; figma.currentPage.appendChild(outer); }
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'HORIZONTAL'; outer.itemSpacing = 20;
  if (isNew) { outer.primaryAxisSizingMode = 'FIXED'; outer.counterAxisSizingMode = 'AUTO'; outer.resize(FRAME_W, 100); }

  if (isNew) {
    try {
      var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
      var docInst = docComp.createInstance();
      outer.appendChild(docInst);
      var docProps = {
        'Epic#134:14': 'Colour',
        'Instance/State#134:16': col.name,
        'Purpose#134:18': 'Semantic colour tokens mapped to primitives per mode. Each column must have its theme applied manually in Figma for the MCP to read the correct resolved colours.',
      };
      try {
        var dp = docInst.componentProperties;
        Object.keys(dp).forEach(function(k) {
          if (dp[k].type === 'BOOLEAN') {
            var kl = k.toLowerCase();
            if (kl.indexOf('section') !== -1 || kl.indexOf('data') !== -1) docProps[k] = false;
            if (kl.indexOf('purpose') !== -1) docProps[k] = true;
          }
        });
      } catch(e) {}
      docInst.setProperties(docProps);
    } catch(e) {}
  }

  var themesContent = outer.findOne(function(n) { return n.name === 'Themes' && n.type === 'FRAME'; });
  if (!themesContent) { themesContent = figma.createFrame(); themesContent.name = 'Themes'; outer.appendChild(themesContent); }
  while (themesContent.children.length > 0) themesContent.children[themesContent.children.length-1].remove();
  themesContent.fills = []; themesContent.clipsContent = false;
  themesContent.layoutMode = 'HORIZONTAL'; themesContent.itemSpacing = 4;
  themesContent.primaryAxisSizingMode = 'AUTO'; themesContent.counterAxisSizingMode = 'AUTO';

  var modes = col.modes;
  var tokens = [];
  for (var vi = 0; vi < col.variableIds.length; vi++) {
    var v = figma.variables.getVariableById(col.variableIds[vi]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    tokens.push(v);
  }

  for (var mi = 0; mi < modes.length; mi++) {
    var mode = modes[mi];
    var modeCol = colComp.createInstance();
    themesContent.appendChild(modeCol);
    try {
      var themeText = modeCol.children[0];
      if (themeText && themeText.type === 'TEXT') themeText.characters = mode.name;
    } catch(e) {}
    var variblesSlot = null;
    for (var ci = 0; ci < modeCol.children.length; ci++) {
      if (modeCol.children[ci].type === 'SLOT') { variblesSlot = modeCol.children[ci]; break; }
    }
    if (!variblesSlot) continue;
    while (variblesSlot.children.length > 0) variblesSlot.children[variblesSlot.children.length-1].remove();

    for (var ti = 0; ti < tokens.length; ti++) {
      var token = tokens[ti];
      var cssName = '--' + token.name.replace(/\//g, '-').toLowerCase();
      var raw = token.valuesByMode[mode.modeId];
      if (!raw) { var ks = Object.keys(token.valuesByMode); raw = ks.length ? token.valuesByMode[ks[0]] : null; }
      var res = raw ? resolveColor(raw, mode.modeId) : null;
      var cell = colourComp.createInstance();
      variblesSlot.appendChild(cell);
      try { cell.setProperties({ 'Variable?#229:95': true }); } catch(e) {}
      try { var semT = cell.children[1]; if (semT && semT.type === 'TEXT') semT.characters = cssName; } catch(e) {}
      try {
        var colorFrame = cell.children[0];
        if (colorFrame && colorFrame.children && colorFrame.children.length > 1) {
          var primFrame = colorFrame.children[1];
          if (primFrame && res) {
            var cf = { type: 'SOLID', color: { r: res.rgba.r, g: res.rgba.g, b: res.rgba.b }, opacity: res.rgba.a };
            primFrame.fills = [figma.variables.setBoundVariableForPaint(cf, 'color', token)];
          }
        }
      } catch(e) {}
    }
  }
  placeFrame(outer);
}

function effectToCss(effects) {
  var parts = [];
  effects.forEach(function(e) {
    if (!e.visible) return;
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      var cl = e.color;
      var inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
      var spread = e.spread !== undefined ? e.spread : 0;
      var colourValue;
      if (e.boundVariables && e.boundVariables.color) {
        var bv = figma.variables.getVariableById(e.boundVariables.color.id);
        colourValue = bv ? 'var(--' + bv.name.replace(/\//g, '-').toLowerCase() + ')' : null;
      }
      if (!colourValue) colourValue = 'rgba(' + Math.round(cl.r*255) + ',' + Math.round(cl.g*255) + ',' + Math.round(cl.b*255) + ',' + Math.round(cl.a*100)/100 + ')';
      parts.push(inset + e.offset.x + 'px ' + e.offset.y + 'px ' + e.radius + 'px ' + spread + 'px ' + colourValue);
    } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
      parts.push('blur(' + e.radius + 'px)');
    }
  });
  return parts.join(', ');
}

async function buildGradientsFrame() {
  var OUTER_NAME = 'Doc/Gradients';
  var paintStyles = figma.getLocalPaintStyles();
  var gradients = [];
  paintStyles.forEach(function(ps) {
    if (ps.paints && ps.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; })) {
      var parts = ps.name.split('/');
      gradients.push({ style: ps, group: parts.length > 1 ? parts.slice(0,-1).join('/') : '', name: parts[parts.length-1] });
    }
  });
  if (!gradients.length) return;
  var gradComp = await figma.importComponentByKeyAsync(KEYS.gradientCard);
  var outer = findExistingFrame(OUTER_NAME);
  var isNew = !outer;
  if (isNew) { outer = figma.createFrame(); outer.name = OUTER_NAME; figma.currentPage.appendChild(outer); }
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'HORIZONTAL'; outer.itemSpacing = 20;
  if (isNew) { outer.primaryAxisSizingMode = 'FIXED'; outer.counterAxisSizingMode = 'AUTO'; outer.resize(FRAME_W, 100); }
  if (isNew) {
    try {
      var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
      var docInst = docComp.createInstance();
      outer.appendChild(docInst);
      var docProps = { 'Epic#134:14': 'Styles', 'Instance/State#134:16': 'Gradients', 'Purpose#134:18': 'Gradient paint styles used across the project.' };
      try {
        var dp = docInst.componentProperties;
        Object.keys(dp).forEach(function(k) {
          if (dp[k].type === 'BOOLEAN') { var kl = k.toLowerCase(); if (kl.indexOf('section') !== -1 || kl.indexOf('data') !== -1) docProps[k] = false; if (kl.indexOf('purpose') !== -1) docProps[k] = true; }
        });
      } catch(e) {}
      docInst.setProperties(docProps);
    } catch(e) {}
  }
  var content = outer.findOne(function(n) { return n.name === 'GradientStyles' && n.type === 'FRAME'; });
  if (!content) { content = figma.createFrame(); content.name = 'GradientStyles'; outer.appendChild(content); }
  while (content.children.length > 0) content.children[content.children.length-1].remove();
  content.fills = []; content.clipsContent = false;
  content.layoutMode = 'HORIZONTAL'; content.layoutWrap = 'WRAP';
  content.itemSpacing = 4; content.counterAxisSpacing = 4;
  content.primaryAxisSizingMode = 'FIXED'; content.counterAxisSizingMode = 'AUTO';
  content.resize(FRAME_W - 320 - 20, 100);
  for (var gi = 0; gi < gradients.length; gi++) {
    var grad = gradients[gi];
    var inst = gradComp.createInstance();
    content.appendChild(inst);
    try { inst.children[0].children[1].fillStyleId = grad.style.id; } catch(e) {}
    try { var nm = inst.children[1].children[0]; if (nm.children[0].type === 'TEXT') nm.children[0].characters = grad.group || ' '; if (nm.children[1].type === 'TEXT') nm.children[1].characters = grad.name; } catch(e) {}
    try {
      var hexF = inst.children[1].children[1];
      var stops = [];
      grad.style.paints.forEach(function(p) {
        if (p.gradientStops) p.gradientStops.forEach(function(s) {
          if (s.boundVariables && s.boundVariables.color) { var v = figma.variables.getVariableById(s.boundVariables.color.id); if (v) stops.push(v); }
        });
      });
      for (var si = 0; si < Math.min(stops.length, hexF.children.length); si++) {
        var cell = hexF.children[si]; var sv = stops[si];
        try {
          var col2 = figma.variables.getVariableCollectionById(sv.variableCollectionId);
          var mid = col2 ? col2.defaultModeId : null;
          var raw = mid ? sv.valuesByMode[mid] : sv.valuesByMode[Object.keys(sv.valuesByMode)[0]];
          var res = raw ? resolveColor(raw, mid) : null;
          if (cell.children[0].children[1] && res) {
            var cf2 = { type: 'SOLID', color: { r: res.rgba.r, g: res.rgba.g, b: res.rgba.b }, opacity: res.rgba.a };
            cell.children[0].children[1].fills = [figma.variables.setBoundVariableForPaint(cf2, 'color', sv)];
          }
        } catch(e) {}
        try { if (cell.children[1].type === 'TEXT') cell.children[1].characters = '--' + sv.name.replace(/\//g, '-').toLowerCase(); } catch(e) {}
      }
    } catch(e) {}
  }
  placeFrame(outer);
}

async function buildEffectsFrame() {
  var OUTER_NAME = 'Doc/Effects';
  var effectStyles = figma.getLocalEffectStyles();
  var effects = [];
  effectStyles.forEach(function(es) {
    if (!es.effects || !es.effects.length) return;
    var parts = es.name.split('/');
    effects.push({ style: es, group: parts.length > 1 ? parts.slice(0,-1).join('/') : '', name: parts[parts.length-1] });
  });
  if (!effects.length) return;
  var effectComp = await figma.importComponentByKeyAsync(KEYS.effectCard);
  var outer = findExistingFrame(OUTER_NAME);
  var isNew = !outer;
  if (isNew) { outer = figma.createFrame(); outer.name = OUTER_NAME; figma.currentPage.appendChild(outer); }
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'HORIZONTAL'; outer.itemSpacing = 20;
  if (isNew) { outer.primaryAxisSizingMode = 'FIXED'; outer.counterAxisSizingMode = 'AUTO'; outer.resize(FRAME_W, 100); }
  if (isNew) {
    try {
      var docComp2 = await figma.importComponentByKeyAsync(KEYS.docModule);
      var docInst2 = docComp2.createInstance();
      outer.appendChild(docInst2);
      var docProps2 = { 'Epic#134:14': 'Styles', 'Instance/State#134:16': 'Effects', 'Purpose#134:18': 'Effect styles (shadows and blurs) used across the project.' };
      try {
        var dp2 = docInst2.componentProperties;
        Object.keys(dp2).forEach(function(k) {
          if (dp2[k].type === 'BOOLEAN') { var kl = k.toLowerCase(); if (kl.indexOf('section') !== -1 || kl.indexOf('data') !== -1) docProps2[k] = false; if (kl.indexOf('purpose') !== -1) docProps2[k] = true; }
        });
      } catch(e) {}
      docInst2.setProperties(docProps2);
    } catch(e) {}
  }
  var content2 = outer.findOne(function(n) { return n.name === 'EffectStyles' && n.type === 'FRAME'; });
  if (!content2) { content2 = figma.createFrame(); content2.name = 'EffectStyles'; outer.appendChild(content2); }
  while (content2.children.length > 0) content2.children[content2.children.length-1].remove();
  var effW = FRAME_W - 320 - 20;
  content2.fills = []; content2.clipsContent = false;
  content2.layoutMode = 'HORIZONTAL'; content2.layoutWrap = 'WRAP';
  content2.itemSpacing = 4; content2.counterAxisSpacing = 4;
  content2.resize(effW, 100);
  content2.primaryAxisSizingMode = 'AUTO'; content2.counterAxisSizingMode = 'FIXED';
  for (var ei = 0; ei < effects.length; ei++) {
    var eff = effects[ei];
    var einst = effectComp.createInstance();
    content2.appendChild(einst);
    try {
      var effFrame = einst.children[0].children[1];
      if (effFrame) { effFrame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }]; effFrame.effectStyleId = eff.style.id; }
    } catch(e) {}
    try {
      var nm2 = einst.children[1].children[0];
      var effTypeLabel = '';
      if (eff.style.effects[0]) { var et = eff.style.effects[0].type; if (et === 'DROP_SHADOW') effTypeLabel = 'Drop shadow'; else if (et === 'INNER_SHADOW') effTypeLabel = 'Inner shadow'; else if (et === 'LAYER_BLUR') effTypeLabel = 'Layer blur'; else if (et === 'BACKGROUND_BLUR') effTypeLabel = 'Background blur'; }
      var typeStr = eff.group ? effTypeLabel + ' - ' + eff.group : effTypeLabel;
      if (nm2.children[0].type === 'TEXT') nm2.children[0].characters = typeStr || ' ';
      if (nm2.children[1].type === 'TEXT') nm2.children[1].characters = eff.name;
    } catch(e) {}
    try {
      var valFrame = einst.children[1].children[1];
      var cssT = valFrame.children[0];
      if (cssT && cssT.type === 'TEXT') cssT.characters = effectToCss(eff.style.effects) || '-';
      var semInst = valFrame.children[1];
      if (semInst) {
        var shadowColourVar = null;
        eff.style.effects.forEach(function(fx) { if (!shadowColourVar && fx.boundVariables && fx.boundVariables.color) shadowColourVar = figma.variables.getVariableById(fx.boundVariables.color.id); });
        if (shadowColourVar) {
          try { semInst.setProperties({ 'Variable?#229:95': true }); } catch(e) {}
          try {
            var col3 = figma.variables.getVariableCollectionById(shadowColourVar.variableCollectionId);
            var mid3 = col3 ? col3.defaultModeId : null;
            var raw3 = mid3 ? shadowColourVar.valuesByMode[mid3] : shadowColourVar.valuesByMode[Object.keys(shadowColourVar.valuesByMode)[0]];
            var res3 = raw3 ? resolveColor(raw3, mid3) : null;
            var colFill3 = semInst.findOne(function(n) { return n.name === 'Colour'; });
            if (colFill3 && res3) { var cf3 = { type: 'SOLID', color: { r: res3.rgba.r, g: res3.rgba.g, b: res3.rgba.b }, opacity: res3.rgba.a }; colFill3.fills = [figma.variables.setBoundVariableForPaint(cf3, 'color', shadowColourVar)]; }
          } catch(e) {}
          try { var primT3 = semInst.findOne(function(n) { return n.name === 'primitive'; }); if (primT3) primT3.characters = '--' + shadowColourVar.name.replace(/\//g, '-').toLowerCase(); } catch(e) {}
        } else {
          try { semInst.setProperties({ 'Variable?#229:95': false }); } catch(e) {}
          var firstFx = eff.style.effects[0];
          if (firstFx && firstFx.color) {
            try { var ecFill = semInst.findOne(function(n) { return n.name === 'Colour'; }); if (ecFill) ecFill.fills = [{ type: 'SOLID', color: { r: firstFx.color.r, g: firstFx.color.g, b: firstFx.color.b }, opacity: firstFx.color.a }]; } catch(e) {}
          }
        }
      }
    } catch(e) {}
  }
  placeFrame(outer);
}

// ============================================================
// TYPOGRAPHY MODULE
// ============================================================
async function buildTypographyAll() {
  await buildTypography();
}

function styleToWeight(fontStyle) {
  var s = (fontStyle || '').toLowerCase();
  if (s.indexOf('thin') !== -1) return '100';
  if (s.indexOf('extralight') !== -1 || s.indexOf('extra light') !== -1) return '200';
  if (s.indexOf('light') !== -1) return '300';
  if (s.indexOf('medium') !== -1) return '500';
  if (s.indexOf('semibold') !== -1 || s.indexOf('semi bold') !== -1) return '600';
  if (s.indexOf('extrabold') !== -1 || s.indexOf('extra bold') !== -1) return '800';
  if (s.indexOf('black') !== -1 || s.indexOf('heavy') !== -1) return '900';
  if (s.indexOf('bold') !== -1) return '700';
  return '400';
}

function formatLineHeight(lh) {
  if (!lh || lh.unit === 'AUTO') return '-';
  if (lh.unit === 'PERCENT') return Math.round(lh.value) + '%';
  if (lh.unit === 'PIXELS') return Math.round(lh.value) + 'px';
  return '-';
}

function formatLetterSpacing(ls) {
  if (!ls) return '0';
  if (ls.unit === 'PERCENT') { var v = Math.round(ls.value * 10) / 10; return v === 0 ? '0' : v + '%'; }
  if (ls.unit === 'PIXELS') return ls.value + 'px';
  return '0';
}

async function buildTypography() {
  var textStyles = figma.getLocalTextStyles();
  if (!textStyles.length) return;

  var typoComp = await figma.importComponentByKeyAsync(KEYS.typographyStyle);
  var docComp  = await figma.importComponentByKeyAsync(KEYS.docModule);
  var typoSlot = await figma.importComponentByKeyAsync(KEYS.typographySlot);

  var groups = {}, groupOrder = [];
  textStyles.forEach(function(s) {
    var gKey = s.name.split('/')[0];
    if (!groups[gKey]) { groups[gKey] = { styles: [] }; groupOrder.push(gKey); }
    groups[gKey].styles.push(s);
  });

  var outer = getOrCreateFrame('Doc/Typography');
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL'; outer.itemSpacing = 16;
  outer.counterAxisSizingMode = 'FIXED'; outer.primaryAxisSizingMode = 'AUTO';
  outer.resize(FRAME_W, outer.height || 100);

  var purposes = {
    'Primary':   'Used for headings and display text.',
    'Secondary': 'Used for body and editorial text.',
    'Misc':      'Used for UI labels, buttons, tags, and inputs.'
  };
  var weightNames = { '100':'Thin','200':'Extra Light','300':'Light','400':'Regular','450':'Roman','500':'Medium','600':'Semi Bold','700':'Bold','800':'Extra Bold','900':'Black' };

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var gKey = groupOrder[gi];
    var g = groups[gKey];
    figma.ui.postMessage({ type: 'progress', name: 'Typography / ' + gKey });

    var variantType = 'Primary';
    var gKeyL = gKey.toLowerCase();
    if (gKeyL === 'secondary') variantType = 'Secondary';
    else if (gKeyL === 'misc' || gKeyL === 'miscellaneous') variantType = 'Misc';

    var secRow = figma.createFrame();
    secRow.name = gKey; secRow.fills = [];
    secRow.layoutMode = 'HORIZONTAL'; secRow.itemSpacing = 16;
    secRow.primaryAxisSizingMode = 'FIXED'; secRow.counterAxisSizingMode = 'AUTO';
    secRow.layoutAlign = 'STRETCH';
    outer.appendChild(secRow);

    var fontFamily = g.styles[0].fontName ? g.styles[0].fontName.family : '-';
    var seenWeights = {}, weightLines = [];
    g.styles.forEach(function(s) {
      if (!s.fontName) return;
      var num = styleToWeight(s.fontName.style);
      var key = num + s.fontName.style;
      if (!seenWeights[key]) {
        seenWeights[key] = true;
        var label = weightNames[num] || s.fontName.style;
        var stripped = s.fontName.style.replace(/\b(Extra\s)?Light\b|\bRegular\b|\bMedium\b|\b(Semi\s)?Bold\b|\b(Extra\s)?Bold\b|\bThin\b|\bBlack\b|\bHeavy\b|\bRoman\b/gi, '').trim();
        if (stripped) label = label + ' ' + stripped;
        weightLines.push(num + ' - ' + label.trim());
      }
    });
    weightLines.sort(function(a, b) { return parseInt(a) - parseInt(b); });

    var docInst = docComp.createInstance();
    secRow.appendChild(docInst);
    var docProps = {
      'Epic#134:14':           'Typography',
      'Instance/State#134:16': gKey,
      'Purpose#134:18':        purposes[variantType] || '',
      'Show purpose#227:81':   true,
      'Show sections#226:79':  true,
    };
    try {
      var instProps = docInst.componentProperties;
      Object.keys(instProps).forEach(function(k) {
        if (instProps[k].type === 'BOOLEAN' && k.toLowerCase().indexOf('data') !== -1) docProps[k] = false;
      });
    } catch(e) {}
    docInst.setProperties(docProps);

    try {
      var sectionsSlot = docInst.findOne(function(n) { return n.name === 'Sections'; });
      if (sectionsSlot) {
        while (sectionsSlot.children.length > 0) sectionsSlot.children[sectionsSlot.children.length - 1].remove();
        var tsInst = typoSlot.createInstance();
        sectionsSlot.appendChild(tsInst);
        try {
          var ffRow = tsInst.children[0];
          var cssVar = '--font-' + gKey.toLowerCase();
          var ffNodes = ffRow.findAll(function(n) { return n.type === 'TEXT' && n.name !== 'Label'; });
          ffNodes.forEach(function(n) { try { if (n.name === 'Font varible') { n.characters = cssVar; } else { n.characters = fontFamily; } } catch(e) {} });
        } catch(e) {}
        try {
          var wtRow = tsInst.children[1];
          var wtText = wtRow.findOne(function(n) { return n.type === 'TEXT' && n.name !== 'Label'; });
          if (wtText) { try { wtText.characters = weightLines.join('\n'); } catch(e) {} }
        } catch(e) {}
      }
    } catch(e) {}

    var isMisc = variantType === 'Misc';
    var colW = FRAME_W - 320 - 16;
    var cardW = isMisc ? 582 : colW;
    var stylesCol = figma.createFrame();
    stylesCol.name = 'TextStyles'; stylesCol.fills = [];
    stylesCol.layoutGrow = 1; stylesCol.layoutAlign = 'INHERIT';
    if (isMisc) {
      stylesCol.layoutMode = 'HORIZONTAL'; stylesCol.layoutWrap = 'WRAP';
      stylesCol.itemSpacing = 4; stylesCol.counterAxisSpacing = 4;
      stylesCol.primaryAxisSizingMode = 'FIXED'; stylesCol.counterAxisSizingMode = 'AUTO';
      stylesCol.resize(colW, 100);
    } else {
      stylesCol.layoutMode = 'VERTICAL'; stylesCol.itemSpacing = 4;
      stylesCol.primaryAxisSizingMode = 'AUTO'; stylesCol.counterAxisSizingMode = 'FIXED';
      stylesCol.resize(colW, 100);
    }
    secRow.appendChild(stylesCol);

    for (var si = 0; si < g.styles.length; si++) {
      var style = g.styles[si];
      var inst = typoComp.createInstance();
      if (isMisc) { inst.resize(cardW, 100); inst.layoutAlign = 'INHERIT'; }
      else { inst.layoutAlign = 'STRETCH'; }
      stylesCol.appendChild(inst);
      if (isMisc) { inst.primaryAxisSizingMode = 'FIXED'; inst.counterAxisSizingMode = 'AUTO'; inst.resize(cardW, inst.height); }

      var sName = style.name.split('/').pop();
      var fs = Math.round(style.fontSize) + ' px';
      var lh = formatLineHeight(style.lineHeight);
      var wt = styleToWeight(style.fontName ? style.fontName.style : '');
      var ls = formatLetterSpacing(style.letterSpacing);
      var previewContent = variantType === 'Primary' ? 'Primary\nSecond line' : variantType === 'Secondary' ? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nisi, gravida mauris ut lectus blandit tortor hendrerit. Commodo adipiscing et in vitae auctor diam amet, est est.' : 'Label';

      try { inst.setProperties({ 'Type': variantType }); } catch(e) {}
      try {
        inst.setProperties({
          'Style name#238:110':    sName,
          'Font-size#205:43':      fs,
          'Line-height#205:47':    lh,
          'Weight#205:51':         wt,
          'Letter-spacing#205:55': ls,
          'Content#203:16':        previewContent,
        });
      } catch(e) {}

      try {
        var previewT = inst.findOne(function(n) { return n.name === 'TextStyle' && n.type === 'TEXT'; });
        if (previewT) {
          try { previewT.textStyleId = style.id; } catch(e) {}
          try { await figma.loadFontAsync(style.fontName); } catch(e) {}
          try { previewT.characters = previewContent; } catch(e) {}
        }
      } catch(e) {}
    }
  }
  placeFrame(outer);
}

// ============================================================
// GRID MODULE
// ============================================================
async function buildGridAll() {
  await buildGrid();
}

async function buildGrid() {
  // Use local grid styles (the named layout guide styles) as the source of truth
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
    Object.keys(order).forEach(function(k) { if (an.indexOf(k) !== -1) aw = order[k]; if (bn.indexOf(k) !== -1) bw = order[k]; });
    return aw - bw;
  });

  var docComp      = await figma.importComponentByKeyAsync(KEYS.docModule);
  var gridSlotComp = await figma.importComponentByKeyAsync(KEYS.slotsGrid);
  var otherComp    = await figma.importComponentByKeyAsync(KEYS.sectionOther);

  var outer = getOrCreateFrame('Doc/Grid');
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL'; outer.itemSpacing = 16;
  outer.counterAxisSizingMode = 'FIXED'; outer.primaryAxisSizingMode = 'AUTO';
  outer.resize(FRAME_W, outer.height || 100);

  for (var i = 0; i < colStyles.length; i++) {
    var gs = colStyles[i];
    var colGrid = null;
    for (var gi = 0; gi < gs.layoutGrids.length; gi++) {
      if (gs.layoutGrids[gi].pattern === 'COLUMNS') { colGrid = gs.layoutGrids[gi]; break; }
    }
    if (!colGrid) continue;

    // Derive label and display width from style name
    var sn = gs.name.toLowerCase();
    var label = sn.indexOf('mob') !== -1 ? 'Mob' : sn.indexOf('tab') !== -1 ? 'Tab' : sn.indexOf('desk') !== -1 ? 'Desk' : 'Wide';
    figma.ui.postMessage({ type: 'progress', name: 'Grid / ' + label });
    await buildGridBreakpoint(outer, colGrid, label, docComp, gridSlotComp, otherComp);
  }
  placeFrame(outer);
}

async function buildGridBreakpoint(outer, colGrid, label, docComp, gridSlotComp, otherComp) {
  var columns  = colGrid.count;
  var gutter   = Math.round(colGrid.gutterSize);
  var margin   = Math.round(colGrid.offset);

  // Fixed display widths per breakpoint (Cinema fills remaining space)
  var vizWidths = { Mob: 360, Tab: 768, Desk: null, Wide: null };
  var vizW = vizWidths[label];
  var isFill = vizW === null;
  if (isFill) vizW = FRAME_W - 320 - 16;

  var bpLabels  = { Mob: 'Mob (360-768px)', Tab: 'Tab (768-1280px)', Desk: 'Desk (1280-1536px)', Wide: 'Wide (1536px+)' };
  var bpRanges  = { Mob: '0 - 767', Tab: '768 - 1279', Desk: '1280 - 1535', Wide: '1536+' };
  var purposes  = {
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

  // Row frame
  var rowFrame = figma.createFrame();
  rowFrame.name = label + 'Grid';
  rowFrame.fills = [];
  rowFrame.layoutMode = 'HORIZONTAL'; rowFrame.itemSpacing = 16;
  rowFrame.primaryAxisSizingMode = 'FIXED'; rowFrame.counterAxisSizingMode = 'AUTO';
  rowFrame.layoutAlign = 'STRETCH';
  outer.appendChild(rowFrame);

  // Doc panel
  var docInst = docComp.createInstance();
  rowFrame.appendChild(docInst);
  try {
    docInst.setProperties({
      'Epic#134:14':           'Grid',
      'Instance/State#134:16': bpLabels[label] || label,
      'Purpose#134:18':        purposes[label] || '',
      'Show purpose#227:81':   true,
      'Show sections#226:79':  true,
    });
  } catch(e) {}

  // Sections: Slots/Grid + Slots/Other
  try {
    var sectionsSlot = docInst.findOne(function(n) { return n.name === 'Sections'; });
    if (sectionsSlot) {
      while (sectionsSlot.children.length > 0) sectionsSlot.children[sectionsSlot.children.length - 1].remove();
      var gridSlot = gridSlotComp.createInstance();
      sectionsSlot.appendChild(gridSlot);
      try {
        gridSlot.setProperties({
          'Breakpoint#247:118': bpRanges[label] || '',
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

  // Column visual - auto-layout frame with named column rects
  var vizFrame = figma.createFrame();
  vizFrame.name = 'GridFrame';
  vizFrame.clipsContent = false;
  vizFrame.cornerRadius = 8;
  vizFrame.layoutAlign = 'STRETCH';      // fills row height
  vizFrame.primaryAxisSizingMode = 'FIXED';
  vizFrame.counterAxisSizingMode = 'AUTO';
  vizFrame.resize(vizW, 100);
  if (isFill) { vizFrame.layoutGrow = 1; } // fill remaining row width

  // Auto-layout: margin = padding, gutter = item spacing
  vizFrame.layoutMode = 'HORIZONTAL';
  vizFrame.paddingLeft = margin;
  vizFrame.paddingRight = margin;
  vizFrame.paddingTop = 0;
  vizFrame.paddingBottom = 0;
  vizFrame.itemSpacing = gutter;

  // Background via --ui-bg-background variable
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
    } else {
      vizFrame.fills = [bgFill];
    }
  } catch(e) { vizFrame.fills = [bgFill]; }

  rowFrame.appendChild(vizFrame);

  // Find --col-semantic-red variable
  var redVar = findCssVariable('--col-semantic-red');
  var redFill = { type: 'SOLID', color: { r: 1, g: 0.2, b: 0.2 } };
  if (redVar) {
    try {
      var redCol = figma.variables.getVariableCollectionById(redVar.variableCollectionId);
      var redMid = redCol ? redCol.defaultModeId : null;
      var rawRed = redMid ? redVar.valuesByMode[redMid] : redVar.valuesByMode[Object.keys(redVar.valuesByMode)[0]];
      var resRed = rawRed ? resolveColor(rawRed, redMid) : null;
      if (resRed) redFill = { type: 'SOLID', color: { r: resRed.rgba.r, g: resRed.rgba.g, b: resRed.rgba.b } };
    } catch(e) {}
  }

  // Column rects: fill height + equal width via layoutGrow
  for (var ci = 0; ci < columns; ci++) {
    var num = ci + 1;
    var colName = 'Column' + (num < 10 ? '0' : '') + num;
    var colRect = figma.createRectangle();
    colRect.name = colName;
    colRect.opacity = 0.5;             // 50% layer opacity
    colRect.layoutGrow = 1;            // fills primary axis equally
    colRect.layoutAlign = 'STRETCH';   // fills counter axis (height)

    if (redVar) {
      try { colRect.fills = [figma.variables.setBoundVariableForPaint(redFill, 'color', redVar)]; }
      catch(e) { colRect.fills = [redFill]; }
    } else {
      colRect.fills = [redFill];
    }
    vizFrame.appendChild(colRect);
  }
}