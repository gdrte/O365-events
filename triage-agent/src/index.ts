import "dotenv/config";
import { KafkaClient } from "./kafka";
import { createTriageAgent, triageEvent, TriageAgent } from "./agent";
import { logger } from "./logger";

async function main() {
  logger.info("=== O365 Triage Agent starting ===");

  const kafka = new KafkaClient();
  let agent: TriageAgent;

  try {
    agent = await createTriageAgent();
    logger.info("[Agent] LangGraph agent initialized");
  } catch (err) {
    logger.error(`[Agent] Failed to initialize: ${err}`);
    process.exit(1);
  }

  try {
    await kafka.connect();
    await kafka.ensureTopics();
    await kafka.subscribe();
  } catch (err) {
    logger.error(`[Kafka] Connection failed: ${err}`);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[Main] Received ${signal} — shutting down`);
    await kafka.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info("[Main] Consuming from topic-false-positive ...");

  await kafka.consume(async (event) => {
    const verdict = await triageEvent(agent, event);
    await kafka.publishVerdict(verdict);

    logger.info(
      `[Result] triageId=${verdict.triageId} verdict=${verdict.verdict} confidence=${verdict.confidence}%`
    );
    logger.info(`[Result] Reasoning: ${verdict.reasoning}`);
  });
}

main().catch((err) => {
  logger.error(`[Main] Fatal error: ${err}`);
  process.exit(1);
});
