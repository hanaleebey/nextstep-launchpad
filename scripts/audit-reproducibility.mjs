// Read-only credential/project-binding scan. Reports paths and line numbers,
// never matching values. Does not inspect Git history or rewrite evidence.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
let findings = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue; // Binary PDFs/images require separate evidence review.
  const lines = bytes.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const categories = [];
    if (/https?:\/\/[a-z0-9]{20}\.supabase\.co\b/i.test(line)) categories.push("Supabase project URL");
    if (/(?:gsk_[a-zA-Z0-9]{25,}|AIza[a-zA-Z0-9_-]{30,}|sk-(?:proj-)?[a-zA-Z0-9_-]{25,}|sb_secret_[a-zA-Z0-9_-]{20,})/.test(line)) categories.push("possible private API credential");
    if (/eyJ[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(line)) categories.push("literal JWT (public anon key or credential; review)");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)) categories.push("private key");
    if (categories.length) {
      findings += 1;
      console.log(`${file}:${index + 1}: ${categories.join("; ")} [value withheld]`);
    }
  });
}
console.log(`${files.length} tracked paths examined; ${findings} matching lines. No values printed.`);
console.log("This heuristic is not proof of absence; binary evidence and past commits are outside its text scan.");
if (findings) process.exitCode = 1;