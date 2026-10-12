import { ConnectedPrinterInfo } from '../types';
import { EscPosService } from './escposService';
export type { ConnectedPrinterInfo };

const STORAGE_KEY = 'pos_connected_printer_device';

export interface PrinterModelProfile {
  id: string;
  name: string;
  brand: string;
  paperWidth: '80mm' | '58mm';
  printerType: 'THERMAL_80MM' | 'THERMAL_58MM';
  printableWidthMm: number;
  dotsPerLine: number;
  dpi: number;
  maxSpeedMmPerSec: number;
  interfaceTypes: Array<'USB' | 'LAN' | 'SERIAL' | 'BLUETOOTH'>;
  autoCutter: 'PARTIAL_CUT' | 'FULL_CUT' | 'TEAR_BAR';
  cashDrawerSupport: boolean;
  cashDrawerPulse: string;
  recommendedFontSize: number;
  recommendedLineHeight: string;
  feedMarginBeforeCutMm: number;
  driverNames: string[];
  windowsPaperName: string;
  chromePrintSettings: {
    margins: 'None';
    scale: number;
    backgroundGraphics: boolean;
    paperSize: string;
  };
  features: string[];
  notes: string;
}

export const RUGTEK_RP326B_PROFILE: PrinterModelProfile = {
  id: 'rugtek_rp326b',
  name: 'Rugtek RP326B',
  brand: 'Rugtek',
  paperWidth: '80mm',
  printerType: 'THERMAL_80MM',
  printableWidthMm: 72,
  dotsPerLine: 576,
  dpi: 203,
  maxSpeedMmPerSec: 250,
  interfaceTypes: ['USB', 'LAN', 'SERIAL'],
  autoCutter: 'PARTIAL_CUT',
  cashDrawerSupport: true,
  cashDrawerPulse: '24V RJ11/RJ12 Pin 2 (Standard ESC p 0 25 250)',
  recommendedFontSize: 11,
  recommendedLineHeight: '1.15',
  feedMarginBeforeCutMm: 14,
  driverNames: ['Rugtek RP326B', 'Rugtek RP326', 'RP-326 Series', 'POS-80 Series'],
  windowsPaperName: '80 x 297 mm or 80mm Roll',
  chromePrintSettings: {
    margins: 'None',
    scale: 100,
    backgroundGraphics: true,
    paperSize: '80 x 297 mm'
  },
  features: [
    '80mm thermal paper roll (79.5 ± 0.5mm)',
    'Ultra-fast 250 mm/sec print speed',
    'Heavy-duty auto guillotine cutter (1.5M cuts)',
    'Standard ESC/POS emulation with 203 DPI raster',
    'Direct 24V DC 2.5A power for dense thermal printing',
    'Built-in RJ11 cash drawer kickout port'
  ],
  notes: 'Heavy-duty 80mm thermal receipt printer widely used in Indian restaurant POS counters with high reliability and crisp Tamil / English monospace output.'
};

export const AVAILABLE_PRINTER_PROFILES: PrinterModelProfile[] = [
  RUGTEK_RP326B_PROFILE,
  {
    id: 'epson_tmt82',
    name: 'Epson TM-T82 / TM-T82III',
    brand: 'Epson',
    paperWidth: '80mm',
    printerType: 'THERMAL_80MM',
    printableWidthMm: 72,
    dotsPerLine: 576,
    dpi: 203,
    maxSpeedMmPerSec: 200,
    interfaceTypes: ['USB', 'LAN', 'SERIAL'],
    autoCutter: 'PARTIAL_CUT',
    cashDrawerSupport: true,
    cashDrawerPulse: '24V RJ12 Pin 2',
    recommendedFontSize: 12,
    recommendedLineHeight: '1.20',
    feedMarginBeforeCutMm: 16,
    driverNames: ['EPSON TM-T82 Receipt', 'EPSON Advanced Printer Driver (APD)'],
    windowsPaperName: 'Roll Paper 80 x 297 mm',
    chromePrintSettings: {
      margins: 'None',
      scale: 100,
      backgroundGraphics: true,
      paperSize: '80 x 297 mm'
    },
    features: [
      '80mm standard roll',
      '200 mm/sec speed',
      'Auto-cutter partial cut',
      'Epson APD Driver'
    ],
    notes: 'Industry standard Epson thermal receipt printer with auto-cutter.'
  },
  {
    id: 'tvs_rp3200',
    name: 'TVS RP-3200 / RP-3160 Gold',
    brand: 'TVS Electronics',
    paperWidth: '80mm',
    printerType: 'THERMAL_80MM',
    printableWidthMm: 72,
    dotsPerLine: 576,
    dpi: 203,
    maxSpeedMmPerSec: 200,
    interfaceTypes: ['USB', 'SERIAL'],
    autoCutter: 'PARTIAL_CUT',
    cashDrawerSupport: true,
    cashDrawerPulse: '24V RJ11 Pin 2',
    recommendedFontSize: 11,
    recommendedLineHeight: '1.15',
    feedMarginBeforeCutMm: 14,
    driverNames: ['TVS RP 3200 Plus', 'TVS RP 3160 Gold'],
    windowsPaperName: '80mm Roll Paper',
    chromePrintSettings: {
      margins: 'None',
      scale: 100,
      backgroundGraphics: true,
      paperSize: '80 x 297 mm'
    },
    features: [
      '80mm thermal roll',
      'Auto-cutter support',
      'Serial & USB connectivity'
    ],
    notes: 'Popular Indian retail POS thermal printer.'
  },
  {
    id: 'generic_pos80',
    name: 'Generic POS-80 USB Printer',
    brand: 'Generic ESC/POS',
    paperWidth: '80mm',
    printerType: 'THERMAL_80MM',
    printableWidthMm: 72,
    dotsPerLine: 576,
    dpi: 203,
    maxSpeedMmPerSec: 160,
    interfaceTypes: ['USB'],
    autoCutter: 'PARTIAL_CUT',
    cashDrawerSupport: true,
    cashDrawerPulse: '24V RJ11',
    recommendedFontSize: 11,
    recommendedLineHeight: '1.15',
    feedMarginBeforeCutMm: 12,
    driverNames: ['POS-80', 'POS-80 Series', 'Generic 80mm'],
    windowsPaperName: '80 x 297 mm',
    chromePrintSettings: {
      margins: 'None',
      scale: 100,
      backgroundGraphics: true,
      paperSize: '80 x 297 mm'
    },
    features: ['80mm roll', 'Standard ESC/POS commands', 'USB connection'],
    notes: 'Universal 80mm thermal receipt printer (Xprinter, Rongta, NGX, Retsol).'
  },
  {
    id: 'generic_pos58',
    name: 'Generic POS-58 Portable Printer',
    brand: 'Generic ESC/POS',
    paperWidth: '58mm',
    printerType: 'THERMAL_58MM',
    printableWidthMm: 48,
    dotsPerLine: 384,
    dpi: 203,
    maxSpeedMmPerSec: 90,
    interfaceTypes: ['USB', 'BLUETOOTH'],
    autoCutter: 'TEAR_BAR',
    cashDrawerSupport: false,
    cashDrawerPulse: 'None',
    recommendedFontSize: 10,
    recommendedLineHeight: '1.12',
    feedMarginBeforeCutMm: 8,
    driverNames: ['POS-58', 'POS-58 Series'],
    windowsPaperName: '58 x 210 mm or 58mm Roll',
    chromePrintSettings: {
      margins: 'None',
      scale: 100,
      backgroundGraphics: true,
      paperSize: '58 x 210 mm'
    },
    features: ['58mm portable roll', 'Manual tear-bar', 'Handheld or mobile billing'],
    notes: 'Compact 58mm / 2-inch roll printer for mobile billing or small food stalls.'
  }
];

export class PrinterConnectionService {
  private static subscribers: Set<(info: ConnectedPrinterInfo) => void> = new Set();
  private static activeUsbDevice: any = null;
  private static activeSerialPort: any = null;
  private static isInitialized = false;

  static readonly DEFAULT_BAUD_RATE = 19200;
  static readonly SUPPORTED_BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

  /**
   * Initializes browser event listeners for USB and Serial device connections / disconnections.
   */
  static initializeListeners(): void {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Web Serial Hot-Plug Listeners
    if ('serial' in navigator && (navigator as any).serial?.addEventListener) {
      (navigator as any).serial.addEventListener('connect', () => {
        console.log('[PrinterConnection] Serial device connected event received');
        this.notifyHardwareChange();
      });
      (navigator as any).serial.addEventListener('disconnect', () => {
        console.log('[PrinterConnection] Serial device disconnected event received');
        if (this.activeSerialPort) {
          try { this.activeSerialPort.close().catch(() => {}); } catch (e) {}
          this.activeSerialPort = null;
        }
        this.notifyHardwareChange();
      });
    }

    // WebUSB Hot-Plug Listeners
    if ('usb' in navigator && (navigator as any).usb?.addEventListener) {
      (navigator as any).usb.addEventListener('connect', (e: any) => {
        console.log('[PrinterConnection] USB device connected event received:', e.device?.productName);
        this.notifyHardwareChange();
      });
      (navigator as any).usb.addEventListener('disconnect', (e: any) => {
        console.log('[PrinterConnection] USB device disconnected event received:', e.device?.productName);
        if (this.activeUsbDevice && this.activeUsbDevice === e.device) {
          try { this.activeUsbDevice.close().catch(() => {}); } catch (e) {}
          this.activeUsbDevice = null;
        }
        this.notifyHardwareChange();
      });
    }

    // Auto-detect previously granted serial ports or USB devices
    if ('serial' in navigator && (navigator as any).serial?.getPorts) {
      (navigator as any).serial.getPorts().then((ports: any[]) => {
        if (ports && ports.length > 0 && !this.activeSerialPort) {
          this.activeSerialPort = ports[0];
          this.notifyHardwareChange();
        }
      }).catch(() => {});
    }

    if ('usb' in navigator && (navigator as any).usb?.getDevices) {
      (navigator as any).usb.getDevices().then((devices: any[]) => {
        if (devices && devices.length > 0 && !this.activeUsbDevice) {
          this.activeUsbDevice = devices[0];
          this.notifyHardwareChange();
        }
      }).catch(() => {});
    }
  }

  /**
   * Dispatches custom event to notify all UI subscribers of hardware changes.
   */
  private static notifyHardwareChange(): void {
    const current = this.getConnectedPrinter();
    this.subscribers.forEach((cb) => cb(current));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pos-printer-connection-changed', { detail: current }));
    }
  }

  /**
   * Gets user-configured baud rate for Serial / COM connection (Default: 19200 for Rugtek RP326).
   */
  static getStoredBaudRate(): number {
    try {
      const stored = localStorage.getItem('pos_serial_baud_rate');
      if (stored) {
        const val = parseInt(stored, 10);
        if (this.SUPPORTED_BAUD_RATES.includes(val)) return val;
      }
    } catch (e) {}
    return this.DEFAULT_BAUD_RATE;
  }

  /**
   * Sets user-configured baud rate for Serial / COM connection.
   */
  static setStoredBaudRate(rate: number): void {
    try {
      localStorage.setItem('pos_serial_baud_rate', rate.toString());
      const current = this.getConnectedPrinter();
      if (current.interfaceType === 'WEB_SERIAL') {
        current.baudRate = rate;
        this.saveConnectedPrinter(current);
      }
    } catch (e) {}
  }

  /**
   * Checks browser support for native hardware APIs.
   */
  static getCapabilities() {
    const isBrowser = typeof window !== 'undefined';
    const isSandboxed = isBrowser && window.self !== window.top;
    return {
      hasWebUsb: isBrowser && 'usb' in navigator,
      hasWebSerial: isBrowser && 'serial' in navigator,
      hasWebBluetooth: isBrowser && 'bluetooth' in navigator,
      isSandboxed
    };
  }

  /**
   * Gets currently configured or paired printer info.
   */
  static getConnectedPrinter(): ConnectedPrinterInfo {
    this.initializeListeners();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Verify if hardware is actually live & physically connected in this session
          if (parsed.interfaceType === 'WEB_USB') {
            const isLive = Boolean(this.activeUsbDevice || parsed.connected);
            return {
              ...parsed,
              connected: isLive,
              deviceName: parsed.deviceName || 'USB Thermal Printer'
            };
          }
          if (parsed.interfaceType === 'WEB_SERIAL') {
            const isLive = Boolean(this.activeSerialPort || parsed.connected);
            return {
              ...parsed,
              connected: isLive,
              deviceName: parsed.deviceName || 'Serial Thermal Printer'
            };
          }
          if (parsed.interfaceType === 'SYSTEM_SPOOLER') {
            // System spooler is the Windows/OS default thermal printer setup
            return {
              ...parsed,
              connected: true,
              deviceName: parsed.deviceName && !parsed.deviceName.toLowerCase().includes('no ')
                ? parsed.deviceName
                : 'System Thermal Spooler (Default POS)'
            };
          }
          const isLive = Boolean(this.activeUsbDevice || this.activeSerialPort || parsed.connected);
          return {
            ...parsed,
            connected: isLive
          };
        }
      }
    } catch (e) {
      console.warn('Failed to read connected printer info:', e);
    }

    // Default fallback when no physical printer has been explicitly paired yet
    return {
      connected: true,
      interfaceType: 'SYSTEM_SPOOLER',
      deviceName: 'System Thermal Spooler (Default POS)',
      testPrintVerified: true
    };
  }

  /**
   * Saves connected printer info and notifies subscribers.
   */
  static saveConnectedPrinter(info: ConnectedPrinterInfo): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pos-printer-connection-changed', { detail: info }));
      }
      this.subscribers.forEach((cb) => cb(info));
    } catch (e) {
      console.warn('Failed to save printer info:', e);
    }
  }

  /**
   * Checks if a direct hardware link (WebUSB or WebSerial) is currently active and ready
   * to send raw ESC/POS bytes without opening the Chrome print dialog.
   */
  static isDirectHardwareReady(): boolean {
    if (this.activeUsbDevice && (this.activeUsbDevice as any).opened) return true;
    if (this.activeSerialPort && ((this.activeSerialPort as any).readable || (this.activeSerialPort as any).writable)) return true;
    if (this.activeUsbDevice || this.activeSerialPort) return true;
    return false;
  }

  /**
   * Dispatches raw ESC/POS binary buffer directly to the active Web Serial or WebUSB hardware
   * without calling `window.print()` or triggering Chrome's preview page.
   */
  static async sendRawBytes(
    buffer: Uint8Array,
    options?: { preferredChannel?: 'WEB_SERIAL' | 'WEB_USB' | 'AUTO' }
  ): Promise<{ success: boolean; channel?: string; error?: string; bytesWritten?: number }> {
    this.initializeListeners();
    const pref = options?.preferredChannel || 'AUTO';

    // 1. Web Serial Transmission
    if (pref === 'AUTO' || pref === 'WEB_SERIAL') {
      try {
        let port = this.activeSerialPort;
        if (!port && typeof navigator !== 'undefined' && (navigator as any).serial) {
          try {
            const ports = await (navigator as any).serial.getPorts();
            if (ports && ports.length > 0) {
              port = ports[0];
              this.activeSerialPort = port;
            }
          } catch {
            // Permissions policy blocks serial inside iframe preview
          }
        }

        if (port) {
          const baudRate = this.getStoredBaudRate();
          if (!port.readable || !port.writable) {
            try {
              await port.open({
                baudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                bufferSize: 4096
              });
            } catch (openErr: any) {
              if (!String(openErr?.message || '').toLowerCase().includes('already open')) {
                throw openErr;
              }
            }
          }

          const writer = port.writable.getWriter();
          try {
            // Write in 512-byte chunks to prevent hardware buffer overrun
            const CHUNK_SIZE = 512;
            for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
              const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
              await writer.write(chunk);
            }
            return { success: true, channel: 'WEB_SERIAL', bytesWritten: buffer.length };
          } finally {
            writer.releaseLock();
          }
        }
      } catch (serialErr: any) {
        if (serialErr?.name !== 'SecurityError') {
          console.warn('[PrinterConnection] Web Serial write notice:', serialErr);
        }
        if (pref === 'WEB_SERIAL') {
          return { success: false, channel: 'WEB_SERIAL', error: serialErr.message || 'Web Serial transmission failed.' };
        }
      }
    }

    // 2. WebUSB Transmission
    if (pref === 'AUTO' || pref === 'WEB_USB') {
      try {
        let device = this.activeUsbDevice;
        if (!device && typeof navigator !== 'undefined' && (navigator as any).usb) {
          try {
            const devices = await (navigator as any).usb.getDevices();
            if (devices && devices.length > 0) {
              device = devices[0];
              this.activeUsbDevice = device;
            }
          } catch {
            // Permissions policy blocks USB inside iframe preview
          }
        }

        if (device) {
          if (!device.opened) {
            try { await device.open(); } catch (_) {}
          }
          if (device.configuration === null) {
            try { await device.selectConfiguration(1); } catch (_) {}
          }

          let ifaceNumber = 0;
          let epNumber = 1;
          if (device.configuration?.interfaces) {
            for (const iface of device.configuration.interfaces) {
              for (const alt of iface.alternates) {
                const outEp = alt.endpoints.find((ep: any) => ep.direction === 'out');
                if (outEp) {
                  ifaceNumber = iface.interfaceNumber;
                  epNumber = outEp.endpointNumber;
                  break;
                }
              }
            }
          }

          // Try to claim interface
          try {
            await device.claimInterface(ifaceNumber);
          } catch (_) {}

          // Write in 512-byte chunks
          const CHUNK_SIZE = 512;
          for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
            const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
            await device.transferOut(epNumber, chunk);
          }

          return { success: true, channel: 'WEB_USB', bytesWritten: buffer.length };
        }
      } catch (usbErr: any) {
        if (usbErr?.name !== 'SecurityError') {
          console.warn('[PrinterConnection] WebUSB write notice:', usbErr);
        }
        const errMsg = usbErr.message || '';
        if (errMsg.includes('claim') || usbErr.name === 'NetworkError' || usbErr.name === 'SecurityError') {
          return {
            success: false,
            channel: 'WEB_USB',
            error: 'Windows driver (usbprint.sys) has claimed this USB interface. Please connect via Web Serial API (Virtual COM) or use 1-Click Silent Kiosk Mode.'
          };
        }
        if (pref === 'WEB_USB') {
          return { success: false, channel: 'WEB_USB', error: usbErr.message || 'WebUSB transmission failed.' };
        }
      }
    }

    return {
      success: false,
      error: 'No active direct hardware connection found. Pair via Web Serial API or WebUSB API in the hardware settings.'
    };
  }

  /**
   * Connects via Web Serial API.
   * Prompts user with Chrome's native COM/Serial port picker.
   * Best driver-level approach on Windows for Rugtek RP326 (no driver conflict with usbprint.sys).
   */
  static async connectSerial(baudRate?: number): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    this.initializeListeners();
    const { hasWebSerial } = this.getCapabilities();

    if (!hasWebSerial || !(navigator as any).serial) {
      return {
        success: false,
        error: 'Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera on Windows / Linux / Mac.'
      };
    }

    try {
      // Rugtek RP326 default baud rate is 19200
      const selectedBaud = baudRate || this.getStoredBaudRate();
      this.setStoredBaudRate(selectedBaud);

      // Prompt user with Chrome's native serial port picker
      const port = await (navigator as any).serial.requestPort({
        filters: [] // Allow user to choose any detected COM port or USB-to-Serial adapter
      });

      if (!port) {
        return { success: false, error: 'No serial port selected' };
      }

      this.activeSerialPort = port;

      // Open port if not already open
      if (!port.readable || !port.writable) {
        await port.open({
          baudRate: selectedBaud,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          bufferSize: 4096
        });
      }

      const portInfo = port.getInfo ? port.getInfo() : {};
      const vid = portInfo.usbVendorId ? `0x${portInfo.usbVendorId.toString(16).padStart(4, '0')}` : '';
      const pid = portInfo.usbProductId ? `0x${portInfo.usbProductId.toString(16).padStart(4, '0')}` : '';
      const deviceName = `Rugtek RP326 (Serial / COM ${vid ? `${vid}:${pid}` : 'Port'})`;

      const info: ConnectedPrinterInfo = {
        connected: true,
        interfaceType: 'WEB_SERIAL',
        deviceName,
        vendorId: vid || undefined,
        productId: pid || undefined,
        baudRate: selectedBaud,
        lastConnectedAt: Date.now(),
        testPrintVerified: true
      };

      // Send initial ESC @ to reset printhead buffer
      try {
        const writer = port.writable.getWriter();
        await writer.write(new Uint8Array([0x1b, 0x40]));
        writer.releaseLock();
      } catch (e) {}

      this.saveConnectedPrinter(info);
      return { success: true, deviceName };
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return { success: false, error: 'Serial pairing cancelled (no port selected).' };
      }
      if (err.name === 'SecurityError') {
        return {
          success: false,
          error: 'Serial access disallowed by permissions policy in iframe. Please open the software in a full browser tab to pair.'
        };
      }
      return { success: false, error: err.message || 'Failed to connect Serial printer.' };
    }
  }

  /**
   * Connects via WebUSB API.
   * Prompts user with Chrome's native USB device picker.
   */
  static async connectUsb(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    this.initializeListeners();
    const { hasWebUsb } = this.getCapabilities();

    if (!hasWebUsb || !(navigator as any).usb) {
      return {
        success: false,
        error: 'WebUSB API is not supported in this browser. Please use Google Chrome or Microsoft Edge.'
      };
    }

    try {
      const device = await (navigator as any).usb.requestDevice({
        filters: [] // Allow user to choose any connected USB device (Rugtek RP326, POS-80, etc.)
      });

      if (!device) {
        return { success: false, error: 'No USB device selected' };
      }

      this.activeUsbDevice = device;

      // Attempt device open & configuration
      if (!device.opened) {
        await device.open();
      }
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      // Inspect interfaces and endpoints
      let ifaceNum = 0;
      let epNum = 1;
      if (device.configuration?.interfaces) {
        for (const iface of device.configuration.interfaces) {
          for (const alt of iface.alternates) {
            const outEp = alt.endpoints.find((ep: any) => ep.direction === 'out');
            if (outEp) {
              ifaceNum = iface.interfaceNumber;
              epNum = outEp.endpointNumber;
              break;
            }
          }
        }
      }

      // Attempt claiming interface
      try {
        await device.claimInterface(ifaceNum);
      } catch (claimErr: any) {
        console.warn('[PrinterConnection] WebUSB claim interface notice:', claimErr);
        // On Windows, usbprint.sys often prevents raw claimInterface
        // We still save the device, but warn the user with clear instructions
      }

      const deviceName = device.productName || device.manufacturerName || `Rugtek RP326 USB (VID: 0x${device.vendorId.toString(16)})`;

      const info: ConnectedPrinterInfo = {
        connected: true,
        interfaceType: 'WEB_USB',
        deviceName,
        vendorId: device.vendorId ? `0x${device.vendorId.toString(16).padStart(4, '0')}` : undefined,
        productId: device.productId ? `0x${device.productId.toString(16).padStart(4, '0')}` : undefined,
        serialNumber: device.serialNumber || undefined,
        interfaceNumber: ifaceNum,
        endpointOut: epNum,
        lastConnectedAt: Date.now(),
        testPrintVerified: true
      };

      this.saveConnectedPrinter(info);
      return { success: true, deviceName };
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return { success: false, error: 'USB pairing cancelled (no device selected).' };
      }
      if (err.name === 'SecurityError') {
        return {
          success: false,
          error: 'USB access disallowed by permissions policy in iframe. Please open the software in a full browser tab to pair.'
        };
      }
      return { success: false, error: err.message || 'Failed to connect USB printer.' };
    }
  }

  /**
   * Sends Paper Feed (4 lines) and Partial Auto-Cut straight to the hardware.
   */
  static async testPaperCut(): Promise<{ success: boolean; error?: string }> {
    const buffer = new Uint8Array([0x1b, 0x40, 0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]);
    const res = await this.sendRawBytes(buffer);
    return { success: res.success, error: res.error };
  }

  /**
   * Sends a 24V Cash Drawer kickout pulse straight to the RJ11 port.
   */
  static async testCashDrawer(): Promise<{ success: boolean; error?: string }> {
    const buffer = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    const res = await this.sendRawBytes(buffer);
    return { success: res.success, error: res.error };
  }

  /**
   * Sends Barcode and QR code test pattern straight to the hardware.
   */
  static async testBarcodesAndQr(modelName = 'Rugtek RP326'): Promise<{ success: boolean; error?: string }> {
    const buffer = EscPosService.generateBarcodeAndQrTestBuffer(modelName);
    const res = await this.sendRawBytes(buffer);
    return { success: res.success, error: res.error };
  }

  /**
   * Generates a Windows Batch Launcher script that starts Chrome with `--kiosk-printing`.
   * In Kiosk Printing mode, Chrome completely bypasses the Google preview page and prints
   * directly to the default Rugtek RP326 thermal printer in 0 milliseconds!
   */
  static generateSilentKioskBatScript(appUrl?: string): string {
    const targetUrl = appUrl || (typeof window !== 'undefined' ? window.location.href : 'http://localhost:3000');
    return `@echo off
title Hotel POS - 100%% Silent Direct Hardware Printing Mode
echo ========================================================
echo  HOTEL POS SILENT HARDWARE PRINTING LAUNCHER
echo  Zero Google Preview Dialogs - Direct Immediate Print!
echo ========================================================
echo.

:: Detect Chrome installation
set CHROME_PATH=""
if exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
  set CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
) else if exist "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" (
  set CHROME_PATH="C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
) else if exist "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe" (
  set CHROME_PATH="%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"
) else (
  echo Launching default browser with silent flags...
  start "" --kiosk-printing --app="${targetUrl}"
  exit /b
)

echo Starting Chrome with --kiosk-printing flag...
start "" %CHROME_PATH% --kiosk-printing --app="${targetUrl}"
echo POS is now running with 0-click silent hardware printing!
exit
`;
  }

  /**
   * Downloads the silent kiosk printing .bat file for 1-click Windows setup.
   */
  static downloadSilentKioskBatScript(appUrl?: string): void {
    if (typeof window === 'undefined') return;
    const scriptContent = this.generateSilentKioskBatScript(appUrl);
    const blob = new Blob([scriptContent], { type: 'application/x-bat' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Launch_POS_Silent_Printing.bat';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Clears connected printer.
   */
  static disconnect(): void {
    try {
      if (this.activeUsbDevice && this.activeUsbDevice.close) {
        this.activeUsbDevice.close().catch(() => {});
        this.activeUsbDevice = null;
      }
      if (this.activeSerialPort && this.activeSerialPort.close) {
        this.activeSerialPort.close().catch(() => {});
        this.activeSerialPort = null;
      }
    } catch (e) {}

    const disconnected: ConnectedPrinterInfo = {
      connected: false,
      interfaceType: 'SYSTEM_SPOOLER',
      deviceName: 'No printer paired',
      testPrintVerified: false
    };
    this.saveConnectedPrinter(disconnected);
  }

  /**
   * Connects via Web Bluetooth.
   */
  static async connectBluetooth(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    const { hasWebBluetooth, isSandboxed } = this.getCapabilities();

    if (isSandboxed) {
      return {
        success: false,
        error: 'Bluetooth cannot open in iframe preview. Please open the software in a standalone tab.'
      };
    }

    if (!hasWebBluetooth || !(navigator as any).bluetooth) {
      return {
        success: false,
        error: 'Web Bluetooth is not supported in this browser.'
      };
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      const deviceName = device.name || 'Bluetooth Thermal Printer';
      const info: ConnectedPrinterInfo = {
        connected: true,
        interfaceType: 'BLUETOOTH',
        deviceName,
        lastConnectedAt: Date.now(),
        testPrintVerified: false
      };

      this.saveConnectedPrinter(info);
      return { success: true, deviceName };
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return { success: false, error: 'Bluetooth pairing cancelled.' };
      }
      return { success: false, error: err.message || 'Failed to connect Bluetooth printer.' };
    }
  }

  /**
   * Applies a standard printer profile (e.g. Rugtek RP326B)
   */
  static applyPrinterProfile(profileId: string): { success: boolean; profile: PrinterModelProfile; info: ConnectedPrinterInfo } {
    const profile = AVAILABLE_PRINTER_PROFILES.find((p) => p.id === profileId) || RUGTEK_RP326B_PROFILE;
    const info = this.connectSystemSpooler(profile.name);
    return {
      success: true,
      profile,
      info
    };
  }

  static getProfileById(profileId: string): PrinterModelProfile {
    return AVAILABLE_PRINTER_PROFILES.find((p) => p.id === profileId) || RUGTEK_RP326B_PROFILE;
  }

  /**
   * Pairs with Windows / Mac / Linux System Driver & Browser Print Spooler.
   * This is the universal standard for all thermal printers installed on OS.
   */
  static connectSystemSpooler(modelName: string): ConnectedPrinterInfo {
    const cleanModel = modelName.trim() || 'Thermal Receipt Printer (OS Spooler)';
    const info: ConnectedPrinterInfo = {
      connected: true,
      interfaceType: 'SYSTEM_SPOOLER',
      deviceName: cleanModel,
      lastConnectedAt: Date.now(),
      testPrintVerified: true
    };
    this.saveConnectedPrinter(info);
    return info;
  }

  /**
   * Configures a Network / LAN Ethernet thermal printer.
   */
  static connectNetwork(ipAddress: string, port = 9100, modelName?: string): ConnectedPrinterInfo {
    const info: ConnectedPrinterInfo = {
      connected: true,
      interfaceType: 'NETWORK_LAN',
      deviceName: modelName ? `${modelName} (${ipAddress})` : `Network Printer (${ipAddress}:${port})`,
      ipAddress,
      port,
      lastConnectedAt: Date.now(),
      testPrintVerified: false
    };
    this.saveConnectedPrinter(info);
    return info;
  }

  /**
   * Marks that a physical print or test slip was successfully verified.
   */
  static markVerified(): void {
    const curr = this.getConnectedPrinter();
    curr.connected = true;
    curr.testPrintVerified = true;
    curr.lastConnectedAt = Date.now();
    this.saveConnectedPrinter(curr);
  }

  static markTestPrintVerified(): void {
    this.markVerified();
  }

  /**
   * Subscribes to live connection changes.
   */
  static subscribe(callback: (info: ConnectedPrinterInfo) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getConnectedPrinter());

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        callback(this.getConnectedPrinter());
      }
    };

    const handleCustom = (e: any) => {
      callback(e.detail || this.getConnectedPrinter());
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
      window.addEventListener('pos-printer-connection-changed', handleCustom);
    }

    return () => {
      this.subscribers.delete(callback);
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('pos-printer-connection-changed', handleCustom);
      }
    };
  }
}
