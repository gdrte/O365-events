/**
 * Verdict monitor — pretty-prints triage verdicts from topic-triage-verdict.
 * Run with: npm run monitor
 */
import "dotenv/config";
import { Kafka, KafkaConfig, logLevel, SASLOptions } from "kafkajs";
import { TriageVerdict } from "./types";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";
const BG_RED = "\x1b[41m";
const BG_GREEN = "\x1b[42m";
const BG_YELLOW = "\x1b[43m";

function buildKafkaConfig(): KafkaConfig {
  const brokers = (process.env.KAFKA_BROKERS ?? "192.168.0.103:9092").split(
    ",",
  );
  const config: KafkaConfig = {
    logLevel: logLevel.ERROR,
    clientId: "triage-monitor",
    brokers,
  };
  if (process.env.KAFKA_SASL_ENABLED === "true") {
    config.sasl = {
      mechanism: "plain",
      username: process.env.KAFKA_SASL_USERNAME ?? "",
      password: process.env.KAFKA_SASL_PASSWORD ?? "",
    } as SASLOptions;
    config.ssl = true;
  }
  return config;
}

function verdictBadge(verdict: string): string {
  if (verdict === "TRUE_POSITIVE")
    return `${BOLD}${BG_RED}  TRUE POSITIVE  ${RESET}`;
  if (verdict === "FALSE_POSITIVE")
    return `${BOLD}${BG_GREEN}  FALSE POSITIVE  ${RESET}`;
  return `${BOLD}${BG_YELLOW}  INCONCLUSIVE  ${RESET}`;
}

function confidenceBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const color = score >= 80 ? GREEN : score >= 60 ? YELLOW : RED;
  return `${color}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET} ${BOLD}${score}%${RESET}`;
}

function formatVerdict(v: TriageVerdict): string {
  const ts = new Date(v.triageTimestamp).toLocaleTimeString();
  const lines: string[] = [];

  lines.push(`\n${CYAN}${"─".repeat(72)}${RESET}`);
  lines.push(
    `${BOLD}${WHITE}[${ts}] ${v.category}${RESET}  ${verdictBadge(v.verdict)}`,
  );
  lines.push(`${DIM}Triage ID : ${v.triageId}${RESET}`);
  lines.push(`${DIM}Alert ID  : ${v.alertId}${RESET}`);
  lines.push(`Confidence: ${confidenceBar(v.confidence)}`);
  lines.push(`${BOLD}Reasoning :${RESET} ${v.reasoning}`);

  if (v.evidenceItems?.length) {
    lines.push(`${BOLD}Evidence  :${RESET}`);
    for (const e of v.evidenceItems) {
      const icon = e.supportsVerdict
        ? `${GREEN}[+]${RESET}`
        : `${RED}[-]${RESET}`;
      const src = `${CYAN}${e.source}${RESET}`;
      lines.push(`  ${icon} ${src}: ${e.finding}`);
    }
  }

  lines.push(`${DIM}Tool calls: ${v.agentIterations}${RESET}`);
  return lines.join("\n");
}

async function main() {
  const topic = process.env.KAFKA_OUTPUT_TOPIC ?? "topic-triage-verdict";
  const kafka = new Kafka(buildKafkaConfig());
  const consumer = kafka.consumer({ groupId: "triage-monitor" });

  console.log(`${BOLD}${CYAN}`);
  console.log(
    "╔══════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║          O365 Triage Agent — Verdict Monitor                        ║",
  );
  console.log(
    `╚══════════════════════════════════════════════════════════════════════╝${RESET}`,
  );
  console.log(
    `${DIM}Connecting to Kafka broker: ${process.env.KAFKA_BROKERS ?? "192.168.0.103:9092"}${RESET}`,
  );
  console.log(`${DIM}Listening on topic        : ${topic}${RESET}\n`);

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  const shutdown = async () => {
    console.log(`\n${DIM}Shutting down monitor...${RESET}`);
    await consumer.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value?.toString();
      if (!raw) return;

      try {
        const verdict = JSON.parse(raw) as TriageVerdict;
        console.log(formatVerdict(verdict));
      } catch {
        console.error(`${RED}Failed to parse verdict message${RESET}`);
      }
    },
  });
}

main().catch((err) => {
  console.error(`${RED}Fatal: ${err}${RESET}`);
  process.exit(1);
});
