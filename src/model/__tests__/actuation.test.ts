/**
 * WP-26: DOF value → firmware command. Mirrors optikit-core's
 * tests/test_actuate.py so the live editor and the CLI agree on the command.
 */

import { describe, expect, it } from 'vitest';
import { firmwareCommand } from '../actuation';
import type { LibraryDof } from '../../document/libraryPalette';

const tiltX: LibraryDof = {
  name: 'tilt_x',
  kind: 'rotation',
  axis: 'x',
  unit: 'deg',
  range: [-15, 15],
  actuatable: true,
  canObject: 0x6070,
};

const lensZ: LibraryDof = {
  name: 'lens_z',
  kind: 'translation',
  axis: 'z',
  unit: 'mm',
  range: [-5, 5],
  actuatable: true,
  canObject: '0x6062:1',
};

describe('firmwareCommand', () => {
  it('maps a galvo rotation to /galvo_act with the CAN object', () => {
    const cmd = firmwareCommand(tiltX, 7.5);
    expect(cmd).not.toBeNull();
    expect(cmd!.uc2rest.task).toBe('/galvo_act');
    expect(cmd!.uc2rest.target).toBe(7.5);
    expect(cmd!.can.index).toBe(0x6070);
    expect(cmd!.can.subindex).toBe(0);
  });

  it('maps a translation to /motor_act and parses an index:sub can-object', () => {
    const cmd = firmwareCommand(lensZ, -2);
    expect(cmd).not.toBeNull();
    expect(cmd!.uc2rest.task).toBe('/motor_act');
    expect(cmd!.can.index).toBe(0x6062);
    expect(cmd!.can.subindex).toBe(1);
  });

  it('returns null for a DOF that is not actuatable', () => {
    expect(firmwareCommand({ ...tiltX, actuatable: false }, 1)).toBeNull();
  });

  it('returns null for an actuatable DOF with no firmware binding', () => {
    expect(firmwareCommand({ ...tiltX, canObject: null }, 1)).toBeNull();
  });
});
