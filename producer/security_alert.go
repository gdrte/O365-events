package main

import (
	"math/rand"
	"time"
)

type SecurityAlertEvent struct {
	Time               time.Time         `json:"time"`
	TenantID           string            `json:"tenantId"`
	AlertType          string            `json:"alertType"`
	AlertDisplayName   string            `json:"alertDisplayName"`
	Description        string            `json:"description"`
	Severity           string            `json:"severity"`
	ConfidenceScore    float64           `json:"confidenceScore"`
	ResourceID         string            `json:"resourceId"`
	CompromisedEntity  string            `json:"compromisedEntity"`
	RemediationSteps   []string          `json:"remediationSteps"`
	ExtendedProperties map[string]string `json:"extendedProperties"`
}

var securityAlerts = []struct{ alertType, name, desc string }{
	{"VM_SuspiciousActivity", "Suspicious process executed", "A process was executed that is known to be associated with suspicious activity."},
	{"NETWORK_AzureDDoSAttack", "DDoS attack detected", "Azure DDoS Protection detected and mitigated a DDoS attack."},
	{"IAM_AnomolousAADObjectAddedToGroup", "Anomalous object added to AAD group", "A user account was added to a privileged Azure AD group."},
	{"KV_AccessFromUnfamiliarApplication", "Key Vault accessed from unfamiliar application", "Key Vault was accessed by an application not seen before."},
	{"SQL_BruteForce", "SQL brute force attack", "Multiple failed login attempts were detected on an Azure SQL Server."},
	{"Storage_AnonymousAccessEnabled", "Anonymous access enabled on storage", "A storage account was modified to allow anonymous public access."},
}

func genSecurityAlert() (string, SecurityAlertEvent) {
	alert := securityAlerts[rand.Intn(len(securityAlerts))]
	names := []string{"vm-prod-01", "sqlserver-core", "kv-secrets", "stgaccountprod"}
	name := pick(names)
	e := SecurityAlertEvent{
		Time:              time.Now().UTC(),
		TenantID:          tenantID,
		AlertType:         alert.alertType,
		AlertDisplayName:  alert.name,
		Description:       alert.desc,
		Severity:          pick([]string{"Low", "Medium", "High", "Informational"}),
		ConfidenceScore:   float64(rand.Intn(40)+60) / 100.0,
		ResourceID:        resourceID("Microsoft.Compute", "virtualMachines", name),
		CompromisedEntity: name,
		RemediationSteps: []string{
			"Review the process execution details",
			"Isolate the resource if compromise is confirmed",
			"Rotate credentials immediately",
		},
		ExtendedProperties: map[string]string{
			"source ip": pick(ipAddresses),
			"user name": pick(users),
			"alert id":  newGUID(),
		},
	}
	return "SecurityAlert", e
}
