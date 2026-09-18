/**
 * The three Node built-ins motion-language.test.ts needs, declared locally.
 *
 * Why not just add "node" to tsconfig's `types` array: that array is set explicitly to
 * ["vitest/globals", "@testing-library/jest-dom"], and adding Node's globals to a
 * 39,000-line DOM program changes the resolved type of things like setTimeout's return
 * value across every file. A shim naming only the four functions actually called keeps
 * that blast radius at zero.
 *
 * Why fs is needed at all: vitest resolves a CSS import to an EMPTY STRING, verified
 * both ways -- an explicit `../app-shell-daylight.css?raw` import and a
 * `import.meta.glob('/src/*.css', { query: '?raw' })` both yield length 0 (the glob
 * finds all 58 files and every one is empty). That is the same fact behind
 * `document.styleSheets.length === 0` in this suite. Reading the bytes off disk is the
 * only way a test here can see a stylesheet.
 */
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  /** Every path under `path`, relative to it (Node 20+); dark-mode-gaps.test.ts walks src with it. */
  export function readdirSync(path: string, options: { recursive: true }): string[];
}
declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}
