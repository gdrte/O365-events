import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { logger } from "../logger";

const EndpointInput = z.object({
  hostname: z.string().describe("Hostname or IP of the endpoint to check"),
  checkType: z
    .enum(["process_activity", "network_connections", "file_activity", "overall_health"])
    .describe("What to check on the endpoint"),
});

export const endpointStatusTool = tool(
  async ({ hostname, checkType }) => {
    logger.info(`[Endpoint] Checking ${checkType} on ${hostname}`);

    const edrUrl = process.env.EDR_API_URL;
    const edrKey = process.env.EDR_API_KEY;

    if (edrUrl && edrKey) {
      try {
        const response = await axios.get(`${edrUrl}/host/${hostname}/${checkType}`, {
          headers: { Authorization: `Bearer ${edrKey}` },
          timeout: 10000,
        });
        return JSON.stringify({ source: "EDR", hostname, checkType, ...response.data });
      } catch (err) {
        logger.warn(`[Endpoint] EDR API error: ${err}`);
      }
    }

    return JSON.stringify(simulateEndpointCheck(hostname, checkType));
  },
  {
    name: "check_endpoint_status",
    description:
      "Query the EDR/endpoint agent on a host to check for suspicious process activity, abnormal network connections, malicious file activity, or overall health status. Use to verify if the endpoint shows real signs of compromise.",
    schema: EndpointInput,
  }
);

function simulateEndpointCheck(hostname: string, checkType: string) {
  const base = {
    source: "SimulatedEDR",
    hostname,
    checkType,
    note: "SIMULATED — configure EDR_API_URL and EDR_API_KEY for live data",
  };

  if (checkType === "process_activity") {
    return {
      ...base,
      suspiciousProcesses: [],
      recentProcesses: ["svchost.exe", "explorer.exe", "chrome.exe"],
      verdict: "CLEAN",
      anomalyScore: 5,
    };
  }
  if (checkType === "network_connections") {
    return {
      ...base,
      activeConnections: [
        { remote: "8.8.8.8:53", protocol: "UDP", process: "svchost.exe" },
        { remote: "192.168.0.1:80", protocol: "TCP", process: "chrome.exe" },
      ],
      suspiciousConnections: [],
      verdict: "CLEAN",
      anomalyScore: 3,
    };
  }
  if (checkType === "file_activity") {
    return {
      ...base,
      recentFileModifications: 12,
      suspiciousFileWrites: 0,
      encryptionActivity: false,
      verdict: "CLEAN",
      anomalyScore: 2,
    };
  }
  return {
    ...base,
    overallRiskScore: 8,
    lastSeen: new Date().toISOString(),
    agentVersion: "7.12.1",
    policyCompliant: true,
    verdict: "HEALTHY",
  };
}
