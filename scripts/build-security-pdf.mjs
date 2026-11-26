#!/usr/bin/env node
// Build the PDF only when explicitly requested:
//   node scripts/build-security-pdf.mjs
// Reads public/security-results.json and optional public/evidence/*.png files.
// Missing images never fail the build; a labelled placeholder is retained.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const inputUrl = new URL("../public/security-results.json", import.meta.url);
const outputUrl = new URL("../public/security-test-report.pdf", import.meta.url);
const evidenceUrl = (filename) => new URL(`../public/evidence/${filename}`, import.meta.url);
const report = JSON.parse(await readFile(inputUrl, "utf8"));

const pdf = await PDFDocument.create();
pdf.setTitle("NextStep Security and Robustness Test Report");
pdf.setAuthor(report.owner);
pdf.setSubject("Security attack, fix, and re-attack evidence");
pdf.setCreationDate(new Date(report.runAt));

const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const mono = await pdf.embedFont(StandardFonts.Courier);
const W = 595.28;
const H = 841.89;
const M = 46;
const BODY = W - M * 2;
const INK = rgb(0x0f / 255, 0x17 / 255, 0x2a / 255);
const MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255);
const PRIMARY = rgb(0x4f / 255, 0x46 / 255, 0xe5 / 255);
const BORDER = rgb(0xe4 / 255, 0xe8 / 255, 0xee / 255);
const SURFACE2 = rgb(0xfb / 255, 0xfb / 255, 0xfc / 255);
const GREEN = rgb(0x15 / 255, 0x80 / 255, 0x3d / 255);
const AMBER = rgb(0xb4 / 255, 0x53 / 255, 0x09 / 255);
const RED = rgb(0xb9 / 255, 0x1c / 255, 0x1c / 255);

// Standard PDF fonts are WinAnsi. Keep evidence readable without font glyphs
// silently disappearing; the JSON remains the unmodified source of truth.
const ascii = (value) => String(value ?? "")
  .replace(/[×]/g, "x").replace(/[–—]/g, "-")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/…/g, "...").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");

let page;
let y;
const newPage = () => {
  page = pdf.addPage([W, H]);
  y = H - M;
  return page;
};
const width = (text, size, font = regular) => font.widthOfTextAtSize(ascii(text), size);
const wrap = (value, size, maxWidth, font = regular) => {
  const lines = [];
  for (const rawLine of ascii(value).split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate, size, font) <= maxWidth) { line = candidate; continue; }
      if (line) lines.push(line);
      if (width(word, size, font) <= maxWidth) { line = word; continue; }
      let fragment = "";
      for (const char of word) {
        if (width(fragment + char, size, font) > maxWidth && fragment) { lines.push(fragment); fragment = ""; }
        fragment += char;
      }
      line = fragment;
    }
    if (line) lines.push(line);
  }
  return lines;
};
const space = (needed) => { if (y - needed < 58) newPage(); };
const text = (value, { size = 9.5, font = regular, color = INK, maxWidth = BODY, x = M, gap = 4, indent = 0 } = {}) => {
  const lineHeight = size * 1.42;
  for (const line of wrap(value, size, maxWidth - indent, font)) {
    space(lineHeight + gap);
    page.drawText(line, { x: x + indent, y: y - size, size, font, color });
    y -= lineHeight;
  }
  y -= gap;
};
const heading = (value, level = 1) => {
  const size = level === 1 ? 22 : level === 2 ? 15 : 10;
  space(size * 2.2);
  text(value, { size, font: level === 3 ? bold : bold, color: level === 3 ? MUTED : INK, gap: level === 1 ? 14 : 8 });
};
const rule = () => { space(14); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: BORDER }); y -= 14; };
const bullets = (items, ordered = false) => items.forEach((item, index) => text(`${ordered ? `${index + 1}.` : "-"} ${item}`, { indent: 8, maxWidth: BODY - 8, gap: 2 }));
const field = (label, value, options = {}) => { heading(label, 3); text(value, options); };
const verdictColor = (verdict) => verdict === "BLOCKED" ? GREEN : verdict === "MANUAL" ? AMBER : RED;

// Cover.
newPage();
page.drawRectangle({ x: M, y: H - 116, width: 54, height: 54, color: PRIMARY });
page.drawText("N", { x: M + 15, y: H - 100, size: 30, font: bold, color: rgb(1, 1, 1) });
y = H - 154;
text("NEXTSTEP", { size: 11, font: bold, color: PRIMARY, gap: 12 });
heading("Security and robustness test programme", 1);
text("Attack, minimal fix, and independent re-attack evidence for the NextStep executive-function coach.", { size: 12, color: MUTED, gap: 24 });
rule();
field("Project", report.project);
field("Run date", new Date(report.runAt).toUTCString());
field("Build commit", report.build, { font: mono });
field("Authorised owner", report.owner);
field("Environment", "React + TypeScript + Vite; Supabase Auth, Postgres RLS, Edge Functions; demo data and fixtures only.");
y -= 18;
page.drawRectangle({ x: M, y: y - 82, width: BODY, height: 82, color: SURFACE2, borderColor: BORDER, borderWidth: 0.8 });
text(`Cases: ${report.summary.cases}   BLOCKED: ${report.summary.blocked}   MANUAL: ${report.summary.manual}   VULNERABLE: ${report.summary.vulnerable}`, { x: M + 16, maxWidth: BODY - 32, size: 12, font: bold, gap: 8 });
text(`Fixed only after a second run: ${report.summary.fixed}`, { x: M + 16, maxWidth: BODY - 32, size: 10, color: MUTED });

// Method, quoted exactly as the six programme steps.
newPage();
heading("Method", 1);
text("The six-step attack pattern:", { size: 11, font: bold });
report.method.forEach((step, index) => text(`"${index + 1}. ${step}"`, { font: regular, indent: 10, maxWidth: BODY - 10, gap: 5 }));
heading("Scope and environment", 2);
bullets(report.scope);
text("No agent-estimate or other AI endpoint is called. No live LMS is required. No test writes another user's data.", { font: bold });

// Dashboard: verification wraps in the final column rather than disappearing.
newPage();
heading("Results dashboard", 1);
const cols = [32, 91, 67, 42, BODY - 232];
const headers = ["ID", "Area", "Verdict", "Fixed", "Verification"];
const tableRow = (values, fonts = regular, colors = INK) => {
  const cellLines = values.map((value, i) => wrap(value, 7.5, cols[i] - 8, Array.isArray(fonts) ? fonts[i] : fonts));
  const height = Math.max(...cellLines.map((lines) => lines.length)) * 10.5 + 10;
  space(height);
  cellLines.forEach((lines, i) => {
    const x = M + cols.slice(0, i).reduce((sum, value) => sum + value, 0);
    lines.forEach((line, lineIndex) => page.drawText(line, {
      x: x + 4, y: y - 10 - lineIndex * 10.5, size: 7.5,
      font: Array.isArray(fonts) ? fonts[i] : fonts,
      color: Array.isArray(colors) ? colors[i] : colors,
    }));
  });
  page.drawLine({ start: { x: M, y: y - height }, end: { x: W - M, y: y - height }, thickness: 0.5, color: BORDER });
  y -= height;
};
tableRow(headers, bold, MUTED);
for (const item of report.cases) tableRow(
  [item.id, item.area, item.verdict, item.fixed ? "yes" : "no", item.verification],
  [bold, regular, bold, regular, regular],
  [INK, INK, verdictColor(item.verdict), INK, MUTED],
);

// One labelled section per case, with exact JSON payload and execution steps.
for (const item of report.cases) {
  newPage();
  text(item.id, { size: 10, font: bold, color: PRIMARY, gap: 4 });
  heading(item.area, 1);
  text(item.verdict + (item.fixed ? " - FIXED AND RE-ATTACKED" : ""), { size: 12, font: bold, color: verdictColor(item.verdict) });
  field("Attack surface", item.attackSurface);
  field("Expected", item.expected);
  field("Exact payload", JSON.stringify(item.payload, null, 2), { font: mono, size: 7.5 });
  field("Execution steps", "");
  bullets(item.executionSteps, true);
  field("Observed outcome", item.observed);
  field("Verdict", item.verdict, { font: bold, color: verdictColor(item.verdict) });
  field("Fix applied", item.fix);
  field("Verification after re-attack", item.verification);
  if (item.manualSteps?.length) {
    field("MANUAL owner steps", "");
    bullets(item.manualSteps, true);
  }
  heading("Screenshot evidence", 2);
  const filename = item.evidenceFile;
  const path = evidenceUrl(filename);
  let embedded = false;
  if (existsSync(path)) {
    try {
      const bytes = await readFile(path);
      // Uploaded screenshots can contain WebP bytes despite a .png filename.
      // Convert in memory, preserving the original evidence files unchanged.
      const isWebP = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
      const pngBytes = isWebP
        ? execFileSync("ffmpeg", ["-loglevel", "error", "-i", "pipe:0", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], { input: bytes, maxBuffer: 32 * 1024 * 1024 })
        : bytes;
      const image = await pdf.embedPng(pngBytes);
      const scale = Math.min(BODY / image.width, 280 / image.height, 1);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      space(drawHeight + 26);
      page.drawImage(image, { x: M, y: y - drawHeight, width: drawWidth, height: drawHeight });
      y -= drawHeight + 8;
      text(`Embedded public/evidence/${filename}`, { size: 8, color: MUTED });
      embedded = true;
    } catch (error) {
      console.warn(`${item.id}: could not embed ${filename}; placeholder kept (${error.message})`);
    }
  }
  if (!embedded) {
    space(112);
    page.drawRectangle({ x: M, y: y - 94, width: BODY, height: 94, borderColor: BORDER, borderWidth: 1, color: SURFACE2 });
    text("Screenshot placeholder", { x: M + 14, maxWidth: BODY - 28, size: 11, font: bold, color: MUTED, gap: 3 });
    text(`Insert public/evidence/${filename}`, { x: M + 14, maxWidth: BODY - 28, size: 9, font: mono, color: INK });
    y -= 94;
  }
}

newPage();
heading("Residual risks and remaining MANUAL work", 1);
bullets(report.residualRisks);
const manual = report.cases.filter((item) => item.verdict === "MANUAL");
if (manual.length) {
  heading("MANUAL cases", 2);
  for (const item of manual) {
    text(`${item.id} - ${item.area}`, { font: bold, size: 11, color: AMBER });
    bullets(item.manualSteps ?? item.executionSteps, true);
  }
} else text("No MANUAL cases remain.", { color: GREEN, font: bold });

// Running footer and page numbers on every page, including the cover.
const pages = pdf.getPages();
pages.forEach((entry, index) => {
  entry.drawLine({ start: { x: M, y: 42 }, end: { x: W - M, y: 42 }, thickness: 0.6, color: BORDER });
  entry.drawText("NextStep - Security and robustness test programme", { x: M, y: 27, size: 7.5, font: regular, color: MUTED });
  const label = `Page ${index + 1} of ${pages.length}`;
  entry.drawText(label, { x: W - M - width(label, 7.5), y: 27, size: 7.5, font: regular, color: MUTED });
});

await writeFile(outputUrl, await pdf.save());
console.log(`Wrote public/security-test-report.pdf (${pages.length} pages).`);
for (const item of report.cases) {
  if (!existsSync(evidenceUrl(item.evidenceFile))) console.log(`${item.id}: public/evidence/${item.evidenceFile} missing; labelled placeholder used.`);
}
