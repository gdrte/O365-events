package main

import (
	"fmt"
	"math/rand"
)

var (
	tenantID       = "72f988bf-86f1-41af-91ab-2d7cd011db47"
	subscriptionID = "a08d98f4-1234-5678-abcd-ef0123456789"

	azureRegions = []string{
		"eastus", "westus2", "westeurope", "southeastasia", "uksouth", "australiaeast",
	}
	resourceGroups = []string{
		"rg-prod-core", "rg-prod-security", "rg-dev-infra", "rg-shared-services",
	}
	users = []string{
		"alice@contoso.com", "bob@contoso.com", "carol@contoso.com",
		"dave@contoso.com", "eve@contoso.com", "svc-deploy@contoso.com",
	}
	appDisplayNames = []string{
		"Microsoft Teams", "Office 365 Exchange Online", "Azure Portal",
		"Microsoft Graph", "Azure Active Directory", "Visual Studio Code",
	}
	ipAddresses = []string{
		"203.0.113.42", "198.51.100.17", "192.0.2.88",
		"104.44.130.22", "52.96.0.1", "40.112.72.205",
	}
	clientApps = []string{
		"Outlook for Windows", "Outlook for Mac", "Outlook Web App",
		"Outlook Mobile (iOS)", "Outlook Mobile (Android)", "REST API",
	}
)

func newGUID() string {
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		rand.Int31(), rand.Int31n(0xffff), rand.Int31n(0xffff),
		rand.Int31n(0xffff), rand.Int63n(0xffffffffffff),
	)
}

func resourceID(provider, resType, name string) string {
	rg := resourceGroups[rand.Intn(len(resourceGroups))]
	return fmt.Sprintf("/subscriptions/%s/resourceGroups/%s/providers/%s/%s/%s",
		subscriptionID, rg, provider, resType, name)
}

func pick(s []string) string { return s[rand.Intn(len(s))] }

func resultType() (string, string) {
	if rand.Intn(10) < 8 {
		return "Success", "0"
	}
	codes := []string{"50126", "50053", "70011", "90095"}
	c := pick(codes)
	return "Failure", c
}
