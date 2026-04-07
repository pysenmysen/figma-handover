// Grebbans Handover — code.js v2.2

var VERSION = '2.2';

figma.showUI(__html__, { width: 420, height: 540, themeColors: true });

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'build') {
    try {
      await Promise.race([
        figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
        new Promise(function(_, rej) { setTimeout(function(){ rej('timeout'); }, 3000); })
      ]);
    } catch(e) {}
    try {
      buildFromTokens(msg.groups);
    } catch(err) {
      figma.ui.postMessage({ type: 'error', message: String(err) });
      return;
    }
    figma.ui.postMessage({ type: 'done' });
  }
  if (msg.type === 'close') figma.closePlugin();
};

// ══════════════════════════════════════════════════════════════════════════════
function buildFromTokens(groups) {
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Grebbans / Colours';
  }).forEach(function(f) { f.remove(); });

  // Outer: vertical auto-layout, 16px gap, hug
  var outer = figma.createFrame();
  outer.name = '◈ Grebbans / Colours';
  outer.fills = [];
  outer.clipsContent = false;
  outer.layoutMode = 'VERTICAL';
  outer.itemSpacing = 16;
  outer.primaryAxisSizingMode = 'AUTO';
  outer.counterAxisSizingMode = 'AUTO';

  for (var gi = 0; gi < groups.length; gi++) {
    var g = groups[gi];
    if (!g.tokens || g.tokens.length === 0) continue;
    outer.appendChild(buildGroup(g));
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

function buildGroup(g) {
  // VaribleGroup: vertical, 12px gap, hug
  var gf = figma.createFrame();
  gf.name = 'VaribleGroup';
  gf.fills = [];
  gf.layoutMode = 'VERTICAL';
  gf.itemSpacing = 12;
  gf.primaryAxisSizingMode = 'AUTO';
  gf.counterAxisSizingMode = 'AUTO';

  // GroupNameContainer: horizontal, 4px gap, center
  var gnc = figma.createFrame();
  gnc.name = 'GroupNameContainer';
  gnc.fills = [];
  gnc.layoutMode = 'HORIZONTAL';
  gnc.itemSpacing = 4;
  gnc.counterAxisAlignItems = 'CENTER';
  gnc.primaryAxisSizingMode = 'AUTO';
  gnc.counterAxisSizingMode = 'AUTO';
  gf.appendChild(gnc);

  // Group label parts with / separators
  var parts = g.label.split('/');
  for (var pi = 0; pi < parts.length; pi++) {
    var pt = makeText(parts[pi].trim(), 16, 0, 0, 0, 0.5);
    pt.textAutoResize = 'WIDTH_AND_HEIGHT';
    gnc.appendChild(pt);
    if (pi < parts.length - 1) {
      var sep = makeText('/', 16, 0, 0, 0, 0.5);
      sep.textAutoResize = 'WIDTH_AND_HEIGHT';
      gnc.appendChild(sep);
    }
  }

  // Varibles: horizontal wrap, 4px gap
  var vf = figma.createFrame();
  vf.name = 'Varibles';
  vf.fills = [];
  vf.layoutMode = 'HORIZONTAL';
  vf.layoutWrap = 'WRAP';
  vf.itemSpacing = 4;
  vf.primaryAxisSizingMode = 'AUTO';
  vf.counterAxisSizingMode = 'AUTO';
  gf.appendChild(vf);

  for (var ti = 0; ti < g.tokens.length; ti++) {
    vf.appendChild(buildCard(g.tokens[ti]));
  }

  return gf;
}

function buildCard(token) {
  var hasAlpha = token.alpha < 0.99;
  var rgb = hexToRgb(token.hex);

  // Card: 229.6×58px fixed, horizontal, 12px gap, 16px padding, rgba(255,255,255,0.8), 20px radius
  var card = figma.createFrame();
  card.name = 'Varible';
  card.fills = [{ type: 'SOLID', color: { r:1, g:1, b:1 }, opacity: 0.8 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.counterAxisAlignItems = 'CENTER';
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'FIXED';
  card.resize(229.6, 58);

  // ── Swatch: use NONE layout, manually position ──
  // Outer box: 26×26, stroke rgba(0,0,0,0.5), 4px radius
  var so = figma.createFrame();
  so.name = 'Color';
  so.layoutMode = 'NONE';
  so.fills = [];
  so.strokes = [{ type: 'SOLID', color: { r:0, g:0, b:0 }, opacity: 0.5 }];
  so.strokeWeight = 1;
  so.cornerRadius = 4;
  so.resize(26, 26);
  so.layoutAlign = 'INHERIT';
  so.layoutGrow = 0;
  card.appendChild(so);

  // Inner colour: 18×18 at position 4,4
  var si = figma.createRectangle();
  si.name = 'Color';
  si.cornerRadius = 2;
  si.resize(18, 18);
  si.x = 4; si.y = 4;
  if (hasAlpha) {
    si.fills = [
      { type: 'SOLID', color: { r:0.85, g:0.85, b:0.85 } },
      { type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b }, opacity: token.alpha }
    ];
  } else {
    si.fills = [{ type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b } }];
  }
  so.appendChild(si);

  // ── Name + Hex column ──
  var nh = figma.createFrame();
  nh.name = 'NameHex';
  nh.fills = [];
  nh.layoutMode = 'VERTICAL';
  nh.itemSpacing = 6;
  nh.primaryAxisSizingMode = 'AUTO';
  nh.counterAxisSizingMode = 'FIXED';
  nh.counterAxisAlignItems = 'STRETCH';
  nh.primaryAxisAlignItems = 'CENTER';
  nh.layoutGrow = 1;
  nh.layoutAlign = 'STRETCH';
  card.appendChild(nh);

  // Variable name: --col-base-black format
  var nameT = makeText(token.cssName, 12, 0, 0, 0, 1);
  nameT.letterSpacing = { value: -1, unit: 'PERCENT' };
  nameT.layoutAlign = 'STRETCH';
  nameT.textAutoResize = 'HEIGHT';
  nh.appendChild(nameT);

  // Hex row (with alpha if needed)
  if (hasAlpha) {
    var hr = figma.createFrame();
    hr.name = 'Hex+Opacity';
    hr.fills = [];
    hr.layoutMode = 'HORIZONTAL';
    hr.primaryAxisAlignItems = 'SPACE_BETWEEN';
    hr.itemSpacing = 8;
    hr.primaryAxisSizingMode = 'AUTO';
    hr.counterAxisSizingMode = 'AUTO';
    hr.layoutAlign = 'STRETCH';
    nh.appendChild(hr);

    var hxT = makeText(token.hex, 12, 0, 0, 0, 0.5);
    hxT.letterSpacing = { value: -1, unit: 'PERCENT' };
    hxT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(hxT);

    var alT = makeText(Math.round(token.alpha * 100) + '%', 12, 0, 0, 0, 0.5);
    alT.letterSpacing = { value: -1, unit: 'PERCENT' };
    alT.textAlignHorizontal = 'RIGHT';
    alT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(alT);
  } else {
    var hxT2 = makeText(token.hex, 12, 0, 0, 0, 0.5);
    hxT2.letterSpacing = { value: -1, unit: 'PERCENT' };
    hxT2.textAutoResize = 'WIDTH_AND_HEIGHT';
    nh.appendChild(hxT2);
  }

  return card;
}

function makeText(chars, size, r, g, b, a) {
  var t = figma.createText();
  try { t.fontName = { family: 'Inter', style: 'Regular' }; } catch(e) {}
  t.fontSize = size;
  t.characters = String(chars);
  var fill = { type: 'SOLID', color: { r:r||0, g:g||0, b:b||0 } };
  if (a !== undefined && a < 1) fill.opacity = a;
  t.fills = [fill];
  return t;
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1,3),16)/255,
    g: parseInt(hex.slice(3,5),16)/255,
    b: parseInt(hex.slice(5,7),16)/255
  };
}
