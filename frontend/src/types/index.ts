export type PasswordType = "same" | "empty";

export interface GeneratorSettings {
  beginNumber: string;
  numLength: number;
  numCount: number;
  customer: string;
  comment: string;
  profile: string;
  passwordType: PasswordType;
}

export interface PdfLayoutSettings {
  backgroundImageDataUrl: string | null;
  backgroundFit: "contain" | "cover" | "stretch";
  useBorder: boolean;
  borderWidth: number;
  borderColor: string;
  columns: number;
  rows: number;
  boxSpacing: number;

  // Card number (always shown)
  textSize: number;
  textPositionX: number;
  textPositionY: number;
  font: string;
  fontWeight: "normal" | "bold";
  textColor: string;
  textAlign: "left" | "center" | "right";
  textRotation: number;

  // Serial number styling (whether it's shown is chosen at generation time)
  serialNumberSize: number;
  serialPositionX: number;
  serialPositionY: number;
  serialColor: string;

  // Date styling (whether it's shown is chosen at generation time)
  dateSize: number;
  datePositionX: number;
  datePositionY: number;
  dateColor: string;

  // Optional custom text styling (whether it's shown, and its content, are
  // chosen at generation time — only its look is fixed here)
  customTextSize: number;
  customTextPositionX: number;
  customTextPositionY: number;
  customTextColor: string;
}

/** Per-generation choices: what to include and its content — NOT how it looks. */
export interface PrintOptions {
  useSerialNumber: boolean;
  serialStartNumber: number;
  useDatePrinting: boolean;
  useCustomText: boolean;
  customText: string;
}

export interface GenerationResult {
  numbers: string[];
  script: string;
}

export interface RouterPublic {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  sslEnabled: boolean;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RouterInput {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  sslEnabled: boolean;
  description?: string;
  isDefault?: boolean;
}

export interface SyncResult {
  routerId: string;
  identity: string;
  routerosVersion: string;
  uptime: string;
  cpuLoad: string;
  freeMemory: string;
  totalMemory: string;
  customers: { name: string; numUsers?: string }[];
  profiles: { name: string; priceUnit?: string; validity?: string }[];
  usersCount: number;
  activeSessionsCount: number;
  expiredUsersCount: number;
  disabledUsersCount: number;
  syncedAt: string;
}

export interface CachedSyncData {
  router_id: string;
  identity: string | null;
  routeros_version: string | null;
  customers: { name: string; numUsers?: string }[];
  profiles: { name: string; priceUnit?: string; validity?: string }[];
  users_count: number | null;
  active_sessions_count: number | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

export interface PrintTemplate {
  id: string;
  name: string;
  profile: string | null;
  layout: PdfLayoutSettings;
  created_at: string;
}

export interface LibraryFile {
  id: string;
  name: string;
  file_type: "txt" | "pdf" | "xlsx" | "mikrotik-script";
  customer: string | null;
  profile: string | null;
  prefix: string | null;
  number_count: number | null;
  created_at: string;
}


// ---- Reports ----
export interface UserManagerReportItem {
  username: string;
  customer: string;
  profile: string;
  firstName: string;
  comment: string;
  disabled: boolean;
  nasPort: string;
  nasPortId: string;
  callingStationId: string;
  calledStationId: string;
  lastSeen: string;
  bytesIn: string;
  bytesOut: string;
  uptime: string;
  price: number;
}

export interface UserManagerReport {
  routerName: string;
  totalCount: number;
  totalRevenue: number;
  profileBreakdown: Record<string, { count: number; revenue: number }>;
  items: UserManagerReportItem[];
}

export interface ReportFilters {
  fromDate?: string;
  toDate?: string;
  profile?: string;
  price?: string;
  port?: string;
  nasId?: string;
}
