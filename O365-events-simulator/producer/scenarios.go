package producer

import (
	"fmt"
	"math/rand"
	"strings"
	"time"
)

// auditParam is a generic name/value pair used across Exchange audit events.
type auditParam struct {
	Name  string `json:"Name"`
	Value string `json:"Value"`
}

// ─── 0: ImpossibleTravel (FALSE_POSITIVE — VPN exit node) ───────────────────

type ImpossibleTravelEvent struct {
	Time              time.Time `json:"time"`
	TenantID          string    `json:"tenantId"`
	CorrelationID     string    `json:"correlationId"`
	Category          string    `json:"category"`
	OperationName     string    `json:"operationName"`
	UserPrincipalName string    `json:"userPrincipalName"`
	UserID            string    `json:"userId"`
	IPAddress         string    `json:"ipAddress"`
	Location          string    `json:"location"`
	PreviousIPAddress string    `json:"previousIpAddress"`
	PreviousLocation  string    `json:"previousLocation"`
	TravelDistanceKm  int       `json:"travelDistanceKm"`
	IntervalMinutes   int       `json:"intervalMinutes"`
	RiskEventType     string    `json:"riskEventType"`
	RiskLevel         string    `json:"riskLevel"`
	UserAgent         string    `json:"userAgent"`
}

var impossibleTravelPairs = []struct {
	loc1, ip1, loc2, ip2 string
	distKm               int
}{
	{"eastus", "104.44.130.22", "westeurope", "52.174.56.203", 6800},
	{"australiaeast", "13.75.149.1", "eastus", "40.71.0.200", 16000},
	{"southeastasia", "137.116.195.85", "uksouth", "51.140.0.50", 10500},
	{"eastus", "40.112.72.205", "southeastasia", "13.67.9.5", 15000},
}

func genImpossibleTravel() (string, ImpossibleTravelEvent) {
	pair := impossibleTravelPairs[rand.Intn(len(impossibleTravelPairs))]
	return "ImpossibleTravel", ImpossibleTravelEvent{
		Time:              time.Now().UTC(),
		TenantID:          tenantID,
		CorrelationID:     newGUID(),
		Category:          "RiskySignins",
		OperationName:     "Risk detection",
		UserPrincipalName: pick(users),
		UserID:            newGUID(),
		IPAddress:         pair.ip2,
		Location:          pair.loc2,
		PreviousIPAddress: pair.ip1,
		PreviousLocation:  pair.loc1,
		TravelDistanceKm:  pair.distKm,
		IntervalMinutes:   rand.Intn(20) + 2,
		RiskEventType:     "impossibleTravel",
		RiskLevel:         pick([]string{"medium", "high"}),
		UserAgent:         pick(clientApps),
	}
}

// ─── 1: ExternalForwardingRuleCreated (TRUE_POSITIVE — attacker exfil) ──────

type ExternalForwardingRuleEvent struct {
	CreationTime     time.Time    `json:"CreationTime"`
	Id               string       `json:"Id"`
	Operation        string       `json:"Operation"`
	OrganizationId   string       `json:"OrganizationId"`
	RecordType       int          `json:"RecordType"`
	ResultStatus     string       `json:"ResultStatus"`
	Workload         string       `json:"Workload"`
	UserId           string       `json:"UserId"`
	ClientIPAddress  string       `json:"ClientIPAddress"`
	OrganizationName string       `json:"OrganizationName"`
	MailboxOwnerUPN  string       `json:"MailboxOwnerUPN"`
	RuleName         string       `json:"RuleName"`
	ForwardTo        string       `json:"ForwardTo"`
	Parameters       []auditParam `json:"Parameters"`
}

var (
	externalDomains = []string{
		"gmail.com", "protonmail.com", "yahoo.com",
		"tutanota.com", "pm.me", "cock.li",
	}
	exfilRuleNames = []string{
		"Newsletter filter", "Auto-sort", "Cleanup rule", "Backup mail", "Notifications",
	}
)

func genExternalForwardingRule() (string, ExternalForwardingRuleEvent) {
	user := pick(users)
	extEmail := fmt.Sprintf("user%04d@%s", rand.Intn(9999), pick(externalDomains))
	rule := pick(exfilRuleNames)
	return "ExternalForwardingRuleCreated", ExternalForwardingRuleEvent{
		CreationTime:     time.Now().UTC(),
		Id:               newGUID(),
		Operation:        "ExternalForwardingRuleCreated",
		OrganizationId:   tenantID,
		RecordType:       1,
		ResultStatus:     "Succeeded",
		Workload:         "Exchange",
		UserId:           user,
		ClientIPAddress:  pick(ipAddresses),
		OrganizationName: "contoso.com",
		MailboxOwnerUPN:  user,
		RuleName:         rule,
		ForwardTo:        extEmail,
		Parameters: []auditParam{
			{Name: "Name", Value: rule},
			{Name: "ForwardTo", Value: extEmail},
			{Name: "Enabled", Value: "True"},
			{Name: "StopProcessingRules", Value: "False"},
		},
	}
}

// ─── 2: BulkSharePointDownload (FALSE_POSITIVE — OneDrive sync) ─────────────

type SharePointDownloadEvent struct {
	CreationTime     time.Time `json:"CreationTime"`
	Id               string    `json:"Id"`
	Operation        string    `json:"Operation"`
	OrganizationId   string    `json:"OrganizationId"`
	RecordType       int       `json:"RecordType"`
	Workload         string    `json:"Workload"`
	UserId           string    `json:"UserId"`
	ClientIPAddress  string    `json:"ClientIPAddress"`
	UserAgent        string    `json:"UserAgent"`
	SiteUrl          string    `json:"SiteUrl"`
	SourceFileName   string    `json:"SourceFileName"`
	SourceFileExt    string    `json:"SourceFileExt"`
	FileSizeBytes    int       `json:"FileSizeBytes"`
	ItemType         string    `json:"ItemType"`
	ListItemUniqueId string    `json:"ListItemUniqueId"`
}

var (
	sharePointSites = []string{
		"https://contoso.sharepoint.com/sites/Finance",
		"https://contoso.sharepoint.com/sites/HR",
		"https://contoso.sharepoint.com/sites/Engineering",
		"https://contoso.sharepoint.com/sites/Legal",
		"https://contoso-my.sharepoint.com/personal/",
	}
	documentNames = []string{
		"Q4_Financial_Report", "Employee_Roster", "MA_Due_Diligence",
		"Source_Code_Export", "Customer_PII_Database", "Board_Minutes",
		"Salary_Data", "Contract_Template", "Product_Roadmap", "HR_Policy",
	}
	fileExtensions = []string{"xlsx", "docx", "pdf", "csv", "zip", "pptx"}
)

func genBulkSharePointDownload() (string, SharePointDownloadEvent) {
	ext := pick(fileExtensions)
	return "BulkSharePointDownload", SharePointDownloadEvent{
		CreationTime:     time.Now().UTC(),
		Id:               newGUID(),
		Operation:        "FileDownloaded",
		OrganizationId:   tenantID,
		RecordType:       6,
		Workload:         "SharePoint",
		UserId:           pick(users),
		ClientIPAddress:  pick(ipAddresses),
		UserAgent:        "OneDrive Sync Engine/22.232.1107.0009",
		SiteUrl:          pick(sharePointSites),
		SourceFileName:   fmt.Sprintf("%s_%d.%s", pick(documentNames), rand.Intn(2024)+2020, ext),
		SourceFileExt:    ext,
		FileSizeBytes:    rand.Intn(50*1024*1024) + 1024,
		ItemType:         "File",
		ListItemUniqueId: newGUID(),
	}
}

// ─── 3: OAuthAppConsentGrant (TRUE_POSITIVE — unverified app, broad perms) ──

type OAuthConsentGrantEvent struct {
	Time          time.Time `json:"time"`
	TenantID      string    `json:"tenantId"`
	CorrelationID string    `json:"correlationId"`
	Category      string    `json:"category"`
	OperationName string    `json:"operationName"`
	Result        string    `json:"result"`
	Actor         struct {
		UserPrincipalName string `json:"userPrincipalName"`
		IPAddress         string `json:"ipAddress"`
	} `json:"actor"`
	App struct {
		Id          string `json:"id"`
		DisplayName string `json:"displayName"`
		Publisher   string `json:"publisher"`
		Verified    bool   `json:"verified"`
	} `json:"app"`
	ConsentType string   `json:"consentType"`
	Scopes      []string `json:"scopes"`
}

var (
	unverifiedApps = []string{
		"QuickCalSync", "MailBackupPro", "TeamsBuddy", "DocuHelper", "CloudDriveX",
	}
	suspiciousScopes = [][]string{
		{"Mail.ReadWrite", "Mail.Send", "MailboxSettings.ReadWrite"},
		{"Files.ReadWrite.All", "Sites.FullControl.All"},
		{"User.ReadWrite.All", "Directory.ReadWrite.All", "Group.ReadWrite.All"},
		{"Mail.ReadWrite", "Calendars.ReadWrite", "Contacts.ReadWrite", "Files.ReadWrite.All"},
	}
)

func genOAuthConsentGrant() (string, OAuthConsentGrantEvent) {
	e := OAuthConsentGrantEvent{
		Time:          time.Now().UTC(),
		TenantID:      tenantID,
		CorrelationID: newGUID(),
		Category:      "ApplicationManagement",
		OperationName: "Consent to application",
		Result:        "success",
		ConsentType:   pick([]string{"AllPrincipals", "Principal"}),
		Scopes:        suspiciousScopes[rand.Intn(len(suspiciousScopes))],
	}
	e.Actor.UserPrincipalName = pick(users)
	e.Actor.IPAddress = pick(ipAddresses)
	e.App.Id = newGUID()
	e.App.DisplayName = pick(unverifiedApps)
	e.App.Publisher = fmt.Sprintf("Unknown Publisher %d", rand.Intn(999))
	e.App.Verified = false
	return "OAuthAppConsentGrant", e
}

// ─── 4: MFADisabledForUser (FALSE_POSITIVE — helpdesk break-glass) ──────────

type MFADisabledEvent struct {
	Time               time.Time    `json:"time"`
	TenantID           string       `json:"tenantId"`
	CorrelationID      string       `json:"correlationId"`
	Category           string       `json:"category"`
	OperationName      string       `json:"operationName"`
	Result             string       `json:"result"`
	Actor              string       `json:"actor"`
	Target             string       `json:"target"`
	HelpdeskTicket     string       `json:"helpdeskTicket"`
	ModifiedProperties []auditParam `json:"modifiedProperties"`
}

var helpdeskPrefixes = []string{"INC", "SR", "CHG", "REQ"}

func genMFADisabled() (string, MFADisabledEvent) {
	ticket := fmt.Sprintf("%s%07d", pick(helpdeskPrefixes), rand.Intn(9999999))
	return "MFADisabledForUser", MFADisabledEvent{
		Time:           time.Now().UTC(),
		TenantID:       tenantID,
		CorrelationID:  newGUID(),
		Category:       "UserManagement",
		OperationName:  "Update user",
		Result:         "success",
		Actor:          "helpdesk@contoso.com",
		Target:         pick(users),
		HelpdeskTicket: ticket,
		ModifiedProperties: []auditParam{
			{Name: "StrongAuthenticationMethods", Value: "[]"},
			{Name: "StrongAuthenticationRequirements", Value: "[]"},
		},
	}
}

// ─── 5: PasswordSpray (TRUE_POSITIVE — known bad IP, python-requests UA) ────

type PasswordSprayEvent struct {
	Time              time.Time `json:"time"`
	TenantID          string    `json:"tenantId"`
	CorrelationID     string    `json:"correlationId"`
	Category          string    `json:"category"`
	OperationName     string    `json:"operationName"`
	ResultType        string    `json:"resultType"`
	ResultDescription string    `json:"resultDescription"`
	UserPrincipalName string    `json:"userPrincipalName"`
	IPAddress         string    `json:"ipAddress"`
	UserAgent         string    `json:"userAgent"`
	Location          string    `json:"location"`
	AppDisplayName    string    `json:"appDisplayName"`
}

var (
	sprayIPs = []string{
		"185.220.101.45", "185.220.101.67", "185.220.101.89",
		"45.153.160.133", "45.153.160.141",
	}
	sprayUserAgents = []string{
		"python-requests/2.28.1", "python-requests/2.31.0",
		"curl/7.88.1", "Go-http-client/1.1",
	}
	sprayTargets = []string{
		"admin@contoso.com", "administrator@contoso.com",
		"ceo@contoso.com", "finance@contoso.com",
		"payroll@contoso.com", "it@contoso.com",
		"security@contoso.com", "helpdesk@contoso.com",
	}
)

func genPasswordSpray() (string, PasswordSprayEvent) {
	return "PasswordSpray", PasswordSprayEvent{
		Time:              time.Now().UTC(),
		TenantID:          tenantID,
		CorrelationID:     newGUID(),
		Category:          "SignInLogs",
		OperationName:     "Sign-in activity",
		ResultType:        "50126",
		ResultDescription: "Invalid username or password",
		UserPrincipalName: pick(sprayTargets),
		IPAddress:         pick(sprayIPs),
		UserAgent:         pick(sprayUserAgents),
		Location:          "Anonymous proxy",
		AppDisplayName:    "Office 365 Exchange Online",
	}
}

// ─── 6: GuestAccountAdded (FALSE_POSITIVE — KPMG vendor onboarding) ─────────

type GuestAccountAddedEvent struct {
	Time             time.Time `json:"time"`
	TenantID         string    `json:"tenantId"`
	CorrelationID    string    `json:"correlationId"`
	Category         string    `json:"category"`
	OperationName    string    `json:"operationName"`
	Result           string    `json:"result"`
	InvitedBy        string    `json:"invitedBy"`
	GuestUPN         string    `json:"guestUpn"`
	GuestDisplayName string    `json:"guestDisplayName"`
	InvitedFromOrg   string    `json:"invitedFromOrg"`
	Roles            []string  `json:"roles"`
	JustificationRef string    `json:"justificationRef"`
}

var (
	vendorOrgs = []string{
		"kpmg.com", "deloitte.com", "ey.com", "pwc.com",
		"accenture.com", "cognizant.com", "infosys.com",
	}
	guestRoleSets = [][]string{
		{"Guest"},
		{"Guest", "SharePoint Visitor"},
		{"Guest", "Teams Member"},
	}
)

func genGuestAccountAdded() (string, GuestAccountAddedEvent) {
	org := pick(vendorOrgs)
	return "GuestAccountAdded", GuestAccountAddedEvent{
		Time:             time.Now().UTC(),
		TenantID:         tenantID,
		CorrelationID:    newGUID(),
		Category:         "UserManagement",
		OperationName:    "Invite external user",
		Result:           "success",
		InvitedBy:        pick(users),
		GuestUPN:         fmt.Sprintf("vendor%04d@%s", rand.Intn(9999), org),
		GuestDisplayName: fmt.Sprintf("Vendor %04d", rand.Intn(9999)),
		InvitedFromOrg:   org,
		Roles:            guestRoleSets[rand.Intn(len(guestRoleSets))],
		JustificationRef: fmt.Sprintf("VENDOR-KPMG-%04d", rand.Intn(9999)),
	}
}

// ─── 7: SuspiciousInboxRule (TRUE_POSITIVE — BEC hiding finance emails) ──────

type SuspiciousInboxRuleEvent struct {
	CreationTime     time.Time    `json:"CreationTime"`
	Id               string       `json:"Id"`
	Operation        string       `json:"Operation"`
	OrganizationId   string       `json:"OrganizationId"`
	RecordType       int          `json:"RecordType"`
	ResultStatus     string       `json:"ResultStatus"`
	Workload         string       `json:"Workload"`
	UserId           string       `json:"UserId"`
	ClientIPAddress  string       `json:"ClientIPAddress"`
	OrganizationName string       `json:"OrganizationName"`
	MailboxOwnerUPN  string       `json:"MailboxOwnerUPN"`
	Parameters       []auditParam `json:"Parameters"`
}

var (
	becRuleNames = []string{
		"Sort newsletters", "Organize notifications", "Move updates",
		"Auto-file", "Clean inbox",
	}
	financeKeywords = [][]string{
		{"invoice", "payment", "wire transfer"},
		{"ACH", "bank account", "routing number"},
		{"purchase order", "PO #", "remittance"},
		{"wire", "transfer", "urgent payment"},
	}
	hidingFolders = []string{
		"RSS Feeds", "Sync Issues", "Conversation History",
		"Junk Email", "Deleted Items",
	}
)

func genSuspiciousInboxRule() (string, SuspiciousInboxRuleEvent) {
	user := pick(users)
	keywords := financeKeywords[rand.Intn(len(financeKeywords))]
	return "SuspiciousInboxRule", SuspiciousInboxRuleEvent{
		CreationTime:     time.Now().UTC(),
		Id:               newGUID(),
		Operation:        "New-InboxRule",
		OrganizationId:   tenantID,
		RecordType:       1,
		ResultStatus:     "Succeeded",
		Workload:         "Exchange",
		UserId:           user,
		ClientIPAddress:  pick(ipAddresses),
		OrganizationName: "contoso.com",
		MailboxOwnerUPN:  user,
		Parameters: []auditParam{
			{Name: "Name", Value: pick(becRuleNames)},
			{Name: "SubjectContainsWords", Value: strings.Join(keywords, ",")},
			{Name: "MoveToFolder", Value: pick(hidingFolders)},
			{Name: "StopProcessingRules", Value: "True"},
			{Name: "Enabled", Value: "True"},
		},
	}
}

// ─── 8: SuspiciousSignIn (unfamiliar location/device, legacy auth) ───────────

type SuspiciousSignInEvent struct {
	Time                    time.Time `json:"time"`
	TenantID                string    `json:"tenantId"`
	CorrelationID           string    `json:"correlationId"`
	Category                string    `json:"category"`
	OperationName           string    `json:"operationName"`
	ResultType              string    `json:"resultType"`
	UserPrincipalName       string    `json:"userPrincipalName"`
	UserID                  string    `json:"userId"`
	IPAddress               string    `json:"ipAddress"`
	Location                string    `json:"location"`
	ClientAppUsed           string    `json:"clientAppUsed"`
	DeviceCompliant         bool      `json:"deviceCompliant"`
	DeviceManaged           bool      `json:"deviceManaged"`
	IsUnfamiliarLocation    bool      `json:"isUnfamiliarLocation"`
	RiskLevelDuringSignin   string    `json:"riskLevelDuringSignin"`
	ConditionalAccessStatus string    `json:"conditionalAccessStatus"`
}

var legacyAuthClients = []string{
	"IMAP4", "POP3", "SMTP AUTH", "Exchange ActiveSync",
	"Exchange Web Services", "Autodiscover", "MAPI over HTTP",
}

func genSuspiciousSignIn() (string, SuspiciousSignInEvent) {
	return "SuspiciousSignIn", SuspiciousSignInEvent{
		Time:                    time.Now().UTC(),
		TenantID:                tenantID,
		CorrelationID:           newGUID(),
		Category:                "SignInLogs",
		OperationName:           "Sign-in activity",
		ResultType:              "0",
		UserPrincipalName:       pick(users),
		UserID:                  newGUID(),
		IPAddress:               pick(ipAddresses),
		Location:                pick([]string{"RU", "CN", "KP", "IR", "NG", "BR"}),
		ClientAppUsed:           pick(legacyAuthClients),
		DeviceCompliant:         false,
		DeviceManaged:           false,
		IsUnfamiliarLocation:    true,
		RiskLevelDuringSignin:   pick([]string{"medium", "high"}),
		ConditionalAccessStatus: "notApplied",
	}
}

// ─── 9: MassMailboxDeletion (high volume deletes in short window) ────────────

type MassMailboxDeletionEvent struct {
	CreationTime     time.Time `json:"CreationTime"`
	Id               string    `json:"Id"`
	Operation        string    `json:"Operation"`
	OrganizationId   string    `json:"OrganizationId"`
	RecordType       int       `json:"RecordType"`
	ResultStatus     string    `json:"ResultStatus"`
	Workload         string    `json:"Workload"`
	UserId           string    `json:"UserId"`
	ClientIPAddress  string    `json:"ClientIPAddress"`
	ClientInfoString string    `json:"ClientInfoString"`
	MailboxGuid      string    `json:"MailboxGuid"`
	MailboxOwnerUPN  string    `json:"MailboxOwnerUPN"`
	OrganizationName string    `json:"OrganizationName"`
	DeleteCount      int       `json:"DeleteCount"`
	TimeWindowSec    int       `json:"TimeWindowSec"`
	FolderPath       string    `json:"FolderPath"`
}

func genMassMailboxDeletion() (string, MassMailboxDeletionEvent) {
	user := pick(users)
	op := pick([]string{"HardDelete", "SoftDelete"})
	return "MassMailboxDeletion", MassMailboxDeletionEvent{
		CreationTime:     time.Now().UTC(),
		Id:               newGUID(),
		Operation:        op,
		OrganizationId:   tenantID,
		RecordType:       2,
		ResultStatus:     "Succeeded",
		Workload:         "Exchange",
		UserId:           user,
		ClientIPAddress:  pick(ipAddresses),
		ClientInfoString: pick(clientApps),
		MailboxGuid:      newGUID(),
		MailboxOwnerUPN:  user,
		OrganizationName: "contoso.com",
		DeleteCount:      rand.Intn(900) + 100,
		TimeWindowSec:    rand.Intn(270) + 30,
		FolderPath:       pick([]string{"\\Inbox", "\\Sent Items", "\\All Mail", "\\Archive"}),
	}
}

// ─── 10: RiskyUserDetected (Identity Protection flag) ───────────────────────

type RiskyUserDetectedEvent struct {
	Time           time.Time `json:"time"`
	TenantID       string    `json:"tenantId"`
	CorrelationID  string    `json:"correlationId"`
	Category       string    `json:"category"`
	OperationName  string    `json:"operationName"`
	UserPrincipalName string `json:"userPrincipalName"`
	UserID         string    `json:"userId"`
	RiskLevel      string    `json:"riskLevel"`
	RiskState      string    `json:"riskState"`
	RiskDetail     string    `json:"riskDetail"`
	RiskLastUpdated time.Time `json:"riskLastUpdated"`
}

var riskDetails = []string{
	"userPassedMFADrivenByRiskBasedPolicy",
	"adminGeneratedTemporaryPassword",
	"aiConfirmedSigninSafe",
	"unknownFutureValue",
	"none",
}

func genRiskyUserDetected() (string, RiskyUserDetectedEvent) {
	return "RiskyUserDetected", RiskyUserDetectedEvent{
		Time:              time.Now().UTC(),
		TenantID:          tenantID,
		CorrelationID:     newGUID(),
		Category:          "RiskyUsers",
		OperationName:     "Risky user",
		UserPrincipalName: pick(users),
		UserID:            newGUID(),
		RiskLevel:         pick([]string{"low", "medium", "high"}),
		RiskState:         pick([]string{"atRisk", "confirmedCompromised", "remediated"}),
		RiskDetail:        pick(riskDetails),
		RiskLastUpdated:   time.Now().UTC().Add(-time.Duration(rand.Intn(3600)) * time.Second),
	}
}

// ─── 11: AnonymousIPSignIn (Tor or anonymous proxy) ──────────────────────────

type AnonymousIPSignInEvent struct {
	Time              time.Time `json:"time"`
	TenantID          string    `json:"tenantId"`
	CorrelationID     string    `json:"correlationId"`
	Category          string    `json:"category"`
	OperationName     string    `json:"operationName"`
	ResultType        string    `json:"resultType"`
	UserPrincipalName string    `json:"userPrincipalName"`
	UserID            string    `json:"userId"`
	IPAddress         string    `json:"ipAddress"`
	Location          string    `json:"location"`
	RiskEventType     string    `json:"riskEventType"`
	RiskLevel         string    `json:"riskLevel"`
	AppDisplayName    string    `json:"appDisplayName"`
	UserAgent         string    `json:"userAgent"`
}

var torExitNodes = []string{
	"185.220.101.1", "185.220.101.15", "185.220.101.32",
	"51.15.179.153", "62.102.148.67", "199.87.154.255",
	"176.10.104.240", "171.25.193.77",
}

func genAnonymousIPSignIn() (string, AnonymousIPSignInEvent) {
	return "AnonymousIPSignIn", AnonymousIPSignInEvent{
		Time:              time.Now().UTC(),
		TenantID:          tenantID,
		CorrelationID:     newGUID(),
		Category:          "RiskySignins",
		OperationName:     "Sign-in activity",
		ResultType:        "0",
		UserPrincipalName: pick(users),
		UserID:            newGUID(),
		IPAddress:         pick(torExitNodes),
		Location:          "Anonymous proxy",
		RiskEventType:     "anonymousIPAddress",
		RiskLevel:         pick([]string{"medium", "high"}),
		AppDisplayName:    pick(appDisplayNames),
		UserAgent:         pick([]string{"TorBrowser/12.0", "Mozilla/5.0 (Windows NT 10.0; rv:102.0) Gecko/20100101 Firefox/102.0"}),
	}
}

// ─── 12: MailboxPermissionGranted (Full Access or Send-As) ──────────────────

type MailboxPermissionGrantedEvent struct {
	CreationTime     time.Time    `json:"CreationTime"`
	Id               string       `json:"Id"`
	Operation        string       `json:"Operation"`
	OrganizationId   string       `json:"OrganizationId"`
	RecordType       int          `json:"RecordType"`
	ResultStatus     string       `json:"ResultStatus"`
	Workload         string       `json:"Workload"`
	UserId           string       `json:"UserId"`
	ClientIPAddress  string       `json:"ClientIPAddress"`
	OrganizationName string       `json:"OrganizationName"`
	TargetMailbox    string       `json:"TargetMailbox"`
	Grantee          string       `json:"Grantee"`
	AccessRights     string       `json:"AccessRights"`
	Parameters       []auditParam `json:"Parameters"`
}

func genMailboxPermissionGranted() (string, MailboxPermissionGrantedEvent) {
	actor := pick(users)
	target := pick(users)
	grantee := pick(users)
	rights := pick([]string{"FullAccess", "SendAs", "SendOnBehalf"})
	return "MailboxPermissionGranted", MailboxPermissionGrantedEvent{
		CreationTime:     time.Now().UTC(),
		Id:               newGUID(),
		Operation:        "Add-MailboxPermission",
		OrganizationId:   tenantID,
		RecordType:       1,
		ResultStatus:     "Succeeded",
		Workload:         "Exchange",
		UserId:           actor,
		ClientIPAddress:  pick(ipAddresses),
		OrganizationName: "contoso.com",
		TargetMailbox:    target,
		Grantee:          grantee,
		AccessRights:     rights,
		Parameters: []auditParam{
			{Name: "Identity", Value: target},
			{Name: "User", Value: grantee},
			{Name: "AccessRights", Value: rights},
			{Name: "InheritanceType", Value: "All"},
		},
	}
}

// ─── 13: AdminConsentGranted (tenant-wide app permission by admin) ───────────

type AdminConsentGrantedEvent struct {
	Time          time.Time `json:"time"`
	TenantID      string    `json:"tenantId"`
	CorrelationID string    `json:"correlationId"`
	Category      string    `json:"category"`
	OperationName string    `json:"operationName"`
	Result        string    `json:"result"`
	Actor         struct {
		UserPrincipalName string `json:"userPrincipalName"`
		IPAddress         string `json:"ipAddress"`
		Role              string `json:"role"`
	} `json:"actor"`
	App struct {
		Id          string `json:"id"`
		DisplayName string `json:"displayName"`
		Publisher   string `json:"publisher"`
		Verified    bool   `json:"verified"`
	} `json:"app"`
	ConsentType string   `json:"consentType"`
	Scopes      []string `json:"scopes"`
}

var adminApps = []string{
	"Salesforce", "ServiceNow", "Workday", "Zoom", "DocuSign",
	"Okta", "SolarWinds", "LogRhythm", "Splunk", "CrowdStrike",
}

func genAdminConsentGranted() (string, AdminConsentGrantedEvent) {
	e := AdminConsentGrantedEvent{
		Time:          time.Now().UTC(),
		TenantID:      tenantID,
		CorrelationID: newGUID(),
		Category:      "ApplicationManagement",
		OperationName: "Consent to application",
		Result:        "success",
		ConsentType:   "AllPrincipals",
		Scopes:        suspiciousScopes[rand.Intn(len(suspiciousScopes))],
	}
	e.Actor.UserPrincipalName = "globaladmin@contoso.com"
	e.Actor.IPAddress = pick(ipAddresses)
	e.Actor.Role = "Global Administrator"
	e.App.Id = newGUID()
	e.App.DisplayName = pick(adminApps)
	e.App.Publisher = pick(adminApps)
	e.App.Verified = rand.Intn(2) == 0
	return "AdminConsentGranted", e
}

// ─── 14: DataExfiltrationAlert (Defender detected potential exfil) ───────────

type DataExfiltrationAlertEvent struct {
	Time              time.Time `json:"time"`
	TenantID          string    `json:"tenantId"`
	CorrelationID     string    `json:"correlationId"`
	Category          string    `json:"category"`
	AlertName         string    `json:"alertName"`
	AlertID           string    `json:"alertId"`
	Severity          string    `json:"severity"`
	Status            string    `json:"status"`
	UserPrincipalName string    `json:"userPrincipalName"`
	IPAddress         string    `json:"ipAddress"`
	FilesAffected     int       `json:"filesAffected"`
	BytesTransferred  int64     `json:"bytesTransferred"`
	DestinationDomain string    `json:"destinationDomain"`
	Protocol          string    `json:"protocol"`
	PolicyName        string    `json:"policyName"`
}

var (
	exfilAlertNames = []string{
		"Mass download by a single user",
		"Unusual file download",
		"Potential exfiltration to unsanctioned app",
		"Suspicious inbox forwarding rule",
		"Ransomware activity",
		"Unusual administrative activity",
	}
	exfilDestinations = []string{
		"dropbox.com", "wetransfer.com", "drive.google.com",
		"mega.nz", "anonfiles.com", "pastebin.com",
	}
	dlpPolicies = []string{
		"Corporate Data Exfiltration Policy",
		"PII Protection Policy",
		"Financial Data Policy",
		"Insider Threat Detection",
	}
)

func genDataExfiltrationAlert() (string, DataExfiltrationAlertEvent) {
	return "DataExfiltrationAlert", DataExfiltrationAlertEvent{
		Time:              time.Now().UTC(),
		TenantID:          tenantID,
		CorrelationID:     newGUID(),
		Category:          "SecurityAlert",
		AlertName:         pick(exfilAlertNames),
		AlertID:           newGUID(),
		Severity:          pick([]string{"medium", "high", "critical"}),
		Status:            "active",
		UserPrincipalName: pick(users),
		IPAddress:         pick(ipAddresses),
		FilesAffected:     rand.Intn(500) + 10,
		BytesTransferred:  int64(rand.Intn(500)*1024*1024) + 1024*1024,
		DestinationDomain: pick(exfilDestinations),
		Protocol:          pick([]string{"HTTPS", "HTTP", "FTP", "SFTP"}),
		PolicyName:        pick(dlpPolicies),
	}
}

// ─── scenario dispatcher ─────────────────────────────────────────────────────

// pickScenario returns one of the 15 scenario events chosen uniformly at random.
// Call this when the 1-in-1000 scenario gate fires for each scenario slot.
func pickScenario(n int) (string, []byte) {
	switch n % 15 {
	case 0:
		return marshal(genImpossibleTravel())
	case 1:
		return marshal(genExternalForwardingRule())
	case 2:
		return marshal(genBulkSharePointDownload())
	case 3:
		return marshal(genOAuthConsentGrant())
	case 4:
		return marshal(genMFADisabled())
	case 5:
		return marshal(genPasswordSpray())
	case 6:
		return marshal(genGuestAccountAdded())
	case 7:
		return marshal(genSuspiciousInboxRule())
	case 8:
		return marshal(genSuspiciousSignIn())
	case 9:
		return marshal(genMassMailboxDeletion())
	case 10:
		return marshal(genRiskyUserDetected())
	case 11:
		return marshal(genAnonymousIPSignIn())
	case 12:
		return marshal(genMailboxPermissionGranted())
	case 13:
		return marshal(genAdminConsentGranted())
	default:
		return marshal(genDataExfiltrationAlert())
	}
}
