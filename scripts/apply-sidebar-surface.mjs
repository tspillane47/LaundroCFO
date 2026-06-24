#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const SURFACE = "#1E3A1E";

const skipDir = (p) =>
  p.includes(`${path.sep}(marketing)${path.sep}`) ||
  p.includes(`${path.sep}node_modules${path.sep}`);

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (skipDir(p)) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) files.push(p);
  }
  return files;
}

const INPUT_CLASS_NEW = `export const INPUT_CLASS =
  "w-full bg-[var(--bg-input)] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-[#4a7c59] dark:focus:border-blue-500";`;

const inputClassStrNew =
  '"w-full bg-[var(--bg-input)] border border-white/10 rounded-lg px-3 py-2.5 text-[13px] text-slate-100 outline-none focus:border-[#4a7c59] dark:focus:border-blue-500"';

const inputClassStrLargeNew =
  '"w-full bg-[var(--bg-input)] border border-white/10 rounded-lg px-4 py-3.5 text-[16px] text-slate-100 outline-none focus:border-[#4a7c59] dark:focus:border-blue-500 font-medium"';

const toggleInactiveNew = `"flex-1 py-2 rounded-lg text-[13px] font-medium bg-[${SURFACE}] dark:bg-[#1e2a3a] border border-white/10 text-slate-400 hover:border-white/20"`;

const replacements = [
  ["bg-[#f0f4f1]/50", `bg-[${SURFACE}]/50`],
  ["bg-[#e8ede9]/50", `bg-[${SURFACE}]/50`],
  ["bg-[#243347]/50", `bg-[${SURFACE}]/50 dark:bg-[#243347]/50`],
  ["bg-[#1e2a3a]/50", `bg-[${SURFACE}]/50 dark:bg-[#1e2a3a]/50`],
  ["bg-[#f0f4f1]", `bg-[${SURFACE}]`],
  ["bg-[#e8ede9]", `bg-[${SURFACE}]`],
  ["bg-[#4a7c59]", `bg-[${SURFACE}]`],
  ["bg-[#1a3d2b]", `bg-[${SURFACE}]`],
  ["bg-[#243347]", `bg-[${SURFACE}] dark:bg-[#243347]`],
  ["bg-[#1e2a3a]", `bg-[${SURFACE}] dark:bg-[#1e2a3a]`],
  ["bg-[#0f1e3d]", `bg-[${SURFACE}] dark:bg-[#0f1e3d]`],
  ["bg-[#0d1520]", `bg-[${SURFACE}] dark:bg-[#0d1520]`],
  ["focus:border-[#1a3d2b]", "focus:border-[#4a7c59]"],
  ["border-[rgba(45,74,40,0.18)] dark:border-white/10", "border-white/10"],
  ["hover:border-[rgba(45,74,40,0.3)]", "hover:border-white/20"],
  ["text-[var(--text-primary)] dark:text-slate-100", "text-slate-100"],
  ['backgroundColor: "#0f1e3d"', `backgroundColor: "${SURFACE}"`],
  ['linear-gradient(135deg, #0f1e3d 0%, #1a3050 100%)', `linear-gradient(135deg, ${SURFACE} 0%, ${SURFACE} 100%)`],
];

const changed = new Set();

for (const filePath of walk(src)) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  if (filePath.endsWith("shared.tsx")) {
    content = content.replace(/export const INPUT_CLASS =[\s\S]*?";/, INPUT_CLASS_NEW);
    content = content.replace(
      /"flex-1 py-2 rounded-lg text-\[13px\] font-medium bg-\[#1e2a3a\][^"]+"/g,
      toggleInactiveNew
    );
    content = content.replace(
      /"flex-1 py-2 rounded-lg text-\[13px\] font-medium bg-\[#1E3A1E\][^"]+"/g,
      toggleInactiveNew
    );
  }

  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }

  if (
    filePath.endsWith("settings/page.tsx") ||
    filePath.endsWith("settings/edit-store/page.tsx") ||
    filePath.endsWith("onboarding/page.tsx")
  ) {
    content = content.replace(
      /"w-full bg-\[#1e2a3a\][^"]+"/g,
      inputClassStrNew
    );
    content = content.replace(
      /"w-full bg-\[#1E3A1E\][^"]+"/g,
      inputClassStrNew
    );
    if (filePath.endsWith("onboarding/page.tsx")) {
      content = content.replace(
        /"w-full bg-\[var\(--bg-input\)\] border border-white\/10 rounded-lg px-4 py-3\.5[^"]+"/,
        inputClassStrLargeNew
      );
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf8");
    changed.add(path.relative(root, filePath));
  }
}

console.log("Updated files:");
for (const f of [...changed].sort()) console.log(" ", f);
console.log(`\nDone. ${changed.size} file(s) patched.`);
