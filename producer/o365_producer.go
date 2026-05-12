package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"time"

	kafka "github.com/segmentio/kafka-go"
)

// O365 event types
var eventTypes = []string{
	"UserLoggedIn", "UserLoggedOut", "FileAccessed", "FileModified", "FileDeleted",
	"FileShared", "MailSent", "MailReceived", "MailDeleted", "MeetingCreated",
	"MeetingUpdated", "MeetingDeleted", "TeamCreated", "ChannelMessageSent",
	"PasswordChanged", "MFAEnabled", "RoleAssigned", "PolicyChanged",
}

var users = []string{
	"alice@contoso.com", "bob@contoso.com", "carol@contoso.com",
	"dave@contoso.com", "eve@contoso.com", "frank@contoso.com",
}

var workloads = []string{"Exchange", "SharePoint", "Teams", "OneDrive", "AzureAD"}

var locations = []string{
	"US-East", "US-West", "EU-West", "AP-Southeast", "UK-South",
}

type O365Event struct {
	ID           string    `json:"id"`
	CreationTime time.Time `json:"creationTime"`
	EventType    string    `json:"eventType"`
	Workload     string    `json:"workload"`
	UserID       string    `json:"userId"`
	ClientIP     string    `json:"clientIp"`
	Location     string    `json:"location"`
	ResultStatus string    `json:"resultStatus"`
	ObjectID     string    `json:"objectId,omitempty"`
}

func randomIP() string {
	return fmt.Sprintf("%d.%d.%d.%d",
		rand.Intn(223)+1,
		rand.Intn(256),
		rand.Intn(256),
		rand.Intn(254)+1,
	)
}

func randomID() string {
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		rand.Int31(), rand.Int31n(0xffff), rand.Int31n(0xffff),
		rand.Int31n(0xffff), rand.Int63n(0xffffffffffff),
	)
}

func randomStatus() string {
	if rand.Intn(10) < 8 {
		return "Success"
	}
	return "Failure"
}

func generateEvent() O365Event {
	workload := workloads[rand.Intn(len(workloads))]
	eventType := eventTypes[rand.Intn(len(eventTypes))]
	var objectID string
	if eventType == "FileAccessed" || eventType == "FileModified" || eventType == "FileDeleted" || eventType == "FileShared" {
		objectID = fmt.Sprintf("/sites/contoso/%s/file-%d.docx", workload, rand.Intn(1000))
	}
	return O365Event{
		ID:           randomID(),
		CreationTime: time.Now().UTC(),
		EventType:    eventType,
		Workload:     workload,
		UserID:       users[rand.Intn(len(users))],
		ClientIP:     randomIP(),
		Location:     locations[rand.Intn(len(locations))],
		ResultStatus: randomStatus(),
		ObjectID:     objectID,
	}
}

func runO365Producer(broker string, intervalMs int, count int) {
	topics := []string{"topic-1", "topic-2", "topic-3"}

	writers := make(map[string]*kafka.Writer, len(topics))
	for _, t := range topics {
		writers[t] = &kafka.Writer{
			Addr:         kafka.TCP(broker),
			Topic:        t,
			Balancer:     &kafka.LeastBytes{},
			BatchTimeout: 10 * time.Millisecond,
		}
	}
	defer func() {
		for _, w := range writers {
			w.Close()
		}
	}()

	log.Printf("O365 producer started → broker=%s  interval=%dms  count=%d\n", broker, intervalMs, count)

	for i := 0; count == 0 || i < count; i++ {
		event := generateEvent()
		payload, err := json.Marshal(event)
		if err != nil {
			log.Printf("marshal error: %v", err)
			continue
		}

		topic := topics[rand.Intn(len(topics))]
		err = writers[topic].WriteMessages(context.Background(),
			kafka.Message{
				Key:   []byte(event.UserID),
				Value: payload,
			},
		)
		if err != nil {
			log.Printf("write error [%s]: %v", topic, err)
		} else {
			log.Printf("→ %-10s  %-20s  %-15s  %s  %s",
				topic, event.EventType, event.UserID, event.Location, event.ResultStatus)
		}

		time.Sleep(time.Duration(intervalMs) * time.Millisecond)
	}

	log.Println("O365 producer done.")
}
