import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { logger } from "../logger";

const NetworkInput = z.object({
  sourceIp: z.string().optional().describe("Source IP to investigate"),
  destinationIp: z.string().optional().describe("Destination IP to investigate"),
  timeRangeMinutes: z.number().default(30).describe("How many minutes back to analyze"),
  checkType: z
    .enum(["flow_summary", "dns_queries", "firewall_hits", "bandwidth_anomaly"])
    .describe("Type of network check to perform"),
});

export const networkTrafficTool = tool(
  async ({ sourceIp, destinationIp, timeRangeMinutes, checkType }) => {
    logger.info(`[Network] ${checkType} for src=${sourceIp ?? "*"} dst=${destinationIp ?? "*"}`);

    const siemUrl = process.env.SIEM_API_URL;
    const siemKey = process.env.SIEM_API_KEY;

    if (siemUrl && siemKey) {
      try {
        const must: object[] = [{ term: { "network.type": checkType } }];
        if (sourceIp) must.push({ term: { "source.ip": sourceIp } });
        if (destinationIp) must.push({ term: { "destination.ip": destinationIp } });

        const response = await axios.post(
          `${siemUrl}/network-*/_search`,
          {
            query: {
              bool: {
                must,
                filter: [{ range: { "@timestamp": { gte: `now-${timeRangeMinutes}m` } } }],
              },
            },
            size: 50,
          },
          { headers: { Authorization: `ApiKey ${siemKey}` }, timeout: 10000 }
        );
        return JSON.stringify({ source: "NetworkAnalysis", ...response.data });
      } catch (err) {
        logger.warn(`[Network] Analysis error: ${err}`);
      }
    }

    return JSON.stringify(simulateNetworkCheck(sourceIp, destinationIp, timeRangeMinutes, checkType));
  },
  {
    name: "analyze_network_traffic",
    description:
      "Analyze network traffic flows, DNS queries, firewall hits, or bandwidth anomalies for a given IP pair or host. Use to determine if network behavior matches an attack pattern or is consistent with normal activity.",
    schema: NetworkInput,
  }
);

function simulateNetworkCheck(
  sourceIp?: string,
  destinationIp?: string,
  timeRange = 30,
  checkType = "flow_summary"
) {
  const base = {
    source: "SimulatedNetworkAnalysis",
    sourceIp: sourceIp ?? "N/A",
    destinationIp: destinationIp ?? "N/A",
    timeRangeMinutes: timeRange,
    checkType,
    note: "SIMULATED — configure SIEM_API_URL for live network data",
  };

  if (checkType === "flow_summary") {
    return {
      ...base,
      totalFlows: 34,
      uniqueDestinations: 8,
      topPorts: [443, 80, 53],
      avgBytesPerFlow: 1240,
      anomalyDetected: false,
      verdict: "NORMAL_TRAFFIC_PATTERN",
    };
  }
  if (checkType === "dns_queries") {
    return {
      ...base,
      totalQueries: 18,
      nxdomainRate: 0.05,
      suspiciousDomains: [],
      dga_suspected: false,
      verdict: "CLEAN",
    };
  }
  if (checkType === "firewall_hits") {
    return {
      ...base,
      blockedAttempts: 0,
      allowedFlows: 34,
      geoRiskCountries: [],
      verdict: "NO_BLOCKED_ATTEMPTS",
    };
  }
  return {
    ...base,
    baselineDeviation: "2.1%",
    peakBandwidthMbps: 1.4,
    anomalyDetected: false,
    verdict: "WITHIN_BASELINE",
  };
}
