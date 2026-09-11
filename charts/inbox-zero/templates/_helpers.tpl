{{/*
Expand the name of the chart.
*/}}
{{- define "inbox-zero.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "inbox-zero.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "inbox-zero.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "inbox-zero.labels" -}}
helm.sh/chart: {{ include "inbox-zero.chart" . }}
app.kubernetes.io/name: {{ include "inbox-zero.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "inbox-zero.selectorLabels" -}}
app.kubernetes.io/name: {{ include "inbox-zero.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "inbox-zero.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "inbox-zero.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "inbox-zero.configMapName" -}}
{{- default (printf "%s-config" (include "inbox-zero.fullname" .)) .Values.existingConfigMap -}}
{{- end -}}

{{- define "inbox-zero.secretName" -}}
{{- default (printf "%s-secret" (include "inbox-zero.fullname" .)) .Values.existingSecret -}}
{{- end -}}

{{- define "inbox-zero.webServiceName" -}}
{{- printf "%s-web" (include "inbox-zero.fullname" .) -}}
{{- end -}}

{{- define "inbox-zero.postgresqlServiceName" -}}
{{- printf "%s-postgresql" (include "inbox-zero.fullname" .) -}}
{{- end -}}

{{- define "inbox-zero.redisServiceName" -}}
{{- printf "%s-redis" (include "inbox-zero.fullname" .) -}}
{{- end -}}

{{- define "inbox-zero.redisHttpServiceName" -}}
{{- printf "%s-redis-http" (include "inbox-zero.fullname" .) -}}
{{- end -}}

{{- define "inbox-zero.databaseUrl" -}}
{{- $password := required "postgresql.auth.password is required when using bundled Postgres" .Values.postgresql.auth.password -}}
{{- printf "postgresql://%s:%s@%s:5432/%s?schema=public" (.Values.postgresql.auth.username | urlquery) ($password | urlquery) (include "inbox-zero.postgresqlServiceName" .) (.Values.postgresql.auth.database | urlquery) -}}
{{- end -}}

{{- define "inbox-zero.redisUrl" -}}
{{- $password := required "redis.auth.password is required when using bundled Redis" .Values.redis.auth.password -}}
{{- printf "redis://:%s@%s:6379" ($password | urlquery) (include "inbox-zero.redisServiceName" .) -}}
{{- end -}}

{{- define "inbox-zero.redisHttpUrl" -}}
{{- printf "http://%s:80" (include "inbox-zero.redisHttpServiceName" .) -}}
{{- end -}}

{{- define "inbox-zero.internalApiUrl" -}}
{{- printf "http://%s:%v" (include "inbox-zero.webServiceName" .) .Values.service.port -}}
{{- end -}}

{{- define "inbox-zero.externalDatabaseEnvRefs" -}}
{{- if and .Values.externalDatabase.enabled .Values.externalDatabase.existingSecret.name }}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.externalDatabase.existingSecret.name }}
      key: {{ .Values.externalDatabase.existingSecret.databaseUrlKey }}
- name: DIRECT_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.externalDatabase.existingSecret.name }}
      key: {{ .Values.externalDatabase.existingSecret.directUrlKey }}
{{- end }}
{{- end -}}

{{- define "inbox-zero.externalRedisEnvRefs" -}}
{{- if and .Values.externalRedis.enabled .Values.externalRedis.existingSecret.name }}
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.externalRedis.existingSecret.name }}
      key: {{ .Values.externalRedis.existingSecret.redisUrlKey }}
- name: UPSTASH_REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.externalRedis.existingSecret.name }}
      key: {{ .Values.externalRedis.existingSecret.upstashRedisUrlKey }}
- name: UPSTASH_REDIS_TOKEN
  valueFrom:
    secretKeyRef:
      name: {{ .Values.externalRedis.existingSecret.name }}
      key: {{ .Values.externalRedis.existingSecret.upstashRedisTokenKey }}
{{- end }}
{{- end -}}

{{- define "inbox-zero.migrationDatabaseEnv" -}}
{{- if and .Values.externalDatabase.enabled .Values.externalDatabase.existingSecret.name }}
{{- include "inbox-zero.externalDatabaseEnvRefs" . }}
{{- else if and .Values.externalDatabase.enabled .Values.existingSecret }}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "inbox-zero.secretName" . }}
      key: DATABASE_URL
- name: DIRECT_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "inbox-zero.secretName" . }}
      key: DIRECT_URL
{{- else if .Values.externalDatabase.enabled }}
- name: DATABASE_URL
  value: {{ required "externalDatabase.databaseUrl is required when externalDatabase.enabled=true and no externalDatabase.existingSecret.name is set" .Values.externalDatabase.databaseUrl | quote }}
- name: DIRECT_URL
  value: {{ default .Values.externalDatabase.databaseUrl .Values.externalDatabase.directUrl | quote }}
{{- else if and .Values.postgresql.enabled (not .Values.externalDatabase.enabled) }}
- name: DATABASE_URL
  value: {{ include "inbox-zero.databaseUrl" . | quote }}
- name: DIRECT_URL
  value: {{ include "inbox-zero.databaseUrl" . | quote }}
{{- else if .Values.existingSecret }}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "inbox-zero.secretName" . }}
      key: DATABASE_URL
- name: DIRECT_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "inbox-zero.secretName" . }}
      key: DIRECT_URL
{{- else if index .Values.secretEnv "DATABASE_URL" }}
- name: DATABASE_URL
  value: {{ index .Values.secretEnv "DATABASE_URL" | quote }}
- name: DIRECT_URL
  value: {{ default (index .Values.secretEnv "DATABASE_URL") (index .Values.secretEnv "DIRECT_URL") | quote }}
{{- end }}
{{- end -}}
