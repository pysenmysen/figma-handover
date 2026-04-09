// Grebbans Handover — v7.0

var VERSION = '7.0';
var FRAME_W = 1504;

var KEYS = {
  docModule:       '8df1ea68f02f91062978acb1ccbab2cec2e92171',
  colourPrimitive: '0f4a992b74f79d0754a10487640c165f040cf6be',
  themesTable:     '817002b1f661519a99cac808dcf221d48f672289', // 📋 Doc/Colour Property1=Default
  themesCol:       'f48bb2051c1b4c248bbc418baa56ac87e7d0a2ee', // Misc/ThemesCol Type=Default
  themesColour:    '9bebe09dc4b4b52bd9771525f9ce437ebc3f014c', // Misc/ThemesRow/Varible Type=Colour
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
  if (isSemantic(col)) await buildThemesFrame(col);
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

// Find existing frame by name — searches page + inside sections + inside section frames
// Stops at depth 3 to avoid finding deeply nested frames with same name
function findExistingFrame(name) {
  // Direct page children
  for (var i = 0; i < figma.currentPage.children.length; i++) {
    var n = figma.currentPage.children[i];
    if (n.type === 'FRAME' && n.name === name) return n;
    // Inside sections
    if (n.type === 'SECTION') {
      for (var j = 0; j < n.children.length; j++) {
        var c = n.children[j];
        if (c.type === 'FRAME' && c.name === name) return c;
        // Inside section > frame (e.g. Colours/Themes/Styles > our frame)
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

// Clear all children from a frame
function clearFrame(frame) {
  while (frame.children.length > 0) {
    frame.children[frame.children.length - 1].remove();
  }
}

// Get or create a frame — if exists, clear in place (preserves position/parent)
// If new, create and place on canvas
function getOrCreateFrame(name) {
  var existing = findExistingFrame(name);
  if (existing) {
    clearFrame(existing);
    return existing;
  }
  var frame = figma.createFrame();
  frame.name = name;
  figma.currentPage.appendChild(frame);
  return frame;
}

function placeFrame(frame) {
  // Already in place — just scroll to it
  figma.viewport.scrollAndZoomIntoView([frame]);
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES — uses 📋 Doc/Colour component instances
// ══════════════════════════════════════════════════════════════════════════════
async function buildPrimitivesFrame(col) {
  var OUTER_NAME = 'Doc/' + col.name; // Matches existing naming: Doc/Primitives, Doc/Themes
  var colComp = await figma.importComponentByKeyAsync(KEYS.colourPrimitive);

  var outer = findExistingFrame(OUTER_NAME);
  var isNew = !outer;
  if (isNew) {
    outer = figma.createFrame();
    outer.name = OUTER_NAME;
    figma.currentPage.appendChild(outer);
  }
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'HORIZONTAL'; outer.itemSpacing = 20;
  if (isNew) {
    // Only set sizing on first generate — never reset on update
    outer.primaryAxisSizingMode = 'FIXED'; // fixed width
    outer.counterAxisSizingMode = 'AUTO';  // hug height
    outer.resize(FRAME_W, 100);
  }

  // Add Doc/Module only on first generate — never touch on update
  if (isNew) {
    try {
      var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
      var docInst = docComp.createInstance();
      outer.appendChild(docInst);
      // Start with known text properties
      var docProps = {
        'Epic#134:14': 'Colour',
        'Instance/State#134:16': col.name,
        'Purpose#134:18': 'Primitive colour tokens. Not used directly in project files — applied via semantic variables in themes/modes.',
      };
      // Auto-detect boolean properties and turn OFF sections/data for colour handover
      try {
        var instProps = docInst.componentProperties;
        Object.keys(instProps).forEach(function(k) {
          if (instProps[k].type === 'BOOLEAN') {
            var kl = k.toLowerCase();
            if (kl.indexOf('section') !== -1 || kl.indexOf('data') !== -1) {
              docProps[k] = false;
            }
          }
        });
      } catch(e2) {}
      docInst.setProperties(docProps);
    } catch(e) {}
  }

  // Find or create Primitives content frame (the updatable part)
  var primContent = outer.findOne(function(n) { return n.name === 'Primitives' && n.type === 'FRAME'; });
  if (!primContent) {
    primContent = figma.createFrame();
    primContent.name = 'Primitives';
    outer.appendChild(primContent);
  }
  // Clear existing colour cards
  while (primContent.children.length > 0) primContent.children[primContent.children.length-1].remove();
  primContent.fills = []; primContent.clipsContent = false;
  primContent.layoutMode = 'VERTICAL'; primContent.itemSpacing = 16;
  var primW = FRAME_W - 320 - 20; // FRAME_W minus Doc/Module width and gap
  primContent.resize(primW, 100);           // set width first
  primContent.primaryAxisSizingMode = 'AUTO';  // hug height
  primContent.counterAxisSizingMode = 'FIXED'; // keep fixed width

  // Group tokens
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

// ══════════════════════════════════════════════════════════════════════════════
// THEMES — one Misc/ThemesCol per mode, Varibles slot per token
// ══════════════════════════════════════════════════════════════════════════════
async function buildThemesFrame(col) {
  var OUTER_NAME = 'Doc/' + col.name;

  var colComp    = await figma.importComponentByKeyAsync(KEYS.themesCol);
  var colourComp = await figma.importComponentByKeyAsync(KEYS.themesColour);

  var outer = findExistingFrame(OUTER_NAME);
  var isNew = !outer;
  if (isNew) {
    outer = figma.createFrame();
    outer.name = OUTER_NAME;
    figma.currentPage.appendChild(outer);
  }
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'HORIZONTAL'; outer.itemSpacing = 20;
  if (isNew) {
    outer.primaryAxisSizingMode = 'FIXED';
    outer.counterAxisSizingMode = 'AUTO';
    outer.resize(FRAME_W, 100);
  }

  // Add Doc/Module only on first generate
  if (isNew) {
    try {
      var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
      var docInst = docComp.createInstance();
      outer.appendChild(docInst);
      var docProps = {
        'Epic#134:14': 'Colour',
        'Instance/State#134:16': col.name,
        'Purpose#134:18': 'Semantic colour tokens mapped to primitives per mode.\n\nEach column must have its theme applied manually in Figma for the MCP to read the correct resolved colours — variable bindings update automatically when the theme is switched.',
      };
      // Auto-detect booleans: turn off sections, turn on purpose
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

  // Find or create Themes content frame (the updatable part)
  var themesContent = outer.findOne(function(n) { return n.name === 'Themes' && n.type === 'FRAME'; });
  if (!themesContent) {
    themesContent = figma.createFrame();
    themesContent.name = 'Themes';
    outer.appendChild(themesContent);
  }
  while (themesContent.children.length > 0) themesContent.children[themesContent.children.length-1].remove();
  themesContent.fills = []; themesContent.clipsContent = false;
  themesContent.layoutMode = 'HORIZONTAL'; themesContent.itemSpacing = 4;
  themesContent.primaryAxisSizingMode = 'AUTO';
  themesContent.counterAxisSizingMode = 'AUTO';

  // Collect semantic tokens in order
  var modes = col.modes;
  var tokens = [];
  for (var vi = 0; vi < col.variableIds.length; vi++) {
    var v = figma.variables.getVariableById(col.variableIds[vi]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    tokens.push(v);
  }

  // One Misc/ThemesCol per mode
  for (var mi = 0; mi < modes.length; mi++) {
    var mode = modes[mi];
    var modeCol = colComp.createInstance();
    themesContent.appendChild(modeCol);

    // children[0] = Theme text, children[1] = Varibles SLOT
    try {
      var themeText = modeCol.children[0];
      if (themeText && themeText.type === 'TEXT') themeText.characters = mode.name;
    } catch(e) {}

    // Find Varibles SLOT (children[1] or first SLOT child)
    var variblesSlot = null;
    for (var ci = 0; ci < modeCol.children.length; ci++) {
      if (modeCol.children[ci].type === 'SLOT') { variblesSlot = modeCol.children[ci]; break; }
    }
    if (!variblesSlot) continue;

    while (variblesSlot.children.length > 0) variblesSlot.children[variblesSlot.children.length-1].remove();

    // One Type=Colour cell per semantic token
    for (var ti = 0; ti < tokens.length; ti++) {
      var token = tokens[ti];
      var cssName = '--' + token.name.replace(/\//g, '-').toLowerCase();

      // Resolve for this mode to get the primitive variable
      var raw = token.valuesByMode[mode.modeId];
      if (!raw) { var ks = Object.keys(token.valuesByMode); raw = ks.length ? token.valuesByMode[ks[0]] : null; }
      var res = raw ? resolveColor(raw, mode.modeId) : null;

      var cell = colourComp.createInstance();
      variblesSlot.appendChild(cell);

      // Set Variable?=true
      try { cell.setProperties({ 'Variable?#229:95': true }); } catch(e) {}

      // semantic name text — children[1]
      try {
        var semT = cell.children[1];
        if (semT && semT.type === 'TEXT') semT.characters = cssName;
      } catch(e) {}

      // Primitive fill — children[0](Color) > children[1](Primitive)
      // Bind to the semantic token variable (resolves per mode)
      try {
        var colorFrame = cell.children[0];
        if (colorFrame && colorFrame.children && colorFrame.children.length > 1) {
          var primFrame = colorFrame.children[1]; // Primitive frame
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


// ══════════════════════════════════════════════════════════════════════════════
// EFFECTS & GRADIENTS
// ══════════════════════════════════════════════════════════════════════════════
function buildStylesFrame() {
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

  var outer = getOrCreateFrame('Effects & Gradients');
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
  var textStyles = figma.getLocalTextStyles();
  if (!textStyles.length) return;

  var groups = {}, groupOrder = [];
  textStyles.forEach(function(s) {
    var gKey = s.name.split('/')[0];
    if (!groups[gKey]) { groups[gKey] = { styles:[] }; groupOrder.push(gKey); }
    groups[gKey].styles.push(s);
  });

  var outer = getOrCreateFrame('Typography');
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
