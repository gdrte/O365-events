package producer

import (
	"math/rand"
	"time"
)

type OutlookCalendarEvent struct {
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
	MailboxOwnerUPN  string    `json:"MailboxOwnerUPN"`
	OrganizationName string    `json:"OrganizationName"`
	Item             struct {
		Id           string    `json:"Id"`
		Subject      string    `json:"Subject"`
		Start        time.Time `json:"Start"`
		End          time.Time `json:"End"`
		Location     string    `json:"Location"`
		IsAllDay     bool      `json:"IsAllDay"`
		Attendees    []string  `json:"Attendees"`
		Organizer    string    `json:"Organizer"`
		ResponseType string    `json:"ResponseType,omitempty"`
	} `json:"Item"`
}

var (
	calendarOperations = []string{
		"Create", "Update", "Delete", "Accept", "Decline", "Tentative", "MoveToDeletedItems",
	}
	calendarSubjects = []string{
		"1:1 with Manager", "Sprint Planning", "All Hands Meeting",
		"Customer Demo", "Interview Loop", "Offsite Strategy Session",
		"Quarterly Business Review", "Team Lunch",
	}
	meetingLocations = []string{
		"Microsoft Teams Meeting", "Conference Room A", "Conference Room B",
		"Building 1 - Room 101", "Virtual", "",
	}
)

func genOutlookCalendar() (string, OutlookCalendarEvent) {
	user := pick(users)
	start := time.Now().UTC().Add(time.Duration(rand.Intn(72)) * time.Hour).Truncate(30 * time.Minute)
	end := start.Add(time.Duration(rand.Intn(3)+1) * 30 * time.Minute)

	attendees := make([]string, rand.Intn(4)+1)
	for i := range attendees {
		attendees[i] = pick(users)
	}

	e := OutlookCalendarEvent{
		CreationTime:     time.Now().UTC(),
		Id:               newGUID(),
		Operation:        pick(calendarOperations),
		OrganizationId:   tenantID,
		RecordType:       9,
		ResultStatus:     "Succeeded",
		Workload:         "Exchange",
		UserId:           user,
		ClientIPAddress:  pick(ipAddresses),
		ClientInfoString: pick(clientApps),
		MailboxOwnerUPN:  user,
		OrganizationName: "contoso.com",
	}
	e.Item.Id = newGUID()
	e.Item.Subject = pick(calendarSubjects)
	e.Item.Start = start
	e.Item.End = end
	e.Item.Location = pick(meetingLocations)
	e.Item.IsAllDay = rand.Intn(10) == 0
	e.Item.Attendees = attendees
	e.Item.Organizer = user
	if e.Operation == "Accept" || e.Operation == "Decline" || e.Operation == "Tentative" {
		e.Item.ResponseType = e.Operation
	}

	return "OutlookCalendar", e
}
