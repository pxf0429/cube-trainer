const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  fileName: file,
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, file);
