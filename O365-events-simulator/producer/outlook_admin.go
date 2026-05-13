package producer

import (
	"fmt"
	"math/rand"
	"time"
)

type OutlookAdminEvent struct {
	CreationTime     time.Time `json:"CreationTime"`
	Id               string    `json:"Id"`
	Operation        string    `json:"Operation"`
	OrganizationId   string    `json:"OrganizationId"`
	RecordType       int       `json:"RecordType"`
	ResultStatus     string    `json:"ResultStatus"`
	Workload         string    `json:"Workload"`
	UserId           string    `json:"UserId"`
	ClientIPAddress  string    `json:"ClientIPAddress"`
	OrganizationName string    `json:"OrganizationName"`
	Parameters       []struct {
		Name  string `json:"Name"`
		Value string `json:"Value"`
	} `json:"Parameters"`
	OriginatingServer string `json:"OriginatingServer"`
	ExternalAccess    bool   `json:"ExternalAccess"`
}

var (
	inboxRuleNames = []string{
		"Move newsletters", "Flag from CEO", "Auto-delete notifications",
		"Forward security alerts", "Move from no-reply",
	}
	adminOperations = []struct {
		op     string
		params map[string]string
	}{
		{"Set-Mailbox", map[string]string{"ProhibitSendQuota": "50GB", "IssueWarningQuota": "45GB"}},
		{"New-InboxRule", map[string]string{"Name": "", "MoveToFolder": "\\Archive", "From": ""}},
		{"Set-InboxRule", map[string]string{"Name": "", "Enabled": "True"}},
		{"Remove-InboxRule", map[string]string{"Name": ""}},
		{"Add-MailboxPermission", map[string]string{"User": "", "AccessRights": "FullAccess"}},
		{"Remove-MailboxPermission", map[string]string{"User": "", "AccessRights": "FullAccess"}},
		{"Set-MailboxAutoReplyConfiguration", map[string]string{"AutoReplyState": "Enabled", "InternalMessage": "Out of office"}},
		{"Enable-Mailbox", map[string]string{"Identity": ""}},
		{"Disable-Mailbox", map[string]string{"Identity": ""}},
	}
)

func genOutlookAdmin() (string, OutlookAdminEvent) {
	op := adminOperations[rand.Intn(len(adminOperations))]
	user := pick(users)

	e := OutlookAdminEvent{
		CreationTime:      time.Now().UTC(),
		Id:                newGUID(),
		Operation:         op.op,
		OrganizationId:    tenantID,
		RecordType:        1,
		ResultStatus:      pick([]string{"Succeeded", "Succeeded", "Failed"}),
		Workload:          "Exchange",
		UserId:            user,
		ClientIPAddress:   pick(ipAddresses),
		OrganizationName:  "contoso.com",
		OriginatingServer: fmt.Sprintf("MSXP%03d (15.20.1234.000)", rand.Intn(999)),
		ExternalAccess:    false,
	}

	for k, v := range op.params {
		val := v
		if val == "" {
			switch k {
			case "Name":
				val = pick(inboxRuleNames)
			case "User", "From", "Identity":
				val = pick(users)
			}
		}
		e.Parameters = append(e.Parameters, struct {
			Name  string `json:"Name"`
			Value string `json:"Value"`
		}{Name: k, Value: val})
	}

	return "OutlookAdmin", e
}
