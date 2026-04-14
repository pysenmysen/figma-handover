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
    try { node.cornerRadius = 12; } catch(e) {}

    // Auto-layout: VERTICAL, hug both axes, 24px padding, 10px gap
    try {
      node.layoutMode = 'VERTICAL';
      node.primaryAxisSizingMode = 'AUTO';
      node.counterAxisSizingMode = 'AUTO';
      node.paddingTop = 32; node.paddingBottom = 32;
      node.paddingLeft = 32; node.paddingRight = 32;
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

// Size map: pixel dimension -> Size variant value
var ICON_SIZE_MAP = [
  { px: 8,  size: 'xs' },
  { px: 12, size: 'sm' },
  { px: 16, size: 'md' },
  { px: 20, size: 'lg' },
  { px: 24, size: 'xl' },
];

function applyIconSize() {
  var sel = figma.currentPage.selection;
  if (!sel.length) { figma.ui.postMessage({ type: 'error', message: 'Nothing selected.' }); return; }

  var updated = 0, skipped = 0;

  for (var i = 0; i < sel.length; i++) {
    var node = sel[i];

    // Accept instances or component sets containing icon variants
    var targets = [];
    if (node.type === 'INSTANCE') {
      targets = [node];
    } else if (node.type === 'COMPONENT_SET') {
      // Apply to all variant components inside
      for (var ci = 0; ci < node.children.length; ci++) {
        if (node.children[ci].type === 'COMPONENT') targets.push(node.children[ci]);
      }
    }

    for (var ti = 0; ti < targets.length; ti++) {
      var target = targets[ti];
      var dim = Math.round(target.width); // icons are square - use width

      // Find matching size
      var sizeVal = null;
      for (var si = 0; si < ICON_SIZE_MAP.length; si++) {
        if (ICON_SIZE_MAP[si].px === dim) { sizeVal = ICON_SIZE_MAP[si].size; break; }
      }

      if (!sizeVal) { skipped++; continue; }

      // Set Size variant property
      try {
        if (target.type === 'INSTANCE') {
          target.setProperties({ 'Size': sizeVal });
        } else if (target.type === 'COMPONENT') {
          // Rename variant: e.g. "Size=md" - update the variant name
          var parts = target.name.split(',').map(function(p) { return p.trim(); });
          var found = false;
          parts = parts.map(function(p) {
            if (p.toLowerCase().indexOf('size=') !== -1) { found = true; return 'Size=' + sizeVal; }
            return p;
          });
          if (!found) parts.push('Size=' + sizeVal);
          target.name = parts.join(', ');
        }
        updated++;
      } catch(e) { skipped++; }
    }
  }

  figma.ui.postMessage({ type: 'size-done', updated: updated, skipped: skipped });
}
