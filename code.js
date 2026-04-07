// Grebbans Handover — code.js v2.0 (JSON import)

var VERSION = '2.0';

figma.showUI(__html__, { width: 420, height: 540, themeColors: true });

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'build') {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    buildFromTokens(msg.groups);
    figma.ui.postMessage({ type: 'done' });
  }
  if (msg.type === 'close') figma.closePlugin();
};

function buildFromTokens(groups) {
  // Remove existing frame
  figma.currentPage.findAll(function(n) {
    return n.type === 'FRAME' && n.name === '◈ Grebbans / Colours';
  }).forEach(function(f) { f.remove(); });

  // Outer: column, 16px gap, hug
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

    // VaribleGroup: column, 12px gap
    var gf = figma.createFrame();
    gf.name = 'VaribleGroup';
    gf.fills = [];
    gf.layoutMode = 'VERTICAL';
    gf.itemSpacing = 12;
    gf.primaryAxisSizingMode = 'AUTO';
    gf.counterAxisSizingMode = 'AUTO';
    gf.layoutAlign = 'STRETCH';
    outer.appendChild(gf);

    // GroupNameContainer: row, center, 4px gap
    var gnc = figma.createFrame();
    gnc.name = 'GroupNameContainer';
    gnc.fills = [];
    gnc.layoutMode = 'HORIZONTAL';
    gnc.itemSpacing = 4;
    gnc.counterAxisAlignItems = 'CENTER';
    gnc.primaryAxisSizingMode = 'AUTO';
    gnc.counterAxisSizingMode = 'AUTO';
    gnc.layoutAlign = 'STRETCH';
    gf.appendChild(gnc);

    // Group name parts separated by /
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

    // Varibles: row, wrap, 4px gap
    var vf = figma.createFrame();
    vf.name = 'Varibles';
    vf.fills = [];
    vf.layoutMode = 'HORIZONTAL';
    vf.layoutWrap = 'WRAP';
    vf.itemSpacing = 4;
    vf.primaryAxisSizingMode = 'AUTO';
    vf.counterAxisSizingMode = 'AUTO';
    vf.layoutAlign = 'STRETCH';
    gf.appendChild(vf);

    for (var ti = 0; ti < g.tokens.length; ti++) {
      vf.appendChild(makeCard(g.tokens[ti]));
    }
  }

  figma.currentPage.appendChild(outer);
  figma.viewport.scrollAndZoomIntoView([outer]);
}

function makeCard(token) {
  var hasAlpha = token.alpha < 0.99;
  var rgb = hexToRgb(token.hex);

  // Card: 229.6px, row wrap, 12px gap, 16px pad, rgba(255,255,255,0.8), 20px radius
  var card = figma.createFrame();
  card.name = 'Varible';
  card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.8 }];
  card.cornerRadius = 20;
  card.layoutMode = 'HORIZONTAL';
  card.layoutWrap = 'WRAP';
  card.itemSpacing = 12;
  card.paddingLeft = card.paddingRight = card.paddingTop = card.paddingBottom = 16;
  card.primaryAxisSizingMode = 'FIXED';
  card.counterAxisSizingMode = 'AUTO';
  card.counterAxisAlignItems = 'CENTER';
  card.resize(229.6, 58);

  // Swatch outer: 26×26, 4px pad, rgba(0,0,0,0.5) stroke, 4px radius
  var so = figma.createFrame();
  so.name = 'Color'; so.fills = [];
  so.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.5 }];
  so.strokeWeight = 1;
  so.cornerRadius = 4;
  so.layoutMode = 'VERTICAL';
  so.primaryAxisAlignItems = 'SPACE_BETWEEN';
  so.counterAxisAlignItems = 'STRETCH';
  so.paddingLeft = so.paddingRight = so.paddingTop = so.paddingBottom = 4;
  so.primaryAxisSizingMode = 'FIXED';
  so.counterAxisSizingMode = 'FIXED';
  so.resize(26, 26);
  so.layoutAlign = 'INHERIT'; so.layoutGrow = 0;
  card.appendChild(so);

  // Swatch inner
  var si = figma.createFrame();
  si.name = 'Color'; si.cornerRadius = 2;
  si.layoutAlign = 'STRETCH'; si.layoutGrow = 1;
  si.primaryAxisSizingMode = 'FIXED'; si.counterAxisSizingMode = 'FIXED';
  if (hasAlpha) {
    si.fills = [
      { type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } },
      { type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b }, opacity: token.alpha }
    ];
  } else {
    si.fills = [{ type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b } }];
  }
  so.appendChild(si);

  // NameHex: column, center, 8px gap, fill
  var nh = figma.createFrame();
  nh.name = 'NameHex'; nh.fills = [];
  nh.layoutMode = 'VERTICAL';
  nh.counterAxisAlignItems = 'STRETCH';
  nh.primaryAxisAlignItems = 'CENTER';
  nh.itemSpacing = 8;
  nh.primaryAxisSizingMode = 'AUTO';
  nh.counterAxisSizingMode = 'FIXED';
  nh.layoutGrow = 1; nh.layoutAlign = 'INHERIT';
  card.appendChild(nh);

  var nameT = makeText(token.name, 12, 0, 0, 0, 1);
  nameT.letterSpacing = { value: -1, unit: 'PERCENT' };
  nameT.layoutAlign = 'STRETCH'; nameT.textAutoResize = 'HEIGHT';
  nh.appendChild(nameT);

  if (hasAlpha) {
    var hr = figma.createFrame();
    hr.name = 'Hex+Opacity'; hr.fills = [];
    hr.layoutMode = 'HORIZONTAL';
    hr.primaryAxisAlignItems = 'SPACE_BETWEEN';
    hr.itemSpacing = 8;
    hr.primaryAxisSizingMode = 'FIXED';
    hr.counterAxisSizingMode = 'AUTO';
    hr.layoutAlign = 'STRETCH';
    nh.appendChild(hr);

    var hexT = makeText(token.hex, 12, 0, 0, 0, 0.5);
    hexT.letterSpacing = { value: -1, unit: 'PERCENT' };
    hexT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(hexT);

    var alphaT = makeText(Math.round(token.alpha * 100) + '%', 12, 0, 0, 0, 0.5);
    alphaT.letterSpacing = { value: -1, unit: 'PERCENT' };
    alphaT.textAlignHorizontal = 'RIGHT';
    alphaT.textAutoResize = 'WIDTH_AND_HEIGHT';
    hr.appendChild(alphaT);
  } else {
    var hexT2 = makeText(token.hex, 12, 0, 0, 0, 0.5);
    hexT2.letterSpacing = { value: -1, unit: 'PERCENT' };
    hexT2.textAutoResize = 'WIDTH_AND_HEIGHT';
    nh.appendChild(hexT2);
  }

  return card;
}

function makeText(chars, size, r, g, b, a) {
  var t = figma.createText();
  t.fontName = { family: 'Inter', style: 'Regular' };
  t.fontSize = size;
  t.characters = String(chars);
  var fill = { type: 'SOLID', color: { r: r||0, g: g||0, b: b||0 } };
  if (a !== undefined && a < 1) fill.opacity = a;
  t.fills = [fill];
  return t;
}

function hexToRgb(hex) {
  var r = parseInt(hex.slice(1,3), 16) / 255;
  var g = parseInt(hex.slice(3,5), 16) / 255;
  var b = parseInt(hex.slice(5,7), 16) / 255;
  return { r: r, g: g, b: b };
}
