#!/usr/bin/env bash
# Register cashclaw with the agent-gateway universal service manager
# Usage: bash scripts/register-service.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config/service.yaml"
SERVICES_DIR="${HOME}/.agent-gateway/services.d"
DEST="${SERVICES_DIR}/cashclaw.yaml"

mkdir -p "${SERVICES_DIR}"
cp "${CONFIG_FILE}" "${DEST}"

echo "Registered cashclaw with service manager at: ${DEST}"
echo "  Run 'service-manager status' to verify."
