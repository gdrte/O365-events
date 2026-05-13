/**
 * Demo runner — triages all 8 O365 scenarios without needing Kafka.
 * Run with: npx ts-node src/demo.ts [scenario-index]
 */
import "dotenv/config";
import { createTriageAgent, triageEvent } from "./agent";
import { generateDemoEvent, getAllDemoScenarios, SCENARIO_LABELS } from "./demoEvents";
import { logger } from "./logger";

async function runDemo() {
  const arg = process.argv[2];

  logger.info("=== O365 Triage Agent — Demo Mode ===");
  logger.info("Available scenarios:");
  SCENARIO_LABELS.forEach((label) => logger.info(`  ${label}`));
  logger.info("");

  const agent = await createTriageAgent();
  logger.info("[Agent] Ready\n");

  const events =
    arg !== undefined && !isNaN(Number(arg))
      ? [generateDemoEvent(Number(arg))]
      : getAllDemoScenarios();

  for (const event of events) {
    logger.info(`\n${"─".repeat(70)}`);
    logger.info(`Scenario: ${event.category}`);
    logger.info(`Flag reason: ${event.flagReason}`);
    logger.info(`User: ${event.auditEvent.UserId}  |  Op: ${event.auditEvent.Operation}`);
    logger.info(`${"─".repeat(70)}`);

    const verdict = await triageEvent(agent, event);

    const icon =
      verdict.verdict === "FALSE_POSITIVE" ? "✓ FALSE POSITIVE" :
      verdict.verdict === "TRUE_POSITIVE"  ? "✗ TRUE POSITIVE (REAL THREAT)" :
                                             "? INCONCLUSIVE";

    logger.info(`\nVERDICT: ${icon} (${verdict.confidence}% confidence)`);
    logger.info(`Reasoning: ${verdict.reasoning}`);
    logger.info("Evidence:");
    for (const e of verdict.evidenceItems) {
      const tag = e.supportsVerdict ? "  [+]" : "  [-]";
      logger.info(`${tag} ${e.source}: ${e.finding}`);
    }
  }

  logger.info("\n=== Demo complete ===");
}

runDemo().catch((err) => {
  logger.error(`Demo failed: ${err}`);
  process.exit(1);
});
