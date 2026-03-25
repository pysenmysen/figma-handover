// Grebbans Handover — code.js
// No build step needed. Plain JS runs directly in Figma.

figma.showUI(__html__, { width: 760, height: 600, themeColors: true });

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'extract') {
    var payload = await extractAll();
    figma.ui.postMessage({ type: 'data', payload: payload });
  }
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

async function extractAll() {
  return {
    fileName: figma.root.name,
    extractedAt: new Date().toISOString(),
    variables: extractVariables(),
    textStyles: extractTextStyles(),
    effectStyles: extractEffectStyles(),
    gridStyles: extractGridStyles()
  };
}

// ─── Variables ────────────────────────────────────────────────────────────────

function extractVariables() {
  var collections = figma.variables.getLocalVariableCollections();
  var result = [];

  for (var c = 0; c < collections.length; c++) {
    var col = collections[c];
    var modeId = col.defaultModeId;
    var modes = col.modes.map(function(m) { return m.name; });
    var colors = [];
    var numbers = [];
    var strings = [];

    for (var v = 0; v < col.variableIds.length; v++) {
      var variable = figma.variables.getVariableById(col.variableIds[v]);
      if (!variable) continue;

      var rawValue = variable.valuesByMode[modeId];
      var nameParts = variable.name.split('/');
      var group = nameParts.length > 1 ? nameParts.slice(0, -1).join(' / ') : 'root';
      var shortName = nameParts[nameParts.length - 1];
      var cssVar = '--' + variable.name.toLowerCase()
        .replace(/\s*\/\s*/g, '-')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-');
      var desc = variable.description || '';

      if (variable.resolvedType === 'COLOR' && rawValue && typeof rawValue === 'object' && 'r' in rawValue) {
        var r = Math.round(rawValue.r * 255);
        var g = Math.round(rawValue.g * 255);
        var b = Math.round(rawValue.b * 255);
        var a = Math.round(rawValue.a * 100) / 100;
        var hex = '#' + [r,g,b].map(function(n){ return n.toString(16).padStart(2,'0').toUpperCase(); }).join('');
        var isGrid = variable.name.toLowerCase().includes('grid') ||
                     desc.toLowerCase().includes('grid colour') ||
                     desc.toLowerCase().includes('layout grid');
        colors.push({
          name: shortName,
          hex: hex,
          alpha: a,
          cssVar: cssVar,
          group: group,
          isGridColor: isGrid
        });
      }

      if (variable.resolvedType === 'FLOAT' && typeof rawValue === 'number') {
        var scopes = variable.scopes || [];
        numbers.push({
          name: shortName,
          value: rawValue,
          cssVar: cssVar,
          group: group,
          scopes: scopes
        });
      }

      if (variable.resolvedType === 'STRING' && typeof rawValue === 'string') {
        strings.push({
          name: shortName,
          value: rawValue,
          cssVar: cssVar,
          group: group
        });
      }
    }

    result.push({ name: col.name, modes: modes, colors: colors, numbers: numbers, strings: strings });
  }

  return result;
}

// ─── Text Styles ──────────────────────────────────────────────────────────────

function extractTextStyles() {
  var styles = figma.getLocalTextStyles();
  return styles.map(function(s) {
    var lh = s.lineHeight;
    var ls = s.letterSpacing;
    var lineHeight = lh.unit === 'PIXELS' ? lh.value + 'px'
                   : lh.unit === 'PERCENT' ? lh.value + '%'
                   : 'normal';
    var letterSpacing = ls.unit === 'PIXELS' ? ls.value + 'px'
                      : ls.unit === 'PERCENT' ? (ls.value / 100).toFixed(3) + 'em'
                      : 'normal';
    var textTransform = s.textCase === 'UPPER' ? 'uppercase'
                      : s.textCase === 'LOWER' ? 'lowercase'
                      : s.textCase === 'TITLE' ? 'capitalize'
                      : 'none';
    return {
      name: s.name,
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontSize: s.fontSize,
      lineHeight: lineHeight,
      letterSpacing: letterSpacing,
      textTransform: textTransform,
      cssClass: s.name.toLowerCase().replace(/\s*\/\s*/g,'__').replace(/[^a-z0-9_-]/g,'-')
    };
  });
}

// ─── Effect Styles ────────────────────────────────────────────────────────────

function extractEffectStyles() {
  var styles = figma.getLocalEffectStyles();
  return styles.map(function(s) {
    var cssValues = [];
    var type = 'mixed';
    var hasShadow = false;
    var hasBlur = false;

    for (var i = 0; i < s.effects.length; i++) {
      var e = s.effects[i];
      if (!e.visible) continue;
      if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
        hasShadow = true;
        var c = e.color;
        var inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
        var col = 'rgba(' + Math.round(c.r*255) + ',' + Math.round(c.g*255) + ',' + Math.round(c.b*255) + ',' + (Math.round(c.a*100)/100) + ')';
        cssValues.push(inset + e.offset.x + 'px ' + e.offset.y + 'px ' + e.radius + 'px ' + (e.spread || 0) + 'px ' + col);
      }
      if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') {
        hasBlur = true;
        cssValues.push('blur(' + e.radius + 'px)');
      }
    }
    if (hasShadow && !hasBlur) type = 'shadow';
    if (hasBlur && !hasShadow) type = 'blur';

    return { name: s.name, type: type, cssValue: cssValues.join(', '), description: s.description || '' };
  });
}

// ─── Grid Styles ──────────────────────────────────────────────────────────────

function extractGridStyles() {
  var styles = figma.getLocalGridStyles();
  var result = [];
  for (var i = 0; i < styles.length; i++) {
    var s = styles[i];
    for (var j = 0; j < s.grids.length; j++) {
      var g = s.grids[j];
      if (g.pattern !== 'COLUMNS') continue;
      result.push({
        name: s.name,
        columns: g.count || 12,
        gutter: g.gutterSize || 0,
        margin: g.offset || 0,
        breakpoint: s.description || ''
      });
    }
  }
  return result;
}
