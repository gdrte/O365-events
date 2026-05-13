import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { logger } from "../logger";

const SiemInput = z.object({
  query: z.string().describe("What to search for — e.g. 'failed logins from 192.168.1.5 last 1h'"),
  sourceIp: z.string().optional().describe("Filter by source IP"),
  hostname: z.string().optional().describe("Filter by hostname"),
  userId: z.string().optional().describe("Filter by user ID"),
  timeRangeMinutes: z.number().default(60).describe("How many minutes back to search"),
});

export const siemQueryTool = tool(
  async ({ query, sourceIp, hostname, userId, timeRangeMinutes }) => {
    logger.info(`[SIEM] Querying: ${query}`);

    const siemUrl = process.env.SIEM_API_URL;
    const siemKey = process.env.SIEM_API_KEY;

    if (siemUrl && siemKey) {
      try {
        const must: object[] = [];
        if (sourceIp) must.push({ term: { "source.ip": sourceIp } });
        if (hostname) must.push({ term: { "host.name": hostname } });
        if (userId) must.push({ term: { "user.name": userId } });

        const esQuery = {
          query: {
            bool: {
              must,
              filter: [{ range: { "@timestamp": { gte: `now-${timeRangeMinutes}m` } } }],
            },
          },
          size: 20,
          sort: [{ "@timestamp": { order: "desc" } }],
        };

        const response = await axios.post(`${siemUrl}/security-*/_search`, esQuery, {
          headers: { Authorization: `ApiKey ${siemKey}`, "Content-Type": "application/json" },
          timeout: 15000,
        });

        const hits = response.data.hits.hits.map((h: { _source: unknown }) => h._source);
        return JSON.stringify({ source: "SIEM", totalHits: response.data.hits.total.value, events: hits });
      } catch (err) {
        logger.warn(`[SIEM] Query error: ${err}`);
      }
    }

    return JSON.stringify(simulateSiemQuery(query, sourceIp, hostname, userId, timeRangeMinutes));
  },
  {
    name: "query_siem_events",
    description:
      "Query the SIEM (Elasticsearch/OpenSearch) to correlate the alert with recent security events. Useful for checking login failures, lateral movement, data exfiltration patterns, or verifying if an alert is part of a broader attack chain.",
    schema: SiemInput,
  }
);

function simulateSiemQuery(
  query: string,
  sourceIp?: string,
  hostname?: string,
  userId?: string,
  timeRange = 60
) {
  const events = [
    {
      "@timestamp": new Date(Date.now() - 5 * 60000).toISOString(),
      "event.category": "authentication",
      "event.outcome": "success",
      "source.ip": sourceIp ?? "10.0.0.45",
      "host.name": hostname ?? "workstation-07",
      "user.name": userId ?? "jdoe",
      message: "Successful login via Kerberos",
    },
    {
      "@timestamp": new Date(Date.now() - 12 * 60000).toISOString(),
      "event.category": "network",
      "event.outcome": "unknown",
      "source.ip": sourceIp ?? "10.0.0.45",
      "host.name": hostname ?? "workstation-07",
      message: "DNS query for internal resource",
    },
  ];

  return {
    source: "SimulatedSIEM",
    query,
    timeRangeMinutes: timeRange,
    totalHits: events.length,
    events,
    anomaliesDetected: 0,
    verdict: "NO_CORRELATION_FOUND",
    note: "SIMULATED — configure SIEM_API_URL and SIEM_API_KEY for live data",
  };
}
