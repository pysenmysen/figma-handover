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
