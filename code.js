// Grebbans Handover — v8.0

var VERSION = '8.0';
var FRAME_W = 1504;

var KEYS = {
  docModule:       '8df1ea68f02f91062978acb1ccbab2cec2e92171', // 📋 Doc/Default State=Default
  colourPrimitive: '0f4a992b74f79d0754a10487640c165f040cf6be',
  themesTable:     '817002b1f661519a99cac808dcf221d48f672289',
  themesCol:       'f48bb2051c1b4c248bbc418baa56ac87e7d0a2ee',
  themesColour:    '9bebe09dc4b4b52bd9771525f9ce437ebc3f014c',
  gradientCard:    '6999639649f183fd91d2648853a74606c765c2b6',
  effectCard:      'a5208d18e7106e3133b9c8cad9fbf2d72138864a',
  sectionOther:    'eb7778ad03fc3564e5b9c25cdeae1743a5233402',
  sectionOption:   'fcd2f3c2808271c76d581b54e0cea7679c9fee3d',
  typographyStyle: '9d4013dacec5710e27d8612265ebde737efe8279', // Typography/Style Type=Primary
  slotsDatapoints: 'ad778223387dceae3c70f6960381248b08df782a', // Slots/Datapoints State=Default
  slotsDataRow:    '98522e2f7df75b6a59071e8f910f91059ad21ec8', // Slots/Datapoints/DataRow Type=Default
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
      exists: !!figma.currentPage.findOne(function(n) { return n.type === 'FRAME' && n.name === 'Doc/' + col.name; })
    });
  });

  var paintStyles = figma.getLocalPaintStyles();
  var gradCount = paintStyles.filter(function(s) {
    return s.paints && s.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; });
  }).length;
  if (gradCount > 0) {
    items.push({
      id: 'gradients',
      name: 'Gradients',
      meta: gradCount + ' gradient styles',
      kind: 'gradients',
      exists: !!figma.currentPage.findOne(function(n) { return n.type === 'FRAME' && n.name === 'Doc/Gradients'; })
    });
  }

  var effectStyles = figma.getLocalEffectStyles();
  if (effectStyles.length > 0) {
    items.push({
      id: 'effects',
      name: 'Effects',
      meta: effectStyles.length + ' effect styles',
      kind: 'effects',
      exists: !!figma.currentPage.findOne(function(n) { return n.type === 'FRAME' && n.name === 'Doc/Effects'; })
    });
  }

  var textStyles = figma.getLocalTextStyles();
  if (textStyles.length > 0) {
    var typoGroups = {};
    var typoGroupOrder = [];
    textStyles.forEach(function(s) {
      var g = s.name.split('/')[0];
      if (!typoGroups[g]) { typoGroups[g] = true; typoGroupOrder.push(g); }
    });
    items.push({
      id: 'typography',
      name: 'Typography',
      meta: typoGroupOrder.join(' · '),
      kind: 'typography',
      exists: !!figma.currentPage.findOne(function(n) { return n.type === 'FRAME' && n.name === 'Doc/Typography'; })
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
      var targets = msg.targets;
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
  if (id === 'gradients')  { await buildGradientsFrame(); return; }
  if (id === 'effects')    { await buildEffectsFrame(); return; }
  if (id === 'typography') { await buildTypography(); return; }
  var col = figma.variables.getVariableCollectionById(id);
  if (!col) return;
  if (isSemantic(col)) await buildThemesFrame(col);
  else await buildPrimitivesFrame(col);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
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
  while (frame.children.length > 0) {
    frame.children[frame.children.length - 1].remove();
  }
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

// ─── Typography helpers ───────────────────────────────────────────────────────
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
  if (!lh || lh.unit === 'AUTO') return '—';
  if (lh.unit === 'PERCENT') return Math.round(lh.value) + '%';
  if (lh.unit === 'PIXELS') return Math.round(lh.value) + 'px';
  return '—';
}

function formatLetterSpacing(ls) {
  if (!ls) return '0';
  if (ls.unit === 'PERCENT') {
    var v = Math.round(ls.value * 10) / 10;
    return v === 0 ? '0' : v + '%';
  }
  if (ls.unit === 'PIXELS') return ls.value + 'px';
  return '0';
}

// ══════════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY — uses Typography/Style component instances
// ══════════════════════════════════════════════════════════════════════════════
async function buildTypography() {
  var textStyles = figma.getLocalTextStyles();
  if (!textStyles.length) return;

  var typoComp = await figma.importComponentByKeyAsync(KEYS.typographyStyle);
  var docComp  = await figma.importComponentByKeyAsync(KEYS.docModule);
  var dpComp   = await figma.importComponentByKeyAsync(KEYS.slotsDatapoints);
  var drComp   = await figma.importComponentByKeyAsync(KEYS.slotsDataRow);

  // Group styles by first path segment, preserve Figma order
  var groups = {}, groupOrder = [];
  textStyles.forEach(function(s) {
    var gKey = s.name.split('/')[0];
    if (!groups[gKey]) { groups[gKey] = { styles: [] }; groupOrder.push(gKey); }
    groups[gKey].styles.push(s);
  });

  var outer = getOrCreateFrame('Doc/Typography');
  outer.fills = []; outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL'; outer.itemSpacing = 16;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'FIXED';
  outer.resize(FRAME_W, 100);

  var purposes = {
    'Primary':   'Used for headings and display text. Tight line-height is intentional at large sizes.',
    'Secondary': 'Used for body and editorial text. Regular and Medium (500) weight variants available.',
    'Misc':      'Used for UI labels, buttons, tags, and inputs. Regular and Medium (500) variants. Minimum 16px to prevent iOS Safari zoom.'
  };

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var gKey = groupOrder[gi];
    var g = groups[gKey];

    // Map group name to variant type
    var variantType = 'Primary';
    var gKeyL = gKey.toLowerCase();
    if (gKeyL === 'secondary') variantType = 'Secondary';
    else if (gKeyL === 'misc' || gKeyL === 'miscellaneous') variantType = 'Misc';

    // Group row: Doc panel + styles column side by side
    var secRow = figma.createFrame();
    secRow.name = gKey; secRow.fills = [];
    secRow.layoutMode = 'HORIZONTAL'; secRow.itemSpacing = 16;
    secRow.primaryAxisSizingMode = 'FIXED'; secRow.counterAxisSizingMode = 'AUTO';
    secRow.layoutAlign = 'STRETCH';
    outer.appendChild(secRow);

    // ── Doc panel ────────────────────────────────────────────────────────────
    var fontFamily = g.styles[0].fontName ? g.styles[0].fontName.family : '—';

    var docInst = docComp.createInstance();
    secRow.appendChild(docInst);

    var docProps = {
      'Epic#134:14':           'Typography',
      'Instance/State#134:16': gKey,
      'Purpose#134:18':        purposes[variantType] || '',
      'Show purpose#227:81':   true,
      'Show sections#226:79':  true,
    };
    // Auto-detect booleans: turn off data-related toggles
    try {
      var instProps = docInst.componentProperties;
      Object.keys(instProps).forEach(function(k) {
        if (instProps[k].type === 'BOOLEAN') {
          var kl = k.toLowerCase();
          if (kl.indexOf('data') !== -1) docProps[k] = false;
        }
      });
    } catch(e) {}
    docInst.setProperties(docProps);

    // Populate Sections slot → Slots/Datapoints → DataRow for Font family
    try {
      var sectionsSlot = null;
      for (var ci = 0; ci < docInst.children.length; ci++) {
        if (docInst.children[ci].type === 'SLOT') { sectionsSlot = docInst.children[ci]; break; }
      }
      if (sectionsSlot) {
        while (sectionsSlot.children.length > 0) sectionsSlot.children[sectionsSlot.children.length - 1].remove();

        var dpInst = dpComp.createInstance();
        sectionsSlot.appendChild(dpInst);

        // Find Datapoints slot within Slots/Datapoints
        var dpSlot = null;
        for (var di = 0; di < dpInst.children.length; di++) {
          if (dpInst.children[di].type === 'SLOT') { dpSlot = dpInst.children[di]; break; }
        }
        if (dpSlot) {
          while (dpSlot.children.length > 0) dpSlot.children[dpSlot.children.length - 1].remove();

          var row = drComp.createInstance();
          dpSlot.appendChild(row);

          var dpT = row.findOne(function(n) { return n.name === 'Datapoint' && n.type === 'TEXT'; });
          var vrT = row.findOne(function(n) { return n.name === 'Value/rule' && n.type === 'TEXT'; });
          if (dpT) { try { dpT.characters = 'Font family'; } catch(e) {} }
          if (vrT) { try { vrT.characters = fontFamily; } catch(e) {} }
        }
      }
    } catch(e) {}

    // ── Styles column ─────────────────────────────────────────────────────────
    var stylesCol = figma.createFrame();
    stylesCol.name = 'TextStyles'; stylesCol.fills = [];
    stylesCol.layoutMode = 'VERTICAL'; stylesCol.itemSpacing = 4;
    stylesCol.primaryAxisSizingMode = 'AUTO'; stylesCol.counterAxisSizingMode = 'FIXED';
    stylesCol.layoutGrow = 1; stylesCol.layoutAlign = 'INHERIT';
    secRow.appendChild(stylesCol);

    for (var si = 0; si < g.styles.length; si++) {
      var style = g.styles[si];
      var inst = typoComp.createInstance();
      stylesCol.appendChild(inst);

      var styleName = style.name.split('/').pop();
      var fs = Math.round(style.fontSize) + ' px';
      var lh = formatLineHeight(style.lineHeight);
      var wt = styleToWeight(style.fontName ? style.fontName.style : '');
      var ls = formatLetterSpacing(style.letterSpacing);

      var content = variantType === 'Primary'
        ? 'Primary\nSecond line'
        : variantType === 'Secondary'
        ? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.\nCommodo adipiscing et in vitae auctor diam amet, est est.'
        : 'Label';

      try {
        inst.setProperties({
          'Type':                  variantType,
          'Style name#237:106':    styleName,
          'Font-size#205:43':      fs,
          'Line-height#205:47':    lh,
          'Weight#205:51':         wt,
          'Letter-spacing#205:55': ls,
          'Content#203:16':        content,
        });
      } catch(e) {}

      // Apply actual text style to the preview text node
      try {
        var previewT = inst.findOne(function(n) { return n.name === 'TextStyle' && n.type === 'TEXT'; });
        if (previewT) {
          try { previewT.textStyleId = style.id; } catch(e) {
            try { previewT.fontSize = style.fontSize; } catch(e2) {}
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
      if (!colourValue) {
        colourValue = 'rgba(' + Math.round(cl.r*255) + ',' + Math.round(cl.g*255) + ',' + Math.round(cl.b*255) + ',' + Math.round(cl.a*100)/100 + ')';
      }
      parts.push(inset + e.offset.x + 'px ' + e.offset.y + 'px ' + e.radius + 'px ' + spread + 'px ' + colourValue);
    } else if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
      parts.push('blur(' + e.radius + 'px)');
    }
  });
  return parts.join(', ');
}

// ══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════
async function buildPrimitivesFrame(col) {
  var OUTER_NAME = 'Doc/' + col.name;
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
    outer.primaryAxisSizingMode = 'FIXED';
    outer.counterAxisSizingMode = 'AUTO';
    outer.resize(FRAME_W, 100);
  }

  if (isNew) {
    try {
      var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
      var docInst = docComp.createInstance();
      outer.appendChild(docInst);
      var docProps = {
        'Epic#134:14': 'Colour',
        'Instance/State#134:16': col.name,
        'Purpose#134:18': 'Primitive colour tokens. Not used directly in project files — applied via semantic variables in themes/modes.',
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
  if (!primContent) {
    primContent = figma.createFrame();
    primContent.name = 'Primitives';
    outer.appendChild(primContent);
  }
  while (primContent.children.length > 0) primContent.children[primContent.children.length-1].remove();
  primContent.fills = []; primContent.clipsContent = false;
  primContent.layoutMode = 'VERTICAL'; primContent.itemSpacing = 16;
  var primW = FRAME_W - 320 - 20;
  primContent.resize(primW, 100);
  primContent.primaryAxisSizingMode = 'AUTO';
  primContent.counterAxisSizingMode = 'FIXED';

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
// THEMES
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

      try {
        var semT = cell.children[1];
        if (semT && semT.type === 'TEXT') semT.characters = cssName;
      } catch(e) {}

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

// ══════════════════════════════════════════════════════════════════════════════
// GRADIENTS
// ══════════════════════════════════════════════════════════════════════════════
async function buildGradientsFrame() {
  var OUTER_NAME = 'Doc/Gradients';
  var paintStyles = figma.getLocalPaintStyles();
  var gradients = [];
  paintStyles.forEach(function(ps) {
    var isGrad = ps.paints && ps.paints.some(function(p) { return p.type.indexOf('GRADIENT') !== -1; });
    if (!isGrad) return;
    var parts = ps.name.split('/');
    gradients.push({ style: ps, group: parts.length > 1 ? parts.slice(0,-1).join('/') : '', name: parts[parts.length-1] });
  });
  if (!gradients.length) return;

  var gradComp = await figma.importComponentByKeyAsync(KEYS.gradientCard);
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

  if (isNew) {
    try {
      var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
      var docInst = docComp.createInstance();
      outer.appendChild(docInst);
      var docProps = {
        'Epic#134:14': 'Styles',
        'Instance/State#134:16': 'Gradients',
        'Purpose#134:18': 'Gradient paint styles used across the project.',
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
    try {
      var nm = inst.children[1].children[0];
      if (nm.children[0].type === 'TEXT') nm.children[0].characters = grad.group || ' ';
      if (nm.children[1].type === 'TEXT') nm.children[1].characters = grad.name;
    } catch(e) {}
    try {
      var hexF = inst.children[1].children[1];
      var stops = [];
      grad.style.paints.forEach(function(p) {
        if (p.gradientStops) p.gradientStops.forEach(function(s) {
          if (s.boundVariables && s.boundVariables.color) {
            var v = figma.variables.getVariableById(s.boundVariables.color.id);
            if (v) stops.push(v);
          }
        });
      });
      for (var si = 0; si < Math.min(stops.length, hexF.children.length); si++) {
        var cell = hexF.children[si];
        var sv = stops[si];
        try {
          var col = figma.variables.getVariableCollectionById(sv.variableCollectionId);
          var mid = col ? col.defaultModeId : null;
          var raw = mid ? sv.valuesByMode[mid] : sv.valuesByMode[Object.keys(sv.valuesByMode)[0]];
          var res = raw ? resolveColor(raw, mid) : null;
          if (cell.children[0].children[1] && res) {
            var cf = { type: 'SOLID', color: { r: res.rgba.r, g: res.rgba.g, b: res.rgba.b }, opacity: res.rgba.a };
            cell.children[0].children[1].fills = [figma.variables.setBoundVariableForPaint(cf, 'color', sv)];
          }
        } catch(e) {}
        try {
          if (cell.children[1].type === 'TEXT') cell.children[1].characters = '--' + sv.name.replace(/\//g, '-').toLowerCase();
        } catch(e) {}
      }
    } catch(e) {}
  }
  placeFrame(outer);
}

// ══════════════════════════════════════════════════════════════════════════════
// EFFECTS
// ══════════════════════════════════════════════════════════════════════════════
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

  if (isNew) {
    try {
      var docComp = await figma.importComponentByKeyAsync(KEYS.docModule);
      var docInst = docComp.createInstance();
      outer.appendChild(docInst);
      var docProps = {
        'Epic#134:14': 'Styles',
        'Instance/State#134:16': 'Effects',
        'Purpose#134:18': 'Effect styles (shadows and blurs) used across the project.',
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

  var content = outer.findOne(function(n) { return n.name === 'EffectStyles' && n.type === 'FRAME'; });
  if (!content) { content = figma.createFrame(); content.name = 'EffectStyles'; outer.appendChild(content); }
  while (content.children.length > 0) content.children[content.children.length-1].remove();
  var effContentW = FRAME_W - 320 - 20;
  content.fills = []; content.clipsContent = false;
  content.layoutMode = 'HORIZONTAL'; content.layoutWrap = 'WRAP';
  content.itemSpacing = 4; content.counterAxisSpacing = 4;
  content.resize(effContentW, 100);
  content.primaryAxisSizingMode = 'AUTO';
  content.counterAxisSizingMode = 'FIXED';

  for (var ei = 0; ei < effects.length; ei++) {
    var eff = effects[ei];
    var einst = effectComp.createInstance();
    content.appendChild(einst);

    try {
      var effFrame = einst.children[0].children[1];
      if (effFrame) {
        effFrame.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
        effFrame.effectStyleId = eff.style.id;
      }
    } catch(e) {}

    try {
      var nm = einst.children[1].children[0];
      var effTypeLabel = '';
      if (eff.style.effects[0]) {
        var et = eff.style.effects[0].type;
        if (et === 'DROP_SHADOW') effTypeLabel = 'Drop shadow';
        else if (et === 'INNER_SHADOW') effTypeLabel = 'Inner shadow';
        else if (et === 'LAYER_BLUR') effTypeLabel = 'Layer blur';
        else if (et === 'BACKGROUND_BLUR') effTypeLabel = 'Background blur';
      }
      var typeStr = eff.group ? effTypeLabel + ' · ' + eff.group : effTypeLabel;
      if (nm.children[0].type === 'TEXT') nm.children[0].characters = typeStr || ' ';
      if (nm.children[1].type === 'TEXT') nm.children[1].characters = eff.name;
    } catch(e) {}

    try {
      var valFrame = einst.children[1].children[1];
      var cssT = valFrame.children[0];
      if (cssT && cssT.type === 'TEXT') cssT.characters = effectToCss(eff.style.effects) || '—';

      var semInst = valFrame.children[1];
      if (semInst) {
        var shadowColourVar = null;
        eff.style.effects.forEach(function(fx) {
          if (!shadowColourVar && fx.boundVariables && fx.boundVariables.color) {
            shadowColourVar = figma.variables.getVariableById(fx.boundVariables.color.id);
          }
        });

        if (shadowColourVar) {
          try { semInst.setProperties({ 'Variable?#229:95': true }); } catch(e) {}
          try {
            var col2 = figma.variables.getVariableCollectionById(shadowColourVar.variableCollectionId);
            var mid2 = col2 ? col2.defaultModeId : null;
            var raw2 = mid2 ? shadowColourVar.valuesByMode[mid2] : shadowColourVar.valuesByMode[Object.keys(shadowColourVar.valuesByMode)[0]];
            var res2 = raw2 ? resolveColor(raw2, mid2) : null;
            var colFill2 = semInst.findOne(function(n) { return n.name === 'Colour'; });
            if (colFill2 && res2) {
              var cf2 = { type: 'SOLID', color: { r: res2.rgba.r, g: res2.rgba.g, b: res2.rgba.b }, opacity: res2.rgba.a };
              colFill2.fills = [figma.variables.setBoundVariableForPaint(cf2, 'color', shadowColourVar)];
            }
          } catch(e) {}
          try {
            var primT2 = semInst.findOne(function(n) { return n.name === 'primitive'; });
            if (primT2) primT2.characters = '--' + shadowColourVar.name.replace(/\//g, '-').toLowerCase();
          } catch(e) {}
        } else {
          try { semInst.setProperties({ 'Variable?#229:95': false }); } catch(e) {}
          var firstFx = eff.style.effects[0];
          if (firstFx && firstFx.color) {
            try {
              var ec = firstFx.color;
              var ecFill = semInst.findOne(function(n) { return n.name === 'Colour'; });
              if (ecFill) ecFill.fills = [{ type: 'SOLID', color: { r: ec.r, g: ec.g, b: ec.b }, opacity: ec.a }];
            } catch(e) {}
          }
        }
      }
    } catch(e) {}
  }
  placeFrame(outer);
}
