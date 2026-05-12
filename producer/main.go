package main

import "os"

func main() {
	broker := os.Getenv("KAFKA_BROKER")
	if broker == "" {
		broker = "fedora:9092"
	}
	runO365Producer(broker, 0, 0)
}
