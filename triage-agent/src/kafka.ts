import { Kafka, Consumer, Producer, Admin, KafkaConfig, SASLOptions } from "kafkajs";
import { FalsePositiveEvent, TriageVerdict } from "./types";
import { normalizeKafkaMessage } from "./normalizer";
import { logger } from "./logger";

// LLM inference can take 60–120s. Session timeout must exceed the longest
// expected processing time; heartbeat interval must be well under it.
const SESSION_TIMEOUT_MS  = 300_000; // 5 min
const HEARTBEAT_INTERVAL_MS = 15_000; // 15 s — sent while message is processing

function buildKafkaConfig(): KafkaConfig {
  const brokers = (process.env.KAFKA_BROKERS ?? "192.168.0.103:9092").split(",");
  const config: KafkaConfig = {
    clientId: process.env.KAFKA_CLIENT_ID ?? "triage-agent",
    brokers,
    retry: { retries: 5 },
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

const INPUT_TOPIC  = process.env.KAFKA_INPUT_TOPIC  ?? "topic-false-positive";
const OUTPUT_TOPIC = process.env.KAFKA_OUTPUT_TOPIC ?? "topic-triage-verdict";

export class KafkaClient {
  private kafka:    Kafka;
  private consumer: Consumer;
  private producer: Producer;
  private admin:    Admin;

  constructor() {
    this.kafka    = new Kafka(buildKafkaConfig());
    this.consumer = this.kafka.consumer({
      groupId:           process.env.KAFKA_GROUP_ID ?? "triage-agent-group",
      sessionTimeout:    SESSION_TIMEOUT_MS,
      heartbeatInterval: HEARTBEAT_INTERVAL_MS,
      // Allow re-joining quickly after a rebalance
      rebalanceTimeout:  SESSION_TIMEOUT_MS,
    });
    this.producer = this.kafka.producer();
    this.admin    = this.kafka.admin();
  }

  async connect(): Promise<void> {
    await Promise.all([
      this.consumer.connect(),
      this.producer.connect(),
      this.admin.connect(),
    ]);
    logger.info("[Kafka] Connected to brokers");
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.consumer.disconnect(),
      this.producer.disconnect(),
      this.admin.disconnect(),
    ]);
    logger.info("[Kafka] Disconnected");
  }

  // Ensure both topics exist before subscribing / publishing
  async ensureTopics(): Promise<void> {
    const existing = await this.admin.listTopics();
    const toCreate = [INPUT_TOPIC, OUTPUT_TOPIC].filter((t) => !existing.includes(t));

    if (toCreate.length === 0) {
      logger.info(`[Kafka] Topics verified: ${INPUT_TOPIC}, ${OUTPUT_TOPIC}`);
      return;
    }

    await this.admin.createTopics({
      topics: toCreate.map((topic) => ({
        topic,
        numPartitions:     1,
        replicationFactor: 1,
      })),
      waitForLeaders: true,
    });

    logger.info(`[Kafka] Created missing topics: ${toCreate.join(", ")}`);
  }

  async subscribe(): Promise<void> {
    await this.consumer.subscribe({ topic: INPUT_TOPIC, fromBeginning: false });
    logger.info(`[Kafka] Subscribed to topic: ${INPUT_TOPIC}`);
  }

  async publishVerdict(verdict: TriageVerdict): Promise<void> {
    await this.producer.send({
      topic: OUTPUT_TOPIC,
      messages: [
        {
          key:   verdict.triageId,
          value: JSON.stringify(verdict),
          headers: {
            "verdict":             verdict.verdict,
            "confidence":          String(verdict.confidence),
            "category":            verdict.category,
            "triage-timestamp":    verdict.triageTimestamp,
            "x-opt-enqueued-time": verdict.triageTimestamp,
            "content-type":        "application/json",
            "event-type":          "TriageVerdict",
          },
        },
      ],
    });
    logger.info(`[Kafka] Published verdict for ${verdict.triageId} → topic: ${OUTPUT_TOPIC}`);
  }

  async consume(handler: (event: FalsePositiveEvent) => Promise<void>): Promise<void> {
    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        const raw = message.value?.toString();
        if (!raw) return;

        const event = normalizeKafkaMessage(
          message.headers ?? {},
          raw,
          message.offset,
          partition,
        );

        // Background event (AADSignin, OutlookMail, …) — not a triage target
        if (!event) {
          await this.consumer.commitOffsets([
            { topic, partition, offset: String(Number(message.offset) + 1) },
          ]);
          return;
        }

        logger.info(
          `[Kafka] Received triageId=${event.triageId} category=${event.category} user=${event.auditEvent.UserId}`,
        );

        // Heartbeat on an interval so the broker doesn't evict us while the
        // LLM is running (inference routinely takes 60–120 s).
        const heartbeatTimer = setInterval(() => {
          heartbeat().catch((err) =>
            logger.warn(`[Kafka] Heartbeat error during processing: ${err}`),
          );
        }, HEARTBEAT_INTERVAL_MS);

        try {
          await handler(event);
          await this.consumer.commitOffsets([
            { topic, partition, offset: String(Number(message.offset) + 1) },
          ]);
        } catch (err) {
          logger.error(`[Kafka] Handler error for triageId=${event.triageId}: ${err}`);
          // Do not commit — message will be retried after rebalance
        } finally {
          clearInterval(heartbeatTimer);
        }
      },
    });
  }
}
