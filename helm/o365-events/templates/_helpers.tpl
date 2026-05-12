{{- define "o365-events.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "o365-events.producerImage" -}}
{{ .Values.imageRegistry }}/{{ .Values.producer.image }}:{{ .Values.imageTag }}
{{- end }}

{{- define "o365-events.consumerImage" -}}
{{ .Values.imageRegistry }}/{{ .Values.consumer.image }}:{{ .Values.imageTag }}
{{- end }}
