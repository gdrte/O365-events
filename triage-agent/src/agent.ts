import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import {
  StateGraph,
  Annotation,
  MessagesAnnotation,
  END,
  START,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  threatIntelTool,
  endpointStatusTool,
  siemQueryTool,
  networkTrafficTool,
  o365UserContextTool,
} from "./tools";
import { FalsePositiveEvent, TriageVerdict, EvidenceItem, O365EventCategory, Verdict } from "./types";
import { logger } from "./logger";

// ── Prompt ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Microsoft 365 security triage agent. Your job is to investigate
security alerts from Microsoft Event Hubs and determine whether each event, flagged as a
"potential false positive", is genuinely a false positive or a true positive (real threat).

## O365 Event Categories You Handle

| Category | Key Indicators | Common FP Causes |
|---|---|---|
| ImpossibleTravel | Two sign-ins from distant geos in short time | VPN, corporate proxy, cloud relay |
| SuspiciousSignIn | Unfamiliar location/device, legacy auth | Business travel, new device |
| MassMailboxDeletion | High volume deletes in short window | Inbox cleanup scripts, email migrations |
| ExternalForwardingRuleCreated | Inbox rule forwards to external domain | Legitimate delegation to personal email |
| BulkSharePointDownload | Large volume of file downloads | Authorized migrations, sync clients |
| OAuthAppConsentGrant | Third-party app granted broad permissions | IT-approved app rollout |
| MFADisabledForUser | MFA removed from an account | IT helpdesk break-glass procedure |
| SuspiciousInboxRule | Rule hides/deletes/redirects emails | Legitimate personal organization |
| GuestAccountAdded | External user invited to tenant | Legitimate vendor/partner onboarding |
| RiskyUserDetected | Azure AD Identity Protection flag | After password reset, safe travel |
| PasswordSpray | Multiple failed logins across accounts | Automated monitoring tool, test run |
| AnonymousIPSignIn | Login from Tor or anonymous proxy | Security researcher, privacy tool |
| MailboxPermissionGranted | Full Access or Send-As granted | Shared mailbox setup, exec assistant |
| AdminConsentGranted | Admin granted app permissions tenant-wide | Approved IT rollout |
| DataExfiltrationAlert | Defender detected potential exfil | DLP test, authorized data transfer |

## Investigation Methodology
1. Extract key indicators from the O365 audit event: UPN, ClientIP, Operation, Workload, ObjectId
2. For sign-in alerts: check sign_in_history and risky_sign_ins for the user
3. For mailbox alerts: check mailbox_rules and delegated_permissions
4. For app/OAuth alerts: check oauth_consents and recent_admin_actions
5. Verify the source IP via threat intel for sign-in events
6. Cross-reference with SIEM events to identify broader attack patterns
7. Consider the user's role (admin vs regular), MFA status, and device compliance

## Verdict Rules
- **FALSE_POSITIVE** (confidence >= 70): Evidence points to benign explanation
- **TRUE_POSITIVE** (confidence >= 70): Malicious activity confirmed, no legitimate justification
- **INCONCLUSIVE** (confidence < 70): Conflicting signals — recommend analyst review

## Output format
Always end your final response with this JSON block and nothing after it:
\`\`\`json
{{
  "verdict": "FALSE_POSITIVE" | "TRUE_POSITIVE" | "INCONCLUSIVE",
  "confidence": <0-100>,
  "reasoning": "<2-3 sentence explanation citing specific evidence>",
  "evidenceItems": [
    {{ "source": "<tool name>", "finding": "<specific finding>", "supportsVerdict": true | false }}
  ]
}}
\`\`\``;

// ── State ─────────────────────────────────────────────────────────────────────

// Extend MessagesAnnotation with triage-specific fields that accumulate through
// the graph. Nodes write to these fields; only parseVerdict sets the final ones.
const TriageState = Annotation.Root({
  // Inherited: messages array with reducer that appends new messages
  ...MessagesAnnotation.spec,

  // Input context (set once at graph entry, never updated)
  triageId: Annotation<string>(),
  category: Annotation<O365EventCategory>(),

  // Output fields written by the parseVerdict node
  verdict: Annotation<Verdict | undefined>({
    default: () => undefined,
    reducer: (_, incoming) => incoming,
  }),
  confidence: Annotation<number>({
    default: () => 0,
    reducer: (_, incoming) => incoming,
  }),
  reasoning: Annotation<string>({
    default: () => "",
    reducer: (_, incoming) => incoming,
  }),
  evidenceItems: Annotation<EvidenceItem[]>({
    default: () => [],
    reducer: (_, incoming) => incoming,
  }),
  toolCallCount: Annotation<number>({
    default: () => 0,
    // Accumulate across every tools node execution
    reducer: (current, delta) => current + delta,
  }),
});

type AgentState = typeof TriageState.State;

// ── Tools & model ─────────────────────────────────────────────────────────────

const TOOLS = [
  o365UserContextTool,
  threatIntelTool,
  siemQueryTool,
  networkTrafficTool,
  endpointStatusTool,
];

// ── Node implementations ──────────────────────────────────────────────────────

function makeAgentNode(model: ChatOpenAI) {
  const modelWithTools = model.bindTools(TOOLS);

  return async function agentNode(state: AgentState): Promise<Partial<AgentState>> {
    const response = await modelWithTools.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ]);
    return { messages: [response] };
  };
}

function makeToolsNode() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolNode = new ToolNode(TOOLS as any[]);

  return async function toolsNode(state: AgentState): Promise<Partial<AgentState>> {
    const result = await toolNode.invoke(state);
    const newToolMessages = (result.messages as BaseMessage[]).filter(
      (m) => m._getType() === "tool",
    );
    return {
      messages: result.messages as BaseMessage[],
      toolCallCount: newToolMessages.length,
    };
  };
}

function parseVerdictNode(state: AgentState): Partial<AgentState> {
  // Find the last AI message with text content
  let finalText = "";
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg._getType() !== "ai") continue;
    const content = msg.content;
    if (typeof content === "string" && content.trim()) {
      finalText = content;
      break;
    }
    if (Array.isArray(content)) {
      const text = content
        .filter((c): c is { type: string; text: string } => typeof c === "object" && c.type === "text")
        .map((c) => c.text)
        .join("");
      if (text.trim()) { finalText = text; break; }
    }
  }

  const jsonMatch = finalText.match(/```json\s*([\s\S]*?)```\s*$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as {
        verdict: Verdict;
        confidence: number;
        reasoning: string;
        evidenceItems: EvidenceItem[];
      };
      return {
        verdict: parsed.verdict,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        evidenceItems: parsed.evidenceItems ?? [],
      };
    } catch {
      logger.warn("[Agent] Failed to parse JSON verdict block, extracting from text");
    }
  }

  // Fallback: extract verdict keyword from plain text
  const upper = finalText.toUpperCase();
  const verdict: Verdict =
    upper.includes("TRUE_POSITIVE") || upper.includes("TRUE POSITIVE")
      ? "TRUE_POSITIVE"
      : upper.includes("FALSE_POSITIVE") || upper.includes("FALSE POSITIVE")
      ? "FALSE_POSITIVE"
      : "INCONCLUSIVE";

  return {
    verdict,
    confidence: 50,
    reasoning: finalText.slice(0, 600),
    evidenceItems: [
      { source: "agent_output", finding: "Structured JSON not found — raw text extracted", supportsVerdict: false },
    ],
  };
}

// ── Graph wiring ──────────────────────────────────────────────────────────────

function shouldContinue(state: AgentState): "tools" | "parseVerdict" {
  const last = state.messages[state.messages.length - 1] as AIMessage;
  if (last.tool_calls && last.tool_calls.length > 0) return "tools";
  return "parseVerdict";
}

export type TriageAgent = ReturnType<typeof buildGraph>;

function buildGraph(model: ChatOpenAI) {
  const graph = new StateGraph(TriageState)
    .addNode("agent",        makeAgentNode(model))
    .addNode("tools",        makeToolsNode())
    .addNode("parseVerdict", parseVerdictNode)
    .addEdge(START,          "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools",        "agent")
    .addEdge("parseVerdict", END);

  return graph.compile();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createTriageAgent(): TriageAgent {
  const baseURL   = process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234/v1";
  const modelName = process.env.AGENT_MODEL        ?? "google/gemma-4-e4b";

  const model = new ChatOpenAI({
    modelName,
    temperature: 0,
    maxTokens: 4096,
    apiKey: process.env.LM_STUDIO_API_KEY ?? "lm-studio",
    configuration: { baseURL },
    streaming: false,
  });

  logger.info(`[Agent] Using LM Studio model "${modelName}" at ${baseURL}`);
  return buildGraph(model);
}

export async function triageEvent(
  agent: TriageAgent,
  event: FalsePositiveEvent,
): Promise<TriageVerdict> {
  const startTime = Date.now();
  const { triageId, category, auditEvent, flagReason } = event;

  logger.info(
    `[Agent] Triaging ${triageId} | category=${category} | user=${auditEvent.UserId} | op=${auditEvent.Operation}`,
  );

  const extProps =
    auditEvent.ExtendedProperties?.reduce(
      (acc, p) => ({ ...acc, [p.Name]: p.Value }),
      {} as Record<string, string>,
    ) ?? {};

  const alertPrompt = `
## O365 Security Alert — Triage Required

**Triage ID**: ${triageId}
**Category**: ${category}
**Flagged Because**: ${flagReason ?? "Upstream detection rule triggered"}

### Audit Event Details
- **Timestamp**: ${auditEvent.CreationTime}
- **Workload**: ${auditEvent.Workload}
- **Operation**: ${auditEvent.Operation}
- **User (UPN)**: ${auditEvent.UserId}
- **User Type**: ${["Regular", "Reserved", "Admin", "DcAdmin", "System", "Application", "ServicePrincipal"][auditEvent.UserType] ?? auditEvent.UserType}
- **Result**: ${auditEvent.ResultStatus}
${auditEvent.ClientIP       ? `- **Client IP**: ${auditEvent.ClientIP}`   : ""}
${auditEvent.ObjectId       ? `- **Object**: ${auditEvent.ObjectId}`       : ""}
${auditEvent.Severity       ? `- **Severity**: ${auditEvent.Severity}`     : ""}
${auditEvent.Name           ? `- **Alert Name**: ${auditEvent.Name}`       : ""}
${Object.keys(extProps).length ? `- **Extended Properties**: ${JSON.stringify(extProps)}` : ""}
${auditEvent.ModifiedProperties?.length
    ? `- **Modified Properties**:\n${auditEvent.ModifiedProperties.map(
        (p) => `  - ${p.Name}: \`${p.OldValue}\` → \`${p.NewValue}\``,
      ).join("\n")}`
    : ""}

### Raw Event (partial)
\`\`\`json
${JSON.stringify(
  Object.fromEntries(
    Object.entries(auditEvent)
      .filter(([k]) => !["ExtendedProperties", "ModifiedProperties", "DeviceProperties"].includes(k))
      .slice(0, 20),
  ),
  null,
  2,
)}
\`\`\`

Investigate this alert using the available tools and deliver your triage verdict.
`.trim();

  const result = await agent.invoke(
    {
      messages:     [new HumanMessage(alertPrompt)],
      triageId,
      category,
    },
    { recursionLimit: Number(process.env.AGENT_MAX_ITERATIONS ?? 15) },
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const verdict  = result.verdict  ?? "INCONCLUSIVE";
  const confidence = result.confidence ?? 0;

  logger.info(
    `[Agent] ${triageId} → ${verdict} (${confidence}% confidence) [${elapsed}s] [${result.toolCallCount} tool calls]`,
  );

  return {
    triageId,
    alertId:          auditEvent.Id,
    category,
    verdict,
    confidence,
    reasoning:        result.reasoning  ?? "",
    evidenceItems:    result.evidenceItems ?? [],
    triageTimestamp:  new Date().toISOString(),
    agentIterations:  result.toolCallCount ?? 0,
  };
}
