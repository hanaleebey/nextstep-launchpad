#!/usr/bin/env node
// Build the PDF only when explicitly requested:
//   node scripts/build-security-pdf.mjs
// Reads public/security-results.json, prose from scripts/security-report-content.ts, and public/evidence/*.png.
// Missing images never fail the build; a labelled placeholder is retained.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as content from "./security-report-content.ts";

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
const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
const W = 595.28;
const H = 841.89;
const M = 64;
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
  .replace(/[×]/g, "x").replace(/–/g, "-")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/…/g, "...").replace(/[^\x09\x0A\x0D\x20-\x7E—]/g, "?");

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
const space = (needed) => { if (y - needed < 64) newPage(); };
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


// Everything below is layout. Prose comes from security-report-content.ts;
// verdicts, timestamps and payloads come from security-results.json.
const byId = Object.fromEntries(report.cases.map((item) => [item.id, item]));
const buildDate = new Date(report.runAt).toISOString().slice(0, 10);
const para = (value) => text(value, { size: 10.5, gap: 9 });

// Cover.
newPage();
page.drawRectangle({ x: M, y: H - 130, width: 54, height: 54, color: PRIMARY });
page.drawText("N", { x: M + 15, y: H - 114, size: 30, font: bold, color: rgb(1, 1, 1) });
y = H - 170;
text("NEXTSTEP", { size: 11, font: bold, color: PRIMARY, gap: 12 });
heading(content.reportTitle, 1);
text(content.reportSubtitle, { size: 12, color: MUTED, gap: 28 });
rule();
field("Prepared by", "Audrie Hana Lee Bey, developer and sole authorised tester");
field("Test run", new Date(report.runAt).toUTCString());
field("Build", report.build, { font: mono });
field("Result", `${report.summary.blocked} of ${report.summary.cases} attacks stopped on the final run; ${report.summary.vulnerable} still open.`, { font: bold, color: report.summary.vulnerable ? RED : GREEN });

// Page 2: in one page.
newPage();
heading("In one page", 1);
content.inOnePage.forEach(para);

// Page 3: glossary.
newPage();
heading("Six terms used in this report", 1);
for (const [term, meaning] of content.glossary) { text(term, { size: 11, font: bold, gap: 2 }); text(meaning, { size: 10.5, gap: 12 }); }

// Method.
newPage();
heading("How every attack was run", 1);
para(content.methodIntro);
content.methodSteps.forEach((step, index) => text(`${index + 1}.  ${step}`, { size: 10.5, indent: 10, maxWidth: BODY - 10, gap: 7 }));
y -= 6;
para(content.methodScope);

// One section per case.
let figure = 0;
for (const prose of content.cases) {
  const item = byId[prose.id];
  newPage();
  text(`${prose.id}  ·  ${item.verdict === "BLOCKED" ? "Stopped" : item.verdict}`.replace("·", "-"), { size: 10, font: bold, color: verdictColor(item.verdict), gap: 4 });
  heading(prose.title, 2);
  const sections = [
    ["What this attack is", prose.whatItIs],
    ["Why it matters", prose.whyItMatters],
    ["How we tested it", prose.howTested],
    ["What happened", prose.whatHappened],
    ["The fix", prose.theFix],
    ["Proof it is fixed", `${prose.proofLead} ${item.verification}`],
  ];
  for (const [label, value] of sections) { heading(label, 3); text(value, { size: 10, gap: 6 }); }
  figure += 1;
  const path = evidenceUrl(item.evidenceFile);
  if (!existsSync(path)) { console.warn(`${item.id}: ${item.evidenceFile} missing; figure skipped.`); continue; }
  try {
    const bytes = await readFile(path);
    // Uploaded screenshots can contain WebP bytes despite a .png filename.
    const isWebP = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    const pngBytes = isWebP
      ? execFileSync("ffmpeg", ["-loglevel", "error", "-i", "pipe:0", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], { input: bytes, maxBuffer: 32 * 1024 * 1024 })
      : bytes;
    const image = await pdf.embedPng(pngBytes);
    const scale = Math.min(BODY / image.width, 230 / image.height, 1);
    const w = image.width * scale, h = image.height * scale;
    y -= 6;
    space(h + 24);
    page.drawRectangle({ x: M + (BODY - w) / 2 - 1, y: y - h - 1, width: w + 2, height: h + 2, borderColor: BORDER, borderWidth: 0.8 });
    page.drawImage(image, { x: M + (BODY - w) / 2, y: y - h, width: w, height: h });
    y -= h + 8;
    const cap = prose.caption;
    text(cap, { size: 9, font: italic, color: MUTED, x: M + (BODY - width(cap, 9, italic)) / 2 });
  } catch (error) {
    console.warn(`${item.id}: could not embed ${item.evidenceFile} (${error.message})`);
  }
}

// What this report does not prove.
newPage();
heading("What this report does not prove", 1);
para(content.notProven);

// Technical appendix.
newPage();
heading("Technical appendix", 1);
text("Raw identifiers, endpoints and exact inputs, for readers who want them. Long inputs are shortened.", { size: 9.5, color: MUTED, gap: 10 });
const short = (value) => { const s = JSON.stringify(value); return s.length > 260 ? `${s.slice(0, 240)}... (${s.length} chars)` : s; };
for (const item of report.cases) {
  space(80);
  text(`${item.id}  ${item.area}  ${item.verdict}`, { size: 9.5, font: bold, gap: 2 });
  text(`Endpoint: ${item.attackSurface}`, { size: 8, gap: 2 });
  text(`Payload: ${short(item.payload)}`, { size: 7, font: mono, gap: 2 });
  text(`Observed: ${item.observed}`, { size: 8, color: MUTED, gap: 4 });
  rule();
}

// Running footer with page number and build date.
const pages = pdf.getPages();
pages.forEach((entry, index) => {
  entry.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.6, color: BORDER });
  entry.drawText(`NextStep security report  -  build ${report.build}, ${buildDate}`, { x: M, y: 31, size: 7.5, font: regular, color: MUTED });
  const label = `Page ${index + 1} of ${pages.length}`;
  entry.drawText(label, { x: W - M - width(label, 7.5), y: 31, size: 7.5, font: regular, color: MUTED });
});

await writeFile(outputUrl, await pdf.save());
console.log(`Wrote public/security-test-report.pdf (${pages.length} pages).`);
