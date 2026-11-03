export type UserRole = 'admin' | 'owner' | 'manager' | 'waiter' | 'ADMIN' | 'OWNER' | 'MANAGER' | 'WAITER';

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  username?: string;
  pin?: string;
  pinHash?: string;
  roleId: string;
  active: boolean;
  fullAccess?: boolean;
  permissions?: string[];
  failedLoginAttempts?: number;
  lockedUntil?: number;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
}

export type User = AppUser;

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  active: boolean;
}

export interface Category {
  id: string;
  categoryCode?: string;
  categoryName?: string;
  name?: string;
  displayOrder?: number;
  description?: string;
  startTime?: string;
  endTime?: string;
  active: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface MenuItem {
  id: string;
  itemCode: string;
  categoryIds?: string[];
  categoryNames?: string[];
  categoryId?: string;
  categoryName?: string;
  itemName: string;
  itemNameEnglish?: string;
  itemNameTamil?: string;
  description?: string;
  imageUrl?: string;
  acPrice: number;
  nonAcPrice: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PriceType = 'NON_AC' | 'AC';
export type OrderType = 'DINE_IN' | 'TAKE_AWAY';

export type KotStatus = 'OPEN' | 'SENT' | 'PREPARING' | 'READY' | 'COMPLETED' | 'BILLED' | 'CANCELLED';
export type KotPrintStatus = 'PENDING' | 'PRINTED';
export type KotItemStatus = 'PENDING' | 'PREPARING' | 'SERVED';

export interface KotItem {
  id: string;
  kotId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemNameTamil?: string;
  quantity: number;
  priceType: PriceType;
  unitPrice?: number;
  notes?: string;
  status?: KotItemStatus;
  printStatus?: KotPrintStatus;
  printedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Kot {
  id: string;
  kotNumber: string;
  businessDate: string;
  orderType: OrderType;
  tableNumber: string;
  waiterId: string;
  waiterName?: string;
  status: KotStatus;
  printStatus?: KotPrintStatus;
  printedAt?: number;
  printCount?: number;
  items?: KotItem[];
  itemsCount?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type BillStatus = 'COMPLETED' | 'CANCELLED';

export interface BillItem {
  id: string;
  billId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemNameTamil?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceType: PriceType;
  businessDate?: string;
  createdAt: number;
}

export interface Bill {
  id: string;
  businessDate: string;
  billNumber: string;
  orderType: OrderType;
  priceType: PriceType;
  userId?: string;
  userName?: string;
  captainNumber?: string | number;
  waiterNumber?: string | number;
  kotId?: string;
  tableNumber?: string;
  subtotal: number;
  discount: number;
  grandTotal: number;
  paymentMethod?: string;
  paymentStatus?: string;
  status: BillStatus;
  reprintCount: number;
  lastReprintedAt?: number;
  lastReprintedBy?: string;
  cancelledBy?: string;
  cancelledAt?: number;
  cancelReason?: string;
  deviceId?: string;
  transactionId?: string;
  originalBillId?: string;
  replacementBillId?: string;
  replacesBillNumber?: string;
  isRebill?: boolean;
  items?: BillItem[];
  createdAt: number;
  updatedAt?: number;
}

export interface BusinessDay {
  businessDate: string;
  lastBillNumber: number;
  lastKotNumber: number;
  startedAt: number;
  isClosed: boolean;
}

export interface CountPurchaseRecord {
  id: string;
  date: string;
  quantity: number;
  unitPrice?: number;
  totalCost?: number;
  supplier?: string;
  invoiceNumber?: string;
  notes?: string;
  createdBy?: string;
  createdAt: number;
}

export interface CountMissingRecord {
  id: string;
  date: string;
  quantity: number;
  reason?: string;
  physicalCountFound?: number;
  expectedCount?: number;
  createdBy?: string;
  createdAt: number;
}

export interface InventoryItem {
  id: string;
  itemCode: string;
  itemName: string;
  itemNameTamil?: string;
  category?: string;
  categoryId?: string;
  unit: string;
  minimumStock: number;
  currentStock: number;
  active: boolean;

  // Simple count-based inventory tracking:
  // INITIAL STOCK → PURCHASED → SOLD → MISSING → REMAINING
  isCountBased?: boolean;
  isInitialized?: boolean;      // True once Initial Stock Count has been entered
  initialStock?: number;        // Entered ONCE when starting inventory. Never resets daily.
  purchasedCount?: number;      // Sum of all purchase entries
  soldCount?: number;           // Auto-calculated from completed bills (Direct, POS, KOT)
  missingCount?: number;        // Recorded physical missing quantity
  remainingCount?: number;      // Total Stock - Sold Count - Missing Count

  purchases?: CountPurchaseRecord[];
  missingLogs?: CountMissingRecord[];

  createdAt: number;
  updatedAt: number;
}

export type MovementType = 'OPENING' | 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'WASTAGE';

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  type: MovementType;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  createdBy: string;
  createdAt: number;
  notes?: string;
}

export type StockMovement = InventoryMovement;

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: number;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  invoiceNumber: string;
  supplierName: string;
  date: string;
  totalAmount: number;
  notes?: string;
  items?: PurchaseItem[];
  createdBy: string;
  createdAt: number;
}

export interface StockAdjustment {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  adjustmentType: 'INCREASE' | 'DECREASE';
  quantity: number;
  reason: string;
  createdBy: string;
  createdAt: number;
}

export interface Wastage {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  reason: string;
  createdBy: string;
  createdAt: number;
}

export interface RestaurantSettings {
  restaurantName: string;
  restaurantNameTamil?: string; // Hotel name in Tamil (e.g. 'ஸ்ரீ சரவண பவன்')
  address: string;
  phone: string;
  logoUrl?: string;
  logoStoragePath?: string; // Firebase Storage path of the official immutable brand logo
  logoStorageUrl?: string; // Firebase Storage public URL of the official brand logo
  logoProtectedBrandAsset?: boolean; // Protected brand asset flag
  monochromeLogoUrl?: string; // Optional specialized black-and-white / 1-bit logo for thermal printing
  bwLogoUrl?: string;
  tagline?: string;
  upiId?: string; // Optional UPI ID for dynamic QR code on thermal receipts
  receiptHeader?: string;
  receiptFooter?: string;
  email?: string;
  gstNumber?: string;
  fssaiNumber?: string;
  paperWidth?: '80mm' | '58mm';
  printerType?: 'THERMAL_80MM' | 'THERMAL_58MM';
  receiptFontSize?: number;
  receiptLogoMaxWidth?: number; // Real-time scaled max-width in px for logo on 80mm/58mm paper (default: 140)
  receiptLogoMaxHeight?: number; // Real-time scaled max-height in px for logo on 80mm/58mm paper (default: 50)
  receiptAlignment?: 'center' | 'left' | 'right'; // Owner configurable receipt alignment
  receiptFormat?: 'standard' | 'compact' | 'tiffin_token' | 'gst_tax_invoice'; // Receipt format template
  receiptHeaderFontSize?: 'normal' | 'large' | 'huge'; // Hotel Title font scale in header
  receiptItemFontSize?: 'normal' | 'large' | 'prominent'; // Item names font size scale
  receiptTotalFontSize?: 'normal' | 'large' | 'huge'; // Grand Total font size scale
  receiptLineSpacing?: 'tight' | 'normal' | 'relaxed'; // Line height spacing (1.12, 1.25, 1.45)
  receiptSectionSpacing?: 'compact' | 'normal' | 'spacious'; // Margin spacing between sections (2px, 5px, 8px)
  receiptItemPadding?: 'compact' | 'normal' | 'spacious'; // Padding between individual item rows (1px, 2.5px, 4px)
  receiptPaperMargin?: 'minimal' | 'normal' | 'spacious'; // Horizontal margin on the thermal paper (2px, 6px, 10px)
  receiptMarginTop?: number; // Custom top margin in mm (default: 2)
  receiptMarginBottom?: number; // Custom bottom margin in mm (default: 4)
  receiptMarginLeft?: number; // Custom left margin in mm (default: 2)
  receiptMarginRight?: number; // Custom right margin in mm (default: 2)
  receiptShowItemSl?: boolean; // Toggle item serial numbers (# / SL)
  receiptShowTotalQty?: boolean; // Toggle net quantity summary row
  receiptShowGstFssai?: boolean; // Toggle GSTIN / FSSAI in receipt header
  receiptShowAddress?: boolean; // Toggle address lines in receipt header
  receiptShowPhone?: boolean; // Toggle phone number in receipt header
  receiptShowEmail?: boolean; // Toggle email address in receipt header
  receiptShowTamilName?: boolean; // Toggle Tamil restaurant name
  receiptShowEnglishName?: boolean; // Toggle English restaurant name
  receiptShowBranchName?: boolean; // Toggle branch name on receipt
  receiptShowInvoiceTitle?: boolean; // Toggle invoice title banner
  receiptShowHeader?: boolean; // Toggle store header subtitle
  receiptFeedLines?: number; // Feed lines before auto-cutter (1 to 4 lines)
  logoDisplay?: 'watermark' | 'header' | 'both' | 'none'; // How the uploaded logo is displayed
  logoRemoved?: boolean; // True when owner explicitly removes the shop logo
  logoOffsetX?: number; // Horizontal logo drag offset in px inside receipt preview
  logoOffsetY?: number; // Vertical logo drag offset in px inside receipt preview
  watermarkEnabled?: boolean; // Enable or disable centered receipt watermark
  watermarkUseLogo?: boolean; // Use the shop logo as the centered receipt watermark
  watermarkText?: string; // Optional watermark text fallback
  watermarkOpacity?: number; // Opacity for light watermark background (default 0.12)
  logoAlignment?: 'left' | 'center' | 'right';
  shopNameAlignment?: 'left' | 'center' | 'right';
  addressAlignment?: 'left' | 'center' | 'right';
  phoneAlignment?: 'left' | 'center' | 'right';
  billHeaderAlignment?: 'left' | 'center' | 'right';
  footerAlignment?: 'left' | 'center' | 'right';
  boldRestaurantName?: boolean;
  boldBillNumber?: boolean;
  boldItemHeader?: boolean;
  boldGrandTotal?: boolean;
  boldFooter?: boolean;
  compactMode?: boolean; // Paper-saving compact mode (reduced font sizes and tighter line spacing)
  // Comprehensive Receipt Designer fields
  invoiceTitle?: string; // e.g. "TAX INVOICE", "CASH RECEIPT", "ESTIMATE", "BILL OF SUPPLY"
  invoiceNumberPrefix?: string; // e.g. "BN-", "INV-", ""
  invoiceDateFormat?: 'DD-MM-YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY';
  showInvoiceDate?: boolean;
  showInvoiceTime?: boolean;
  showOrderType?: boolean;
  showTableNumber?: boolean;
  showCaptainCode?: boolean;
  showCustomerInfo?: boolean;
  thankYouMessage?: string;
  returnPolicy?: string;
  receiptShowReturnPolicy?: boolean; // Toggle return policy / terms note on receipt
  receiptFontFamily?: 'monospace' | 'sans-serif' | 'clean-pos' | 'tamil-noto';
  receiptSeparatorStyle?: 'dashed' | 'dotted' | 'solid' | 'double';
  customPaperWidthMm?: number;
  receiptShowItemCode?: boolean; // SKU / Code column
  receiptShowRate?: boolean; // Unit rate column
  receiptShowItemDiscount?: boolean;
  receiptShowItemTax?: boolean;
  receiptShowLineTotal?: boolean;
  receiptShowSubtotal?: boolean;
  receiptShowDiscount?: boolean;
  receiptShowCgst?: boolean;
  receiptShowSgst?: boolean;
  receiptShowIgst?: boolean;
  receiptShowRoundOff?: boolean;
  receiptShowGrandTotal?: boolean;
  receiptShowPaymentMethod?: boolean;
  receiptShowAmountPaid?: boolean;
  receiptShowBalanceDue?: boolean;
  receiptShowChangeReturned?: boolean;
  receiptShowQrCode?: boolean;
  receiptShowBarcode?: boolean;
  receiptShowUpiDetails?: boolean;
  receiptPayeeName?: string;
  receiptPrintCopies?: number; // 1, 2, or 3
  storeId?: string; // Store / Branch identifier for multi-store support
  storeBranchName?: string;
  businessDayStartHour?: string;
  businessDayStart?: string;
  billNumberDigits?: number;
  autoPrintOnSave?: boolean;
  skipPrintPreview?: boolean; // When true, completely skips the on-screen receipt preview modal for ultra-fast checkout
  printerInterface?: 'BROWSER_SPOOLER' | 'WEB_USB' | 'WEB_SERIAL' | 'BLUETOOTH' | 'NETWORK_LAN';
  printerModelName?: string;
  printerDeviceName?: string;
  printerIpAddress?: string;
  printerPort?: number;
  autoDailyBackupEnabled?: boolean; // Toggles automated daily backup execution
  autoDailyBackupTime?: string; // Scheduled daily time (e.g. '22:00' or '23:00')
  autoDailyBackupDownloadMode?: 'auto_download' | 'prompt_notification';
  autoDailyBackupScope?: 'core_billing' | 'full_database';
  lastDailyBackupDate?: string;
  lastDailyBackupTimestamp?: number;
  lastDailyBackupStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  enableRemotePrintQueue?: boolean; // Enable Firestore-based print queue for waiter devices
  isPrimaryPrintServer?: boolean; // Set this terminal as the primary print server
  remotePrintSoundNotification?: boolean; // Audio alert on incoming remote print jobs
  updatedAt?: number;
}

export interface ConnectedPrinterInfo {
  connected: boolean;
  interfaceType: 'WEB_USB' | 'WEB_SERIAL' | 'BLUETOOTH' | 'SYSTEM_SPOOLER' | 'NETWORK_LAN';
  deviceName: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  baudRate?: number;
  endpointOut?: number;
  interfaceNumber?: number;
  ipAddress?: string;
  port?: number;
  lastConnectedAt?: number;
  testPrintVerified?: boolean;
}

export interface BillingSettings {
  businessDayStart: string; // e.g. "04:00"
  billNumberStart: number;
  discountEnabled: boolean;
  autoPrintAfterSave: boolean;
}

export interface AuditLog {
  id: string;
  user: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: string;
  newValue?: string;
  timestamp: number;
  deviceId?: string;
}

export interface CartItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemNameTamil?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priceType: PriceType;
}

export interface BillingDraft {
  id: string;
  screen: 'direct_billing' | 'pos';
  userId?: string;
  userName?: string;
  deviceId: string;
  orderType: OrderType;
  priceType: PriceType;
  tableNumber: string;
  items: (CartItem & { notes?: string })[];
  discount: number;
  discountPercent?: number | null;
  customDiscount?: number;
  cashTendered?: string;
  updatedAt: number;
  itemCount: number;
  subtotal: number;
  grandTotal: number;
}

export type PrintJobStatus = 'PENDING' | 'SUCCESS' | 'FAILURE' | 'RESTRICTED';
export type PrintJobType = 'BILL' | 'KOT' | 'TEST_PAGE' | 'REPRINT';
export type PrintMethod = 'IFRAME' | 'DIRECT_DOM' | 'POPUP' | 'MOCK' | 'ESC_POS';

export interface PrintJobLog {
  id: string;
  timestamp: string; // ISO string
  createdAt: number; // epoch ms
  jobType: PrintJobType;
  referenceNumber: string; // e.g. Bill #BN-01 or KOT #01
  status: PrintJobStatus;
  method: PrintMethod;
  paperWidth: '80mm' | '58mm' | string;
  fontSize?: number;
  itemCount: number;
  totalAmount?: number;
  durationMs: number;
  errorMessage?: string | null;
  errorCode?: string | null;
  errorStack?: string | null;
  isMockMode: boolean;
  userAgent: string;
  isIframe: boolean;
  userId?: string;
  userName?: string;
}

export type DailyBackupTriggerType = 'AUTOMATED' | 'MANUAL';
export type DailyBackupScope = 'CORE_BILLING' | 'FULL_DATABASE';
export type DailyBackupStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface DailyBackupRecord {
  id: string;
  businessDate: string;
  timestamp: number;
  exportedAt: string;
  filename: string;
  triggerType: DailyBackupTriggerType;
  status: DailyBackupStatus;
  scope: DailyBackupScope;
  billCount: number;
  totalRevenue: number;
  cashTotal: number;
  upiTotal: number;
  cardTotal?: number;
  cancelledBillCount?: number;
  kotCount: number;
  totalDocuments: number;
  fileSizeBytes?: number;
  checksum?: string;
  exportFormat?: 'JSON' | 'XLSX' | 'PDF' | 'Export Excel' | string;
  action?: 'Export Excel' | string;
  exportType?: string;
  description?: string;
  createdAt?: number;
  errorMessage?: string;
}

export interface AutomatedDailyBackupConfig {
  enabled: boolean;
  scheduledTime: string; // e.g. "22:00"
  autoDownload: boolean; // Direct browser file download vs prompt
  scope: DailyBackupScope;
  notifyOnComplete: boolean;
  retentionMaxRecords: number;
}

export interface CoreBillingMetrics {
  totalBills: number;
  completedBills: number;
  cancelledBills: number;
  totalRevenue: number;
  cashRevenue: number;
  upiRevenue: number;
  cardRevenue: number;
  otherRevenue: number;
  totalDiscount: number;
  dineInBills: number;
  takeAwayBills: number;
  averageBillValue: number;
  totalBillItems: number;
  totalKots: number;
  totalDrafts: number;
  totalCategories: number;
  totalMenuItems: number;
  earliestBillTimestamp?: number;
  latestBillTimestamp?: number;
}

export interface CoreBillingBackupPayload {
  archiveType: 'CORE_BILLING_DAILY_ARCHIVE';
  version: '1.0';
  exportTimestamp: string;
  exportTimestampMs: number;
  businessDate: string;
  restaurant: {
    name: string;
    nameTamil?: string;
    address?: string;
    phone?: string;
    gstNumber?: string;
    fssaiNumber?: string;
  };
  metrics: CoreBillingMetrics;
  collections: {
    bills: Bill[];
    bill_items: BillItem[];
    billing_drafts: BillingDraft[];
    kots: Kot[];
    kot_items: KotItem[];
    business_days: BusinessDay[];
    bill_counters: any[];
    categories: Category[];
    menu_items: MenuItem[];
    settings: RestaurantSettings[];
    offline_cached_bills?: Bill[];
    offline_cached_items?: BillItem[];
  };
  checksum: string;
  instructions: string;
}

export type NavTab = 
  | 'dashboard' 
  | 'pos' 
  | 'direct-billing' 
  | 'kot' 
  | 'running-kot'
  | 'reprint' 
  | 'menu' 
  | 'inventory' 
  | 'reports' 
  | 'users' 
  | 'settings';

export type UserActivityAction =
  | 'User Registered'
  | 'Role Updated'
  | 'Access Updated'
  | 'PIN Updated'
  | 'Status Changed'
  | 'User Deleted'
  | 'Staff Reset';

export interface UserActivityLog {
  id: string;
  action: UserActivityAction | string;
  targetUserId: string;
  targetUserName: string;
  targetUsername: string;
  targetRole: string;
  performedByUid: string;
  performedByName: string;
  performedByUsername: string;
  details: string;
  previousValue?: string;
  newValue?: string;
  timestamp: number;
  createdAt: string;
}

export type RemotePrintJobType = 'KOT' | 'BILL' | 'REPRINT' | 'TEST';
export type RemotePrintJobStatus = 'PENDING' | 'PRINTING' | 'COMPLETED' | 'FAILED';

export interface RemotePrintJob {
  id: string;
  jobType: RemotePrintJobType;
  status: RemotePrintJobStatus;
  sourceDeviceId: string;
  sourceDeviceName?: string;
  sourceUserName?: string;
  tableNumber?: string;
  referenceNumber: string; // e.g. "KOT-05" or "BN-102"
  createdAt: number;
  updatedAt: number;
  executedAt?: number;
  executedByDeviceId?: string;
  errorMessage?: string;
  kotData?: {
    kot: Kot;
    items: KotItem[];
  };
  billData?: {
    bill: Bill;
    items?: BillItem[];
  };
  htmlSnapshot?: string;
}

export type BackupProcessStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed';

export interface DailySalesBackupStatusRecord {
  id: string; // businessDate (YYYY-MM-DD)
  businessDate: string; // YYYY-MM-DD
  formattedDate: string; // DD-MM-YYYY
  status: BackupProcessStatus;
  pdfBackupStatus: BackupProcessStatus;
  excelBackupStatus: BackupProcessStatus;
  pdfFileName: string; // SSB_DD-MM-YYYY.pdf
  excelFileName: string; // SSB_DD-MM-YYYY.xlsx
  pdfStoragePath: string; // Daily_Sales_Backup/YYYY/MM-MonthName/SSB_DD-MM-YYYY.pdf
  excelStoragePath: string; // Daily_Sales_Backup/YYYY/MM-MonthName/SSB_DD-MM-YYYY.xlsx
  pdfDownloadUrl?: string;
  excelDownloadUrl?: string;
  pdfBase64?: string;
  excelBase64?: string;
  totalBills: number;
  totalItemsSold: number;
  totalDailySales: number;
  totalsVerified: boolean;
  triggerType: 'AUTO_SCHEDULED' | 'MANUAL_REGENERATE' | 'CATCHUP_MISSED';
  timezone: string; // 'Asia/Kolkata'
  closingTimeConfigured: string; // e.g. '23:00'
  retryCount: number;
  lastAttemptAt: number;
  lastSuccessfulBackupAt?: number;
  lastSuccessfulBackupFormatted?: string;
  failureReason?: string;
  initiatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DailySalesBackupConfig {
  enabled: boolean;
  dailyClosingTime: string; // HH:mm in Asia/Kolkata timezone (e.g. '23:00')
  timezone: string; // 'Asia/Kolkata'
  autoRetryOnFailure: boolean;
  maxRetries: number;
  notifyOwnerOnFailure: boolean;
  lastSuccessfulBackupDate?: string;
  lastSuccessfulBackupAt?: number;
  lastSuccessfulBackupFormatted?: string;
  updatedBy?: string;
  updatedAt: number;
}

export type SecurityAuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'ACCOUNT_LOCKOUT'
  | 'LOGOUT'
  | 'UNAUTHORIZED_ACCESS_BLOCKED'
  | 'REPORT_DOWNLOAD_PDF'
  | 'REPORT_DOWNLOAD_EXCEL'
  | 'DAILY_BACKUP_COMPLETED'
  | 'DAILY_BACKUP_FAILED'
  | 'DAILY_BACKUP_REGENERATED'
  | 'CLOSING_TIME_UPDATED'
  | 'USER_ROLE_CHANGED'
  | 'PIN_CHANGED'
  | 'DATA_MODIFIED';

export interface SecurityAuditLogEntry {
  id: string;
  eventType: SecurityAuditEventType;
  username: string;
  userId?: string;
  role?: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'WARNING';
  details: string;
  timestamp: number;
  formattedTimeIST: string;
  deviceId?: string;
  metadata?: Record<string, any>;
}
