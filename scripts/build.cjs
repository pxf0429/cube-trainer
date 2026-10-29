const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');

function build() {
  fs.mkdirSync(output, { recursive: true });
  const versionHash = crypto.createHash('sha256');
  function hashSources(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) hashSources(file);
      else { versionHash.update(path.relative(path.join(root, 'src'), file).replace(/\\/g, '/')); versionHash.update(fs.readFileSync(file)); }
    }
  }
  hashSources(path.join(root, 'src'));
  const buildVersion = versionHash.digest('hex').slice(0, 12);
  function visit(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) { visit(file); continue; }
      const relative = path.relative(path.join(root, 'src'), file);
      const destination = path.join(output, relative.replace(/\.ts$/, '.js').replace(/\.json$/, '.js'));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (file.endsWith('.ts')) {
        const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
          fileName: file,
          compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, esModuleInterop: true },
        });
        const content = result.outputText.replace(
          /(from\s*["']|import\s*["'])(\.{1,2}\/[^"']+)(["'])/g,
          (_, start, specifier, end) => start + specifier.replace(/\.json$/, '.js').replace(/(?<!\.js)$/, '.js') + '?v=' + buildVersion + end,
        ).replace(/(["'])\.\/generator\.worker\.js\1/g, (_, quote) => quote + './generator.worker.js?v=' + buildVersion + quote);
        fs.writeFileSync(destination, content);
      } else if (file.endsWith('.json')) {
        fs.writeFileSync(destination, 'export default ' + fs.readFileSync(file, 'utf8') + ';\n');
      } else {
        fs.copyFileSync(file, destination);
      }
    }
  }
  visit(path.join(root, 'src'));
  function copyAssets(directory, destination) {
    if (!fs.existsSync(directory)) return;
    fs.mkdirSync(destination, { recursive: true });
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, item.name), target = path.join(destination, item.name);
      if (item.isDirectory()) copyAssets(source, target);
      else if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size || fs.statSync(target).mtimeMs < fs.statSync(source).mtimeMs) fs.copyFileSync(source, target);
    }
  }
  copyAssets(path.join(root, 'public'), output);
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('src="./app.js"', 'src="./app.js?v=' + buildVersion + '"')
    .replace(/href="(\.\/[^"?]+\.css)"/g, (_, href) => 'href="' + href + '?v=' + buildVersion + '"');
  fs.writeFileSync(path.join(output, 'index.html'), index);
  for (const file of ['favicon.svg', 'LICENSE', 'NOTICE.md']) {
    if (fs.existsSync(path.join(root, file))) fs.copyFileSync(path.join(root, file), path.join(output, file));
  }
  console.log('Built independent static app: ' + output);
}
module.exports = { build };
if (require.main === module) build();
