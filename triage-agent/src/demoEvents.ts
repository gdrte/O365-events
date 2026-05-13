import { FalsePositiveEvent, O365RecordType, O365EventCategory } from "./types";
import { randomUUID } from "crypto";

// Realistic O365 demo scenarios — mix of genuine FPs and TPs
const DEMO_SCENARIOS: Array<{
  category: O365EventCategory;
  flagReason: string;
  auditEvent: Partial<FalsePositiveEvent["auditEvent"]>;
}> = [
  // ── SCENARIO 1: Impossible Travel (likely FP — VPN)
  {
    category: "ImpossibleTravel",
    flagReason: "Two successful sign-ins from US and Netherlands within 45 minutes",
    auditEvent: {
      RecordType: O365RecordType.AzureActiveDirectory,
      Operation: "UserLoggedIn",
      Workload: "AzureActiveDirectory",
      ResultStatus: "Success",
      UserId: "alice.johnson@contoso.com",
      UserType: 0,
      ClientIP: "185.220.101.45", // Mullvad VPN exit node
      Severity: "Medium",
      ExtendedProperties: [
        { Name: "UserAgent", Value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124" },
        { Name: "LoginStatus", Value: "0" },
        { Name: "RequestType", Value: "OAuth2:Token" },
      ],
      DeviceProperties: [
        { Name: "OS", Value: "Windows10" },
        { Name: "DisplayName", Value: "ALICE-LAPTOP" },
        { Name: "TrustType", Value: "Azure AD Joined" },
      ],
    },
  },

  // ── SCENARIO 2: External Forwarding Rule (TP — attacker persistence)
  {
    category: "ExternalForwardingRuleCreated",
    flagReason: "Inbox rule created to forward all email to external Gmail address",
    auditEvent: {
      RecordType: O365RecordType.ExchangeAdmin,
      Operation: "New-InboxRule",
      Workload: "Exchange",
      ResultStatus: "Success",
      UserId: "bob.smith@contoso.com",
      UserType: 0,
      ClientIP: "198.51.100.77", // known bad IP in simulation
      Severity: "High",
      ObjectId: "/o=ExchangeLabs/ou=Exchange Administrative Group/cn=Recipients/cn=bob.smith",
      ModifiedProperties: [
        { Name: "ForwardTo", NewValue: "exfil.attacker@gmail.com", OldValue: "" },
        { Name: "StopProcessingRules", NewValue: "True", OldValue: "" },
        { Name: "Name", NewValue: "Auto-fwd", OldValue: "" },
      ],
      ExtendedProperties: [
        { Name: "ClientAppId", Value: "1b730954-1685-4b74-9bfd-dac224a7b894" },
      ],
    },
  },

  // ── SCENARIO 3: Bulk SharePoint Download (likely FP — OneDrive sync)
  {
    category: "BulkSharePointDownload",
    flagReason: "User downloaded 847 files from SharePoint in 12 minutes",
    auditEvent: {
      RecordType: O365RecordType.SharePoint,
      Operation: "FileDownloaded",
      Workload: "SharePoint",
      ResultStatus: "Success",
      UserId: "carol.white@contoso.com",
      UserType: 0,
      ClientIP: "10.0.0.23", // internal IP
      Severity: "Medium",
      ObjectId: "https://contoso.sharepoint.com/sites/ProjectAlpha/Shared Documents",
      ExtendedProperties: [
        { Name: "ItemType", Value: "File" },
        { Name: "UserAgent", Value: "OneDriveSync/23.156 (Windows)" },
        { Name: "EventData", Value: JSON.stringify({ fileCount: 847, totalSizeMB: 234 }) },
      ],
    },
  },

  // ── SCENARIO 4: OAuth App Consent (TP — malicious app)
  {
    category: "OAuthAppConsentGrant",
    flagReason: "User consented to third-party app requesting Mail.ReadWrite and Contacts.Read",
    auditEvent: {
      RecordType: O365RecordType.AzureActiveDirectory,
      Operation: "Consent to application.",
      Workload: "AzureActiveDirectory",
      ResultStatus: "Success",
      UserId: "dan.brown@contoso.com",
      UserType: 0,
      ClientIP: "91.108.56.130",
      Severity: "High",
      ObjectId: "ServicePrincipal_a4f3e2b1-cc12-4d5e-9f78-123456789abc",
      ModifiedProperties: [
        { Name: "ConsentType", NewValue: "AllPrincipals", OldValue: "" },
        {
          Name: "Permissions",
          NewValue: "Mail.ReadWrite, Contacts.Read, offline_access, User.Read",
          OldValue: "",
        },
        { Name: "ApplicationDisplayName", NewValue: "DocuSign Integration Pro", OldValue: "" },
      ],
      ExtendedProperties: [
        { Name: "additionalDetails", Value: "app not verified by Microsoft" },
      ],
    },
  },

  // ── SCENARIO 5: MFA Disabled (FP — IT helpdesk procedure)
  {
    category: "MFADisabledForUser",
    flagReason: "MFA authentication method removed for privileged account",
    auditEvent: {
      RecordType: O365RecordType.AzureActiveDirectory,
      Operation: "Delete user",
      Workload: "AzureActiveDirectory",
      ResultStatus: "Success",
      UserId: "helpdesk@contoso.com",
      UserType: 2, // Admin
      ClientIP: "10.0.1.5", // corporate helpdesk IP
      Severity: "High",
      ObjectId: "User_eve.davis@contoso.com",
      ModifiedProperties: [
        { Name: "AuthenticationMethod", NewValue: "", OldValue: "Microsoft Authenticator" },
        { Name: "TargetUser", NewValue: "eve.davis@contoso.com", OldValue: "" },
        { Name: "Reason", NewValue: "User lost phone — break-glass procedure JIRA-4521", OldValue: "" },
      ],
    },
  },

  // ── SCENARIO 6: Password Spray (TP — real attack)
  {
    category: "PasswordSpray",
    flagReason: "35 failed login attempts across 28 accounts from single IP in 8 minutes",
    auditEvent: {
      RecordType: O365RecordType.AzureActiveDirectory,
      Operation: "UserLoginFailed",
      Workload: "AzureActiveDirectory",
      ResultStatus: "Failed",
      UserId: "frank.miller@contoso.com",
      UserType: 0,
      ClientIP: "198.51.100.1", // known bad in simulation
      Severity: "High",
      Name: "Password spray attack",
      ExtendedProperties: [
        { Name: "UserAgent", Value: "python-requests/2.31.0" },
        { Name: "ErrorCode", Value: "50126" },
        { Name: "AuthenticationMethod", Value: "Password" },
        { Name: "CorrelationId", Value: "spray-campaign-abc123" },
      ],
    },
  },

  // ── SCENARIO 7: Guest Account Added (FP — vendor onboarding)
  {
    category: "GuestAccountAdded",
    flagReason: "External user invited from non-standard domain and immediately added to Finance team",
    auditEvent: {
      RecordType: O365RecordType.AzureActiveDirectory,
      Operation: "Invite external user",
      Workload: "AzureActiveDirectory",
      ResultStatus: "Success",
      UserId: "grace.lee@contoso.com",
      UserType: 0,
      ClientIP: "10.0.0.45",
      Severity: "Medium",
      ObjectId: "vendor.rep@kpmg.com",
      ModifiedProperties: [
        { Name: "InvitedUserEmailAddress", NewValue: "vendor.rep@kpmg.com", OldValue: "" },
        { Name: "InvitedToGroup", NewValue: "Finance-External-Reviewers", OldValue: "" },
      ],
      ExtendedProperties: [
        { Name: "InvitationSentDate", Value: new Date().toISOString() },
      ],
    },
  },

  // ── SCENARIO 8: Suspicious Inbox Rule (TP — BEC)
  {
    category: "SuspiciousInboxRule",
    flagReason: "Inbox rule created to move emails containing 'invoice', 'wire', 'payment' to RSS Feeds (hidden folder)",
    auditEvent: {
      RecordType: O365RecordType.ExchangeAdmin,
      Operation: "New-InboxRule",
      Workload: "Exchange",
      ResultStatus: "Success",
      UserId: "henry.clark@contoso.com",
      UserType: 0,
      ClientIP: "91.108.4.200",
      Severity: "High",
      ModifiedProperties: [
        { Name: "SubjectContainsWords", NewValue: "invoice;wire transfer;payment;urgent", OldValue: "" },
        { Name: "MoveToFolder", NewValue: "RSS Feeds", OldValue: "" },
        { Name: "StopProcessingRules", NewValue: "True", OldValue: "" },
        { Name: "MarkAsRead", NewValue: "True", OldValue: "" },
      ],
    },
  },
];

export function generateDemoEvent(scenarioIndex?: number): FalsePositiveEvent {
  const idx = scenarioIndex !== undefined
    ? scenarioIndex % DEMO_SCENARIOS.length
    : Math.floor(Math.random() * DEMO_SCENARIOS.length);

  const scenario = DEMO_SCENARIOS[idx];
  const now = new Date();

  return {
    triageId: `triage-${randomUUID()}`,
    enqueuedTime: now.toISOString(),
    eventHubSequenceNumber: Math.floor(Math.random() * 100000),
    eventHubOffset: String(Math.floor(Math.random() * 1000000)),
    partitionKey: scenario.auditEvent.UserId?.split("@")[0] ?? "default",
    category: scenario.category,
    flagReason: scenario.flagReason,
    auditEvent: {
      Id: randomUUID(),
      CreationTime: now.toISOString(),
      OrganizationId: "contoso-org-id-12345",
      ...scenario.auditEvent,
      RecordType: scenario.auditEvent.RecordType ?? O365RecordType.AzureActiveDirectory,
      Operation: scenario.auditEvent.Operation ?? "Unknown",
      Workload: scenario.auditEvent.Workload ?? "AzureActiveDirectory",
      ResultStatus: scenario.auditEvent.ResultStatus ?? "Success",
      UserId: scenario.auditEvent.UserId ?? "unknown@contoso.com",
      UserType: scenario.auditEvent.UserType ?? 0,
      UserKey: scenario.auditEvent.UserId ?? "unknown",
    },
  };
}

export function getAllDemoScenarios(): FalsePositiveEvent[] {
  return DEMO_SCENARIOS.map((_, i) => generateDemoEvent(i));
}

export const SCENARIO_LABELS = DEMO_SCENARIOS.map((s, i) =>
  `[${i}] ${s.category} — ${s.flagReason.slice(0, 60)}`
);
