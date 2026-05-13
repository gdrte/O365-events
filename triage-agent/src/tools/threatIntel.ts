import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import { logger } from "../logger";

const ThreatIntelInput = z.object({
  indicator: z.string().describe("IP address, domain, or file hash to look up"),
  indicatorType: z.enum(["ip", "domain", "hash"]).describe("Type of indicator"),
});

export const threatIntelTool = tool(
  async ({ indicator, indicatorType }) => {
    logger.info(`[ThreatIntel] Looking up ${indicatorType}: ${indicator}`);

    // AbuseIPDB for IPs
    if (indicatorType === "ip" && process.env.ABUSEIPDB_API_KEY) {
      try {
        const response = await axios.get("https://api.abuseipdb.com/api/v2/check", {
          headers: {
            Key: process.env.ABUSEIPDB_API_KEY,
            Accept: "application/json",
          },
          params: { ipAddress: indicator, maxAgeInDays: 30 },
          timeout: 10000,
        });
        const data = response.data.data;
        return JSON.stringify({
          source: "AbuseIPDB",
          indicator,
          abuseConfidenceScore: data.abuseConfidenceScore,
          totalReports: data.totalReports,
          isTor: data.isTor,
          usageType: data.usageType,
          isp: data.isp,
          countryCode: data.countryCode,
          verdict: data.abuseConfidenceScore > 50 ? "MALICIOUS" : data.abuseConfidenceScore > 10 ? "SUSPICIOUS" : "CLEAN",
        });
      } catch (err) {
        logger.warn(`[ThreatIntel] AbuseIPDB error: ${err}`);
      }
    }

    // VirusTotal for hashes, IPs, domains
    if (process.env.VIRUSTOTAL_API_KEY) {
      try {
        const endpoint =
          indicatorType === "hash"
            ? `files/${indicator}`
            : indicatorType === "domain"
            ? `domains/${indicator}`
            : `ip_addresses/${indicator}`;

        const response = await axios.get(`https://www.virustotal.com/api/v3/${endpoint}`, {
          headers: { "x-apikey": process.env.VIRUSTOTAL_API_KEY },
          timeout: 10000,
        });
        const stats = response.data.data?.attributes?.last_analysis_stats ?? {};
        const malicious = stats.malicious ?? 0;
        const total = Object.values(stats).reduce((a: number, b) => a + (b as number), 0);
        return JSON.stringify({
          source: "VirusTotal",
          indicator,
          maliciousEngines: malicious,
          totalEngines: total,
          detectionRatio: total > 0 ? `${malicious}/${total}` : "N/A",
          verdict: malicious > 5 ? "MALICIOUS" : malicious > 0 ? "SUSPICIOUS" : "CLEAN",
        });
      } catch (err) {
        logger.warn(`[ThreatIntel] VirusTotal error: ${err}`);
      }
    }

    // Simulation fallback for demo
    return JSON.stringify(simulateThreatIntel(indicator, indicatorType));
  },
  {
    name: "lookup_threat_intel",
    description:
      "Look up an IP address, domain, or file hash in threat intelligence databases (AbuseIPDB, VirusTotal). Returns malicious/suspicious/clean verdict with confidence scores.",
    schema: ThreatIntelInput,
  }
);

function simulateThreatIntel(indicator: string, type: string) {
  const knownBad = ["198.51.100.1", "evil.example.com", "d41d8cd98f00b204e9800998ecf8427e"];
  const isMalicious = knownBad.includes(indicator) || indicator.startsWith("198.51");
  return {
    source: "SimulatedThreatIntel",
    indicator,
    indicatorType: type,
    verdict: isMalicious ? "MALICIOUS" : "CLEAN",
    abuseConfidenceScore: isMalicious ? 85 : 2,
    note: "SIMULATED — configure ABUSEIPDB_API_KEY or VIRUSTOTAL_API_KEY for live lookups",
  };
}
