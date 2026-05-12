package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
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

type indexDoc struct {
	O365Event
	KafkaTopic  string `json:"kafka_topic"`
	KafkaOffset int64  `json:"kafka_offset"`
}

type indexer struct {
	client  *http.Client
	baseURL string
	index   string
}

func newIndexer(baseURL string) *indexer {
	return &indexer{
		client:  &http.Client{Timeout: 5 * time.Second},
		baseURL: baseURL,
		index:   "o365-events",
	}
}

func (ix *indexer) put(event O365Event, topic string, offset int64) {
	doc := indexDoc{O365Event: event, KafkaTopic: topic, KafkaOffset: offset}
	body, err := json.Marshal(doc)
	if err != nil {
		log.Printf("[opensearch] marshal error: %v", err)
		return
	}

	url := fmt.Sprintf("%s/%s/_doc/%s", ix.baseURL, ix.index, event.ID)
	req, _ := http.NewRequest(http.MethodPut, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := ix.client.Do(req)
	if err != nil {
		log.Printf("[opensearch] index error: %v", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("[opensearch] unexpected status %d for doc %s", resp.StatusCode, event.ID)
	}
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
		Logger:         kafka.LoggerFunc(func(s string, a ...interface{}) {}),
	})
}

func consume(ctx context.Context, reader *kafka.Reader, topic string, ix *indexer) {
	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
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

		go ix.put(event, topic, msg.Offset)
	}
}

func main() {
	defaultBroker := "fedora:9092"
	if env := os.Getenv("KAFKA_BROKER"); env != "" {
		defaultBroker = env
	}
	defaultGroup := "o365-consumer-group"
	if env := os.Getenv("KAFKA_GROUP"); env != "" {
		defaultGroup = env
	}
	defaultOS := "http://opensearch-cluster-master.opensearch.svc.cluster.local:9200"
	if env := os.Getenv("OPENSEARCH_URL"); env != "" {
		defaultOS = env
	}

	broker := flag.String("broker", defaultBroker, "Kafka broker address")
	group := flag.String("group", defaultGroup, "Consumer group ID")
	osURL := flag.String("opensearch", defaultOS, "OpenSearch base URL")
	flag.Parse()

	ix := newIndexer(*osURL)
	topics := []string{"topic-1", "topic-2", "topic-3"}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	readers := make([]*kafka.Reader, len(topics))
	for i, t := range topics {
		readers[i] = newReader(*broker, t, *group)
	}

	for i, r := range readers {
		go consume(ctx, r, topics[i], ix)
	}

	log.Printf("Consuming from %v  broker=%s  group=%s  opensearch=%s  (Ctrl+C to stop)\n",
		topics, *broker, *group, *osURL)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")
	cancel()
	for _, r := range readers {
		r.Close()
	}
}
