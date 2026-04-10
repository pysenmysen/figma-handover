// Grebbans Handover - v10.0 (auto-generated, edit src/ files)

// ============================================================
// src/config.js
// ============================================================
// Grebbans Handover - config
// Edit VERSION, FRAME_W and KEYS here. All other files read from this.

var VERSION = '10.0';
var FRAME_W    = 1504;
var CONTENT_W  = FRAME_W - 320 - 20; // width of content area next to Doc/Default (1164px)

var KEYS = {
  docModule:       '8df1ea68f02f91062978acb1ccbab2cec2e92171', // Doc/Default State=Default
  colourPrimitive: '0f4a992b74f79d0754a10487640c165f040cf6be', // Doc/Colour primitive swatch
  themesCol:       'f48bb2051c1b4c248bbc418baa56ac87e7d0a2ee', // Misc/ThemesCol
  themesColour:    '9bebe09dc4b4b52bd9771525f9ce437ebc3f014c', // Misc/ThemesRow/Variable
  gradientCard:    '6999639649f183fd91d2648853a74606c765c2b6', // Doc/Gradient
  effectCard:      'a5208d18e7106e3133b9c8cad9fbf2d72138864a', // Doc/Effect
  sectionOther:    'eb7778ad03fc3564e5b9c25cdeae1743a5233402', // Slots/Other
  typographyStyle: '39f846162ae664e4774bb26add863e258b437bb1', // Typography/Style Type=Primary
  typographySlot:  'e0f20829328d45fb0f5de235069bef08a808bca5', // Slots/Typography State=Default
  slotsGrid:       'b0abdcf55797a8770b650c170c96a0e3e32e6f72', // Slots/Grid State=Default
};


// ============================================================
// src/helpers.js
// ============================================================
// Shared helpers - used across all modules

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

// --- Frame helpers ---

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

function getOrCreateFrame(name) {
  var f = findExistingFrame(name);
  if (f) { clearChildren(f); return f; }
  f = figma.createFrame(); f.name = name; figma.currentPage.appendChild(f); return f;
}

// Find or create a sub-frame inside a parent by name. Does NOT clear children.
function getOrCreateSubFrame(parent, name) {
  for (var i = 0; i < parent.children.length; i++) {
    if (parent.children[i].type === 'FRAME' && parent.children[i].name === name) return { frame: parent.children[i], isNew: false };
  }
  var f = figma.createFrame(); f.name = name; parent.appendChild(f);
  return { frame: f, isNew: true };
}

function clearChildren(frame) {
  while (frame.children.length > 0) frame.children[frame.children.length - 1].remove();
}

// Remove any legacy or duplicate FRAME children from an outer frame.
// Keeps only INSTANCE children (i.e. the Doc/Default panel).
// Call before getOrCreateSubFrame to avoid stale named frames accumulating.
function clearLegacyFrames(outer) {
  var toRemove = [];
  for (var i = 0; i < outer.children.length; i++) {
    if (outer.children[i].type === 'FRAME') toRemove.push(outer.children[i]);
  }
  toRemove.forEach(function(n) { n.remove(); });
}

function placeFrame(frame) {
  figma.viewport.scrollAndZoomIntoView([frame]);
}
// ---- Layout configure helpers ----
// Always call these on both new AND existing frames - fixes sizing on update.
// Modes set BEFORE resize so AUTO takes effect correctly.

// VERTICAL, fixed width, hug height
// resize() FIRST, then set sizing modes.
// If modes are set before resize(), resize() overrides AUTO and locks height.

// VERTICAL, fixed width, hug height
function configDocRows(frame, width, gap) {
  frame.fills = []; frame.clipsContent = false;
  frame.layoutMode = 'VERTICAL'; frame.itemSpacing = gap !== undefined ? gap : 4;
  frame.layoutAlign = 'STRETCH';
  frame.resize(width || CONTENT_W, frame.height > 10 ? frame.height : 100);
  frame.counterAxisSizingMode = 'FIXED'; // fix width
  frame.primaryAxisSizingMode = 'AUTO';  // hug height
}

// HORIZONTAL, fixed width, hug height
function configDocCol(frame, width, gap) {
  frame.fills = []; frame.clipsContent = false;
  frame.layoutMode = 'HORIZONTAL'; frame.itemSpacing = gap !== undefined ? gap : 4;
  frame.layoutAlign = 'STRETCH';
  frame.resize(width || FRAME_W, frame.height > 10 ? frame.height : 100);
  frame.primaryAxisSizingMode = 'FIXED'; // fix width
  frame.counterAxisSizingMode = 'AUTO';  // hug height
}

// HORIZONTAL + WRAP, fixed width, hug height
function configDocWrap(frame, width) {
  frame.fills = []; frame.clipsContent = false;
  frame.layoutMode = 'HORIZONTAL'; frame.layoutWrap = 'WRAP';
  frame.itemSpacing = 4; frame.counterAxisSpacing = 4;
  frame.layoutAlign = 'STRETCH';
  frame.resize(width || CONTENT_W, frame.height > 10 ? frame.height : 100);
  frame.primaryAxisSizingMode = 'FIXED'; // fix width (required for wrap)
  frame.counterAxisSizingMode = 'AUTO';  // hug height
}


// Creates a standard "Doc row" frame - Doc/Default panel (320px) + content side by side
// Used identically across Colours, Typography and Grid outputs
function createDocRow(parent, name) {
  var row = figma.createFrame();
  row.name = name;
  row.fills = [];
  row.layoutMode = 'HORIZONTAL';
  row.itemSpacing = 20;         // gap between Doc/Default and content
  row.primaryAxisSizingMode = 'FIXED';
  row.counterAxisSizingMode = 'AUTO'; // hug height
  row.layoutAlign = 'STRETCH';       // fill parent width
  row.resize(FRAME_W, 100);
  parent.appendChild(row);
  return row;
}

// Sets horizontal auto-layout with fixed width + hug height (most common outer frame pattern)
function setupOuterFrame(frame, isNew) {
  frame.fills = []; frame.clipsContent = false;
  frame.layoutMode = 'HORIZONTAL'; frame.itemSpacing = 4;
  frame.layoutAlign = 'STRETCH';
  // Set sizing modes before resize so AUTO height is respected
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'AUTO';
  if (isNew) frame.resize(FRAME_W, 100); // only set dimensions on first creation
}

// --- Colour helpers ---

function toHex(r, g, b) {
  return '#' + [r,g,b].map(function(n) { return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase(); }).join('');
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
  var modeId = col.defaultModeId, aliases = 0, total = 0;
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    total++;
    if (v.valuesByMode[modeId] && v.valuesByMode[modeId].type === 'VARIABLE_ALIAS') aliases++;
  }
  return total > 0 && aliases / total > 0.5;
}

function findCssVariable(cssName) {
  var target = cssName.replace(/^--/, '');
  var allVars = figma.variables.getLocalVariables();
  for (var i = 0; i < allVars.length; i++) {
    var v = allVars[i];
    if (v.resolvedType !== 'COLOR') continue;
    if (v.name.split('/').join('-').toLowerCase() === target) return v;
  }
  return null;
}

// Ensures a Doc/Default instance is at index 0 of frame. Creates if missing.
async function ensureDocPanel(outer, props) {
  var hasDoc = outer.children.length > 0 && outer.children[0].type === 'INSTANCE';
  if (hasDoc) return;
  try {
    var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
    var inst = docComp.createInstance();
    outer.insertChild(0, inst);
    // Auto-detect boolean props and turn off data-only sections
    var merged = {};
    try {
      var compProps = inst.componentProperties;
      Object.keys(compProps).forEach(function(k) {
        if (compProps[k].type === 'BOOLEAN') {
          var kl = k.toLowerCase();
          if (kl.indexOf('data') !== -1) merged[k] = false;
        }
      });
    } catch(e) {}
    Object.keys(props).forEach(function(k) { merged[k] = props[k]; });
    inst.setProperties(merged);
  } catch(e) {}
}

// Populates a Sections slot with a single component instance, then calls populate(instance)
async function populateSectionsSlot(outer, componentKey, populate) {
  try {
    var sectionsSlot = outer.findOne(function(n) { return n.name === 'Sections'; });
    if (!sectionsSlot) return;
    clearChildren(sectionsSlot);
    var comp = await figma.importComponentByKeyAsync(componentKey);
    var inst = comp.createInstance();
    sectionsSlot.appendChild(inst);
    if (populate) populate(inst);
  } catch(e) {}
}

// --- Typography helpers ---

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


// ============================================================
// src/colours.js
// ============================================================
// Colours module -- Primitives, Themes, Gradients, Effects

async function buildColoursAll() {
  var wrapper = findExistingFrame('Doc/Colour');
  var isNew = !wrapper;
  if (isNew) { wrapper = figma.createFrame(); wrapper.name = 'Doc/Colour'; figma.currentPage.appendChild(wrapper); }
  configDocRows(wrapper, FRAME_W, 16);

  var collections = figma.variables.getLocalVariableCollections();
  for (var i = 0; i < collections.length; i++) {
    var col = collections[i];
    var hasColor = col.variableIds.some(function(id) {
      var v = figma.variables.getVariableById(id); return v && v.resolvedType === 'COLOR';
    });
    if (!hasColor) continue;
    figma.ui.postMessage({ type: 'progress', name: col.name });
    if (isSemantic(col)) await buildThemesFrame(col, wrapper);
    else await buildPrimitivesFrame(col, wrapper);
  }
  var gradients = figma.getLocalPaintStyles().filter(function(s) {
    return s.paints && s.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; });
  });
  if (gradients.length > 0) { figma.ui.postMessage({ type: 'progress', name: 'Gradients' }); await buildGradientsFrame(wrapper); }
  var effectStyles = figma.getLocalEffectStyles();
  if (effectStyles.length > 0) { figma.ui.postMessage({ type: 'progress', name: 'Effects' }); await buildEffectsFrame(wrapper); }
  placeFrame(wrapper);
}

async function buildPrimitivesFrame(col, wrapper) {
  var colComp = await figma.importComponentByKeyAsync(KEYS.colourPrimitive);
  var res = getOrCreateSubFrame(wrapper, col.name);
  var outer = res.frame;
  configDocCol(outer, FRAME_W, 16);
  await ensureDocPanel(outer, {
    'Epic#134:14': 'Colour', 'Instance/State#134:16': col.name,
    'Purpose#134:18': 'Primitive colour tokens. Not used directly in project files - applied via semantic variables in themes/modes.',
  });
  clearLegacyFrames(outer);
  var cr = getOrCreateSubFrame(outer, 'DocRows');
  var content = cr.frame;
  configDocRows(content, CONTENT_W);
  clearChildren(content);

  var modeId = col.defaultModeId;
  var groups = {}, groupOrder = [];
  for (var vi = 0; vi < col.variableIds.length; vi++) {
    var v = figma.variables.getVariableById(col.variableIds[vi]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    var raw = v.valuesByMode[modeId] || v.valuesByMode[Object.keys(v.valuesByMode)[0]];
    var resolved = raw ? resolveColor(raw, modeId) : null;
    if (!resolved) continue;
    var parts = v.name.split('/');
    var gKey = parts.length > 1 ? parts.slice(0,2).join('/') : '__root__';
    if (!groups[gKey]) { groups[gKey] = { tokens: [] }; groupOrder.push(gKey); }
    groups[gKey].tokens.push({
      cssName: '--' + v.name.split('/').join('-').toLowerCase(),
      variable: v, hex: toHex(resolved.rgba.r, resolved.rgba.g, resolved.rgba.b),
      alpha: Math.round(resolved.rgba.a * 100) / 100,
      r: resolved.rgba.r, g: resolved.rgba.g, b: resolved.rgba.b
    });
  }
  for (var gi = 0; gi < groupOrder.length; gi++) {
    var g = groups[groupOrder[gi]];
    var gf = figma.createFrame(); gf.name = 'DocRows'; gf.fills = [];
    gf.layoutMode = 'VERTICAL'; gf.itemSpacing = 12;
    gf.primaryAxisSizingMode = 'AUTO'; gf.counterAxisSizingMode = 'FIXED';
    gf.layoutAlign = 'STRETCH';
    content.appendChild(gf);
    var vf = figma.createFrame(); vf.name = 'DocWrap'; vf.fills = [];
    vf.layoutMode = 'HORIZONTAL'; vf.layoutWrap = 'WRAP';
    vf.itemSpacing = 4; vf.counterAxisSpacing = 4;
    vf.primaryAxisSizingMode = 'FIXED'; vf.counterAxisSizingMode = 'AUTO';
    vf.layoutAlign = 'STRETCH';
    gf.appendChild(vf);
    for (var ti = 0; ti < g.tokens.length; ti++) {
      var token = g.tokens[ti];
      var inst = colComp.createInstance();
      vf.appendChild(inst);
      try { inst.setProperties({ 'VariantName#221:77': token.cssName, 'Hex#221:71': token.hex, 'Show Opacity#221:75': token.alpha < 0.99, 'Opacity#221:73': Math.round(token.alpha * 100) + '%' }); } catch(e) {}
      try {
        var colFr = inst.findOne(function(n) { return n.name === 'Colour'; });
        if (colFr) colFr.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: token.r, g: token.g, b: token.b }, opacity: token.alpha }, 'color', token.variable)];
      } catch(e) {}
    }
  }
}

async function buildThemesFrame(col, wrapper) {
  var colComp    = await figma.importComponentByKeyAsync(KEYS.themesCol);
  var colourComp = await figma.importComponentByKeyAsync(KEYS.themesColour);
  var res = getOrCreateSubFrame(wrapper, col.name);
  var outer = res.frame;
  configDocCol(outer, FRAME_W, 16);
  await ensureDocPanel(outer, {
    'Epic#134:14': 'Colour', 'Instance/State#134:16': col.name,
    'Purpose#134:18': 'Semantic colour tokens mapped to primitives per mode. Each column must have its theme applied manually in Figma for the MCP to read the correct resolved colours.',
    'Show purpose#227:81': true,
  });
  clearLegacyFrames(outer);
  var cr = getOrCreateSubFrame(outer, 'DocCol');
  var content = cr.frame;
  content.fills = []; content.layoutMode = 'HORIZONTAL'; content.itemSpacing = 4;
  content.primaryAxisSizingMode = 'AUTO'; content.counterAxisSizingMode = 'AUTO';
  clearChildren(content);

  var tokens = col.variableIds.map(function(id) { return figma.variables.getVariableById(id); }).filter(function(v) { return v && v.resolvedType === 'COLOR'; });
  for (var mi = 0; mi < col.modes.length; mi++) {
    var mode = col.modes[mi];
    var modeCol = colComp.createInstance();
    content.appendChild(modeCol);
    try { if (modeCol.children[0] && modeCol.children[0].type === 'TEXT') modeCol.children[0].characters = mode.name; } catch(e) {}
    var slot = null;
    for (var ci = 0; ci < modeCol.children.length; ci++) { if (modeCol.children[ci].type === 'SLOT') { slot = modeCol.children[ci]; break; } }
    if (!slot) continue;
    clearChildren(slot);
    for (var ti = 0; ti < tokens.length; ti++) {
      var token = tokens[ti];
      var raw = token.valuesByMode[mode.modeId];
      if (!raw) { var ks = Object.keys(token.valuesByMode); raw = ks.length ? token.valuesByMode[ks[0]] : null; }
      var resolved = raw ? resolveColor(raw, mode.modeId) : null;
      var cell = colourComp.createInstance();
      slot.appendChild(cell);
      try { cell.setProperties({ 'Variable?#229:95': true }); } catch(e) {}
      try { if (cell.children[1] && cell.children[1].type === 'TEXT') cell.children[1].characters = '--' + token.name.split('/').join('-').toLowerCase(); } catch(e) {}
      try {
        var cf = cell.children[0];
        if (cf && cf.children && cf.children.length > 1 && resolved)
          cf.children[1].fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: resolved.rgba.r, g: resolved.rgba.g, b: resolved.rgba.b }, opacity: resolved.rgba.a }, 'color', token)];
      } catch(e) {}
    }
  }
}

async function buildGradientsFrame(wrapper) {
  var gradients = [];
  figma.getLocalPaintStyles().forEach(function(ps) {
    if (ps.paints && ps.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; })) {
      var parts = ps.name.split('/');
      gradients.push({ style: ps, group: parts.length > 1 ? parts.slice(0,-1).join('/') : '', name: parts[parts.length-1] });
    }
  });
  if (!gradients.length) return;
  var gradComp = await figma.importComponentByKeyAsync(KEYS.gradientCard);
  var res = getOrCreateSubFrame(wrapper, 'Gradients');
  var outer = res.frame;
  configDocCol(outer, FRAME_W, 16);
  await ensureDocPanel(outer, { 'Epic#134:14': 'Styles', 'Instance/State#134:16': 'Gradients', 'Purpose#134:18': 'Gradient paint styles used across the project.', 'Show purpose#227:81': true });
  clearLegacyFrames(outer);
  var cr = getOrCreateSubFrame(outer, 'DocWrap');
  var content = cr.frame;
  configDocWrap(content, CONTENT_W);
  clearChildren(content);
  for (var gi = 0; gi < gradients.length; gi++) {
    var grad = gradients[gi];
    var inst = gradComp.createInstance();
    content.appendChild(inst);
    try { inst.children[0].children[1].fillStyleId = grad.style.id; } catch(e) {}
    try { var nm = inst.children[1].children[0]; if (nm.children[0].type === 'TEXT') nm.children[0].characters = grad.group || ' '; if (nm.children[1].type === 'TEXT') nm.children[1].characters = grad.name; } catch(e) {}
    try {
      var hexF = inst.children[1].children[1];
      var stops = [];
      grad.style.paints.forEach(function(p) { if (p.gradientStops) p.gradientStops.forEach(function(s) { if (s.boundVariables && s.boundVariables.color) { var v = figma.variables.getVariableById(s.boundVariables.color.id); if (v) stops.push(v); } }); });
      for (var si = 0; si < Math.min(stops.length, hexF.children.length); si++) {
        var sv = stops[si];
        var col2 = figma.variables.getVariableCollectionById(sv.variableCollectionId);
        var mid = col2 ? col2.defaultModeId : null;
        var raw2 = mid ? sv.valuesByMode[mid] : sv.valuesByMode[Object.keys(sv.valuesByMode)[0]];
        var res2 = raw2 ? resolveColor(raw2, mid) : null;
        try { if (hexF.children[si].children[0].children[1] && res2) hexF.children[si].children[0].children[1].fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: res2.rgba.r, g: res2.rgba.g, b: res2.rgba.b }, opacity: res2.rgba.a }, 'color', sv)]; } catch(e) {}
        try { if (hexF.children[si].children[1].type === 'TEXT') hexF.children[si].children[1].characters = '--' + sv.name.split('/').join('-').toLowerCase(); } catch(e) {}
      }
    } catch(e) {}
  }
}

function effectToCss(effects) {
  var parts = [];
  effects.forEach(function(e) {
    if (!e.visible) return;
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      var cl = e.color; var spread = e.spread !== undefined ? e.spread : 0;
      parts.push((e.type === 'INNER_SHADOW' ? 'inset ' : '') + e.offset.x + 'px ' + e.offset.y + 'px ' + e.radius + 'px ' + spread + 'px rgba(' + Math.round(cl.r*255) + ',' + Math.round(cl.g*255) + ',' + Math.round(cl.b*255) + ',' + Math.round(cl.a*100)/100 + ')');
    } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') { parts.push('blur(' + e.radius + 'px)'); }
  });
  return parts.join(', ');
}

async function buildEffectsFrame(wrapper) {
  var effects = [];
  figma.getLocalEffectStyles().forEach(function(es) {
    if (!es.effects || !es.effects.length) return;
    var parts = es.name.split('/');
    effects.push({ style: es, group: parts.length > 1 ? parts.slice(0,-1).join('/') : '', name: parts[parts.length-1] });
  });
  if (!effects.length) return;
  var effectComp = await figma.importComponentByKeyAsync(KEYS.effectCard);
  var res = getOrCreateSubFrame(wrapper, 'Effects');
  var outer = res.frame;
  configDocCol(outer, FRAME_W, 16);
  await ensureDocPanel(outer, { 'Epic#134:14': 'Styles', 'Instance/State#134:16': 'Effects', 'Purpose#134:18': 'Effect styles (shadows and blurs) used across the project.', 'Show purpose#227:81': true });
  clearLegacyFrames(outer);
  var cr = getOrCreateSubFrame(outer, 'DocWrap');
  var content = cr.frame;
  configDocWrap(content, CONTENT_W);
  clearChildren(content);
  var labels = { DROP_SHADOW: 'Drop shadow', INNER_SHADOW: 'Inner shadow', LAYER_BLUR: 'Layer blur', BACKGROUND_BLUR: 'Background blur' };
  for (var ei = 0; ei < effects.length; ei++) {
    var eff = effects[ei];
    var einst = effectComp.createInstance();
    content.appendChild(einst);
    try { var effFr = einst.children[0].children[1]; if (effFr) { effFr.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }]; effFr.effectStyleId = eff.style.id; } } catch(e) {}
    try { var nm = einst.children[1].children[0]; var tl = eff.style.effects[0] ? (labels[eff.style.effects[0].type] || '') : ''; if (nm.children[0].type === 'TEXT') nm.children[0].characters = eff.group ? tl + ' - ' + eff.group : tl; if (nm.children[1].type === 'TEXT') nm.children[1].characters = eff.name; } catch(e) {}
    try {
      var valFrame = einst.children[1].children[1];
      var cssT = valFrame.children[0]; if (cssT && cssT.type === 'TEXT') cssT.characters = effectToCss(eff.style.effects) || '-';
      var semInst = valFrame.children[1];
      if (semInst) {
        var shadowVar = null;
        eff.style.effects.forEach(function(fx) { if (!shadowVar && fx.boundVariables && fx.boundVariables.color) shadowVar = figma.variables.getVariableById(fx.boundVariables.color.id); });
        if (shadowVar) {
          try { semInst.setProperties({ 'Variable?#229:95': true }); } catch(e) {}
          try {
            var sc = figma.variables.getVariableCollectionById(shadowVar.variableCollectionId);
            var sm = sc ? sc.defaultModeId : null;
            var sr = sm ? shadowVar.valuesByMode[sm] : shadowVar.valuesByMode[Object.keys(shadowVar.valuesByMode)[0]];
            var sres = sr ? resolveColor(sr, sm) : null;
            var scf = semInst.findOne(function(n) { return n.name === 'Colour'; });
            if (scf && sres) scf.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: sres.rgba.r, g: sres.rgba.g, b: sres.rgba.b }, opacity: sres.rgba.a }, 'color', shadowVar)];
            var pt = semInst.findOne(function(n) { return n.name === 'primitive'; });
            if (pt) pt.characters = '--' + shadowVar.name.split('/').join('-').toLowerCase();
          } catch(e) {}
        } else {
          try { semInst.setProperties({ 'Variable?#229:95': false }); } catch(e) {}
          var fx0 = eff.style.effects[0];
          if (fx0 && fx0.color) { try { var ecf = semInst.findOne(function(n) { return n.name === 'Colour'; }); if (ecf) ecf.fills = [{ type: 'SOLID', color: { r: fx0.color.r, g: fx0.color.g, b: fx0.color.b }, opacity: fx0.color.a }]; } catch(e) {} }
        }
      }
    } catch(e) {}
  }
}


// ============================================================
// src/typography.js
// ============================================================
// Typography module

async function buildTypographyAll() {
  await buildTypography();
}

async function buildTypography() {
  var textStyles = figma.getLocalTextStyles();
  if (!textStyles.length) return;

  var typoComp = await figma.importComponentByKeyAsync(KEYS.typographyStyle);
  var docComp  = await figma.importComponentByKeyAsync(KEYS.docModule);
  var typoSlot = await figma.importComponentByKeyAsync(KEYS.typographySlot);

  // Group by first path segment
  var groups = {}, groupOrder = [];
  textStyles.forEach(function(s) {
    var gKey = s.name.split('/')[0];
    if (!groups[gKey]) { groups[gKey] = { styles: [] }; groupOrder.push(gKey); }
    groups[gKey].styles.push(s);
  });

  var outer = getOrCreateFrame('Doc/Typography');
  configDocRows(outer, FRAME_W, 16);

  var purposes = {
    Primary:   'Used for headings and display text.',
    Secondary: 'Used for body and editorial text.',
    Misc:      'Used for UI labels, buttons, tags, and inputs.'
  };
  var weightNames = { '100':'Thin','200':'Extra Light','300':'Light','400':'Regular','450':'Roman','500':'Medium','600':'Semi Bold','700':'Bold','800':'Extra Bold','900':'Black' };

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var gKey = groupOrder[gi];
    var g = groups[gKey];
    figma.ui.postMessage({ type: 'progress', name: 'Typography / ' + gKey });

    var gKeyL = gKey.toLowerCase();
    var variantType = gKeyL === 'secondary' ? 'Secondary' : (gKeyL === 'misc' || gKeyL === 'miscellaneous') ? 'Misc' : 'Primary';

    // Group row
    var secRow = createDocRow(outer, gKey);

    // Collect font info for Slots/Typography
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

    // Doc panel
    var docInst = docComp.createInstance();
    secRow.appendChild(docInst);
    var docProps = {
      'Epic#134:14': 'Typography', 'Instance/State#134:16': gKey,
      'Purpose#134:18': purposes[variantType] || '',
      'Show purpose#227:81': true, 'Show sections#226:79': true,
    };
    try {
      var instProps = docInst.componentProperties;
      Object.keys(instProps).forEach(function(k) {
        if (instProps[k].type === 'BOOLEAN' && k.toLowerCase().indexOf('data') !== -1) docProps[k] = false;
      });
    } catch(e) {}
    docInst.setProperties(docProps);

    // Slots/Typography
    try {
      var sectionsSlot = docInst.findOne(function(n) { return n.name === 'Sections'; });
      if (sectionsSlot) {
        clearChildren(sectionsSlot);
        var tsInst = typoSlot.createInstance();
        sectionsSlot.appendChild(tsInst);
        try {
          var ffRow = tsInst.children[0];
          var cssVar = '--font-' + gKey.toLowerCase();
          var ffNodes = ffRow.findAll(function(n) { return n.type === 'TEXT' && n.name !== 'Label'; });
          ffNodes.forEach(function(n) { try { n.characters = n.name === 'Font varible' ? cssVar : fontFamily; } catch(e) {} });
        } catch(e) {}
        try {
          var wtRow = tsInst.children[1];
          var wtText = wtRow.findOne(function(n) { return n.type === 'TEXT' && n.name !== 'Label'; });
          if (wtText) { try { wtText.characters = weightLines.join('\n'); } catch(e) {} }
        } catch(e) {}
      }
    } catch(e) {}

    // Styles column
    var isMisc = variantType === 'Misc';
    var colW = CONTENT_W;
    var stylesCol = figma.createFrame();
    stylesCol.name = isMisc ? 'DocWrap' : 'DocRows';
    stylesCol.layoutGrow = 1; stylesCol.layoutAlign = 'INHERIT';
    if (isMisc) {
      configDocWrap(stylesCol, colW);
    } else {
      configDocRows(stylesCol, colW);
    }
    secRow.appendChild(stylesCol);

    var cardW = isMisc ? 582 : colW;
    for (var si = 0; si < g.styles.length; si++) {
      var style = g.styles[si];
      var inst = typoComp.createInstance();
      if (isMisc) { inst.resize(cardW, 100); inst.layoutAlign = 'INHERIT'; }
      else { inst.layoutAlign = 'STRETCH'; }
      stylesCol.appendChild(inst);
      if (isMisc) { inst.primaryAxisSizingMode = 'FIXED'; inst.counterAxisSizingMode = 'AUTO'; inst.resize(cardW, inst.height); }

      var sName = style.name.split('/').pop();
      var previewContent = variantType === 'Primary' ? 'Primary\nSecond line'
        : variantType === 'Secondary' ? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nisi, gravida mauris ut lectus blandit tortor hendrerit. Commodo adipiscing et in vitae auctor diam amet, est est.'
        : 'Label';

      try { inst.setProperties({ 'Type': variantType }); } catch(e) {}
      try {
        inst.setProperties({
          'Style name#238:110': sName,
          'Font-size#205:43':   Math.round(style.fontSize) + ' px',
          'Line-height#205:47': formatLineHeight(style.lineHeight),
          'Weight#205:51':      styleToWeight(style.fontName ? style.fontName.style : ''),
          'Letter-spacing#205:55': formatLetterSpacing(style.letterSpacing),
          'Content#203:16':     previewContent,
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
// src/grid.js
// ============================================================
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
  Desk: 'Design at 1280px. Make sure the design is scaleable to 1280x720px as a minimum' +
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


// ============================================================
// src/documentation.js
// ============================================================
// Documentation module

// Component frame styling - matches "Final styling" pattern in template
var COMP_FILL   = { type: 'SOLID', color: { r: 0.541, g: 0.220, b: 0.961 }, opacity: 0.15 };
var COMP_STROKE = { type: 'SOLID', color: { r: 0.541, g: 0.220, b: 0.961 } };

function styleSelectedFrames() {
  var sel = figma.currentPage.selection;
  if (!sel.length) { figma.ui.postMessage({ type: 'error', message: 'Nothing selected.' }); return; }

  var count = 0;
  for (var i = 0; i < sel.length; i++) {
    var node = sel[i];
    var t = node.type;
    if (t !== 'COMPONENT_SET' && t !== 'COMPONENT' && t !== 'FRAME' && t !== 'GROUP') continue;

    // Fill: light purple tint
    try { node.fills = [COMP_FILL]; } catch(e) {}

    // Stroke: dashed purple (1px, dash 10 gap 5)
    try {
      node.strokes = [COMP_STROKE];
      node.strokeWeight = 1;
      node.dashPattern = [10, 5];
    } catch(e) {}

    // Corner radius
    try { node.cornerRadius = 5; } catch(e) {}

    // Auto-layout: VERTICAL, hug both axes, 24px padding, 10px gap
    try {
      node.layoutMode = 'VERTICAL';
      node.primaryAxisSizingMode = 'AUTO';
      node.counterAxisSizingMode = 'AUTO';
      node.paddingTop = 24; node.paddingBottom = 24;
      node.paddingLeft = 24; node.paddingRight = 24;
      node.itemSpacing = 10;
    } catch(e) {}

    count++;
  }

  figma.ui.postMessage({ type: 'style-done', count: count });
}

function getSelectionInfo() {
  return figma.currentPage.selection.map(function(n) {
    return { id: n.id, name: n.name, type: n.type };
  });
}


// ============================================================
// src/main.js
// ============================================================
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

  // Post current selection to Documentation tab
  figma.ui.postMessage({ type: 'selection', items: getSelectionInfo() });
})();

// Update Documentation tab when selection changes
figma.on('selectionchange', function() {
  figma.ui.postMessage({ type: 'selection', items: getSelectionInfo() });
});

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
  if (msg.type === 'style-frames') {
    styleSelectedFrames();
    figma.ui.postMessage({ type: 'selection', items: getSelectionInfo() });
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
