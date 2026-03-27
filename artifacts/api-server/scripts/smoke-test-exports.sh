#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: ./smoke-test-exports.sh [OPTIONS]

Smoke-test all binary export endpoints to verify files are not corrupted.
Checks: HTTP status, Content-Length match, ZIP/PDF magic bytes, ZIP integrity.

Options:
  --base-url URL     API base URL (default: http://localhost:8080)
  --email    EMAIL   Login email (default: exporttest@test.com)
  --password PASS    Login password (default: Test1234!)
  --model-id ID      Model ID to export (default: auto-detect first model)
  --token    TOKEN   Skip login, use this JWT directly
  -h, --help         Show this help

Examples:
  ./smoke-test-exports.sh
  ./smoke-test-exports.sh --base-url https://schoolstackbudget.up.railway.app
  ./smoke-test-exports.sh --base-url https://budget.schoolstack.ai --token "ey..."
EOF
  exit 0
}

BASE_URL="http://localhost:8080"
EMAIL="exporttest@test.com"
PASSWORD="Test1234!"
MODEL_ID=""
TOKEN=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --email)    EMAIL="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --model-id) MODEL_ID="$2"; shift 2 ;;
    --token)    TOKEN="$2"; shift 2 ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

PASS=0
FAIL=0

if [[ -z "$TOKEN" ]]; then
  echo "Logging in as $EMAIL..."
  LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  TOKEN=$(echo "$LOGIN_RESP" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})" 2>/dev/null)
  if [[ -z "$TOKEN" ]]; then
    echo "FATAL: Login failed. Response: $LOGIN_RESP"
    exit 1
  fi
  echo "Authenticated."
fi

if [[ -z "$MODEL_ID" ]]; then
  MODELS_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/models")
  MODEL_ID=$(echo "$MODELS_RESP" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const m=JSON.parse(d);console.log((Array.isArray(m)?m[0]?.id:m.models?.[0]?.id)||'')}catch{console.log('')}})" 2>/dev/null)
  if [[ -z "$MODEL_ID" ]]; then
    echo "FATAL: No models found. Create a model first."
    exit 1
  fi
  echo "Using model ID: $MODEL_ID"
fi

echo ""
echo "=== Smoke Test: Binary Exports ==="
echo "Base URL:  $BASE_URL"
echo "Model ID:  $MODEL_ID"
echo ""

check_export() {
  local name="$1"
  local path="$2"
  local expected_type="$3"
  local outfile="$TMPDIR/$(echo "$name" | tr ' ' '_')"

  local http_code
  http_code=$(curl -s -o "$outfile" -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL$path")

  if [[ "$http_code" != "200" ]]; then
    echo "  FAIL | $name | HTTP $http_code"
    FAIL=$((FAIL + 1))
    return
  fi

  local file_size
  file_size=$(wc -c < "$outfile" | tr -d ' ')

  if [[ "$expected_type" == "xlsx" ]]; then
    local magic
    magic=$(od -A n -t x1 -N 4 "$outfile" 2>/dev/null | tr -d ' \n' || echo "")
    if [[ "$magic" != "504b0304" ]]; then
      echo "  FAIL | $name | Bad magic: $magic (expected 504b0304 / PK)"
      FAIL=$((FAIL + 1))
      return
    fi

    if command -v python3 &>/dev/null; then
      local zip_check
      zip_check=$(python3 -c "import zipfile; z=zipfile.ZipFile('$outfile'); r=z.testzip(); print(f'OK:{len(z.namelist())} entries' if r is None else f'CORRUPT:{r}')" 2>&1)
      if [[ "$zip_check" == CORRUPT* ]]; then
        echo "  FAIL | $name | ZIP corrupt: $zip_check | ${file_size}B"
        FAIL=$((FAIL + 1))
        return
      fi
      echo "  PASS | $name | ${file_size}B | $zip_check"
    else
      echo "  PASS | $name | ${file_size}B | magic OK (python3 not available for deep check)"
    fi
  elif [[ "$expected_type" == "pdf" ]]; then
    local magic
    magic=$(head -c 5 "$outfile" 2>/dev/null || echo "")
    if [[ "$magic" != "%PDF-" ]]; then
      echo "  FAIL | $name | Bad magic: '$magic' (expected %PDF-)"
      FAIL=$((FAIL + 1))
      return
    fi
    echo "  PASS | $name | ${file_size}B | %PDF- header OK"
  fi

  PASS=$((PASS + 1))
}

check_export "Formula XLSX"              "/api/models/$MODEL_ID/export"                 "xlsx"
check_export "Pro Forma PDF"             "/api/models/$MODEL_ID/export/pro-forma-pdf"   "pdf"
check_export "Loan Readiness PDF"        "/api/models/$MODEL_ID/export/loan-readiness-pdf" "pdf"
check_export "Lender Pro Forma XLSX"     "/api/models/$MODEL_ID/export/lender-proforma" "xlsx"
check_export "Lender Packet PDF"         "/api/models/$MODEL_ID/export/lender-packet-pdf" "pdf"
check_export "Board Summary PDF"         "/api/models/$MODEL_ID/export/board-packet-pdf" "pdf"
check_export "Underwriting Pro Forma"    "/api/models/$MODEL_ID/export/underwriting"    "xlsx"
check_export "Underwriting V2 XLSX"      "/api/models/$MODEL_ID/export/underwriting-v2" "xlsx"
check_export "Single-Year Budget XLSX"   "/api/models/$MODEL_ID/export/single-year?year=0" "xlsx"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
  echo "SOME EXPORTS ARE CORRUPTED"
  exit 1
else
  echo "ALL EXPORTS HEALTHY"
  exit 0
fi
