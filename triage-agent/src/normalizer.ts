import { randomUUID } from "crypto";
import { IHeaders } from "kafkajs";
import {
  FalsePositiveEvent,
  O365AuditEvent,
  O365EventCategory,
  O365RecordType,
  RawAadEvent,
  RawExchangeEvent,
  RawSharePointEvent,
} from "./types";
import { logger } from "./logger";

// ── Helpers ───────────────────────────────────────────────────────────────────

function headerStr(headers: IHeaders, name: string): string | undefined {
  const v = headers[name];
  if (!v) return undefined;
  return Buffer.isBuffer(v) ? v.toString() : String(v);
}

function parseSequence(headers: IHeaders): number | undefined {
  const v = headerStr(headers, "x-opt-sequence-number");
  return v !== undefined ? Number(v) : undefined;
}

function parseOffset(headers: IHeaders): string | undefined {
  return headerStr(headers, "x-opt-offset");
}

function parseEnqueuedTime(headers: IHeaders, fallback: string): string {
  return headerStr(headers, "x-opt-enqueued-time") ?? fallback;
}

// Map producer's event-type header → O365EventCategory.
// Returns undefined for background events (AADSignin, OutlookMail, etc.)
function mapEventType(eventType: string): O365EventCategory | undefined {
  const MAP: Record<string, O365EventCategory> = {
    ImpossibleTravel:            "ImpossibleTravel",
    SuspiciousSignIn:            "SuspiciousSignIn",
    MassMailboxDeletion:         "MassMailboxDeletion",
    ExternalForwardingRuleCreated:"ExternalForwardingRuleCreated",
    BulkSharePointDownload:      "BulkSharePointDownload",
    OAuthAppConsentGrant:        "OAuthAppConsentGrant",
    MFADisabledForUser:          "MFADisabledForUser",
    SuspiciousInboxRule:         "SuspiciousInboxRule",
    GuestAccountAdded:           "GuestAccountAdded",
    RiskyUserDetected:           "RiskyUserDetected",
    PasswordSpray:               "PasswordSpray",
    AnonymousIPSignIn:           "AnonymousIPSignIn",
    MailboxPermissionGranted:    "MailboxPermissionGranted",
    AdminConsentGranted:         "AdminConsentGranted",
    DataExfiltrationAlert:       "DataExfiltrationAlert",
  };
  return MAP[eventType];
}

function deriveFlagReason(category: O365EventCategory, raw: Record<string, unknown>): string {
  const user = (raw["userPrincipalName"] ?? raw["UserId"] ?? "unknown") as string;
  const ip   = (raw["ipAddress"] ?? raw["ClientIPAddress"] ?? "") as string;

  const REASONS: Record<O365EventCategory, string> = {
    ImpossibleTravel:             `Sign-in from geographically impossible location for ${user}`,
    SuspiciousSignIn:             `Suspicious sign-in from ${ip || "unknown IP"} for ${user}`,
    MassMailboxDeletion:          `High-volume mailbox deletion detected for ${user}`,
    ExternalForwardingRuleCreated:`External email forwarding rule created by ${user}`,
    BulkSharePointDownload:       `Bulk SharePoint file download by ${user}`,
    OAuthAppConsentGrant:         `OAuth app consent granted by ${user}`,
    MFADisabledForUser:           `MFA disabled for a user account`,
    SuspiciousInboxRule:          `Suspicious inbox rule created by ${user}`,
    GuestAccountAdded:            `External guest account invited by ${user}`,
    RiskyUserDetected:            `Azure AD Identity Protection flagged ${user} as risky`,
    PasswordSpray:                `Password spray attack detected from ${ip || "unknown IP"}`,
    AnonymousIPSignIn:            `Sign-in from anonymous/Tor IP ${ip} for ${user}`,
    MailboxPermissionGranted:     `Mailbox permission granted by ${user}`,
    AdminConsentGranted:          `Admin consent granted to application`,
    DataExfiltrationAlert:        `Defender detected potential data exfiltration by ${user}`,
  };
  return REASONS[category];
}

// ── Exchange / SharePoint event normalizer ────────────────────────────────────
// Producer Exchange events use ClientIPAddress; SharePoint uses UserAgent.
// RecordType is already numeric. UserId is already a UPN.

function normalizeExchangeEvent(
  raw: RawExchangeEvent | RawSharePointEvent,
): O365AuditEvent {
  const ex = raw as RawExchangeEvent;
  const sp = raw as RawSharePointEvent;
  // Spread raw first so explicitly normalised fields override producer names
  return {
    ...raw,
    Id:              raw.Id ?? randomUUID(),
    CreationTime:    raw.CreationTime,
    RecordType:      raw.RecordType ?? O365RecordType.ExchangeAdmin,
    Operation:       raw.Operation,
    OrganizationId:  raw.OrganizationId ?? "",
    UserType:        ex.UserType ?? 0,
    UserKey:         ex.UserKey ?? raw.UserId,
    Workload:        raw.Workload,
    ResultStatus:    ex.ResultStatus ?? "Succeeded",
    UserId:          raw.UserId,
    ClientIP:        ex.ClientIPAddress ?? sp.ClientIPAddress,
    MailboxOwnerUPN: ex.MailboxOwnerUPN,
    ClientInfoString:ex.ClientInfoString ?? sp.UserAgent,
    ExternalAccess:  ex.ExternalAccess === true || ex.ExternalAccess === false
                       ? ex.ExternalAccess : undefined,
    Parameters:      ex.Parameters,
  };
}

// ── Azure AD / ARM event normalizer ──────────────────────────────────────────
// Producer AAD events use: time, userPrincipalName, ipAddress, operationName.
// They have no Id, no RecordType, result instead of ResultStatus.

function normalizeAadEvent(raw: RawAadEvent, category: O365EventCategory): O365AuditEvent {
  const resultStatus =
    raw.result === "success" ? "Succeeded" :
    raw.result === "failure" ? "Failed" :
    raw.resultType === "0"   ? "Succeeded" :
    raw.resultType           ? `Error:${raw.resultType}` :
    raw.result               ?? "Unknown";

  // MFADisabledForUser has modifiedProperties; map to our ModifiedProperties format
  const modProps = Array.isArray(raw["modifiedProperties"])
    ? (raw["modifiedProperties"] as Array<{ Name: string; Value: string }>).map((p) => ({
        Name:     p.Name,
        NewValue: p.Value,
        OldValue: "",
      }))
    : undefined;

  // OAuthAppConsentGrant / AdminConsentGranted pack scopes into ExtendedProperties
  const scopesArr = Array.isArray(raw["scopes"]) ? (raw["scopes"] as string[]) : [];
  const extProps: Array<{ Name: string; Value: string }> = scopesArr.length
    ? [{ Name: "Scopes", Value: scopesArr.join(", ") }]
    : [];

  // Actor field present in OAuthAppConsentGrant / AdminConsentGranted
  const actor = raw["actor"] as Record<string, string> | undefined;
  if (actor?.userPrincipalName) {
    extProps.push({ Name: "ActorUPN", Value: actor.userPrincipalName });
  }

  // App info present in consent events
  const app = raw["app"] as Record<string, unknown> | undefined;
  if (app) {
    extProps.push({ Name: "AppDisplayName", Value: String(app["displayName"] ?? "") });
    extProps.push({ Name: "AppVerified",    Value: String(app["verified"] ?? "") });
    extProps.push({ Name: "AppPublisher",   Value: String(app["publisher"] ?? "") });
  }

  return {
    Id:               randomUUID(),
    CreationTime:     raw.time,
    RecordType:       O365RecordType.AzureActiveDirectory,
    Operation:        raw.operationName ?? raw.category ?? category,
    OrganizationId:   raw.tenantId ?? "",
    UserType:         0,
    UserKey:          raw.userPrincipalName ?? raw.userId ?? "",
    Workload:         "AzureActiveDirectory",
    ResultStatus:     resultStatus,
    UserId:           raw.userPrincipalName ?? raw.userId ?? actor?.userPrincipalName ?? "",
    ClientIP:         actor?.ipAddress ?? raw.ipAddress,
    Category:         raw.category,
    ModifiedProperties: modProps,
    ExtendedProperties: extProps.length ? extProps : undefined,
    // Passthrough everything so the agent can see raw fields
    ...raw,
  };
}

// ── Detect whether a raw payload is Exchange or AAD ──────────────────────────
// Exchange/SharePoint events have CreationTime + RecordType (number) at the root.
// AAD/ARM events have 'time' at the root.

function isExchangeOrSharePoint(raw: Record<string, unknown>): boolean {
  return typeof raw["CreationTime"] === "string" && typeof raw["RecordType"] === "number";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Normalise a raw Kafka message from the O365-events producer into the
 * canonical FalsePositiveEvent used by the triage agent.
 *
 * Handles two cases:
 *  1. Already-wrapped FalsePositiveEvent (from a consumer service upstream)
 *  2. Raw producer payload (AAD / Exchange / SharePoint event)
 */
export function normalizeKafkaMessage(
  headers: IHeaders,
  rawJson: string,
  kafkaOffset: string,
  kafkaPartition: number,
): FalsePositiveEvent | null {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    logger.error("[Normalizer] Failed to parse message JSON");
    return null;
  }

  // ── Case 1: pre-wrapped FalsePositiveEvent ────────────────────────────────
  if (typeof payload["triageId"] === "string" && payload["auditEvent"]) {
    logger.debug("[Normalizer] Message is already a FalsePositiveEvent envelope");
    return payload as unknown as FalsePositiveEvent;
  }

  // ── Case 2: raw producer event ────────────────────────────────────────────
  const eventType = headerStr(headers, "event-type");
  if (!eventType) {
    logger.warn("[Normalizer] Missing event-type header — skipping message");
    return null;
  }

  const category = mapEventType(eventType);
  if (!category) {
    logger.debug(`[Normalizer] Background event type "${eventType}" — not a triage target, skipping`);
    return null;
  }

  const enqueuedTime = parseEnqueuedTime(headers, new Date().toISOString());
  const tenantId     = headerStr(headers, "tenant-id") ?? "";

  let auditEvent: O365AuditEvent;
  if (isExchangeOrSharePoint(payload)) {
    auditEvent = normalizeExchangeEvent(payload as RawExchangeEvent | RawSharePointEvent);
  } else {
    auditEvent = normalizeAadEvent(payload as RawAadEvent, category);
  }

  // Ensure OrganizationId is populated from the tenant-id header if absent
  if (!auditEvent.OrganizationId && tenantId) {
    auditEvent.OrganizationId = tenantId;
  }

  const event: FalsePositiveEvent = {
    triageId:               randomUUID(),
    enqueuedTime,
    category,
    eventHubSequenceNumber: parseSequence(headers),
    eventHubOffset:         parseOffset(headers) ?? kafkaOffset,
    partitionKey:           String(kafkaPartition),
    flagReason:             deriveFlagReason(category, payload),
    auditEvent,
  };

  logger.debug(`[Normalizer] Normalised raw "${eventType}" → category=${category} user=${auditEvent.UserId}`);
  return event;
}
