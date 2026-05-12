package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	kafka "github.com/segmentio/kafka-go"
)

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

func newReader(broker, topic, group string) *kafka.Reader {
	return kafka.NewReader(kafka.ReaderConfig{
		Brokers:        []string{broker},
		Topic:          topic,
		GroupID:        group,
		MinBytes:       1,
		MaxBytes:       10e6,
		CommitInterval: time.Second,
		StartOffset:    kafka.FirstOffset,
		Logger:         kafka.LoggerFunc(func(s string, a ...interface{}) {}), // suppress kafka-go internals
	})
}

func consume(ctx context.Context, reader *kafka.Reader, topic string) {
	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return // shutdown
			}
			log.Printf("[%s] read error: %v", topic, err)
			continue
		}

		var event O365Event
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("[%s] parse error: %v | raw: %s", topic, err, msg.Value)
			continue
		}

		fmt.Printf("[%-10s] offset=%-6d  %-20s  %-28s  %-12s  %-10s  %s\n",
			topic,
			msg.Offset,
			event.EventType,
			event.UserID,
			event.Location,
			event.ResultStatus,
			event.CreationTime.Format("15:04:05"),
		)
	}
}

func main() {
	broker := flag.String("broker", "fedora:9092", "Kafka broker address")
	group := flag.String("group", "o365-consumer-group", "Consumer group ID")
	flag.Parse()

	topics := []string{"topic-1", "topic-2", "topic-3"}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	readers := make([]*kafka.Reader, len(topics))
	for i, t := range topics {
		readers[i] = newReader(*broker, t, *group)
	}

	for i, r := range readers {
		go consume(ctx, r, topics[i])
	}

	log.Printf("Consuming from %v  broker=%s  group=%s  (Ctrl+C to stop)\n", topics, *broker, *group)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")
	cancel()
	for _, r := range readers {
		r.Close()
	}
}
