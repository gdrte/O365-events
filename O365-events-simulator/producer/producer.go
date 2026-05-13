package producer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"sync/atomic"
	"time"

	kafka "github.com/segmentio/kafka-go"
)

var sequenceNumber int64

func buildMessage(topic string) (kafka.Message, string) {
	seq := atomic.AddInt64(&sequenceNumber, 1)
	now := time.Now().UTC()

	var eventType string
	var payload []byte

	// Each of the 15 scenario types fires at ~1/10000 probability.
	// Roll once: values 0–14 each map to one scenario; 15–9999 → background event.
	roll := rand.Intn(10000)
	if roll < 15 {
		eventType, payload = pickScenario(roll)
	} else {
		switch rand.Intn(7) {
		case 0:
			eventType, payload = marshal(genAADSignin())
		case 1:
			eventType, payload = marshal(genActivityLog())
		case 2:
			eventType, payload = marshal(genSecurityAlert())
		case 3:
			eventType, payload = marshal(genDiagnostic())
		case 4:
			eventType, payload = marshal(genOutlookMail())
		case 5:
			eventType, payload = marshal(genOutlookCalendar())
		default:
			eventType, payload = marshal(genOutlookAdmin())
		}
	}

	headers := []kafka.Header{
		{Key: "x-opt-sequence-number", Value: []byte(fmt.Sprintf("%d", seq))},
		{Key: "x-opt-offset", Value: []byte(fmt.Sprintf("%d", seq*512+rand.Int63n(512)))},
		{Key: "x-opt-enqueued-time", Value: []byte(now.Format(time.RFC3339Nano))},
		{Key: "x-opt-publisher", Value: []byte("azure-monitor")},
		{Key: "diagnostic-id", Value: []byte("00-" + newGUID() + "-01")},
		{Key: "content-type", Value: []byte("application/json")},
		{Key: "event-type", Value: []byte(eventType)},
		{Key: "tenant-id", Value: []byte(tenantID)},
	}

	return kafka.Message{
		Key:     []byte(newGUID()),
		Value:   payload,
		Headers: headers,
		Time:    now,
	}, eventType
}

func marshal(eventType string, v interface{}) (string, []byte) {
	b, _ := json.Marshal(v)
	return eventType, b
}

func RunO365Producer(broker string, intervalMs int, count int) {
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

	log.Printf("Event Hub producer started → broker=%s  interval=%dms  count=%d\n", broker, intervalMs, count)

	for i := 0; count == 0 || i < count; i++ {
		topic := pick(topics)
		msg, eventType := buildMessage(topic)

		if err := writers[topic].WriteMessages(context.Background(), msg); err != nil {
			log.Printf("write error [%s]: %v", topic, err)
		} else {
			log.Printf("→ %-10s  %-15s  seq=%-6d  %s",
				topic, eventType,
				atomic.LoadInt64(&sequenceNumber),
				time.Now().Format("15:04:05.000"),
			)
		}

		time.Sleep(time.Duration(intervalMs) * time.Millisecond)
	}

	log.Println("Producer done.")
}
