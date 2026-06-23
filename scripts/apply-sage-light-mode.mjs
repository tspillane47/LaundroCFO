#!/usr/bin/env node
/**
 * Light-mode navy → sage palette migration.
 * Run from repo root: node scripts/apply-sage-light-mode.mjs
 *
 * Light mode targets:
 *   #f0f4f1  card/input backgrounds
 *   #1a3d2b  primary buttons
 *   #e8ede9  secondary backgrounds
 *
 * Dark mode preserved via dark: Tailwind variants and .dark CSS blocks.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

const INPUT_CLASS_OLD =
  'export const INPUT_CLASS =\n  "w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500";';

const INPUT_CLASS_NEW = `export const INPUT_CLASS =
  "w-full bg-[#f0f4f1] dark:bg-[#1e2a3a] border border-[rgba(45,74,40,0.18)] dark:border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] dark:text-slate-100 outline-none focus:border-[#1a3d2b] dark:focus:border-blue-500";`;

const inputClassStrOld =
  '"w-full bg-[#1e2a3a] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-blue-500"';

const inputClassStrNew =
  '"w-full bg-[#f0f4f1] dark:bg-[#1e2a3a] border border-[rgba(45,74,40,0.18)] dark:border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] dark:text-slate-100 outline-none focus:border-[#1a3d2b] dark:focus:border-blue-500"';

const toggleInactiveOld =
  '"flex-1 py-2 rounded-lg text-[13px] font-medium bg-[#1e2a3a] border border-white/10 text-slate-400 hover:border-white/20"';

const toggleInactiveNew =
  '"flex-1 py-2 rounded-lg text-[13px] font-medium bg-[#f0f4f1] dark:bg-[#1e2a3a] border border-[rgba(45,74,40,0.18)] dark:border-white/10 text-adaptive-muted hover:border-[rgba(45,74,40,0.3)] dark:hover:border-white/20"';

/** Order matters: longer/more-specific patterns first. */
const bgReplacements = [
  ["bg-[#243347]/80", "bg-[#e8ede9]/80 dark:bg-[#243347]/80"],
  ["bg-[#243347]/50", "bg-[#e8ede9]/50 dark:bg-[#243347]/50"],
  ["bg-[#1e2a3a]/50", "bg-[#f0f4f1]/50 dark:bg-[#1e2a3a]/50"],
  ["bg-[#161f30]", "bg-[#e8ede9] dark:bg-[#161f30]"],
  ["bg-[#0f1623]", "bg-[#f0f4f1] dark:bg-[#0f1623]"],
  ["bg-[#243347]", "bg-[#e8ede9] dark:bg-[#243347]"],
  ["bg-[#1e2a3a]", "bg-[#f0f4f1] dark:bg-[#1e2a3a]"],
];

const MARKER = "SAGE LIGHT MODE — navy background overrides";

const globalsAppend = `
/* ============ ${MARKER} ============ */
:root:not(.dark) {
  --bg-input: #f0f4f1;
  --bg-secondary: #e8ede9;
}

:root:not(.dark) .btn-primary {
  background: #1a3d2b;
}

:root:not(.dark) .btn-primary:hover {
  background: #245a3a;
}

:root:not(.dark) .select-tan {
  background-color: #f0f4f1;
  color: var(--text-primary);
  border: 1px solid rgba(45, 74, 40, 0.18);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23111B10' d='M2.5 4.5 6 8l3.5-3.5'/%3E%3C/svg%3E");
  text-align: left;
  font-weight: 400;
}

:root:not(.dark) .select-tan:focus {
  border-color: #1a3d2b;
}

:root:not(.dark) .select-tan option {
  background: #f0f4f1;
  color: var(--text-primary);
}

:root:not(.dark) .hero-value-card {
  background: linear-gradient(135deg, #1a3d2b 0%, #2d6a4f 100%);
}

.dark .hero-value-card {
  background: linear-gradient(135deg, #0f1e3d 0%, #1e3a5f 100%);
}
`;

const skipDir = (p) =>
  p.includes(`${path.sep}(marketing)${path.sep}`) ||
  p.includes(`${path.sep}node_modules${path.sep}`);

function walk(dir, exts, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (skipDir(p)) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, exts, files);
    else if (exts.some((e) => name.endsWith(e))) files.push(p);
  }
  return files;
}

const changed = new Set();

function replaceBgTokens(content) {
  let out = content;
  for (const [from, to] of bgReplacements) {
    if (!out.includes(from)) continue;
    out = out
      .split("\n")
      .map((line) => {
        if (!line.includes(from)) return line;
        if (line.includes("dark:bg-[#")) return line;
        return line.split(from).join(to);
      })
      .join("\n");
  }
  return out;
}

function patchFile(filePath, transforms = [], bg = false) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;
  for (const [from, to] of transforms) {
    content = content.split(from).join(to);
  }
  if (bg) content = replaceBgTokens(content);
  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    changed.add(path.relative(root, filePath));
  }
}

function patchGlobalsCss(filePath) {
  let css = fs.readFileSync(filePath, "utf8");
  const original = css;

  const darkIdx = css.indexOf(".dark {");
  if (darkIdx === -1) {
    console.warn("Warning: .dark block not found in globals.css");
  } else {
    let lightBlock = css.slice(0, darkIdx);
    const darkAndRest = css.slice(darkIdx);

    lightBlock = lightBlock.replace(
      /--bg-card2:\s*#[0-9A-Fa-f]{6};/,
      "--bg-card2: #e8ede9;"
    );
    lightBlock = lightBlock.replace(
      /--accent:\s*#[0-9A-Fa-f]{6};/,
      "--accent: #1a3d2b;"
    );
    lightBlock = lightBlock.replace(
      /--hero-bg:\s*linear-gradient\(135deg, #0f1e3d 0%, #1e3a5f 100%\);/,
      "--hero-bg: linear-gradient(135deg, #1a3d2b 0%, #2d6a4f 100%);"
    );

    css = lightBlock + darkAndRest;
  }

  if (!css.includes(MARKER)) css += globalsAppend;

  // Base hero card defaults to sage; dark mode override keeps navy
  css = css.replace(
    /\.hero-value-card \{\n  background: linear-gradient\(135deg, #0f1e3d 0%, #1e3a5f 100%\);/,
    ".hero-value-card {\n  background: linear-gradient(135deg, #1a3d2b 0%, #2d6a4f 100%);"
  );

  if (css !== original) {
    fs.writeFileSync(filePath, css, "utf8");
    changed.add(path.relative(root, filePath));
  }
}

// ── shared.tsx ──
const sharedPath = path.join(src, "components/occupancy/shared.tsx");
if (fs.existsSync(sharedPath)) {
  patchFile(sharedPath, [
    [INPUT_CLASS_OLD, INPUT_CLASS_NEW],
    [inputClassStrOld, inputClassStrNew],
    [toggleInactiveOld, toggleInactiveNew],
    [
      "bg-[#1e2a3a] border-white/10 text-slate-400",
      "bg-[#f0f4f1] dark:bg-[#1e2a3a] border-[rgba(45,74,40,0.18)] dark:border-white/10 text-adaptive-muted",
    ],
  ]);
}

for (const rel of [
  "app/settings/page.tsx",
  "app/settings/edit-store/page.tsx",
  "app/onboarding/page.tsx",
]) {
  const p = path.join(src, rel);
  if (fs.existsSync(p)) patchFile(p, [[inputClassStrOld, inputClassStrNew]], true);
}

const onboardingPath = path.join(src, "app/onboarding/page.tsx");
if (fs.existsSync(onboardingPath)) {
  patchFile(onboardingPath, [
    [
      "min-h-screen bg-[#0f1e3d] flex items-center justify-center",
      "min-h-screen bg-[var(--bg-page)] dark:bg-[#0f1e3d] flex items-center justify-center",
    ],
    [
      "min-h-screen bg-[#0f1e3d] flex flex-col",
      "min-h-screen bg-[var(--bg-page)] dark:bg-[#0f1e3d] flex flex-col",
    ],
  ]);
}

const valuationPath = path.join(src, "app/valuation/page.tsx");
if (fs.existsSync(valuationPath)) {
  patchFile(valuationPath, [
    [
      'className="rounded-xl px-6 py-4"\n          style={{ background: "linear-gradient(135deg, #0f1e3d 0%, #1a3050 100%)", border: "1px solid rgba(59,130,246,0.2)" }}',
      'className="hero-value-card rounded-xl px-6 py-4"\n          style={{ border: "1px solid rgba(59,130,246,0.2)" }}',
    ],
  ]);
}

for (const filePath of walk(src, [".tsx", ".ts"])) {
  if (skipDir(filePath)) continue;
  if (filePath.endsWith("shared.tsx")) continue;
  patchFile(filePath, [], true);
}

const globalsPath = path.join(src, "app/globals.css");
if (fs.existsSync(globalsPath)) {
  patchGlobalsCss(globalsPath);
}

const list = [...changed].sort();
console.log("Updated files:");
for (const f of list) console.log(" ", f);
console.log(`\nDone. ${list.length} file(s) patched.`);
