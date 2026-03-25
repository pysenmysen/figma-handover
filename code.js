// Grebbans Handover — code.js v0.10

var VERSION = '0.10';

figma.showUI(__html__, { width: 480, height: 560, themeColors: true });

(async function init() {
  var collections = figma.variables.getLocalVariableCollections();
  var summary = collections.map(function(col) {
    var colorCount = 0;
    for (var i = 0; i < col.variableIds.length; i++) {
      var v = figma.variables.getVariableById(col.variableIds[i]);
      if (v && v.resolvedType === 'COLOR') colorCount++;
    }
    return { id: col.id, name: col.name, colorCount: colorCount,
      modes: col.modes.map(function(m) { return { id: m.modeId, name: m.name }; }) };
  }).filter(function(c) { return c.colorCount > 0; });
  figma.ui.postMessage({ type: 'collections', data: summary, version: VERSION });
})();

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'debug') { runDebug(msg.collectionId); }
  if (msg.type === 'build') { await buildFrame(msg.collectionIds); figma.ui.postMessage({ type: 'done' }); }
  if (msg.type === 'close') figma.closePlugin();
};

// ─── Debug: inspect first variable in collection ──────────────────────────────
function runDebug(collectionId) {
  var col = figma.variables.getVariableCollectionById(collectionId);
  if (!col) { figma.ui.postMessage({ type: 'debug_result', text: 'Collection not found' }); return; }

  var result = ['Collection: ' + col.name, 'DefaultModeId: ' + col.defaultModeId,
    'Modes: ' + col.modes.map(function(m){ return m.name + '=' + m.modeId; }).join(', ')];

  // Check first 3 colour variables
  var count = 0;
  for (var i = 0; i < col.variableIds.length && count < 3; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    count++;
    result.push('--- Var: ' + v.name);
    var modeKeys = Object.keys(v.valuesByMode);
    result.push('  modeKeys: ' + modeKeys.join(', '));
    modeKeys.forEach(function(k) {
      var val = v.valuesByMode[k];
      result.push('  [' + k + ']: ' + JSON.stringify(val).slice(0, 80));
    });
  }
  figma.ui.postMessage({ type: 'debug_result', text: result.join('\n') });
}

// ─── Resolve alias ─────────────────────────────────────────────────────────────
function resolveColor(rawVal, preferredModeId) {
  var val = rawVal;
  var aliasName = null;
  var depth = 0;
  while (val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS') {
    if (depth++ > 10) break;
    var ref = figma.variables.getVariableById(val.id);
    if (!ref) break;
    if (aliasName === null) aliasName = ref.name;
    var refCol = figma.variables.getVariableCollectionById(ref.variableCollectionId);
    var fallback = refCol ? refCol.defaultModeId : null;
    val = ref.valuesByMode[preferredModeId]
       || (fallback ? ref.valuesByMode[fallback] : null)
       || ref.valuesByMode[Object.keys(ref.valuesByMode)[0]];
  }
  if (val && typeof val === 'object' && 'r' in val) return { rgba: val, aliasName: aliasName };
  return null;
}

function isSemantic(col) {
  var modeId = col.defaultModeId;
  var aliasCount = 0, total = 0;
  for (var i = 0; i < col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType !== 'COLOR') continue;
    total++;
    var raw = v.valuesByMode[modeId];
    if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') aliasCount++;
  }
  return total > 0 && aliasCount / total > 0.5;
}

var F = 'Inter';

async function loadFonts() {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  F = 'Inter';
}

function txt(chars, size, r, g, b, a) {
  var t = figma.createText();
  t.fontName = { family: F, style: 'Regular' };
  t.fontSize = size || 16;
  t.fills = [{ type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 }, opacity: (a !== undefined ? a : 1) }];
  t.characters = String(chars);
  return t;
}

function solid(r, g, b, a) {
  var f = { type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 } };
  if (a !== undefined && a < 1) f.opacity = a;
  return f;
}

function fr(name, mode, gap, pad, ps, cs) {
  var f = figma.createFrame();
  f.name = name || 'f'; f.fills = [];
  f.layoutMode = mode || 'VERTICAL';
  if (gap !== undefined) f.itemSpacing = gap;
  if (pad !== undefined) { f.paddingLeft=f.paddingRight=f.paddingTop=f.paddingBottom=pad; }
  f.primaryAxisSizingMode = ps || 'AUTO';
  f.counterAxisSizingMode = cs || 'AUTO';
  return f;
}

function rgbToHex(r,g,b) {
  return '#'+[r,g,b].map(function(n){return Math.round(n*255).toString(16).padStart(2,'0').toUpperCase();}).join('');
}

async function buildFrame(collectionIds) {
  await loadFonts();

  figma.currentPage.findAll(function(n) {
    return n.type==='FRAME' && n.name==='◈ Grebbans / Colours';
  }).forEach(function(f){f.remove();});

  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / Colours';
  outer.fills = [solid(1,1,1,0.3)];
  outer.cornerRadius = 40; outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL'; outer.itemSpacing = 80;
  outer.paddingLeft=outer.paddingRight=outer.paddingTop=outer.paddingBottom=80;
  outer.primaryAxisSizingMode = 'AUTO'; outer.counterAxisSizingMode = 'FIXED';
  outer.resize(2000, 200);

  for (var ci = 0; ci < collectionIds.length; ci++) {
    var col = figma.variables.getVariableCollectionById(collectionIds[ci]);
    if (!col) continue;
    figma.ui.postMessage({ type: 'progress', step: ci, total: collectionIds.length, name: col.name });
    if (isSemantic(col)) buildThemes(outer, col);
    else buildPrimitives(outer, col);
  }

  outer.primaryAxisSizingMode = 'AUTO';
  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

function buildPrimitives(outer, col) {
  var t = txt(col.name, 64, 0, 0, 0, 1);
  t.letterSpacing = { value: -1, unit: 'PERCENT' };
  t.layoutAlign = 'STRETCH'; t.textAutoResize = 'HEIGHT';
  outer.appendChild(t);

  var gc = fr('groups','VERTICAL',40,0,'AUTO','FIXED');
  gc.layoutAlign = 'STRETCH';
  outer.appendChild(gc);

  var groups={}, order=[];
  for (var i=0; i<col.variableIds.length; i++) {
    var v = figma.variables.getVariableById(col.variableIds[i]);
    if (!v || v.resolvedType!=='COLOR') continue;

    // Get value — try defaultModeId first, then any available mode
    var modeId = col.defaultModeId;
    var raw = v.valuesByMode[modeId];
    if (!raw) {
      var keys = Object.keys(v.valuesByMode);
      if (keys.length) raw = v.valuesByMode[keys[0]];
    }
    if (!raw) continue;

    var res = resolveColor(raw, modeId);
    if (!res) continue;

    var parts = v.name.split('/');
    var gKey = parts.length>1 ? parts.slice(0,-1).join('/') : '__root__';
    var gLabel = parts.length>1 ? parts[parts.length-2] : col.name;
    gLabel = gLabel.charAt(0).toUpperCase()+gLabel.slice(1);
    if (!groups[gKey]) { groups[gKey]={label:gLabel,tokens:[]}; order.push(gKey); }
    groups[gKey].tokens.push({
      name:'--'+v.name.replace(/\//g,'-').toLowerCase(),
      fullName:v.name, variableId:v.id,
      r:res.rgba.r, g:res.rgba.g, b:res.rgba.b, a:res.rgba.a
    });
  }

  for (var gi=0; gi<order.length; gi++) {
    var g = groups[order[gi]];
    var row = fr(g.label,'HORIZONTAL',20,0,'AUTO','FIXED');
    row.layoutAlign='STRETCH'; row.counterAxisAlignItems='MIN';
    gc.appendChild(row);

    var lbl = txt(g.label,32,0,0,0,0.5);
    lbl.resize(445,40); lbl.textAutoResize='HEIGHT';
    lbl.layoutAlign='INHERIT'; lbl.layoutGrow=0;
    row.appendChild(lbl);

    var cw = fr('cards','HORIZONTAL',8,0,'FIXED','AUTO');
    cw.layoutWrap='WRAP';
    cw.layoutGrow=1; cw.layoutAlign='INHERIT';
    row.appendChild(cw);

    for (var ti=0; ti<g.tokens.length; ti++) {
      cw.appendChild(makeCard(g.tokens[ti]));
    }
  }
}

function makeCard(token) {
  var card = figma.createFrame();
  card.name=token.fullName; card.fills=[solid(1,1,1,1)]; card.cornerRadius=8;
  card.layoutMode='HORIZONTAL'; card.itemSpacing=16;
  card.paddingLeft=card.paddingRight=card.paddingTop=card.paddingBottom=16;
  card.primaryAxisSizingMode='FIXED'; card.counterAxisSizingMode='AUTO';
  card.counterAxisAlignItems='CENTER'; card.resize(267.6,76);

  // Swatch
  var so=figma.createFrame(); so.name='Color'; so.fills=[];
  so.strokes=[{type:'SOLID',color:{r:0,g:0,b:0}}]; so.strokeWeight=1;
  so.cornerRadius=2.4; so.layoutMode='VERTICAL';
  so.paddingLeft=so.paddingRight=so.paddingTop=so.paddingBottom=2.4;
  so.primaryAxisSizingMode='FIXED'; so.counterAxisSizingMode='FIXED';
  so.resize(44,44); so.layoutAlign='INHERIT'; so.layoutGrow=0;
  card.appendChild(so);

  var si=figma.createFrame(); si.name='Color'; si.cornerRadius=1;
  si.layoutAlign='STRETCH'; si.layoutGrow=1;
  si.primaryAxisSizingMode='FIXED'; si.counterAxisSizingMode='FIXED';
  try {
    si.fills=[figma.variables.setBoundVariableForPaint(
      solid(token.r,token.g,token.b,token.a),'color',
      figma.variables.getVariableById(token.variableId))];
  } catch(e) { si.fills=[solid(token.r,token.g,token.b,token.a)]; }
  so.appendChild(si);

  var tc=fr('text','VERTICAL',8,0,'AUTO','FIXED');
  tc.layoutGrow=1; tc.layoutAlign='INHERIT';
  card.appendChild(tc);

  var nt=txt(token.name,16,0.1,0.1,0.1,1);
  nt.letterSpacing={value:-2,unit:'PERCENT'};
  nt.layoutAlign='STRETCH'; nt.textAutoResize='HEIGHT';
  tc.appendChild(nt);

  var hr=fr('hex','HORIZONTAL',0,0,'FIXED','AUTO');
  hr.primaryAxisAlignItems='SPACE_BETWEEN'; hr.layoutAlign='STRETCH';
  tc.appendChild(hr);

  var ht=txt('# '+rgbToHex(token.r,token.g,token.b).replace('#',''),16,0.55,0.55,0.55,1);
  ht.letterSpacing={value:-2,unit:'PERCENT'}; ht.textAutoResize='WIDTH_AND_HEIGHT';
  hr.appendChild(ht);

  if (token.a<1) {
    var at=txt(Math.round(token.a*100)+'%',16,0.55,0.55,0.55,1);
    at.textAlignHorizontal='RIGHT'; at.textAutoResize='WIDTH_AND_HEIGHT';
    hr.appendChild(at);
  }
  return card;
}

function buildThemes(outer, col) {
  var modes=col.modes;
  var t=txt(col.name,64,0,0,0,1);
  t.letterSpacing={value:-1,unit:'PERCENT'};
  t.layoutAlign='STRETCH'; t.textAutoResize='HEIGHT';
  outer.appendChild(t);

  var tc=fr('themes','VERTICAL',40,0,'AUTO','FIXED');
  tc.layoutAlign='STRETCH'; outer.appendChild(tc);

  // Headers
  var hdr=fr('headers','HORIZONTAL',20,0,'FIXED','AUTO');
  hdr.resize(1840,40); hdr.layoutAlign='STRETCH';
  tc.appendChild(hdr);

  var sh=txt('Semantic',32,0.35,0.35,0.35,1);
  sh.resize(445,36); sh.textAutoResize='HEIGHT';
  sh.layoutAlign='INHERIT'; sh.layoutGrow=0;
  hdr.appendChild(sh);

  for (var mi=0; mi<modes.length; mi++) {
    var mh=txt(modes[mi].name,32,0.35,0.35,0.35,1);
    mh.textAutoResize='WIDTH_AND_HEIGHT';
    mh.layoutAlign='INHERIT'; mh.layoutGrow=1;
    hdr.appendChild(mh);
  }

  var rc=fr('rows','VERTICAL',20,0,'AUTO','FIXED');
  rc.layoutAlign='STRETCH'; tc.appendChild(rc);

  for (var i=0; i<col.variableIds.length; i++) {
    var variable=figma.variables.getVariableById(col.variableIds[i]);
    if (!variable||variable.resolvedType!=='COLOR') continue;

    var tokenName='--'+variable.name.replace(/\//g,'-').toLowerCase();
    var row=fr(variable.name,'HORIZONTAL',20,0,'FIXED','FIXED');
    row.resize(1840,76); row.counterAxisAlignItems='CENTER';
    row.layoutAlign='STRETCH'; rc.appendChild(row);

    // Semantic card
    var sc=figma.createFrame(); sc.name='semantic';
    sc.fills=[solid(1,1,1,1)]; sc.cornerRadius=8;
    sc.layoutMode='HORIZONTAL'; sc.itemSpacing=20;
    sc.paddingLeft=sc.paddingRight=sc.paddingTop=sc.paddingBottom=20;
    sc.primaryAxisSizingMode='FIXED'; sc.counterAxisSizingMode='FIXED';
    sc.counterAxisAlignItems='CENTER'; sc.resize(445,76);
    sc.layoutAlign='INHERIT'; sc.layoutGrow=0;
    row.appendChild(sc);

    var snt=txt(tokenName,24,0,0,0,1);
    snt.letterSpacing={value:-2,unit:'PERCENT'};
    snt.layoutAlign='INHERIT'; snt.layoutGrow=1; snt.textAutoResize='HEIGHT';
    sc.appendChild(snt);

    // Mode cards
    for (var mi2=0; mi2<modes.length; mi2++) {
      var mode=modes[mi2];
      // Try this mode's ID, then default, then first available
      var raw=variable.valuesByMode[mode.id];
      if (!raw) raw=variable.valuesByMode[col.defaultModeId];
      if (!raw) raw=variable.valuesByMode[Object.keys(variable.valuesByMode)[0]];
      var res=raw ? resolveColor(raw, mode.id) : null;

      var mc=figma.createFrame(); mc.name=mode.name;
      mc.fills=[solid(1,1,1,1)]; mc.cornerRadius=8;
      mc.layoutMode='HORIZONTAL'; mc.itemSpacing=16;
      mc.paddingLeft=mc.paddingRight=mc.paddingTop=mc.paddingBottom=16;
      mc.primaryAxisSizingMode='FIXED'; mc.counterAxisSizingMode='FIXED';
      mc.counterAxisAlignItems='CENTER';
      mc.layoutAlign='INHERIT'; mc.layoutGrow=1;
      row.appendChild(mc);

      if (!res) {
        var dT=txt('—',16,0.6,0.6,0.6,1);
        dT.textAutoResize='WIDTH_AND_HEIGHT';
        mc.appendChild(dT); continue;
      }

      var so2=figma.createFrame(); so2.name='Color'; so2.fills=[];
      so2.strokes=[{type:'SOLID',color:{r:0,g:0,b:0}}]; so2.strokeWeight=1;
      so2.cornerRadius=2.4; so2.layoutMode='VERTICAL';
      so2.paddingLeft=so2.paddingRight=so2.paddingTop=so2.paddingBottom=2.4;
      so2.primaryAxisSizingMode='FIXED'; so2.counterAxisSizingMode='FIXED';
      so2.resize(44,44); so2.layoutAlign='INHERIT'; so2.layoutGrow=0;
      mc.appendChild(so2);

      var si2=figma.createFrame(); si2.name='Color'; si2.cornerRadius=1;
      si2.layoutAlign='STRETCH'; si2.layoutGrow=1;
      si2.primaryAxisSizingMode='FIXED'; si2.counterAxisSizingMode='FIXED';
      try {
        si2.fills=[figma.variables.setBoundVariableForPaint(
          solid(res.rgba.r,res.rgba.g,res.rgba.b,res.rgba.a||1),
          'color',figma.variables.getVariableById(variable.id))];
      } catch(e) { si2.fills=[solid(res.rgba.r,res.rgba.g,res.rgba.b,res.rgba.a||1)]; }
      so2.appendChild(si2);

      var pn=res.aliasName?'--'+res.aliasName.replace(/\//g,'-').toLowerCase():rgbToHex(res.rgba.r,res.rgba.g,res.rgba.b);
      var pt=txt(pn,16,0.1,0.1,0.1,1);
      pt.letterSpacing={value:-2,unit:'PERCENT'};
      pt.layoutAlign='INHERIT'; pt.layoutGrow=1; pt.textAutoResize='HEIGHT';
      mc.appendChild(pt);
    }
  }
}
