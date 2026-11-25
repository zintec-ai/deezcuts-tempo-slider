// Builds one loadable extension folder per browser:
//   dist/<browser>/manifest.json = tempo_core/manifest.base.json
//                                  + <browser>/manifest.override.json
//                                  + "version" from package.json
//   dist/<browser>/*             = only the files that the manifest uses
// A browser cannot load files from outside the extension folder, so the
// shared code must be copied.
// Run: npm run build              (all browsers)
//      npm run build -- firefox   (one browser)
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BROWSERS = ["chrome", "firefox"];
const root = new URL("../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

const args = process.argv.slice(2);
const unknown = args.filter((a) => !BROWSERS.includes(a));
if (unknown.length > 0) {
  console.error(`unknown browser: ${unknown.join(", ")}. Use: ${BROWSERS.join(", ")}`);
  process.exit(1);
}

const { version } = readJson("package.json");
const base = readJson("tempo_core/manifest.base.json");

// The files that the manifest uses: content scripts and icons.
function filesOf(manifest) {
  const files = new Set(Object.values(manifest.icons ?? {}));
  for (const cs of manifest.content_scripts ?? []) for (const js of cs.js ?? []) files.add(js);
  return [...files];
}

for (const browser of args.length > 0 ? args : BROWSERS) {
  // A key in the override replaces the same key in the base (no deep merge).
  const manifest = { ...base, ...readJson(`${browser}/manifest.override.json`), version };
  const out = new URL(`dist/${browser}/`, root);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const file of filesOf(manifest)) {
    const target = new URL(file, out);
    mkdirSync(new URL("./", target), { recursive: true });
    cpSync(new URL(`tempo_core/${file}`, root), target);
  }
  writeFileSync(new URL("manifest.json", out), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`built dist/${browser} (version ${version})`);
}
