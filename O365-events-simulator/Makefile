REGISTRY    := 192.168.0.103:5000
TAG         := latest
FEDORA_HOST := 192.168.0.103
KUBECONFIG  := /tmp/k3s-kubeconfig.yaml

.PHONY: kubeconfig build load push deploy undeploy logs-producer logs-consumer opensearch-deploy opensearch-status opensearch-dashboard

kubeconfig:
	ssh $(FEDORA_HOST) "sudo cat /etc/rancher/k3s/k3s.yaml" | sed 's/127.0.0.1/$(FEDORA_HOST)/g' > $(KUBECONFIG)

build:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bin/producer ./cmd/producer/...
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bin/consumer ./cmd/consumer/...
	chmod +x bin/producer bin/consumer
	docker buildx build --platform linux/amd64 \
		-f producer.Dockerfile \
		-t $(REGISTRY)/o365-producer:$(TAG) --load .
	docker buildx build --platform linux/amd64 \
		-f consumer.Dockerfile \
		-t $(REGISTRY)/o365-consumer:$(TAG) --load .

load: build
	docker save $(REGISTRY)/o365-producer:$(TAG) | ssh $(FEDORA_HOST) "sudo k3s ctr images import -"
	docker save $(REGISTRY)/o365-consumer:$(TAG) | ssh $(FEDORA_HOST) "sudo k3s ctr images import -"

push: build
	docker push $(REGISTRY)/o365-producer:$(TAG)
	docker push $(REGISTRY)/o365-consumer:$(TAG)

deploy: load
	KUBECONFIG=$(KUBECONFIG) helm upgrade --install o365-events helm/o365-events \
		--set imageRegistry=$(REGISTRY) \
		--set imageTag=$(TAG) \
		--set kafka.broker=$(FEDORA_HOST):9092 \
		--set imagePullPolicy=Never
	KUBECONFIG=$(KUBECONFIG) kubectl rollout restart deployment/o365-events-producer deployment/o365-events-consumer
	KUBECONFIG=$(KUBECONFIG) kubectl rollout status deployment/o365-events-producer deployment/o365-events-consumer

undeploy:
	KUBECONFIG=$(KUBECONFIG) helm uninstall o365-events

logs-producer:
	KUBECONFIG=$(KUBECONFIG) kubectl logs -l app=o365-producer -f

logs-consumer:
	KUBECONFIG=$(KUBECONFIG) kubectl logs -l app=o365-consumer -f

opensearch-deploy:
	KUBECONFIG=$(KUBECONFIG) helm upgrade --install opensearch opensearch/opensearch \
		-f helm/opensearch-values.yaml --namespace opensearch --create-namespace
	KUBECONFIG=$(KUBECONFIG) helm upgrade --install opensearch-dashboards opensearch/opensearch-dashboards \
		-f helm/opensearch-dashboards-values.yaml --namespace opensearch

opensearch-status:
	KUBECONFIG=$(KUBECONFIG) kubectl get pods,svc -n opensearch

opensearch-dashboard:
	python3 scripts/create-dashboard.py http://$(FEDORA_HOST):30561
