"use strict";
/**
 * fix-esm.js — postinstall patch
 * Scans node_modules for ESM-only packages that are required by
 * @dongdev/fca-unofficial at runtime and replaces them with CJS shims.
 *
 * Run automatically via: npm install (postinstall) and nixpacks build step.
 */

const fs   = require("fs");
const path = require("path");

// ─── CJS shims for known ESM-only packages ────────────────────────────────────

const SHIMS = {
  "gradient-string": `"use strict";
function gradient() { return function(t) { return String(t); }; }
gradient.atlas      = function(t) { return String(t); };
gradient.cristal    = function(t) { return String(t); };
gradient.teen       = function(t) { return String(t); };
gradient.mind       = function(t) { return String(t); };
gradient.morning    = function(t) { return String(t); };
gradient.vice       = function(t) { return String(t); };
gradient.passion    = function(t) { return String(t); };
gradient.fruit      = function(t) { return String(t); };
gradient.instagram  = function(t) { return String(t); };
gradient.retro      = function(t) { return String(t); };
gradient.summer     = function(t) { return String(t); };
gradient.rainbow    = function(t) { return String(t); };
gradient.pastel     = function(t) { return String(t); };
module.exports = gradient;
module.exports.default = gradient;
`,

  "chalk": `"use strict";
function id(x) { return x != null ? String(x) : ""; }
const handler = { get(_, k) { if (k === "default" || k === "__esModule") return proxy; return proxy; } };
const proxy = new Proxy(id, handler);
module.exports = proxy;
module.exports.default = proxy;
`,
};

// ─── Targets: look in all nested node_modules paths ──────────────────────────

function findTargets(pkgName, startDir) {
  const found = [];
  // Direct nested path (most common)
  const direct = path.join(startDir, "node_modules", pkgName);
  if (fs.existsSync(direct)) found.push(direct);
  // Walk one level deeper (scoped packages like @dongdev)
  const nm = path.join(startDir, "node_modules");
  if (!fs.existsSync(nm)) return found;
  for (const entry of fs.readdirSync(nm)) {
    const sub = path.join(nm, entry, "node_modules", pkgName);
    if (fs.existsSync(sub)) found.push(sub);
    // scoped packages (e.g. @dongdev/fca-unofficial)
    if (entry.startsWith("@")) {
      const nmRoot = path.join(nm, entry);
      for (const pkg of fs.readdirSync(nmRoot)) {
        const deep = path.join(nmRoot, pkg, "node_modules", pkgName);
        if (fs.existsSync(deep)) found.push(deep);
      }
    }
  }
  return found;
}

function isEsm(dir) {
  const pkgFile = path.join(dir, "package.json");
  if (!fs.existsSync(pkgFile)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    return pkg.type === "module";
  } catch (_) {
    return false;
  }
}

function resolveMain(dir) {
  const pkgFile = path.join(dir, "package.json");
  let main = "index.js";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    // Try exports.require first (CJS conditional export)
    if (pkg.exports) {
      const exp = pkg.exports["."] || pkg.exports;
      if (typeof exp === "object") {
        const cjsPath = exp.require || exp.default;
        if (typeof cjsPath === "string") return path.join(dir, cjsPath);
        if (typeof cjsPath === "object") {
          const inner = cjsPath.default || cjsPath.require;
          if (typeof inner === "string") return path.join(dir, inner);
        }
      }
    }
    if (pkg.main) main = pkg.main;
  } catch (_) {}
  return path.join(dir, main);
}

function patchDir(dir, pkgName, shim) {
  const pkgFile = path.join(dir, "package.json");
  let patched = false;

  // 1. Remove "type":"module" from package.json
  if (fs.existsSync(pkgFile)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
      if (pkg.type === "module") {
        delete pkg.type;
        // Redirect exports to our shim file
        if (pkg.exports) {
          pkg.exports = { ".": "./cjs-shim.js" };
        }
        if (pkg.main) pkg.main = "cjs-shim.js";
        else pkg.main = "cjs-shim.js";
        fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2), "utf8");
        patched = true;
      }
    } catch (e) {
      console.warn(`[fix-esm] warn: could not patch package.json at ${dir}: ${e.message}`);
    }
  }

  // 2. Write shim file
  const shimFile = path.join(dir, "cjs-shim.js");
  fs.writeFileSync(shimFile, shim, "utf8");

  // 3. Overwrite the resolved main entry with the shim
  try {
    const mainFile = resolveMain(dir);
    if (mainFile && fs.existsSync(path.dirname(mainFile))) {
      fs.writeFileSync(mainFile, shim, "utf8");
    }
  } catch (_) {}

  // 4. Also overwrite index.js if it exists and is different
  const idx = path.join(dir, "index.js");
  if (fs.existsSync(idx)) {
    try {
      const content = fs.readFileSync(idx, "utf8");
      if (content.startsWith("import ") || content.startsWith("export ")) {
        fs.writeFileSync(idx, shim, "utf8");
      }
    } catch (_) {}
  }

  // 5. Overwrite dist/index.js if ESM
  const distIdx = path.join(dir, "dist", "index.js");
  if (fs.existsSync(distIdx)) {
    try {
      const content = fs.readFileSync(distIdx, "utf8");
      if (content.startsWith("import ") || content.startsWith("export ") || content.includes("export default")) {
        fs.writeFileSync(distIdx, shim, "utf8");
      }
    } catch (_) {}
  }

  return patched;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
let totalPatched = 0;

for (const [pkgName, shim] of Object.entries(SHIMS)) {
  const targets = findTargets(pkgName, ROOT);
  for (const dir of targets) {
    if (!isEsm(dir)) continue;
    try {
      patchDir(dir, pkgName, shim);
      console.log(`[fix-esm] patched ESM → CJS: ${path.relative(ROOT, dir)}`);
      totalPatched++;
    } catch (e) {
      console.warn(`[fix-esm] failed to patch ${dir}: ${e.message}`);
    }
  }
}

if (totalPatched === 0) {
  console.log("[fix-esm] no ESM packages needed patching.");
} else {
  console.log(`[fix-esm] done — ${totalPatched} package(s) patched.`);
}
