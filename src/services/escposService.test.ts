import { describe, it, expect } from 'vitest';
import { EscPosService } from './escposService';

describe('EscPosService', () => {
  it('generates a valid raw ESC/POS binary buffer with proper initialization and cut commands', () => {
    const buffer = EscPosService.generateDiagnosticEscPosBuffer({
      modelName: 'Rugtek RP326B',
      paperWidth: '80mm',
      includeCutter: true
    });

    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(100);

    // Initial ESC @ command (0x1B 0x40)
    expect(buffer[0]).toBe(0x1b);
    expect(buffer[1]).toBe(0x40);

    // Code page select ESC t 0 (0x1B 0x74 0x00)
    expect(buffer[2]).toBe(0x1b);
    expect(buffer[3]).toBe(0x74);
    expect(buffer[4]).toBe(0x00);

    // Partial Cut command at end (GS V 66 0 => 0x1D 0x56 0x42 0x00)
    const len = buffer.length;
    expect(buffer[len - 4]).toBe(0x1d);
    expect(buffer[len - 3]).toBe(0x56);
    expect(buffer[len - 2]).toBe(0x42);
    expect(buffer[len - 1]).toBe(0x00);
  });

  it('verifies character set contents and attributes inside the buffer', () => {
    const buffer = EscPosService.generateDiagnosticEscPosBuffer({
      modelName: 'Rugtek RP326B',
      paperWidth: '80mm'
    });

    const text = new TextDecoder('ascii').decode(buffer);

    // Check uppercase & lowercase character sets
    expect(text).toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(text).toContain('abcdefghijklmnopqrstuvwxyz');
    expect(text).toContain('0123456789');

    // Check hardware handshake indicator
    expect(text).toContain('HARDWARE HANDSHAKE: PASS');
    expect(text).toContain('window.print() Skipped');
  });

  it('formats buffer into readable hex dump', () => {
    const buffer = new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0x01, 0x48, 0x69]);
    const hexDump = EscPosService.formatBufferAsHexDump(buffer);

    expect(hexDump).toContain('0000:');
    expect(hexDump).toContain('1B 40 1B 61 01 48 69');
  });

  it('analyzes buffer and extracts recognized ESC/POS commands', () => {
    const buffer = EscPosService.generateDiagnosticEscPosBuffer({
      modelName: 'Rugtek RP326B'
    });

    const analysis = EscPosService.analyzeBuffer(buffer);
    expect(analysis.totalBytes).toBe(buffer.length);
    expect(analysis.commands.some((c) => c.name === 'Initialize')).toBe(true);
    expect(analysis.commands.some((c) => c.name === 'Code Table')).toBe(true);
    expect(analysis.commands.some((c) => c.name === 'Bold / Emphasize')).toBe(true);
    expect(analysis.commands.some((c) => c.name === 'Cut Paper')).toBe(true);
    expect(analysis.characterSetsTested.length).toBeGreaterThan(0);
  });

  it('executes simulation fallback cleanly without throwing errors', async () => {
    const buffer = EscPosService.generateDiagnosticEscPosBuffer();
    const result = await EscPosService.sendRawBuffer(buffer, 'AUTO');

    expect(result.success).toBe(true);
    expect(result.handshakeVerified).toBe(true);
    expect(result.characterSetVerified).toBe(true);
    expect(result.bytesSent).toBe(buffer.length);
  });

  it('generates an ultra-compact 3-inch KOT ESC/POS buffer with 2 columns and non-overlapping wrapped item names', () => {
    const kot = {
      id: 'kot-10',
      kotNumber: 'KOT-10',
      businessDate: '2026-11-02',
      orderType: 'DINE_IN' as const,
      tableNumber: 'T-4',
      waiterId: 'w1',
      waiterName: 'Kumar',
      status: 'OPEN' as const,
      itemsCount: 2,
      createdBy: 'Kumar',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const items = [
      {
        id: 'ki-1',
        kotId: 'kot-10',
        itemId: 'm1',
        itemCode: '101',
        itemName: 'Special Chettinad Mushroom Masala Roast Dosa With Extra Ghee',
        quantity: 3,
        priceType: 'NON_AC' as const,
        unitPrice: 140,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const buffer = EscPosService.generateKotEscPosBuffer(kot, items);
    const text = new TextDecoder('ascii').decode(buffer);

    expect(text).toContain('KOT: KOT-10');
    expect(text).toContain('QTY  ITEM');
    expect(text).toContain('------------------------');
    expect(text).toContain('3    Special Chettinad Mushroom Masala');
    expect(text).toContain('     Roast Dosa With Extra Ghee');
    expect(text).not.toContain('140');
    expect(text).not.toContain('Table:');
  });
});
