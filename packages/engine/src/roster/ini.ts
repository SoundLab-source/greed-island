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
