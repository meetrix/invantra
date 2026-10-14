/** Parses RFC 4180 CSV: quoted fields, doubled quotes, and line breaks inside quotes. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = input.replace(/^﻿/, "");

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}

/**
 * Rows of a CSV with a header line, read by column name. Names are matched
 * ignoring case, spaces and underscores, so "Item ID" and "ITEM_ID" are the same.
 */
export class CsvTable {
  private columns: Map<string, number>;
  rows: string[][];

  constructor(input: string) {
    const [header = [], ...rows] = parseCsv(input);
    this.columns = new Map(header.map((name, index) => [CsvTable.key(name), index]));
    this.rows = rows;
  }

  private static key(name: string): string {
    return name.toLowerCase().replace(/[\s_]/g, "");
  }

  has(...names: string[]): boolean {
    return names.some((name) => this.columns.has(CsvTable.key(name)));
  }

  /** The first non-empty value among the named columns. */
  get(row: string[], ...names: string[]): string {
    for (const name of names) {
      const index = this.columns.get(CsvTable.key(name));
      const value = index === undefined ? "" : (row[index] ?? "").trim();
      if (value) return value;
    }
    return "";
  }
}

/** "AUD 2000.00", "$2,000.00" and "€2.000,00" all read as 2000. */
export function parseAmount(value: string): number {
  let digits = value.replace(/[^\d.,-]/g, "");
  const comma = digits.lastIndexOf(",");
  const dot = digits.lastIndexOf(".");
  if (comma > dot) {
    // The comma is the decimal separator when it is followed by one or two digits.
    digits = /,\d{1,2}$/.test(digits) ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/,/g, "");
  } else {
    digits = digits.replace(/,/g, "");
  }
  const amount = Number(digits);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}
