#!/bin/bash

# ============================================================
# say2-6team Docker Image Build and ECR Push Script
# ============================================================

set -e  # Stop script on error

REGION="ap-northeast-2"
PROJECT_NAME="say2-6team"

# Set paths relative to repo root regardless of where script is run from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "=========================================="
echo "say2-6team Docker Build & Push"
echo "Region: ap-northeast-2 (Seoul)"
echo "Repo root: ${REPO_ROOT}"
echo "=========================================="
echo ""

# ------------------------------------------------------------
# Check prerequisites
# ------------------------------------------------------------
echo "Checking prerequisites..."

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "[OK] AWS Account: $ACCOUNT_ID"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "[FAIL] Docker not found. Please install Docker first."
    exit 1
fi
echo "[OK] Docker found"
echo ""

# ------------------------------------------------------------
# ECR Login
# ------------------------------------------------------------
echo "Logging in to ECR..."
aws ecr get-login-password --region ${REGION} | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

if [ $? -eq 0 ]; then
    echo "[OK] ECR login successful!"
else
    echo "[FAIL] ECR login failed!"
    exit 1
fi
echo ""

# ------------------------------------------------------------
# Build helper function
# ------------------------------------------------------------
build_and_push() {
    local STEP="$1"
    local TOTAL="$2"
    local LABEL="$3"
    local SRC_DIR="$4"
    local IMAGE_NAME="${PROJECT_NAME}-$5"

    echo "[${STEP}/${TOTAL}] Building and pushing ${LABEL}..."
    cd "${REPO_ROOT}/${SRC_DIR}"

    if [ ! -f "Dockerfile" ]; then
        echo "[FAIL] Dockerfile not found in ${SRC_DIR}"
        exit 1
    fi

    local IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${IMAGE_NAME}:latest"

    echo "Building ${IMAGE_NAME}..."
    docker build --platform linux/amd64 --no-cache -t ${IMAGE_NAME}:latest .

    echo "Tagging ${IMAGE_NAME}..."
    docker tag ${IMAGE_NAME}:latest ${IMAGE_URI}

    echo "Pushing ${IMAGE_NAME}..."
    docker push ${IMAGE_URI}

    echo "[OK] ${LABEL} pushed: ${IMAGE_URI}"
    echo ""
    # Return URI to caller (via global variable approach)
    echo "${IMAGE_URI}"
}

# ------------------------------------------------------------
# 1. Build & Push Orchestrator
# ------------------------------------------------------------
ORCHESTRATOR_URI=$(build_and_push 1 5 "Orchestrator" "final/central/backend" "orchestrator" | tail -1)

# ------------------------------------------------------------
# 2. Build & Push CXR Service
# ------------------------------------------------------------
CXR_URI=$(build_and_push 2 5 "CXR Service" "chest-svc" "cxr-svc" | tail -1)

# ------------------------------------------------------------
# 3. Build & Push ECG Service
# ------------------------------------------------------------
ECG_URI=$(build_and_push 3 5 "ECG Service" "ecg-svc" "ecg-svc" | tail -1)

# ------------------------------------------------------------
# 4. Build & Push Lab Service
# ------------------------------------------------------------
LAB_URI=$(build_and_push 4 5 "Lab Service" "Lab-svc" "lab-svc" | tail -1)

# ------------------------------------------------------------
# 5. Build & Push Router Service
# ------------------------------------------------------------
ROUTER_URI=$(build_and_push 5 6 "Router Service" "router-svc" "router-svc" | tail -1)

# ------------------------------------------------------------
# 6. Build & Push RAG Service
# ------------------------------------------------------------
RAG_URI=$(build_and_push 6 6 "RAG Service" "AWS/Data-RAG/docker" "rag-svc" | tail -1)

# ------------------------------------------------------------
# Generate compute-stack-params.json
# ------------------------------------------------------------
echo "Creating compute-stack-params.json..."
cd "${SCRIPT_DIR}"

cat > compute-stack-params.json << EOF
[
  {
    "ParameterKey": "ProjectName",
    "ParameterValue": "${PROJECT_NAME}"
  },
  {
    "ParameterKey": "Environment",
    "ParameterValue": "dev"
  },
  {
    "ParameterKey": "Owner",
    "ParameterValue": "lji"
  },
  {
    "ParameterKey": "OrchestratorImageUri",
    "ParameterValue": "${ORCHESTRATOR_URI}"
  },
  {
    "ParameterKey": "CxrSvcImageUri",
    "ParameterValue": "${CXR_URI}"
  },
  {
    "ParameterKey": "EcgSvcImageUri",
    "ParameterValue": "${ECG_URI}"
  },
  {
    "ParameterKey": "LabSvcImageUri",
    "ParameterValue": "${LAB_URI}"
  },
  {
    "ParameterKey": "RouterSvcImageUri",
    "ParameterValue": "${ROUTER_URI}"
  }
]
EOF

echo "[OK] compute-stack-params.json updated!"
echo ""

# ------------------------------------------------------------
# Completion message
# ------------------------------------------------------------
echo "=========================================="
echo "[OK] All images built and pushed!"
echo "=========================================="
echo ""
echo "Image URIs:"
echo "  Orchestrator:  ${ORCHESTRATOR_URI}"
echo "  CXR Service:   ${CXR_URI}"
echo "  ECG Service:   ${ECG_URI}"
echo "  Lab Service:   ${LAB_URI}"
echo "  Router Service:${ROUTER_URI}"
echo "  RAG Service:   ${RAG_URI}"
echo ""
echo "Next step:"
echo "  bash deploy-compute.sh"
echo ""
