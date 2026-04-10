// Build script — concatenates src/ files into code.js
// Run: node build.js (Claude runs this automatically before every push)

var fs = require('fs');
var path = require('path');

var FILES = [
  'src/config.js',
  'src/helpers.js',
  'src/colours.js',
  'src/typography.js',
  'src/grid.js',
  'src/documentation.js',
  'src/main.js',
];

var banner = '// Grebbans Handover - v' + require('./package.json').version + ' (auto-generated, edit src/ files)\n\n';

var output = FILES.map(function(f) {
  var content = fs.readFileSync(path.join(__dirname, f), 'utf-8');
  return '// ============================================================\n// ' + f + '\n// ============================================================\n' + content;
}).join('\n\n');

fs.writeFileSync(path.join(__dirname, 'code.js'), banner + output, 'utf-8');
console.log('Built code.js from ' + FILES.length + ' files (' + (banner + output).length + ' chars)');
