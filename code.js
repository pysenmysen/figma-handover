// Grebbans Handover — v7.0

var VERSION = '7.0';
var FRAME_W = 1164;

var KEYS = {
  docModule:       '8df1ea68f02f91062978acb1ccbab2cec2e92171',
  colourPrimitive: '0f4a992b74f79d0754a10487640c165f040cf6be',
  sectionOther:    'eb7778ad03fc3564e5b9c25cdeae1743a5233402',
  sectionOption:   'fcd2f3c2808271c76d581b54e0cea7679c9fee3d',
};

figma.showUI(__html__, { width: 480, height: 600, themeColors: true });

// ─── Init ────────────────────────────────────────────────────────────────────
(async function init() {
  var collections = figma.variables.getLocalVariableCollections();
  var items = [];

  collections.forEach(function(col) {
    var colorCount = col.variableIds.filter(function(id) {
      var v = figma.variables.getVariableById(id);
      return v && v.resolvedType === 'COLOR';
    }).length;
    if (!colorCount) return;
    items.push({
      id: col.id,
      name: col.name,
      meta: colorCount + ' colours' + (col.modes.length > 1 ? ' · ' + col.modes.length + ' modes' : ''),
      kind: 'collection',
      exists: !!figma.currentPage.findOne(function(n) { return n.type === 'FRAME' && n.name === col.name; })
    });
  });

  // Check styles
  var effectStyles = figma.getLocalEffectStyles();
  var paintStyles = figma.getLocalPaintStyles();
  var gradCount = paintStyles.filter(function(s) {
    return s.paints && s.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; });
  }).length;
  if (effectStyles.length + gradCount > 0) {
    items.push({
      id: 'effects',
      name: 'Effects & Gradients',
      meta: (effectStyles.length + gradCount) + ' styles',
      kind: 'styles',
      exists: !!figma.currentPage.findOne(function(n) { return n.type === 'FRAME' && n.name === 'Effects & Gradients'; })
    });
  }

  var textStyles = figma.getLocalTextStyles();
  if (textStyles.length > 0) {
    items.push({
      id: 'typography',
      name: 'Typography',
      meta: textStyles.length + ' text styles',
      kind: 'typography',
      exists: !!figma.currentPage.findOne(function(n) { return n.type === 'FRAME' && n.name === 'Typography'; })
    });
  }

  figma.ui.postMessage({ type: 'init', items: items, version: VERSION });
})();

// ─── Message handler ──────────────────────────────────────────────────────────
figma.ui.onmessage = async function(msg) {
  if (msg.type === 'build') {
    var nhStyles = ['Regular', 'Roman', '55 Roman'];
    for (var fi = 0; fi < nhStyles.length; fi++) {
      try {
        await Promise.race([
          figma.loadFontAsync({ family: 'Neue Haas Grotesk Display Pro', style: nhStyles[fi] }),
          new Promise(function(_, r) { setTimeout(r, 1500); })
        ]);
        LOADED_FONT = { family: 'Neue Haas Grotesk Display Pro', style: nhStyles[fi] };
        break;
      } catch(e) {}
    }
    if (!LOADED_FONT) {
      try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); LOADED_FONT = { family: 'Inter', style: 'Regular' }; } catch(e) {}
    }

    try {
      var targets = msg.targets; // array of item ids
      for (var ti = 0; ti < targets.length; ti++) {
        figma.ui.postMessage({ type: 'progress', name: targets[ti] });
        await buildTarget(targets[ti], msg.collectionMap);
      }
    } catch(err) {
      figma.ui.postMessage({ type: 'error', message: String(err) });
      return;
    }
    figma.ui.postMessage({ type: 'done' });
  }
  if (msg.type === 'close') figma.closePlugin();
};

var LOADED_FONT = null;

// ─── Route to correct builder ─────────────────────────────────────────────────
async function buildTarget(id, collectionMap) {
  if (id === 'effects') { buildStylesFrame(); return; }
  if (id === 'typography') { buildTypography(); return; }
  // Collection
  var col = figma.variables.getVariableCollectionById(id);
  if (!col) return;
  if (isSemantic(col)) buildThemesFrame(col);
  else await buildPrimitivesFrame(col);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
var LOADED_FONT = { family: 'Inter', style: 'Regular' };

function makeText(chars, size, r, g, b, a, rightAlign) {
  var t = figma.createText();
  try { t.fontName = LOADED_FONT; } catch(e) {
    try { t.fontName = { family: 'Inter', style: 'Regular' }; } catch(e2) {}
  }
  t.fontSize = size || 12;
  t.characters = String(chars);
  var fill = { type: 'SOLID', color: { r:r||0, g:g||0, b:b||0 } };
  if (a !== undefined && a < 1) fill.opacity = a;
  t.fills = [fill];
  if (rightAlign) t.textAlignHorizontal = 'RIGHT';
  return t;
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

function removeFrame(name) {
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === name;
  }).forEach(function(f) { f.remove(); });
}

function placeFrame(frame) {
  // Place inside ✏️ Style sheet section if it exists, else on canvas
  var section = figma.currentPage.findOne(function(n) {
    return n.type === 'SECTION' && n.name.indexOf('Style sheet') !== -1;
  });
  if (section) {
    section.appendChild(frame);
  } else {
    figma.currentPage.appendChild(frame);
  }
  figma.viewport.scrollAndZoomIntoView([frame]);
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES — uses 📋 Doc/Colour component instances
// ══════════════════════════════════════════════════════════════════════════════
async function buildPrimitivesFrame(col) {
  removeFrame(col.name);
  var modeId = col.defaultModeId;

  // Group by top 2 path segments
  var groups = {}, groupOrder = [];
  for (var vi = 0; vi < col.variableIds.length; vi++) {
    var v = figma.variables.getVariableById(col.variableIds[vi]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var raw = v.valuesByMode[modeId] || v.valuesByMode[Object.keys(v.valuesByMode)[0]];
    var res = raw ? resolveColor(raw, modeId) : null;
    if (!res) continue;
    var parts = v.name.split('/');
    var gKey = parts.length > 1 ? parts.slice(0,2).join('/') : '__root__';
    var gParts = parts.length > 1 ? parts.slice(0,2) : [col.name];
    if (!groups[gKey]) { groups[gKey] = { parts: gParts, tokens: [] }; groupOrder.push(gKey); }
    groups[gKey].tokens.push({
      cssName: '--' + v.name.replace(/\//g, '-').toLowerCase(),
      variable: v,
      hex: toHex(res.rgba.r, res.rgba.g, res.rgba.b),
      alpha: Math.round(res.rgba.a * 100) / 100
    });
  }

  // Import colour card component
  var colComp = await figma.importComponentByKeyAsync(KEYS.colourPrimitive);

  // Outer frame
  var outer = figma.createFrame();
  outer.name = col.name;
  outer.fills = [];
  outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 16;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'FIXED';
  outer.resize(FRAME_W, 100);

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var g = groups[groupOrder[gi]];

    var gf = figma.createFrame();
    gf.name = 'VaribleGroup';
    gf.fills = [];
    gf.layoutMode = 'VERTICAL';
    gf.itemSpacing = 12;
    gf.primaryAxisSizingMode = 'AUTO';
    gf.counterAxisSizingMode = 'FIXED';
    gf.layoutAlign = 'STRETCH';
    outer.appendChild(gf);

    // Group label
    var gnc = figma.createFrame();
    gnc.name = 'GroupNameContainer';
    gnc.fills = [];
    gnc.layoutMode = 'HORIZONTAL';
    gnc.itemSpacing = 4;
    gnc.primaryAxisSizingMode = 'AUTO';
    gnc.counterAxisSizingMode = 'AUTO';
    gf.appendChild(gnc);

    for (var pi = 0; pi < g.parts.length; pi++) {
      var pt = makeText(g.parts[pi], 16, 0, 0, 0, 1);
      pt.textAutoResize = 'WIDTH_AND_HEIGHT';
      gnc.appendChild(pt);
      if (pi < g.parts.length - 1) {
        var sp = makeText('/', 16, 0, 0, 0, 1);
        sp.textAutoResize = 'WIDTH_AND_HEIGHT';
        gnc.appendChild(sp);
      }
    }

    // Cards wrap
    var vf = figma.createFrame();
    vf.name = 'Varibles';
    vf.fills = [];
    vf.layoutMode = 'HORIZONTAL';
    vf.layoutWrap = 'WRAP';
    vf.itemSpacing = 4;
    vf.counterAxisSpacing = 4;
    vf.primaryAxisSizingMode = 'FIXED';
    vf.counterAxisSizingMode = 'AUTO';
    vf.layoutAlign = 'STRETCH';
    gf.appendChild(vf);

    for (var ti = 0; ti < g.tokens.length; ti++) {
      var token = g.tokens[ti];
      var inst = colComp.createInstance();
      vf.appendChild(inst);

      var hasAlpha = token.alpha < 0.99;
      try {
        var nameNode = inst.findOne(function(n) { return n.name === 'VariantName'; });
        var hexNode  = inst.findOne(function(n) { return n.name === 'Hex'; });
        var opNode   = inst.findOne(function(n) { return n.name === 'Opacity'; });
        if (nameNode) nameNode.characters = token.cssName;
        if (hexNode)  hexNode.characters  = token.hex;
        if (opNode) { opNode.visible = hasAlpha; if (hasAlpha) opNode.characters = Math.round(token.alpha * 100) + '%'; }
      } catch(e) {}
      try {
        var colourFrame = inst.findOne(function(n) { return n.name === 'Colour'; });
        if (colourFrame) {
          var colorFill = { type: 'SOLID', color: { r:0, g:0, b:0 }, opacity: token.alpha };
          colourFrame.fills = [figma.variables.setBoundVariableForPaint(colorFill, 'color', token.variable)];
        }
      } catch(e) {}
    }
  }

  placeFrame(outer);
}

// ══════════════════════════════════════════════════════════════════════════════
// THEMES
// ══════════════════════════════════════════════════════════════════════════════
function buildThemesFrame(col) {
  removeFrame(col.name);
  var modes = col.modes;
  var groups = {}, groupOrder = [];

  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var parts = v.name.split('/');
    var gKey = parts.length > 1 ? parts.slice(0,2).join('/') : '__root__';
    if (!groups[gKey]) { groups[gKey] = { tokens: [] }; groupOrder.push(gKey); }
    groups[gKey].tokens.push(v);
  }

  var outer = figma.createFrame();
  outer.name = col.name;
  outer.fills = [];
  outer.clipsContent = false;
  outer.layoutMode = 'HORIZONTAL';
  outer.itemSpacing = 4;
  outer.primaryAxisSizingMode = 'FIXED';
  outer.counterAxisSizingMode = 'AUTO';
  outer.resize(FRAME_W, 100);

  // Semantic column
  var semCol = figma.createFrame();
  semCol.name = 'Semantic'; semCol.fills = [];
  semCol.layoutMode = 'VERTICAL'; semCol.itemSpacing = 4;
  semCol.primaryAxisSizingMode = 'AUTO';
  semCol.counterAxisSizingMode = 'FIXED';
  semCol.layoutGrow = 1; semCol.layoutAlign = 'INHERIT';
  outer.appendChild(semCol);
  buildThemeHeader(semCol, 'Semantic');

  for (var gi = 0; gi < groupOrder.length; gi++) {
    if (gi > 0) buildSeparator(semCol);
    var g = groups[groupOrder[gi]];
    for (var ti = 0; ti < g.tokens.length; ti++) {
      var cssName = '--' + g.tokens[ti].name.replace(/\//g,'-').toLowerCase();
      semCol.appendChild(buildThemeNameCard(cssName, ti % 2 === 0));
    }
  }

  // Mode columns
  for (var mi = 0; mi < modes.length; mi++) {
    var mode = modes[mi];
    var modeCol = figma.createFrame();
    modeCol.name = mode.name; modeCol.fills = [];
    modeCol.layoutMode = 'VERTICAL'; modeCol.itemSpacing = 4;
    modeCol.primaryAxisSizingMode = 'AUTO';
    modeCol.counterAxisSizingMode = 'FIXED';
    modeCol.layoutGrow = 1; modeCol.layoutAlign = 'INHERIT';
    outer.appendChild(modeCol);
    buildThemeHeader(modeCol, mode.name);

    for (var gi2 = 0; gi2 < groupOrder.length; gi2++) {
      if (gi2 > 0) buildSeparator(modeCol);
      var g2 = groups[groupOrder[gi2]];
      for (var ti2 = 0; ti2 < g2.tokens.length; ti2++) {
        var v2 = g2.tokens[ti2];
        var raw = v2.valuesByMode[mode.modeId];
        if (!raw) { var ks = Object.keys(v2.valuesByMode); if(ks.length) raw = v2.valuesByMode[ks[0]]; }
        var res = raw ? resolveColor(raw, mode.modeId) : null;
        modeCol.appendChild(buildThemeModeCard(v2, res, ti2 % 2 === 0));
      }
    }
  }

  placeFrame(outer);
}

function buildThemeHeader(parent, label) {
  var hdr = figma.createFrame();
  hdr.name = 'ThemeHeader'; hdr.fills = [];
  hdr.layoutMode = 'HORIZONTAL';
  hdr.counterAxisAlignItems = 'CENTER';
  hdr.itemSpacing = 4; hdr.paddingBottom = 16;
  hdr.primaryAxisSizingMode = 'FIXED'; hdr.counterAxisSizingMode = 'AUTO';
  hdr.layoutAlign = 'STRETCH';
  parent.appendChild(hdr);
  var t = makeText(label, 16, 0, 0, 0, 1);
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  hdr.appendChild(t);
}

function buildSeparator(parent) {
  var sep = figma.createFrame();
  sep.name = 'Seperator'; sep.fills = [];
  sep.layoutMode = 'HORIZONTAL'; sep.itemSpacing = 0; sep.paddingBottom = 8;
  sep.primaryAxisSizingMode = 'FIXED'; sep.counterAxisSizingMode = 'AUTO';
  sep.layoutAlign = 'STRETCH'; sep.resize(10, 8);
  parent.appendChild(sep);
}

function buildThemeNameCard(cssName, primary) {
  var card = figma.createFrame();
  card.name = 'Colou';
  card.fills = [{ type:'SOLID', color:{r:1,g:1,b:1}, opacity: primary ? 0.8 : 0.3 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL'; card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = 16; card.paddingTop = card.paddingBottom = 0;
  card.primaryAxisSizingMode = 'FIXED'; card.counterAxisSizingMode = 'FIXED';
  card.counterAxisAlignItems = 'CENTER';
  card.layoutAlign = 'STRETCH'; card.resize(10, 40);
  var t = makeText(cssName, 12, 0, 0, 0, 1);
  t.letterSpacing = { value: -1, unit: 'PERCENT' };
  t.layoutAlign = 'STRETCH'; t.textAutoResize = 'HEIGHT';
  card.appendChild(t);
  return card;
}

function buildThemeModeCard(variable, res, primary) {
  var card = figma.createFrame();
  card.name = 'Colou';
  card.fills = [{ type:'SOLID', color:{r:1,g:1,b:1}, opacity: primary ? 0.8 : 0.3 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL'; card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = 16; card.paddingTop = card.paddingBottom = 0;
  card.primaryAxisSizingMode = 'FIXED'; card.counterAxisSizingMode = 'FIXED';
  card.counterAxisAlignItems = 'CENTER';
  card.layoutAlign = 'STRETCH'; card.resize(10, 40);

  if (!res) {
    var dash = makeText('—', 12, 0, 0, 0, 0.4);
    dash.textAutoResize = 'WIDTH_AND_HEIGHT';
    card.appendChild(dash);
    return card;
  }

  var so = figma.createFrame();
  so.name = 'Color'; so.fills = []; so.layoutMode = 'NONE';
  so.strokes = [{ type:'SOLID', color:{r:0,g:0,b:0}, opacity:0.5 }];
  so.strokeWeight = 1; so.cornerRadius = 4;
  so.resize(16, 16); so.layoutAlign = 'INHERIT'; so.layoutGrow = 0;
  card.appendChild(so);

  var checker = figma.createRectangle();
  checker.resize(10,10); checker.x=3; checker.y=3; checker.cornerRadius=2;
  checker.fills=[{type:'SOLID',color:{r:0.85,g:0.85,b:0.85}}];
  so.appendChild(checker);

  var si = figma.createRectangle();
  si.resize(10,10); si.x=3; si.y=3; si.cornerRadius=2;
  var hasAlpha = res.rgba.a < 0.99;
  var colorFill = { type:'SOLID', color:{r:res.rgba.r,g:res.rgba.g,b:res.rgba.b}, opacity:res.rgba.a };
  try {
    si.fills = [figma.variables.setBoundVariableForPaint(colorFill, 'color', figma.variables.getVariableById(variable.id))];
  } catch(e) { si.fills = [colorFill]; }
  so.appendChild(si);

  var primName = res.aliasName ? '--' + res.aliasName.replace(/\//g,'-').toLowerCase() : toHex(res.rgba.r,res.rgba.g,res.rgba.b);
  var pt = makeText(primName, 12, 0, 0, 0, 1);
  pt.letterSpacing = { value:-1, unit:'PERCENT' };
  pt.layoutGrow = 1; pt.textAutoResize = 'HEIGHT'; pt.layoutAlign = 'INHERIT';
  card.appendChild(pt);
  return card;
}

// ══════════════════════════════════════════════════════════════════════════════
// EFFECTS & GRADIENTS
// ══════════════════════════════════════════════════════════════════════════════
function buildStylesFrame() {
  removeFrame('Effects & Gradients');
  var effectStyles = figma.getLocalEffectStyles();
  var paintStyles  = figma.getLocalPaintStyles();
  var groups = {}, groupOrder = [];

  paintStyles.forEach(function(ps) {
    var isGradient = ps.paints && ps.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; });
    if (!isGradient) return;
    var pparts = ps.name.split('/');
    var pgKey = pparts[0];
    if (!groups[pgKey]) { groups[pgKey] = { items: [] }; groupOrder.push(pgKey); }
    groups[pgKey].items.push({ kind:'gradient', style:ps, groupName: pparts.length>1?pparts[1]:'', dirName:pparts[pparts.length-1] });
  });

  effectStyles.forEach(function(es) {
    if (!es.effects || !es.effects.length) return;
    var eparts = es.name.split('/');
    var egKey = eparts[0];
    if (!groups[egKey]) { groups[egKey] = { items: [] }; groupOrder.push(egKey); }
    groups[egKey].items.push({ kind:'effect', style:es, groupName:eparts.length>1?eparts[1]:'', dirName:eparts[eparts.length-1] });
  });

  if (!groupOrder.length) return;

  var outer = figma.createFrame();
  outer.name = 'Effects & Gradients';
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL'; outer.itemSpacing = 16;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'FIXED';
  outer.resize(FRAME_W, 100);

  groupOrder.forEach(function(gKey) {
    var g = groups[gKey];
    var gf = figma.createFrame();
    gf.name = 'VaribleGroup'; gf.fills = [];
    gf.layoutMode = 'VERTICAL'; gf.itemSpacing = 12;
    gf.primaryAxisSizingMode = 'AUTO';
    gf.counterAxisSizingMode = 'FIXED'; gf.layoutAlign = 'STRETCH';
    outer.appendChild(gf);

    var gnc = figma.createFrame();
    gnc.name = 'GroupNameContainer'; gnc.fills = [];
    gnc.layoutMode = 'HORIZONTAL'; gnc.itemSpacing = 4;
    gnc.primaryAxisSizingMode = 'AUTO'; gnc.counterAxisSizingMode = 'AUTO';
    gnc.layoutAlign = 'STRETCH';
    gf.appendChild(gnc);
    var lbl = makeText(gKey, 16, 0, 0, 0, 1);
    lbl.textAutoResize = 'WIDTH_AND_HEIGHT';
    gnc.appendChild(lbl);

    var vf = figma.createFrame();
    vf.name = 'Varibles'; vf.fills = [];
    vf.layoutMode = 'HORIZONTAL'; vf.layoutWrap = 'WRAP';
    vf.itemSpacing = 4; vf.counterAxisSpacing = 4;
    vf.primaryAxisSizingMode = 'FIXED'; vf.counterAxisSizingMode = 'AUTO';
    vf.layoutAlign = 'STRETCH';
    gf.appendChild(vf);

    g.items.forEach(function(item) {
      vf.appendChild(item.kind === 'gradient' ? buildStyleGradientCard(item) : buildStyleEffectCard(item));
    });
  });

  placeFrame(outer);
}

function buildStyleGradientCard(item) {
  var card = figma.createFrame();
  card.name = 'Varible';
  card.fills = [{type:'SOLID',color:{r:1,g:1,b:1},opacity:0.8}];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL'; card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.counterAxisAlignItems = 'CENTER';
  card.primaryAxisSizingMode = 'FIXED'; card.counterAxisSizingMode = 'AUTO';
  card.resize(288, 52);

  var so = figma.createFrame();
  so.name = 'Color'; so.fills = [];
  so.layoutMode = 'VERTICAL';
  so.paddingLeft = so.paddingRight = so.paddingTop = so.paddingBottom = 4;
  so.strokes=[{type:'SOLID',color:{r:0,g:0,b:0},opacity:0.5}];
  so.strokeWeight=1; so.cornerRadius=4;
  so.primaryAxisSizingMode='FIXED'; so.counterAxisSizingMode='FIXED';
  so.resize(52,52); so.layoutAlign='INHERIT'; so.layoutGrow=0;
  card.appendChild(so);

  var checker = figma.createFrame();
  checker.name='BG-img'; checker.fills=[{type:'SOLID',color:{r:0.851,g:0.851,b:0.851}}];
  checker.layoutMode='NONE'; checker.cornerRadius=2;
  checker.layoutAlign='STRETCH'; checker.layoutGrow=1;
  so.appendChild(checker);

  var gradRect = figma.createFrame();
  gradRect.name='Color'; gradRect.layoutMode='NONE'; gradRect.cornerRadius=2;
  gradRect.resize(44,44);
  try { gradRect.fills=item.style.paints; } catch(e) { gradRect.fills=[{type:'SOLID',color:{r:0.8,g:0.8,b:0.8}}]; }
  so.appendChild(gradRect);
  gradRect.layoutPositioning='ABSOLUTE'; gradRect.x=4; gradRect.y=4;

  var nh = figma.createFrame();
  nh.name='NameHex'; nh.fills=[];
  nh.layoutMode='VERTICAL'; nh.itemSpacing=8;
  nh.primaryAxisSizingMode='AUTO'; nh.counterAxisSizingMode='FIXED';
  nh.primaryAxisAlignItems='CENTER';
  nh.layoutGrow=1; nh.layoutAlign='STRETCH';
  card.appendChild(nh);

  var gn = figma.createFrame();
  gn.name='GradientName'; gn.fills=[];
  gn.layoutMode='VERTICAL'; gn.itemSpacing=0;
  gn.primaryAxisSizingMode='AUTO'; gn.counterAxisSizingMode='FIXED';
  gn.layoutAlign='STRETCH';
  nh.appendChild(gn);

  if (item.groupName) {
    var grpT = makeText(item.groupName,12,0,0,0,0.5);
    grpT.layoutAlign='STRETCH'; grpT.textAutoResize='HEIGHT';
    gn.appendChild(grpT);
  }
  var dirT = makeText(item.dirName,12,0,0,0,1);
  dirT.layoutAlign='STRETCH'; dirT.textAutoResize='HEIGHT';
  gn.appendChild(dirT);

  var varNames = getGradientVarNames(item.style);
  if (varNames) {
    var varT = makeText(varNames,12,0,0,0,0.5);
    varT.letterSpacing={value:-1,unit:'PERCENT'};
    varT.layoutAlign='STRETCH'; varT.textAutoResize='HEIGHT';
    nh.appendChild(varT);
  }
  return card;
}

function buildStyleEffectCard(item) {
  var card = figma.createFrame();
  card.name = 'Varible';
  card.fills=[{type:'SOLID',color:{r:1,g:1,b:1},opacity:0.8}];
  card.cornerRadius=20;
  card.layoutMode='HORIZONTAL'; card.itemSpacing=12;
  card.paddingLeft=card.paddingRight=card.paddingTop=card.paddingBottom=16;
  card.counterAxisAlignItems='CENTER';
  card.primaryAxisSizingMode='FIXED'; card.counterAxisSizingMode='AUTO';
  card.resize(288,52); card.layoutAlign='INHERIT';

  var preview = figma.createEllipse();
  preview.name='Preview'; preview.resize(44,44);
  preview.fills=[{type:'SOLID',color:{r:0.9,g:0.9,b:0.9}}];
  try { preview.effects=item.style.effects; } catch(e) {}
  preview.layoutAlign='INHERIT'; preview.layoutGrow=0;
  card.appendChild(preview);

  var nh = figma.createFrame();
  nh.name='NameHex'; nh.fills=[];
  nh.layoutMode='VERTICAL'; nh.itemSpacing=8;
  nh.primaryAxisSizingMode='AUTO'; nh.counterAxisSizingMode='FIXED';
  nh.primaryAxisAlignItems='CENTER';
  nh.layoutGrow=1; nh.layoutAlign='STRETCH';
  card.appendChild(nh);

  if (item.groupName) {
    var grpT=makeText(item.groupName,12,0,0,0,0.5);
    grpT.textAutoResize='WIDTH_AND_HEIGHT'; nh.appendChild(grpT);
  }
  var nameT=makeText(item.dirName,12,0,0,0,1);
  nameT.textAutoResize='WIDTH_AND_HEIGHT'; nh.appendChild(nameT);

  var cssVal=effectToCss(item.style.effects);
  if (cssVal) {
    var cssT=makeText(cssVal,10,0,0,0,0.5);
    cssT.letterSpacing={value:-1,unit:'PERCENT'};
    cssT.layoutAlign='STRETCH'; cssT.textAutoResize='HEIGHT';
    nh.appendChild(cssT);
  }
  return card;
}

function getGradientVarNames(paintStyle) {
  var names = [];
  try {
    paintStyle.paints.forEach(function(p) {
      if (p.gradientStops) p.gradientStops.forEach(function(s) {
        if (s.boundVariables && s.boundVariables.color) {
          var v = figma.variables.getVariableById(s.boundVariables.color.id);
          if (v) names.push('--' + v.name.replace(/\//g,'-').toLowerCase());
        }
      });
    });
  } catch(e) {}
  return names.length ? names.join('\n') : null;
}

function effectToCss(effects) {
  var parts = [];
  effects.forEach(function(e) {
    if (!e.visible) return;
    if (e.type==='DROP_SHADOW'||e.type==='INNER_SHADOW') {
      var c=e.color, inset=e.type==='INNER_SHADOW'?'inset ':'';
      parts.push(inset+e.offset.x+'px '+e.offset.y+'px '+e.radius+'px rgba('+Math.round(c.r*255)+','+Math.round(c.g*255)+','+Math.round(c.b*255)+','+Math.round(c.a*100)/100+')');
    } else if (e.type==='LAYER_BLUR'||e.type==='BACKGROUND_BLUR') {
      parts.push('blur('+e.radius+'px)');
    }
  });
  return parts.join(', ');
}

// ══════════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY
// ══════════════════════════════════════════════════════════════════════════════
function buildTypography() {
  removeFrame('Typography');
  var textStyles = figma.getLocalTextStyles();
  if (!textStyles.length) return;

  var groups = {}, groupOrder = [];
  textStyles.forEach(function(s) {
    var gKey = s.name.split('/')[0];
    if (!groups[gKey]) { groups[gKey] = { styles:[] }; groupOrder.push(gKey); }
    groups[gKey].styles.push(s);
  });

  var outer = figma.createFrame();
  outer.name = 'Typography';
  outer.fills=[]; outer.clipsContent=false;
  outer.layoutMode='VERTICAL'; outer.itemSpacing=16;
  outer.primaryAxisSizingMode='AUTO';
  outer.counterAxisSizingMode='FIXED';
  outer.resize(FRAME_W, 100);

  groupOrder.forEach(function(gKey) {
    var g = groups[gKey];
    var secRow = figma.createFrame();
    secRow.name=gKey; secRow.fills=[];
    secRow.layoutMode='HORIZONTAL'; secRow.itemSpacing=16;
    secRow.primaryAxisSizingMode='FIXED'; secRow.counterAxisSizingMode='AUTO';
    secRow.layoutAlign='STRETCH';
    outer.appendChild(secRow);

    // Doc panel
    var doc = figma.createFrame();
    doc.name='Doc';
    doc.fills=[{type:'SOLID',color:{r:0.153,g:0.153,b:0.153}}];
    doc.cornerRadius=20;
    doc.effects=[{type:'INNER_SHADOW',color:{r:1,g:1,b:1,a:0.05},offset:{x:0,y:0},radius:4,spread:1,visible:true,blendMode:'NORMAL'}];
    doc.layoutMode='VERTICAL'; doc.itemSpacing=0;
    doc.paddingLeft=doc.paddingRight=doc.paddingTop=doc.paddingBottom=16;
    doc.primaryAxisSizingMode='AUTO';
    doc.counterAxisSizingMode='FIXED';
    doc.resize(320,100); doc.layoutAlign='STRETCH';
    secRow.appendChild(doc);

    var hdr=figma.createFrame(); hdr.name='Header'; hdr.fills=[];
    hdr.layoutMode='VERTICAL'; hdr.itemSpacing=0; hdr.paddingBottom=16;
    hdr.primaryAxisSizingMode='AUTO'; hdr.counterAxisSizingMode='FIXED'; hdr.layoutAlign='STRETCH';
    doc.appendChild(hdr);

    var epicT=makeText('Typography',16,1,1,1,0.7); epicT.layoutAlign='STRETCH'; epicT.textAutoResize='HEIGHT'; hdr.appendChild(epicT);
    var instT=makeText(gKey,16,1,1,1,1); instT.layoutAlign='STRETCH'; instT.textAutoResize='HEIGHT'; hdr.appendChild(instT);

    var opts=figma.createFrame(); opts.name='Options'; opts.fills=[];
    opts.strokes=[{type:'SOLID',color:{r:1,g:1,b:1},opacity:0.2}];
    opts.strokeWeight=0.5; opts.strokeTopWeight=0.5; opts.strokeBottomWeight=0; opts.strokeLeftWeight=0; opts.strokeRightWeight=0;
    opts.layoutMode='VERTICAL'; opts.itemSpacing=2; opts.paddingTop=opts.paddingBottom=12;
    opts.primaryAxisSizingMode='AUTO'; opts.counterAxisSizingMode='FIXED'; opts.layoutAlign='STRETCH';
    doc.appendChild(opts);

    var fontFamily = g.styles[0].fontName ? g.styles[0].fontName.family : '—';
    buildDocRow(opts,'Font family',fontFamily);
    buildDocRow(opts,'Text transform','Regular + Italic');

    // Styles
    var stylesCol=figma.createFrame(); stylesCol.name='TextStyles'; stylesCol.fills=[];
    stylesCol.layoutMode='VERTICAL'; stylesCol.itemSpacing=16;
    stylesCol.primaryAxisSizingMode='AUTO'; stylesCol.counterAxisSizingMode='FIXED';
    stylesCol.layoutGrow=1; stylesCol.layoutAlign='INHERIT';
    secRow.appendChild(stylesCol);

    g.styles.forEach(function(style) { stylesCol.appendChild(buildTypographyCard(style,gKey)); });
  });

  placeFrame(outer);
}

function buildDocRow(parent,label,value) {
  var row=figma.createFrame();
  row.name='DataRow'; row.fills=[{type:'SOLID',color:{r:1,g:1,b:1},opacity:0.05}];
  row.cornerRadius=4; row.layoutMode='HORIZONTAL';
  row.paddingLeft=row.paddingTop=row.paddingBottom=4; row.paddingRight=16;
  row.primaryAxisSizingMode='FIXED'; row.counterAxisSizingMode='AUTO'; row.layoutAlign='STRETCH';
  parent.appendChild(row);
  var lT=makeText(label,10,1,1,1,0.7); lT.textAutoResize='HEIGHT'; lT.resize(68,16); row.appendChild(lT);
  var vT=makeText(value,10,1,1,1,1); vT.layoutGrow=1; vT.layoutAlign='STRETCH'; vT.textAutoResize='HEIGHT'; row.appendChild(vT);
}

function buildTypographyCard(style,group) {
  var card=figma.createFrame();
  card.name=style.name;
  card.fills=[{type:'SOLID',color:{r:1,g:1,b:1},opacity:0.8}];
  card.strokes=[{type:'SOLID',color:{r:1,g:1,b:1},opacity:0.8}]; card.strokeWeight=1;
  card.cornerRadius=20;
  card.layoutMode='HORIZONTAL'; card.itemSpacing=16;
  card.paddingLeft=card.paddingRight=card.paddingTop=card.paddingBottom=16;
  card.counterAxisAlignItems='CENTER';
  card.primaryAxisSizingMode='FIXED'; card.counterAxisSizingMode='AUTO';
  card.layoutAlign='STRETCH';

  var settings=figma.createFrame();
  settings.name='StyleSettings'; settings.fills=[];
  settings.layoutMode='HORIZONTAL'; settings.layoutWrap='WRAP';
  settings.itemSpacing=2; settings.counterAxisSpacing=2;
  settings.primaryAxisSizingMode='FIXED'; settings.counterAxisSizingMode='AUTO';
  settings.resize(288,10);
  card.appendChild(settings);

  var fs=Math.round(style.fontSize)+'px';
  var lh=style.lineHeight&&style.lineHeight.unit==='PERCENT'?Math.round(style.lineHeight.value)+'%':style.lineHeight&&style.lineHeight.unit==='PIXELS'?Math.round(style.lineHeight.value)+'px':'—';
  var wt=style.fontName?style.fontName.style:'Regular';
  var ls=style.letterSpacing&&style.letterSpacing.unit==='PERCENT'?Math.round(style.letterSpacing.value)+'%':style.letterSpacing&&style.letterSpacing.unit==='PIXELS'?style.letterSpacing.value+'px':'0';

  buildSpecPill(settings,'Font-size',fs);
  buildSpecPill(settings,'Line-height',lh);
  buildSpecPill(settings,'Weight',wt);
  buildSpecPill(settings,'Letter-spacing',ls);

  var preview=figma.createText();
  preview.name='TextStyle';
  preview.layoutAlign='INHERIT'; preview.layoutGrow=1; preview.textAutoResize='HEIGHT';
  var sample=style.fontSize>=20?'Primary\nSecond line':group.toLowerCase().includes('misc')||style.fontSize<=16?'Button text':'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
  try { preview.fontName=style.fontName||{family:'Inter',style:'Regular'}; } catch(e) { try{preview.fontName={family:'Inter',style:'Regular'};}catch(e2){} }
  preview.characters=sample;
  try { preview.textStyleId=style.id; } catch(e) { preview.fontSize=style.fontSize; }
  preview.fills=[{type:'SOLID',color:{r:0,g:0,b:0}}];
  card.appendChild(preview);
  return card;
}

function buildSpecPill(parent,label,value) {
  var pill=figma.createFrame();
  pill.name=label; pill.fills=[{type:'SOLID',color:{r:0,g:0,b:0},opacity:0.05}];
  pill.cornerRadius=4; pill.layoutMode='HORIZONTAL'; pill.itemSpacing=4;
  pill.paddingLeft=pill.paddingRight=pill.paddingTop=pill.paddingBottom=4;
  pill.primaryAxisSizingMode='FIXED'; pill.counterAxisSizingMode='AUTO'; pill.resize(143,10);
  parent.appendChild(pill);
  var lT=makeText(label,10,0,0,0,0.5); lT.textAutoResize='WIDTH_AND_HEIGHT'; pill.appendChild(lT);
  var vT=makeText(value,10,0,0,0,1); vT.textAutoResize='WIDTH_AND_HEIGHT'; pill.appendChild(vT);
}
