// Build the browser half (lib/client.js) as a `window.__ModuleLoader__` factory
// bundle — the exact wrapper shape the client-modules host serves at
// /plugins/<id>/client.js (same product as the dsh-mcp-plugin build).
//
// react / react-dom / react/jsx-runtime stay external: the module loader's
// `require` supplies the app's own copies (a bundled second React would break
// hooks). The host half is plain ESM JS and needs no build.
//
// Run: node build.mjs
import { build } from 'esbuild'

const ID = '@local/workspace-group-manager'
const GLOBAL = '__workspace_group_manager_exports__'

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
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
