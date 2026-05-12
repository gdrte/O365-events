package main

import (
	"math/rand"
	"time"
)

type DiagnosticEvent struct {
	Time          time.Time              `json:"time"`
	ResourceID    string                 `json:"resourceId"`
	OperationName string                 `json:"operationName"`
	Category      string                 `json:"category"`
	Level         string                 `json:"level"`
	Properties    map[string]interface{} `json:"properties"`
}

func genDiagnostic() (string, DiagnosticEvent) {
	categories := []string{"AppServiceHTTPLogs", "StorageReadLogs", "KeyVaultAuditEvent", "SQLSecurityAuditEvents"}
	cat := pick(categories)
	names := []string{"app-prod", "storageaccount", "kv-main", "sqlserver"}
	e := DiagnosticEvent{
		Time:          time.Now().UTC(),
		ResourceID:    resourceID("Microsoft.Web", "sites", pick(names)),
		OperationName: cat + "/write",
		Category:      cat,
		Level:         pick([]string{"Informational", "Warning", "Error"}),
		Properties: map[string]interface{}{
			"clientIp":   pick(ipAddresses),
			"timeTaken":  rand.Intn(5000),
			"httpStatus": pick([]string{"200", "201", "400", "401", "403", "500"}),
			"userAgent":  "Mozilla/5.0 (compatible; AzureMonitor)",
			"requestId":  newGUID(),
		},
	}
	return "Diagnostic", e
}
