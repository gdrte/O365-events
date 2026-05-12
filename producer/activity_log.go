package main

import (
	"math/rand"
	"time"
)

type ActivityLogEvent struct {
	Time            time.Time         `json:"time"`
	TenantID        string            `json:"tenantId"`
	CorrelationID   string            `json:"correlationId"`
	Category        string            `json:"category"`
	OperationName   string            `json:"operationName"`
	Level           string            `json:"level"`
	ResultType      string            `json:"resultType"`
	ResultSignature string            `json:"resultSignature"`
	Caller          string            `json:"caller"`
	ResourceID      string            `json:"resourceId"`
	SubscriptionID  string            `json:"subscriptionId"`
	Properties      map[string]string `json:"properties"`
}

var armOperations = []struct{ op, provider, resType string }{
	{"Microsoft.Compute/virtualMachines/write", "Microsoft.Compute", "virtualMachines"},
	{"Microsoft.Compute/virtualMachines/delete", "Microsoft.Compute", "virtualMachines"},
	{"Microsoft.Network/networkSecurityGroups/write", "Microsoft.Network", "networkSecurityGroups"},
	{"Microsoft.Storage/storageAccounts/write", "Microsoft.Storage", "storageAccounts"},
	{"Microsoft.KeyVault/vaults/secrets/write", "Microsoft.KeyVault", "vaults"},
	{"Microsoft.Authorization/roleAssignments/write", "Microsoft.Authorization", "roleAssignments"},
	{"Microsoft.Web/sites/write", "Microsoft.Web", "sites"},
	{"Microsoft.Sql/servers/databases/write", "Microsoft.Sql", "servers"},
}

func genActivityLog() (string, ActivityLogEvent) {
	op := armOperations[rand.Intn(len(armOperations))]
	result, _ := resultType()
	names := []string{"vm-prod-01", "vm-prod-02", "storage-core", "kv-secrets", "nsg-frontend"}
	e := ActivityLogEvent{
		Time:            time.Now().UTC(),
		TenantID:        tenantID,
		CorrelationID:   newGUID(),
		Category:        "Administrative",
		OperationName:   op.op,
		Level:           pick([]string{"Informational", "Warning", "Error"}),
		ResultType:      result,
		ResultSignature: pick([]string{"Succeeded", "Accepted", "Failed"}),
		Caller:          pick(users),
		ResourceID:      resourceID(op.provider, op.resType, pick(names)),
		SubscriptionID:  subscriptionID,
		Properties: map[string]string{
			"requestbody":      `{"location":"` + pick(azureRegions) + `"}`,
			"serviceRequestId": newGUID(),
		},
	}
	return "ActivityLog", e
}
