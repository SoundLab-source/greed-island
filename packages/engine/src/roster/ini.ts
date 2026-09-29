/**
 * Minimal reader for M.U.G.E.N/IKEMEN .def files: `[Section]` headers,
 * `key = value` lines, `;` comments (outside quotes), optional quotes.
 * Keys and section names are case-insensitive, and the first occurrence wins.
 */
export type IniSections = Map<string, Map<string, string>>;

function stripComment(line: string): string {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ";" && !inQuotes) return line.slice(0, i);
  }
  return line;
}

function unquote(value: string): string {
  const v = value.trim();
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

export function parseIni(text: string): IniSections {
  const sections: IniSections = new Map();
  let current: Map<string, string> | undefined;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      const name = header[1]!.trim().toLowerCase();
      current = sections.get(name);
      if (!current) {
        current = new Map();
        sections.set(name, current);
      }
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0 || !current) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    if (key && !current.has(key)) current.set(key, unquote(line.slice(eq + 1)));
  }
  return sections;
}

export function iniValue(sections: IniSections, section: string, key: string): string | undefined {
  const v = sections.get(section.toLowerCase())?.get(key.toLowerCase());
  return v === undefined || v === "" ? undefined : v;
}

function splitComment(line: string): { body: string; comment: string } {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ";" && !inQuotes) return { body: line.slice(0, i), comment: line.slice(i) };
  }
  return { body: line, comment: "" };
}

/**
 * Set keys in the first `[section]` of a .def/.cns text, keeping everything
 * else (comments, spacing, other sections, line endings) as it was. Keys that
 * aren't there yet are added right after the section header.
 */
export function patchIni(text: string, section: string, values: Record<string, string>): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const wanted = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), { key: k, value: v }]));
  const start = lines.findIndex((l) => splitComment(l).body.trim().toLowerCase() === `[${section.toLowerCase()}]`);
  if (start < 0) throw new Error(`section [${section}] not found`);
  let i = start + 1;
  for (; i < lines.length; i++) {
    const { body, comment } = splitComment(lines[i]!);
    if (/^\s*\[.*\]\s*$/.test(body)) break;
    const m = /^(\s*)([^=\s][^=]*?)(\s*=\s*)(.*?)(\s*)$/.exec(body);
    if (!m) continue;
    const hit = wanted.get(m[2]!.toLowerCase());
    if (!hit) continue;
    lines[i] = `${m[1]}${m[2]}${m[3]}${hit.value}${comment ? (m[5] || " ") + comment : ""}`;
    wanted.delete(m[2]!.toLowerCase());
  }
  if (wanted.size > 0) lines.splice(start + 1, 0, ...[...wanted.values()].map((w) => `${w.key} = ${w.value}`));
  return lines.join(eol);
}
