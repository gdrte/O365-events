package producer

import (
	"O365_Events_Orchestrator/producer"
	"os"
)

func main() {
	broker := os.Getenv("KAFKA_BROKER")
	if broker == "" {
		broker = "fedora:9092"
	}
	producer.RunO365Producer(broker, 0, 0)
}
