FROM --platform=linux/amd64 gcr.io/distroless/static-debian12
COPY bin/consumer /consumer
ENTRYPOINT ["/consumer"]
