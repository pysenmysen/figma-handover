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
function configDocCol(frame, width) {
  frame.fills = []; frame.clipsContent = false;
  frame.layoutMode = 'HORIZONTAL'; frame.itemSpacing = 4;
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
