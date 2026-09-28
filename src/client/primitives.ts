/**
 * Lazy accessor for @deepseek-ai/dsh-client-ui-primitives, resolved through
 * the module loader's require (surfaced as window.__wsgRequire by the bundle
 * footer). The official WorkspaceBrowser hard-requires the same package, so
 * it is guaranteed present whenever our region renders; using its real
 * components (icons, Menu, Tooltip) keeps the region pixel-identical.
 * @module dsh-workspace-group-manager/client/primitives
 */

type Primitives = Record<string, unknown>

let cached: Primitives | null | undefined

/** The primitives module (empty object when unexpectedly unavailable). */
export function primitives(): Primitives {
  if (cached === undefined) {
    try {
      const require_ = (window as unknown as { __wsgRequire?: (id: string) => unknown }).__wsgRequire
      cached = (require_?.('@deepseek-ai/dsh-client-ui-primitives') as Primitives | undefined) ?? null
    } catch {
      cached = null
    }
  }
  return cached ?? {}
}

/** Join class names, skipping falsy (tiny clsx). */
export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
