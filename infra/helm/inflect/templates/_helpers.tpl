{{/*
Common helpers for the inflect chart.

Conventions:
  - inflect.name           — chart name (overridable by .Values.nameOverride)
  - inflect.fullname       — release-prefixed instance name
  - inflect.chart          — chart name + version (used in helm.sh/chart label)
  - inflect.labels         — full label set for any object (with optional component)
  - inflect.selectorLabels — stable selector subset (must NOT change across upgrades)
  - inflect.serviceAccountName — derived SA name
  - inflect.image          — full image reference (repo:tag, falls back to AppVersion)
  - inflect.workerImage    — worker image (inherits from inflect.image when overrides empty)
  - inflect.migrationImage — migration job image (same fallback model)
  - inflect.envFromConfigMapName — ConfigMap name for envFrom
  - inflect.envFromSecretName    — Secret name for envFrom
*/}}

{{/*
Expand the name of the chart.
*/}}
{{- define "inflect.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name. Truncate at 63 chars
because some Kubernetes name fields are limited to that by the DNS
naming spec. If release name contains chart name, just use release
name (avoids "myapp-myapp" duplication).
*/}}
{{- define "inflect.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart label value.
*/}}
{{- define "inflect.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels — applied to every resource's metadata.
Accepts an optional component override:
  {{ include "inflect.labels" (dict "ctx" . "component" "worker") }}
Default component is "app". The selector-label subset never includes
component (which is the chart-wide pattern); component lives in the
full label set so per-tier filtering works without breaking selectors.
*/}}
{{- define "inflect.labels" -}}
{{- $ctx := . -}}
{{- $component := "app" -}}
{{- if and (kindIs "map" .) (hasKey . "ctx") -}}
{{- $ctx = .ctx -}}
{{- $component = default "app" .component -}}
{{- end -}}
helm.sh/chart: {{ include "inflect.chart" $ctx }}
{{ include "inflect.selectorLabels" (dict "ctx" $ctx "component" $component) }}
{{- if $ctx.Chart.AppVersion }}
app.kubernetes.io/version: {{ $ctx.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ $ctx.Release.Service }}
app.kubernetes.io/part-of: {{ include "inflect.name" $ctx }}
{{- end }}

{{/*
Selector labels — load-bearing subset that MUST be stable across
upgrades. Used in spec.selector.matchLabels (immutable on Deployment).
Includes component when called with the dict form so app vs worker
pods get DIFFERENT selectors and don't accidentally share a single
ReplicaSet.
*/}}
{{- define "inflect.selectorLabels" -}}
{{- $ctx := . -}}
{{- $component := "" -}}
{{- if and (kindIs "map" .) (hasKey . "ctx") -}}
{{- $ctx = .ctx -}}
{{- $component = default "" .component -}}
{{- end -}}
app.kubernetes.io/name: {{ include "inflect.name" $ctx }}
app.kubernetes.io/instance: {{ $ctx.Release.Name }}
{{- if $component }}
app.kubernetes.io/component: {{ $component }}
{{- end }}
{{- end }}

{{/*
Create the name of the service account to use.
*/}}
{{- define "inflect.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "inflect.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image reference: repository:tag. If .Values.image.tag is empty, falls
back to .Chart.AppVersion (which we keep in sync with package.json).
*/}}
{{- define "inflect.image" -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end }}

{{/*
Worker image. Defaults to .Values.image.* when worker overrides empty.
*/}}
{{- define "inflect.workerImage" -}}
{{- $repo := default .Values.image.repository .Values.worker.image.repository -}}
{{- $tag := default (default .Chart.AppVersion .Values.image.tag) .Values.worker.image.tag -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end }}

{{/*
Migration job image. Same fallback model as worker.
*/}}
{{- define "inflect.migrationImage" -}}
{{- $repo := default .Values.image.repository .Values.migration.image.repository -}}
{{- $tag := default (default .Chart.AppVersion .Values.image.tag) .Values.migration.image.tag -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end }}

{{/*
ConfigMap name for envFrom — derives "<fullname>-config" if not
overridden.
*/}}
{{- define "inflect.envFromConfigMapName" -}}
{{- if .Values.envFrom.configMap.name -}}
{{- .Values.envFrom.configMap.name -}}
{{- else -}}
{{- printf "%s-config" (include "inflect.fullname" .) -}}
{{- end -}}
{{- end }}

{{/*
Secret name for envFrom — derives "<fullname>-secrets" if not
overridden.
*/}}
{{- define "inflect.envFromSecretName" -}}
{{- if .Values.envFrom.secret.name -}}
{{- .Values.envFrom.secret.name -}}
{{- else -}}
{{- printf "%s-secrets" (include "inflect.fullname" .) -}}
{{- end -}}
{{- end }}

{{/*
PgBouncer password Secret name — derives "<fullname>-pgbouncer" if
not overridden. The Secret must carry the key named in
.Values.pgbouncer.passwordSecret.key (default POSTGRESQL_PASSWORD).
*/}}
{{- define "inflect.pgbouncerSecretName" -}}
{{- if .Values.pgbouncer.passwordSecret.name -}}
{{- .Values.pgbouncer.passwordSecret.name -}}
{{- else -}}
{{- printf "%s-pgbouncer" (include "inflect.fullname" .) -}}
{{- end -}}
{{- end }}
