// Build the browser half (lib/client.js) as a `window.__ModuleLoader__` factory
// bundle — the exact wrapper shape the client-modules host serves at
// /plugins/<id>/client.js (same product as the dsh-mcp-plugin build).
//
// react / react-dom / react/jsx-runtime stay external: the module loader's
// `require` supplies the app's own copies (a bundled second React would break
// hooks). The host half is plain ESM JS and needs no build.
//
// write:false + explicit fs.writeFile: on some setups the esbuild Go process
// is denied direct writes to this directory while the Node runtime is not.
//
// Run: node build.mjs
import { build } from 'esbuild'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const ID = '@local/workspace-group-manager'
const GLOBAL = '__workspace_group_manager_exports__'

const result = await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  write: false,
  bundle: true,
  format: 'iife',
  globalName: GLOBAL,
  target: 'es2022',
  jsx: 'automatic',
  minify: false,
  sourcemap: true,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: {
    js: [
      'window.__ModuleLoader__.load({',
      `\tid: ${JSON.stringify(ID)},`,
      '\tfactory: (require) => {',
      '\t\tvar module = { exports: {} };',
      '\t\tvar exports = module.exports;',
      '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    ].join('\n'),
  },
  footer: {
    js: [
      `\t\tmodule.exports.apply = ${GLOBAL}.apply;`,
      `\t\tmodule.exports.inject = ${GLOBAL}.inject;`,
      '\t\t// The loader require resolves workspace-external packages (ui-primitives icons).',
      '\t\twindow.__wsgRequire = require;',
      '\t\treturn module.exports;',
      '\t}',
      '});',
    ].join('\n'),
  },
  logLevel: 'info',
})

await mkdir(dirname(result.outputFiles[0].path), { recursive: true })
for (const file of result.outputFiles) {
  await writeFile(file.path, file.contents)
}
console.log(`lib/client.js ${(result.outputFiles[0].contents.length / 1024).toFixed(1)}kb`)
