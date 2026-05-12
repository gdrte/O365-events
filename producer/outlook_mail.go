package main

import (
	"fmt"
	"math/rand"
	"time"
)

type MailItem struct {
	Id           string `json:"Id"`
	Subject      string `json:"Subject"`
	ParentFolder struct {
		Id   string `json:"Id"`
		Path string `json:"Path"`
	} `json:"ParentFolder"`
	SizeInBytes int    `json:"SizeInBytes"`
	Attachments string `json:"Attachments,omitempty"`
}

type OutlookMailEvent struct {
	CreationTime      time.Time `json:"CreationTime"`
	Id                string    `json:"Id"`
	Operation         string    `json:"Operation"`
	OrganizationId    string    `json:"OrganizationId"`
	RecordType        int       `json:"RecordType"`
	ResultStatus      string    `json:"ResultStatus"`
	UserKey           string    `json:"UserKey"`
	UserType          int       `json:"UserType"`
	Workload          string    `json:"Workload"`
	UserId            string    `json:"UserId"`
	ClientIPAddress   string    `json:"ClientIPAddress"`
	ClientInfoString  string    `json:"ClientInfoString"`
	ExternalAccess    bool      `json:"ExternalAccess"`
	InternalLogonType int       `json:"InternalLogonType"`
	LogonType         int       `json:"LogonType"`
	LogonUserSid      string    `json:"LogonUserSid"`
	MailboxGuid       string    `json:"MailboxGuid"`
	MailboxOwnerUPN   string    `json:"MailboxOwnerUPN"`
	OrganizationName  string    `json:"OrganizationName"`
	Item              MailItem  `json:"Item"`
	SendAsUserSmtp    string    `json:"SendAsUserSmtp,omitempty"`
	Recipients        []string  `json:"Recipients,omitempty"`
}

var (
	emailSubjects = []string{
		"Q2 Budget Review", "Team Standup Notes", "Re: Project Kickoff",
		"Action Required: Security Training", "Fwd: Customer Escalation",
		"Meeting Invite: Quarterly Planning", "RE: Contract Renewal",
		"Urgent: Production Outage", "Weekly Status Report", "New Hire Onboarding",
	}
	folderPaths = []string{
		"\\Inbox", "\\Sent Items", "\\Drafts", "\\Deleted Items",
		"\\Archive", "\\Junk Email", "\\Inbox\\Projects", "\\Inbox\\HR",
	}
	mailOperations = []struct {
		op         string
		recordType int
	}{
		{"Send", 2}, {"Create", 2}, {"Update", 2}, {"MoveToDeletedItems", 2},
		{"SoftDelete", 2}, {"HardDelete", 2}, {"Copy", 2}, {"Move", 2},
		{"MailboxLogin", 2}, {"FolderBind", 2}, {"SendAs", 2}, {"SendOnBehalf", 2},
	}
)

func genOutlookMail() (string, OutlookMailEvent) {
	op := mailOperations[rand.Intn(len(mailOperations))]
	user := pick(users)

	item := MailItem{
		Id:          newGUID(),
		Subject:     pick(emailSubjects),
		SizeInBytes: rand.Intn(500000) + 1024,
	}
	item.ParentFolder.Id = newGUID()
	item.ParentFolder.Path = pick(folderPaths)
	if rand.Intn(3) == 0 {
		item.Attachments = fmt.Sprintf("report_%d.pdf", rand.Intn(100))
	}

	e := OutlookMailEvent{
		CreationTime:      time.Now().UTC(),
		Id:                newGUID(),
		Operation:         op.op,
		OrganizationId:    tenantID,
		RecordType:        op.recordType,
		ResultStatus:      pick([]string{"Succeeded", "Succeeded", "Succeeded", "Failed"}),
		UserKey:           newGUID(),
		Workload:          "Exchange",
		UserId:            user,
		ClientIPAddress:   pick(ipAddresses),
		ClientInfoString:  pick(clientApps),
		ExternalAccess:    rand.Intn(10) < 2,
		LogonUserSid:      fmt.Sprintf("S-1-5-21-%d-%d-%d", rand.Int31(), rand.Int31(), rand.Int31()),
		MailboxGuid:       newGUID(),
		MailboxOwnerUPN:   user,
		OrganizationName:  "contoso.com",
		Item:              item,
	}

	if op.op == "Send" || op.op == "SendAs" || op.op == "SendOnBehalf" {
		n := rand.Intn(3) + 1
		for i := 0; i < n; i++ {
			e.Recipients = append(e.Recipients, pick(users))
		}
		if op.op == "SendAs" {
			e.SendAsUserSmtp = pick(users)
		}
	}

	return "OutlookMail", e
}
