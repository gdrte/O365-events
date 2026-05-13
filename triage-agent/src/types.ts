// ── O365 record type numeric codes (producer uses integers) ───────────────────
export enum O365RecordType {
  ExchangeAdmin          = 1,
  ExchangeItem           = 2,
  ExchangeItemGroup      = 3,
  SharePoint             = 6,
  SharePointFileOperation= 6,
  AzureActiveDirectory   = 8,
  ExchangeCalendar       = 9,
  DataCenterSecurity     = 10,
  ComplianceDLPSharePoint= 11,
  Sway                   = 12,
  ComplianceDLPExchange  = 13,
  SharePointSharingOp    = 14,
  AzureActiveDirectoryAccountLogon = 15,
  SecurityComplianceCenterAlertsInsights = 28,
  ThreatIntelligence     = 28,
  MicrosoftTeams         = 25,
  PowerBI                = 20,
  Yammer                 = 36,
  MicrosoftForms         = 62,
}

// ── Event categories (match the producer's event-type header exactly) ─────────
export type O365EventCategory =
  | "ImpossibleTravel"
  | "SuspiciousSignIn"
  | "MassMailboxDeletion"
  | "ExternalForwardingRuleCreated"
  | "BulkSharePointDownload"
  | "OAuthAppConsentGrant"
  | "MFADisabledForUser"
  | "SuspiciousInboxRule"
  | "GuestAccountAdded"
  | "RiskyUserDetected"
  | "PasswordSpray"
  | "AnonymousIPSignIn"
  | "MailboxPermissionGranted"
  | "AdminConsentGranted"
  | "DataExfiltrationAlert";

// Background event types the producer also emits (not triage targets but
// must be parseable when they arrive on the topic)
export type O365BackgroundEventType =
  | "AADSignin"
  | "ActivityLog"
  | "SecurityAlert"
  | "Diagnostic"
  | "OutlookMail"
  | "OutlookCalendar"
  | "OutlookAdmin";

// ── Canonical audit event (our internal normalised form) ──────────────────────
// Field names follow Microsoft UAL conventions; the normalizer maps all
// producer variants (ClientIPAddress, ipAddress, userPrincipalName …) here.
export interface O365AuditEvent {
  // --- Core UAL fields ---
  Id: string;                   // GUID; generated if absent in raw event
  CreationTime: string;         // ISO 8601
  RecordType: number;           // Numeric (see O365RecordType enum)
  Operation: string;
  OrganizationId: string;
  UserType: number;             // 0=Regular 2=Admin 3=DcAdmin 4=System 5=Application
  UserKey: string;
  Workload: string;             // "AzureActiveDirectory" | "Exchange" | "SharePoint" | …
  ResultStatus: string;         // "Succeeded" | "Failed" | "Success" | error code

  // --- Identity ---
  UserId: string;               // UPN — e.g. john.doe@contoso.com

  // --- Network ---
  ClientIP?: string;            // Normalised from ClientIPAddress / ipAddress

  // --- Object ---
  ObjectId?: string;
  Scope?: string;

  // --- Exchange specific ---
  MailboxOwnerUPN?: string;
  ClientInfoString?: string;    // User-agent string
  ExternalAccess?: boolean;
  Parameters?: Array<{ Name: string; Value: string }>;

  // --- Azure AD specific ---
  ExtendedProperties?: Array<{ Name: string; Value: string }>;
  ModifiedProperties?: Array<{ Name: string; NewValue: string; OldValue: string }>;
  DeviceProperties?: Array<{ Name: string; Value: string }>;
  Actor?: Array<{ ID: string; Type: number }>;
  Target?: Array<{ ID: string; Type: number }>;

  // --- Risk / Defender fields ---
  AlertId?: string;
  Category?: string;
  Severity?: "Informational" | "Low" | "Medium" | "High" | "Critical";
  Name?: string;

  // --- Passthrough for any other producer fields ---
  [key: string]: unknown;
}

// ── Raw producer payloads (typed for the normalizer) ─────────────────────────

// Fields common to all Azure AD / ARM events from the producer
export interface RawAadEvent {
  time: string;
  tenantId: string;
  correlationId?: string;
  category: string;
  operationName?: string;
  result?: string;
  resultType?: string;
  resultDescription?: string;
  userPrincipalName?: string;
  userId?: string;
  ipAddress?: string;
  location?: string;
  [key: string]: unknown;
}

// Fields common to Exchange UAL events from the producer
export interface RawExchangeEvent {
  CreationTime: string;
  Id: string;
  Operation: string;
  OrganizationId: string;
  RecordType: number;
  ResultStatus?: string;
  Workload: string;
  UserId: string;
  ClientIPAddress?: string;
  UserKey?: string;
  UserType?: number;
  MailboxOwnerUPN?: string;
  ClientInfoString?: string;
  Parameters?: Array<{ Name: string; Value: string }>;
  [key: string]: unknown;
}

// SharePoint / OneDrive events from the producer
export interface RawSharePointEvent {
  CreationTime: string;
  Id: string;
  Operation: string;
  OrganizationId: string;
  RecordType: number;
  Workload: string;
  UserId: string;
  ClientIPAddress?: string;
  UserAgent?: string;
  SiteUrl?: string;
  SourceFileName?: string;
  SourceFileExt?: string;
  FileSizeBytes?: number;
  [key: string]: unknown;
}

// ── FalsePositiveEvent — what arrives on topic-false-positive ─────────────────
// The upstream K3S consumer service may send this as a fully-wrapped envelope
// (all fields present) OR as a raw producer payload (only rawPayload present).
// The normalizer in kafka.ts handles both cases.
export interface FalsePositiveEvent {
  // Triage metadata
  triageId: string;
  enqueuedTime: string;
  category: O365EventCategory;
  eventHubSequenceNumber?: number;
  eventHubOffset?: string;
  partitionKey?: string;
  flagReason?: string;

  // Normalised audit event
  auditEvent: O365AuditEvent;
}

// ── Verdict types ─────────────────────────────────────────────────────────────
export type Verdict = "FALSE_POSITIVE" | "TRUE_POSITIVE" | "INCONCLUSIVE";

export interface TriageVerdict {
  triageId: string;
  alertId: string;
  category: O365EventCategory;
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  evidenceItems: EvidenceItem[];
  triageTimestamp: string;
  agentIterations: number;
}

export interface EvidenceItem {
  source: string;
  finding: string;
  supportsVerdict: boolean;
}
