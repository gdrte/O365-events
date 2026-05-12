package producer

import "time"

type AADSigninEvent struct {
	Time                    time.Time `json:"time"`
	TenantID                string    `json:"tenantId"`
	CorrelationID           string    `json:"correlationId"`
	Category                string    `json:"category"`
	OperationName           string    `json:"operationName"`
	ResultType              string    `json:"resultType"`
	ResultDescription       string    `json:"resultDescription"`
	UserPrincipalName       string    `json:"userPrincipalName"`
	UserID                  string    `json:"userId"`
	AppDisplayName          string    `json:"appDisplayName"`
	AppID                   string    `json:"appId"`
	IPAddress               string    `json:"ipAddress"`
	Location                string    `json:"location"`
	ConditionalAccessStatus string    `json:"conditionalAccessStatus"`
	MfaDetail               struct {
		AuthMethod string `json:"authMethod"`
		AuthDetail string `json:"authDetail"`
	} `json:"mfaDetail"`
	RiskLevelDuringSignin string `json:"riskLevelDuringSignin"`
	ResourceDisplayName   string `json:"resourceDisplayName"`
}

func genAADSignin() (string, AADSigninEvent) {
	_, code := resultType()
	desc := map[string]string{
		"0": "", "50126": "Invalid username or password",
		"50053": "Account locked", "70011": "Invalid scope",
		"90095": "Admin consent required",
	}
	e := AADSigninEvent{
		Time:                    time.Now().UTC(),
		TenantID:                tenantID,
		CorrelationID:           newGUID(),
		Category:                "SignInLogs",
		OperationName:           "Sign-in activity",
		ResultType:              code,
		ResultDescription:       desc[code],
		UserPrincipalName:       pick(users),
		UserID:                  newGUID(),
		AppDisplayName:          pick(appDisplayNames),
		AppID:                   newGUID(),
		IPAddress:               pick(ipAddresses),
		Location:                pick(azureRegions),
		ConditionalAccessStatus: pick([]string{"success", "notApplied", "failure"}),
		RiskLevelDuringSignin:   pick([]string{"none", "low", "medium", "high"}),
		ResourceDisplayName:     "Microsoft Graph",
	}
	e.MfaDetail.AuthMethod = pick([]string{"Phone app notification", "SMS", "FIDO2 key", ""})
	e.MfaDetail.AuthDetail = pick([]string{"MFA completed in Azure AD", "MFA required by conditional access", ""})
	return "AADSignin", e
}
