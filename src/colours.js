// Colours module -- Primitives, Themes, Gradients, Effects

async function buildColoursAll() {
  var wrapper = findExistingFrame('Doc/Colour');
  var isNew = !wrapper;
  if (isNew) { wrapper = figma.createFrame(); wrapper.name = 'Doc/Colour'; figma.currentPage.appendChild(wrapper); }
  configDocRows(wrapper, FRAME_W);

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
  configDocCol(outer, FRAME_W);
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
  configDocCol(outer, FRAME_W);
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
  configDocCol(outer, FRAME_W);
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
  configDocCol(outer, FRAME_W);
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
