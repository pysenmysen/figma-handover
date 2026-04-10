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
