import { useState, useEffect, useRef } from 'react';
import { PrinterStatusService, PrinterHealthCheck } from '../services/printerStatusService';
import { RestaurantSettings } from '../types';

export function usePrinterStatus(settings?: RestaurantSettings): {
  health: PrinterHealthCheck;
  runTestPrint: () => { success: boolean; restrictedInIframe?: boolean; error?: string };
  refresh: () => void;
} {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [health, setHealth] = useState<PrinterHealthCheck>(() => 
    PrinterStatusService.getHealthCheck(settings)
  );

  useEffect(() => {
    const unsub = PrinterStatusService.subscribe((latest) => {
      setHealth((prev) => {
        if (
          prev.status === latest.status &&
          prev.isReady === latest.isReady &&
          prev.label === latest.label &&
          prev.connectedInfo?.connected === latest.connectedInfo?.connected
        ) {
          return prev;
        }
        return latest;
      });
    });
    return unsub;
  }, []);

  const runTestPrint = () => {
    const res = PrinterStatusService.testPrint(settingsRef.current);
    // Refresh health after test run
    setHealth(PrinterStatusService.getHealthCheck(settingsRef.current));
    return res;
  };

  const refresh = () => {
    setHealth(PrinterStatusService.getHealthCheck(settingsRef.current));
  };

  return { health, runTestPrint, refresh };
}
