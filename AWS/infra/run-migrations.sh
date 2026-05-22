#!/bin/bash
set -e

REGION="ap-northeast-2"
PROJECT_NAME="say2-6team"

echo "=========================================="
echo "Aurora DB Schema & Migrations Setup"
echo "=========================================="

# Get Aurora endpoint
AURORA_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ${PROJECT_NAME}-aurora \
  --query 'Stacks[0].Outputs[?OutputKey==`ClusterEndpoint`].OutputValue' \
  --output text \
  --region ${REGION})

if [ -z "$AURORA_ENDPOINT" ]; then
  echo "[FAIL] Error: Aurora endpoint not found!"
  echo "   Make sure ${PROJECT_NAME}-aurora stack is deployed."
  exit 1
fi

echo "[OK] Aurora Endpoint: ${AURORA_ENDPOINT}"

# Get DB password from Secrets Manager
DB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id ${PROJECT_NAME}-aurora-master-secret \
  --query SecretString \
  --output text \
  --region ${REGION})

DB_USERNAME=$(echo $DB_SECRET | jq -r .username)
DB_PASSWORD=$(echo $DB_SECRET | jq -r .password)

if [ -z "$DB_USERNAME" ] || [ -z "$DB_PASSWORD" ]; then
  echo "[FAIL] Error: Failed to retrieve DB credentials from Secrets Manager"
  exit 1
fi

echo "[OK] DB Credentials retrieved"

# Path relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_FILE="${SCRIPT_DIR}/../AWS/aurora-serverless/migrations.yaml"

if [ ! -f "$MIGRATIONS_FILE" ]; then
  echo "[FAIL] Error: migrations.yaml not found at ${MIGRATIONS_FILE}"
  exit 1
fi

echo "[OK] Migrations file found"
echo ""
echo "[WARN]  WARNING: This will execute SQL migrations on Aurora database 'drai_ops'"
echo "   Endpoint: ${AURORA_ENDPOINT}"
echo "   Database: drai_ops"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Extract SQL from YAML and execute
echo ""
echo "Extracting and executing migrations..."

# Create temporary SQL file
TEMP_SQL=$(mktemp)

# Extract SQL from migrations.yaml (versions 001~009)
cat > "$TEMP_SQL" << 'EOF'
-- ============================================================
-- drai_ops DB initialization script
-- Auto-extracted from migrations.yaml
-- ============================================================

-- 001: encounters table
CREATE TABLE IF NOT EXISTS encounters (
    encounter_id       TEXT PRIMARY KEY,
    patient_id         TEXT NOT NULL,
    subject_id         VARCHAR(20),
    chief_complaint    TEXT,
    patient_name       VARCHAR(128),
    patient_age        INTEGER,
    patient_gender     VARCHAR(16),
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at          TIMESTAMPTZ,
    status             VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata           JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_enc_patient      ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_enc_subject      ON encounters(subject_id);
CREATE INDEX IF NOT EXISTS idx_enc_status_start ON encounters(status, started_at DESC);

-- 002: modal_results table
CREATE TABLE IF NOT EXISTS modal_results (
    id                 BIGSERIAL PRIMARY KEY,
    encounter_id       TEXT NOT NULL REFERENCES encounters(encounter_id) ON DELETE CASCADE,
    subject_id         VARCHAR(20),
    modality           VARCHAR(16) NOT NULL,
    service_request_id VARCHAR(64),
    raw_response       JSONB NOT NULL,
    risk_level         VARCHAR(20),
    summary            TEXT,
    synced_to_fhir     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (encounter_id, modality)
);

CREATE INDEX IF NOT EXISTS idx_mr_enc        ON modal_results(encounter_id);
CREATE INDEX IF NOT EXISTS idx_mr_subject    ON modal_results(subject_id);
CREATE INDEX IF NOT EXISTS idx_mr_risk       ON modal_results(risk_level);
CREATE INDEX IF NOT EXISTS idx_mr_created    ON modal_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_sr         ON modal_results(service_request_id);
CREATE INDEX IF NOT EXISTS idx_mr_raw_gin    ON modal_results USING GIN (raw_response);

-- 003: diagnostic_reports table
CREATE TABLE IF NOT EXISTS diagnostic_reports (
    id                 BIGSERIAL PRIMARY KEY,
    encounter_id       TEXT NOT NULL REFERENCES encounters(encounter_id) ON DELETE CASCADE,
    subject_id         VARCHAR(20),
    fhir_report_id     VARCHAR(64),
    ai_diagnosis       TEXT,
    ai_recommendations JSONB DEFAULT '[]'::jsonb,
    ai_risk_level      VARCHAR(20),
    physician_edits    TEXT,
    status             VARCHAR(20) NOT NULL DEFAULT 'preliminary',
    signed_by          VARCHAR(64),
    signed_at          TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (encounter_id)
);

CREATE INDEX IF NOT EXISTS idx_dr_enc     ON diagnostic_reports(encounter_id);
CREATE INDEX IF NOT EXISTS idx_dr_subject ON diagnostic_reports(subject_id);
CREATE INDEX IF NOT EXISTS idx_dr_status  ON diagnostic_reports(status, created_at DESC);

-- 004: modal_events table
CREATE TABLE IF NOT EXISTS modal_events (
    id           BIGSERIAL PRIMARY KEY,
    encounter_id TEXT,
    subject_id   VARCHAR(20),
    event_type   VARCHAR(40) NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_me_enc_time ON modal_events(encounter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_me_subject  ON modal_events(subject_id);
CREATE INDEX IF NOT EXISTS idx_me_type     ON modal_events(event_type);

-- 005: updated_at auto-update trigger
CREATE OR REPLACE FUNCTION _bump_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dr_updated_at ON diagnostic_reports;
CREATE TRIGGER trg_dr_updated_at
BEFORE UPDATE ON diagnostic_reports
FOR EACH ROW EXECUTE FUNCTION _bump_updated_at();

-- 006: subject_id auto-fill trigger
CREATE OR REPLACE FUNCTION _fill_subject_id() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.subject_id IS NULL AND NEW.encounter_id IS NOT NULL THEN
        SELECT subject_id INTO NEW.subject_id
        FROM encounters
        WHERE encounter_id = NEW.encounter_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mr_fill_subject ON modal_results;
CREATE TRIGGER trg_mr_fill_subject
BEFORE INSERT OR UPDATE OF encounter_id ON modal_results
FOR EACH ROW EXECUTE FUNCTION _fill_subject_id();

DROP TRIGGER IF EXISTS trg_dr_fill_subject ON diagnostic_reports;
CREATE TRIGGER trg_dr_fill_subject
BEFORE INSERT OR UPDATE OF encounter_id ON diagnostic_reports
FOR EACH ROW EXECUTE FUNCTION _fill_subject_id();

DROP TRIGGER IF EXISTS trg_me_fill_subject ON modal_events;
CREATE TRIGGER trg_me_fill_subject
BEFORE INSERT OR UPDATE OF encounter_id ON modal_events
FOR EACH ROW EXECUTE FUNCTION _fill_subject_id();

-- 007: fhir_sync_queue table
CREATE TABLE IF NOT EXISTS fhir_sync_queue (
    id            BIGSERIAL PRIMARY KEY,
    encounter_id  TEXT NOT NULL,
    patient_id    TEXT,
    resource_type VARCHAR(40) NOT NULL,
    resource_id   TEXT NOT NULL,
    payload       JSONB NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending',
    retry_count   INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fsq_pending
    ON fhir_sync_queue(status, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_fsq_encounter
    ON fhir_sync_queue(encounter_id);

-- 008: device_tokens table
CREATE TABLE IF NOT EXISTS device_tokens (
    id           BIGSERIAL PRIMARY KEY,
    user_id      TEXT,
    token        TEXT NOT NULL UNIQUE,
    platform     VARCHAR(20) NOT NULL,
    app_version  VARCHAR(20),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dt_user     ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_dt_platform ON device_tokens(platform);
CREATE INDEX IF NOT EXISTS idx_dt_active   ON device_tokens(last_seen_at DESC);

-- 009: add last_reminder_at column to diagnostic_reports
ALTER TABLE diagnostic_reports
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dr_unsigned_reminder
  ON diagnostic_reports(created_at, last_reminder_at)
  WHERE status <> 'signed';

-- Done
SELECT 'Migrations completed successfully!' AS status;
EOF

echo "Executing SQL migrations..."

# Run psql (using PGPASSWORD environment variable)
export PGPASSWORD="$DB_PASSWORD"

psql -h "$AURORA_ENDPOINT" \
     -U "$DB_USERNAME" \
     -d drai_ops \
     -f "$TEMP_SQL"

# Delete temporary file
rm -f "$TEMP_SQL"

echo ""
echo "[OK] Migrations completed successfully!"
echo ""
echo "Database: drai_ops"
echo "Tables created:"
echo "  - encounters"
echo "  - modal_results"
echo "  - diagnostic_reports"
echo "  - modal_events"
echo "  - fhir_sync_queue"
echo "  - device_tokens"
echo ""
echo "Next steps:"
echo "1. Verify tables: psql -h ${AURORA_ENDPOINT} -U ${DB_USERNAME} -d drai_ops -c '\\dt'"
echo "2. Check compute-stack is using correct Aurora endpoint"
echo "3. Restart compute services if needed"
