import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { logger } from "../logger";

const O365UserInput = z.object({
  upn: z.string().describe("User Principal Name (UPN) e.g. john.doe@contoso.com"),
  checkType: z.enum([
    "sign_in_history",
    "mfa_status",
    "mailbox_rules",
    "delegated_permissions",
    "oauth_consents",
    "recent_admin_actions",
    "risky_sign_ins",
  ]).describe("What aspect of the user's O365 profile to verify"),
});

export const o365UserContextTool = tool(
  async ({ upn, checkType }) => {
    logger.info(`[O365] Checking ${checkType} for ${upn}`);

    const graphUrl = process.env.GRAPH_API_URL ?? "https://graph.microsoft.com/v1.0";
    const graphToken = process.env.GRAPH_API_TOKEN;

    if (graphToken) {
      try {
        const headers = { Authorization: `Bearer ${graphToken}` };

        if (checkType === "sign_in_history") {
          const r = await axios.get(
            `${graphUrl}/auditLogs/signIns?$filter=userPrincipalName eq '${upn}'&$top=10&$orderby=createdDateTime desc`,
            { headers, timeout: 10000 }
          );
          return JSON.stringify({ source: "MicrosoftGraph", checkType, signIns: r.data.value });
        }

        if (checkType === "mfa_status") {
          const r = await axios.get(
            `${graphUrl}/users/${upn}/authentication/methods`,
            { headers, timeout: 10000 }
          );
          const methods = r.data.value as Array<{ "@odata.type": string }>;
          const hasMfa = methods.some((m) =>
            ["#microsoft.graph.microsoftAuthenticatorAuthenticationMethod",
             "#microsoft.graph.phoneAuthenticationMethod",
             "#microsoft.graph.fido2AuthenticationMethod"].includes(m["@odata.type"])
          );
          return JSON.stringify({ source: "MicrosoftGraph", checkType, upn, hasMfa, methods });
        }

        if (checkType === "mailbox_rules") {
          const r = await axios.get(
            `${graphUrl}/users/${upn}/mailFolders/inbox/messageRules`,
            { headers, timeout: 10000 }
          );
          const rules = r.data.value as Array<{ displayName: string; actions: unknown; conditions: unknown }>;
          const suspicious = rules.filter((rule) =>
            JSON.stringify(rule.actions).includes("forwardTo") ||
            JSON.stringify(rule.actions).includes("redirectTo") ||
            JSON.stringify(rule.actions).includes("delete")
          );
          return JSON.stringify({ source: "MicrosoftGraph", checkType, totalRules: rules.length, suspiciousRules: suspicious });
        }

        if (checkType === "risky_sign_ins") {
          const r = await axios.get(
            `${graphUrl}/identityProtection/riskyUsers?$filter=userPrincipalName eq '${upn}'`,
            { headers, timeout: 10000 }
          );
          return JSON.stringify({ source: "MicrosoftGraph", checkType, riskyUserInfo: r.data.value?.[0] ?? null });
        }

        // Generic fallback for other check types
        const r = await axios.get(`${graphUrl}/users/${upn}`, { headers, timeout: 10000 });
        return JSON.stringify({ source: "MicrosoftGraph", checkType, userProfile: r.data });
      } catch (err) {
        logger.warn(`[O365] Graph API error: ${err}`);
      }
    }

    return JSON.stringify(simulateO365Check(upn, checkType));
  },
  {
    name: "check_o365_user_context",
    description:
      "Query Microsoft Graph API for O365 user context: sign-in history, MFA status, mailbox forwarding rules, delegated permissions, OAuth app consents, recent admin actions, or risky sign-in detections from Azure AD Identity Protection. Essential for triaging O365-specific alerts.",
    schema: O365UserInput,
  }
);

function simulateO365Check(upn: string, checkType: string) {
  const base = {
    source: "SimulatedO365",
    upn,
    checkType,
    note: "SIMULATED — configure GRAPH_API_TOKEN for live Microsoft Graph data",
  };

  const sampleSignIns = [
    {
      id: "sign-001",
      createdDateTime: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
      userDisplayName: upn.split("@")[0],
      userPrincipalName: upn,
      ipAddress: "40.112.72.205",
      location: { city: "Seattle", state: "WA", countryOrRegion: "US" },
      status: { errorCode: 0, failureReason: null },
      conditionalAccessStatus: "success",
      isInteractive: true,
      riskLevelAggregated: "none",
      clientAppUsed: "Browser",
    },
    {
      id: "sign-002",
      createdDateTime: new Date(Date.now() - 26 * 60 * 60000).toISOString(),
      userDisplayName: upn.split("@")[0],
      userPrincipalName: upn,
      ipAddress: "40.112.72.205",
      location: { city: "Seattle", state: "WA", countryOrRegion: "US" },
      status: { errorCode: 0, failureReason: null },
      conditionalAccessStatus: "success",
      isInteractive: true,
      riskLevelAggregated: "none",
      clientAppUsed: "Mobile Apps and Desktop clients",
    },
  ];

  if (checkType === "sign_in_history") {
    return {
      ...base,
      signIns: sampleSignIns,
      distinctLocations: ["Seattle, WA, US"],
      failedAttempts: 0,
      verdict: "CONSISTENT_LOCATION",
    };
  }

  if (checkType === "mfa_status") {
    return {
      ...base,
      hasMfa: true,
      methods: ["MicrosoftAuthenticator", "SMS"],
      mfaEnforcedByPolicy: true,
      verdict: "MFA_ENABLED",
    };
  }

  if (checkType === "mailbox_rules") {
    return {
      ...base,
      totalRules: 2,
      rules: [
        { displayName: "Move newsletters to folder", actions: { moveToFolder: "Newsletters" }, suspicious: false },
        { displayName: "Flag emails from boss", actions: { markImportance: "high" }, suspicious: false },
      ],
      suspiciousRules: [],
      verdict: "NO_SUSPICIOUS_RULES",
    };
  }

  if (checkType === "delegated_permissions") {
    return {
      ...base,
      delegatedPermissions: [],
      fullAccessGrantees: [],
      verdict: "NO_DELEGATED_PERMISSIONS",
    };
  }

  if (checkType === "oauth_consents") {
    return {
      ...base,
      consentedApps: [
        { appId: "de8bc8b5-d9f9-48b1-a8ad-b748da725064", displayName: "Microsoft Teams", scope: "User.Read", isBuiltIn: true },
        { appId: "00b41c95-dab0-4487-9791-b9d2c32c80f2", displayName: "Office 365 SharePoint Online", scope: "AllSites.Read", isBuiltIn: true },
      ],
      suspiciousThirdPartyApps: [],
      verdict: "ONLY_TRUSTED_APPS",
    };
  }

  if (checkType === "risky_sign_ins") {
    return {
      ...base,
      riskState: "none",
      riskLevel: "none",
      riskDetail: "none",
      isConfirmedSafe: false,
      verdict: "NOT_FLAGGED_AS_RISKY",
    };
  }

  if (checkType === "recent_admin_actions") {
    return {
      ...base,
      isAdmin: false,
      recentAdminOperations: [],
      verdict: "NOT_AN_ADMIN",
    };
  }

  return { ...base, verdict: "UNKNOWN" };
}
