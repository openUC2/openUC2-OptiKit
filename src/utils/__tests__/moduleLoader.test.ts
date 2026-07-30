/**
 * parseCSV must honour quoted fields. The catalogue's `description` and
 * `notification` columns contain semicolons and newlines, and a naive
 * `split(';')` shifted every later column — silently mis-assigning
 * `optikitId` (which then 404s against the library) and corrupting
 * `defaultParams`.
 */

import { describe, expect, it } from 'vitest';
import { csvRowToModuleDefinition, parseCSV } from '../moduleLoader';

const HEADER = 'id;name;description;defaultParams;optikitId';

describe('parseCSV', () => {
  it('keeps a semicolon inside a quoted field out of the column split', () => {
    const csv = `${HEADER}\nlaser-x;Laser;"stable, low-noise; ideal for excitation";{};openuc2.source.laser_488`;
    const [row] = parseCSV(csv);
    expect(row.description).toBe('stable, low-noise; ideal for excitation');
    expect(row.optikitId).toBe('openuc2.source.laser_488');
  });

  it('keeps a newline inside a quoted field inside one record', () => {
    const csv = `${HEADER}\nlens-y;Lens;"line one\nline two";{};openuc2.lens.achromat_25mm_f50`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('line one\nline two');
    expect(rows[0].optikitId).toBe('openuc2.lens.achromat_25mm_f50');
  });

  it('unescapes doubled quotes and parses the JSON params', () => {
    const csv = `${HEADER}\ncam;Camera;desc;"{""resolution"": ""1920x1080""}";`;
    const [row] = parseCSV(csv);
    expect(row.defaultParams).toBe('{"resolution": "1920x1080"}');
    expect(csvRowToModuleDefinition(row).defaultParams).toEqual({ resolution: '1920x1080' });
  });

  it('leaves an unmapped part without an optikitId', () => {
    const csv = `${HEADER}\nled;LED Blue;"bright; blue";{};`;
    expect(csvRowToModuleDefinition(parseCSV(csv)[0]).optikitId).toBeUndefined();
  });

  it('handles CRLF line endings and ignores trailing blank lines', () => {
    const csv = `${HEADER}\r\na;A;d;{};x\r\nb;B;d;{};y\r\n`;
    const rows = parseCSV(csv);
    expect(rows.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('parses JSON params containing an empty string value', () => {
    const csv = `${HEADER}\nw;Wildcard;desc;"{""customText"": """"}";`;
    const def = csvRowToModuleDefinition(parseCSV(csv)[0]);
    expect(def.defaultParams).toEqual({ customText: '' });
  });
});
