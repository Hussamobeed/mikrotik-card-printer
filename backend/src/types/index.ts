export interface RouterRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password_encrypted: string;
  ssl_enabled: number;
  description: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
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

export interface UserManagerCustomer {
  name: string;
  numUsers?: string;
}

export interface UserManagerProfile {
  name: string;
  priceUnit?: string;
  validity?: string;
}

export interface SyncResult {
  routerId: string;
  identity: string;
  routerosVersion: string;
  uptime: string;
  cpuLoad: string;
  freeMemory: string;
  totalMemory: string;
  customers: UserManagerCustomer[];
  profiles: UserManagerProfile[];
  usersCount: number;
  activeSessionsCount: number;
  expiredUsersCount: number;
  disabledUsersCount: number;
  syncedAt: string;
}

export interface LibraryFileRecord {
  id: string;
  name: string;
  file_type: "txt" | "pdf" | "xlsx" | "mikrotik-script";
  stored_path: string;
  customer: string | null;
  profile: string | null;
  prefix: string | null;
  number_count: number | null;
  created_at: string;
}
