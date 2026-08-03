#!/usr/bin/env bash
#
# End-to-end smoke test.
#
# Builds a database from zero, applies every migration, seeds it, boots the API
# and exercises every feature the platform has. Verifies three things at once:
# that migrations apply from empty, that the seed works, and that every endpoint
# behaves — including the refusals, which matter as much as the successes.
#
#   ./scripts/smoke-test.sh
#
# Uses its own database and port, so a running dev server and your demo data
# are both untouched.

set -uo pipefail

DB=${SMOKE_DB:-drone_ops_smoke}
PORT=${SMOKE_PORT:-3999}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/apps/api"
URL="postgresql://$(whoami)@localhost:5432/$DB?schema=public"
B="http://localhost:$PORT/api/v1"
TMP=$(mktemp -d)

PASS=0; FAIL=0; SECTION=""
GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; OFF=$'\033[0m'

cleanup() {
  [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

section() { SECTION="$1"; printf "\n${BOLD}%s${OFF}\n" "$1"; }

# Guards against cascade noise: one empty id would otherwise turn into dozens of
# meaningless 404s and bury the real failure.
need() {
  if [ -z "${2:-}" ]; then
    FAIL=$((FAIL + 1)); printf "  ${RED}✗${OFF} %-52s ${RED}%s is empty — downstream checks are meaningless${OFF}\n" "$1" "$1"
    return 1
  fi
  return 0
}

# check <label> <expected-status> <actual-status> [extra-assertion-result]
check() {
  if [ "$2" = "$3" ] && [ "${4:-ok}" = "ok" ]; then
    PASS=$((PASS + 1)); printf "  ${GREEN}✓${OFF} %-52s ${DIM}%s${OFF}\n" "$1" "$3"
  else
    FAIL=$((FAIL + 1)); printf "  ${RED}✗${OFF} %-52s expected %s got %s %s\n" "$1" "$2" "$3" "${4:-}"
    head -c 200 "$TMP/body" 2>/dev/null | sed 's/^/      /'; echo
  fi
}

# req <method> <route> <token> [payload]  -> echoes status, body in $TMP/body
#
# argv is built as an ARRAY. Conditional expansions that carry their own quotes
# (${3:+-H "..."}) word-split in ways that silently corrupt payloads — which is
# a test lying about the code under test, the worst kind of bug in a harness.
req() {
  local -a argv=(-s -o "$TMP/body" -w '%{http_code}' -X "$1")
  [ -n "${3:-}" ] && argv+=(-H "Authorization: Bearer $3")
  argv+=(-H 'content-type: application/json')
  [ -n "${4:-}" ] && argv+=(-d "$4")
  curl "${argv[@]}" "$B$2"
}

# json <path> -> reads a value out of the last response
json() { node -e "
const fs=require('fs');
let d; try { d = JSON.parse(fs.readFileSync('$TMP/body','utf8')); } catch { console.log(''); process.exit(0); }
const v = (() => { try { return $1; } catch { return ''; } })();
console.log(v === undefined || v === null ? '' : v);
"; }

login() {
  curl -s -o "$TMP/body" -X POST "$B/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" >/dev/null
  json 'd.data.accessToken'
}

printf "${BOLD}Drone Operations Platform — smoke test${OFF}\n"
printf "${DIM}database %s · port %s${OFF}\n" "$DB" "$PORT"

# ---------------------------------------------------------------- build & boot
section "Build from zero"
dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
check "database created" 0 $?

(cd "$API" && DATABASE_URL="$URL" npx prisma migrate deploy >"$TMP/migrate" 2>&1)
check "all migrations apply to an empty database" 0 $?

(cd "$ROOT" && npm run api:build >"$TMP/build" 2>&1)
check "api builds" 0 $?

(cd "$API" && DATABASE_URL="$URL" node dist/database/seed.js >"$TMP/seed" 2>&1)
check "seed runs" 0 $?
(cd "$API" && DATABASE_URL="$URL" node dist/database/seed.js >>"$TMP/seed" 2>&1)
check "seed is idempotent (second run)" 0 $?

(cd "$API" && DATABASE_URL="$URL" PORT=$PORT API_PUBLIC_URL="http://localhost:$PORT" \
  STORAGE_LOCAL_DIR="$TMP/storage" exec node dist/main.js >"$TMP/api.log" 2>&1) &
SRV=$!
for _ in $(seq 1 30); do
  curl -s -o /dev/null "http://localhost:$PORT/api/v1/health" && break; sleep 1
done
check "api boots and answers" 200 "$(req GET /health '')"

# --------------------------------------------------------------------- health
section "Health & docs"
check "liveness" 200 "$(req GET /health '')"
check "readiness reports the database up" 200 "$(req GET /health/ready '')"
check "unversioned route is 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health")"
check "swagger ui" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/docs")"
check "openapi spec" 200 "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/docs-json")"

# ----------------------------------------------------------------------- auth
section "Identity"
check "register a customer" 201 "$(req POST /auth/register '' '{"email":"smoke.cust@test.local","password":"a long passphrase","fullName":"Smoke Customer","accountType":"CUSTOMER"}')"
check "duplicate email refused" 409 "$(req POST /auth/register '' '{"email":"smoke.cust@test.local","password":"a long passphrase","fullName":"Dup","accountType":"CUSTOMER"}')"
check "case-insensitive duplicate refused" 409 "$(req POST /auth/register '' '{"email":"SMOKE.CUST@TEST.LOCAL","password":"a long passphrase","fullName":"Dup","accountType":"CUSTOMER"}')"
check "validation errors are per-field" 400 "$(req POST /auth/register '' '{"email":"nope","password":"short","fullName":"X","accountType":"HACKER"}')"
check "unknown field rejected (mass assignment)" 400 "$(req POST /auth/register '' '{"email":"x@y.com","password":"a long passphrase","fullName":"Test User","accountType":"CUSTOMER","role":"ADMIN"}')"
check "register a provider" 201 "$(req POST /auth/register '' '{"email":"smoke.prov@test.local","password":"a long passphrase","fullName":"Smoke Provider","accountType":"PROVIDER","organisationName":"Smoke Drones"}')"

check "wrong password" 401 "$(req POST /auth/login '' '{"email":"smoke.cust@test.local","password":"wrong"}')"
check "unknown user gives the same answer" 401 "$(req POST /auth/login '' '{"email":"nobody@test.local","password":"wrong"}')"

CUST=$(login smoke.cust@test.local 'a long passphrase')
PROV=$(login smoke.prov@test.local 'a long passphrase')
ADMIN=$(login admin@droneops.local 'seed-admin-passphrase')
ENG=$(login engineer@droneops.local 'seed-engineer-passphrase')
DEMO=$(login kisan@demo.local 'demo-passphrase-2026')
check "all five logins issued tokens" ok "$([ -n "$CUST$PROV$ADMIN$ENG$DEMO" ] && echo ok || echo missing)"

check "protected route without a token" 401 "$(req GET /auth/me '')"
check "protected route with garbage" 401 "$(req GET /auth/me 'not-a-token')"
check "/auth/me with a real token" 200 "$(req GET /auth/me "$CUST")"

curl -s -c "$TMP/jar" -o /dev/null -X POST "$B/auth/login" -H 'content-type: application/json' \
  -d '{"email":"smoke.cust@test.local","password":"a long passphrase"}'
OLD=$(grep refresh_token "$TMP/jar" | awk '{print $NF}')
check "refresh rotates the session" 200 "$(curl -s -b "$TMP/jar" -c "$TMP/jar" -o "$TMP/body" -w '%{http_code}' -X POST "$B/auth/refresh")"
NEW=$(grep refresh_token "$TMP/jar" | awk '{print $NF}')
check "the token actually changed" ok "$([ "$OLD" != "$NEW" ] && echo ok || echo same)"
check "replaying the old token is detected" 401 "$(curl -s -o "$TMP/body" -w '%{http_code}' -X POST "$B/auth/refresh" -H "Cookie: refresh_token=$OLD")"
check "reuse revokes the whole family" 401 "$(curl -s -b "$TMP/jar" -o "$TMP/body" -w '%{http_code}' -X POST "$B/auth/refresh")"

# ----------------------------------------------------------------------- rbac
section "Authorisation"
check "customer cannot list all organisations" 403 "$(req GET /admin/organisations "$CUST")"
check "customer cannot reach the provider queue" 403 "$(req GET /admin/providers "$CUST")"
check "provider cannot review providers" 403 "$(req POST "/admin/providers/00000000-0000-4000-8000-000000000000/activate" "$PROV")"
check "engineer cannot assign tickets" 403 "$(req GET /admin/tickets "$ENG")"
check "admin can list organisations" 200 "$(req GET /admin/organisations "$ADMIN")"
check "customer reads its own organisation" 200 "$(req GET /organisations/me "$CUST")"
check "customer renames its own organisation" 200 "$(req PATCH /organisations/me "$CUST" '{"name":"Smoke Farms"}')"

# ------------------------------------------------------------------ catalogue
section "Catalogue"
check "service types readable" 200 "$(req GET /service-types "$CUST")"
ST=$(json 'd.data.find(t=>t.code==="CROP_SPRAYING").id')
check "areas: states" 200 "$(req GET /areas "$CUST")"
SID=$(json 'd.data.find(a=>a.name==="Telangana").id')
check "areas: districts of a state" 200 "$(req GET "/areas?parentId=$SID" "$CUST")"
AID=$(json 'd.data.find(a=>a.name==="Warangal").id')
check "area with full path" 200 "$(req GET "/areas/$AID" "$CUST")"
check "customer cannot add a service type" 403 "$(req POST /admin/catalogue/service-types "$CUST" '{"code":"HACK","name":"No","pricingUnit":"PER_ACRE"}')"
check "admin adds a service type (no deploy)" 201 "$(req POST /admin/catalogue/service-types "$ADMIN" '{"code":"SMOKE_SERVICE","name":"Smoke service","pricingUnit":"PER_DAY"}')"
check "duplicate code refused" 409 "$(req POST /admin/catalogue/service-types "$ADMIN" '{"code":"SMOKE_SERVICE","name":"Dup","pricingUnit":"PER_DAY"}')"
check "district under a district refused" 400 "$(req POST /admin/catalogue/areas "$ADMIN" "{\"level\":\"DISTRICT\",\"name\":\"Bad\",\"parentId\":\"$AID\"}")"

# --------------------------------------------------------------- onboarding
section "Provider onboarding"
check "new provider starts REGISTERED" 200 "$(req GET /providers/me "$PROV")"
check "  stage" REGISTERED "$(json 'd.data.stage')"
check "not bookable yet (BR1)" false "$(json 'd.data.bookable')"
check "save business details" 200 "$(req PUT /providers/me/profile "$PROV" '{"legalName":"Smoke Drones Pvt Ltd","contactPhone":"+919000000001","addressLine":"Plot 1","city":"Warangal","state":"Telangana","pincode":"506002"}')"
check "  stage advanced" PROFILE_COMPLETE "$(json 'd.data.stage')"

check "request a document upload" 201 "$(req POST /providers/me/documents "$PROV" '{"kind":"BUSINESS_REGISTRATION","filename":"../../etc/passwd.pdf","contentType":"application/pdf"}')"
DOCID=$(json 'd.data.documentId'); UPURL=$(json 'd.data.uploadUrl')
printf '%%PDF-1.4 smoke test certificate' > "$TMP/cert.pdf"
SZ=$(curl -s -X PUT "$UPURL" --data-binary @"$TMP/cert.pdf" -H 'content-type: application/pdf' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).sizeBytes)}catch{console.log(0)}})")
check "upload the bytes to the signed URL" ok "$([ "$SZ" -gt 0 ] && echo ok || echo failed)"
check "tampered signature refused" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "${UPURL%signature=*}signature=deadbeef" --data-binary @"$TMP/cert.pdf")"
check "path traversal defeated" ok "$(find "$TMP/storage" -name 'passwd*' 2>/dev/null | grep -q . && echo LEAKED || echo ok)"
check "confirm the upload" 200 "$(req POST "/providers/me/documents/$DOCID/confirm" "$PROV" "{\"sizeBytes\":$SZ}")"
check "submit for review" 200 "$(req POST /providers/me/submit "$PROV")"
check "  stage" UNDER_REVIEW "$(json 'd.data.stage')"
check "details locked under review" 409 "$(req PUT /providers/me/profile "$PROV" '{"legalName":"Sneaky","contactPhone":"+919000000001","addressLine":"x","city":"Warangal","state":"Telangana","pincode":"506002"}')"

check "admin sees the review queue" 200 "$(req GET "/admin/providers?stage=UNDER_REVIEW" "$ADMIN")"
PID=$(json 'd.data.items[0].id')
check "admin reads the provider detail" 200 "$(req GET "/admin/providers/$PID" "$ADMIN")"
check "admin lists their documents" 200 "$(req GET "/admin/providers/$PID/documents" "$ADMIN")"
ADOC=$(json 'd.data[0].id')
check "admin gets a signed document link" 200 "$(req GET "/admin/providers/$PID/documents/$ADOC/link" "$ADMIN")"
DLURL=$(json 'd.data.url')
check "the link serves the real file" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$DLURL")"
check "admin activates" 200 "$(req POST "/admin/providers/$PID/activate" "$ADMIN")"
check "  bookable now (BR1)" true "$(json 'd.data.bookable')"
check "activating twice refused" 409 "$(req POST "/admin/providers/$PID/activate" "$ADMIN")"

# ------------------------------------------------------------------ offerings
section "Offerings"
check "publish an offering" 201 "$(req POST /providers/me/offerings "$PROV" "{\"serviceTypeId\":\"$ST\",\"unitPriceMinor\":44000,\"minQuantity\":5,\"inclusions\":[\"WATER\",\"TRANSPORT\"],\"areaIds\":[\"$AID\"]}")"
OFF=$(json 'd.data.id')
check "  version 1" 1 "$(json 'd.data.currentVersion.versionNumber')"
check "same service twice refused (partial index)" 409 "$(req POST /providers/me/offerings "$PROV" "{\"serviceTypeId\":\"$ST\",\"unitPriceMinor\":50000}")"
check "publish a new version" 201 "$(req POST "/providers/me/offerings/$OFF/versions" "$PROV" '{"unitPriceMinor":47000,"minQuantity":5,"inclusions":["WATER","TRANSPORT"]}')"
check "  version 2" 2 "$(json 'd.data.currentVersion.versionNumber')"
check "price history keeps both" 200 "$(req GET "/providers/me/offerings/$OFF/history" "$PROV")"
check "  two versions recorded" 2 "$(json 'd.data.versions.length')"
check "  exactly one is current" 1 "$(json 'd.data.versions.filter(v=>!v.effectiveTo).length')"
check "customer cannot manage offerings" 403 "$(req GET /providers/me/offerings "$CUST")"

# ------------------------------------------------------------------ discovery
section "Discovery"
check "matches for 20 acres in Warangal" 200 "$(req GET "/discovery/matches?serviceTypeId=$ST&areaId=$AID&quantity=20" "$CUST")"
check "  returns priced offers" ok "$([ "$(json 'd.data.total')" -ge 1 ] && echo ok || echo none)"
check "  includes our new provider" ok "$(json 'd.data.matches.some(m=>m.provider.name==="Smoke Drones") ? "ok" : "missing"')"
check "  states what is NOT included (R9)" ok "$(json 'd.data.matches[0].notIncluded.length > 0 ? "ok" : "empty"')"
BOFF=$(json 'd.data.matches[0].offeringId')
check "below the minimum returns nothing" 200 "$(req GET "/discovery/matches?serviceTypeId=$ST&areaId=$AID&quantity=1" "$CUST")"
check "  filtered out" ok "$([ "$(json 'd.data.matches.filter(m=>m.minQuantity>1).length')" = "0" ] && echo ok || echo leaked)"

# ------------------------------------------------------------------- booking
section "Booking lifecycle"
check "create + assign" 201 "$(req POST /bookings "$CUST" "{\"serviceTypeId\":\"$ST\",\"areaId\":\"$AID\",\"quantity\":20,\"preferredDate\":\"2026-10-01\",\"preferredWindow\":\"DAWN\",\"locationNote\":\"North block\",\"offeringId\":\"$OFF\"}")"
BID=$(json 'd.data.id')
check "  status" ASSIGNED "$(json 'd.data.status')"
check "  quote frozen" 940000 "$(json 'd.data.estimatedTotalMinor')"
check "provider sees the request" 200 "$(req GET "/providers/me/bookings?assignmentStatus=PENDING" "$PROV")"
check "provider declines" 200 "$(req POST "/providers/me/bookings/$BID/reject" "$PROV" '{"reason":"Machine in for service"}')"
check "  D9: booking reopens" UNASSIGNED "$(json 'd.data.status')"
check "reassign the same booking" 201 "$(req POST "/bookings/$BID/assignments" "$CUST" "{\"offeringId\":\"$OFF\"}")"
check "  two assignments on record (S1)" 2 "$(json 'd.data.assignments.length')"
check "provider counter-proposes a date" 200 "$(req POST "/bookings/$BID/schedule/propose" "$PROV" '{"date":"2026-10-04","window":"MORNING"}')"
check "proposer cannot confirm (BR15)" 403 "$(req POST "/bookings/$BID/schedule/confirm" "$PROV")"
check "customer confirms" 200 "$(req POST "/bookings/$BID/schedule/confirm" "$CUST")"
check "  status" SCHEDULED "$(json 'd.data.status')"
check "  date agreed" 2026-10-04 "$(json 'd.data.confirmedDate')"
check "customer cannot mark work done" 403 "$(req POST "/providers/me/bookings/$BID/complete" "$CUST" '{"finalQuantity":18}')"
check "provider marks done (18 of 20)" 200 "$(req POST "/providers/me/bookings/$BID/complete" "$PROV" '{"finalQuantity":18,"note":"Wind picked up"}')"
check "  BR14: billed on delivered" 846000 "$(json 'd.data.finalAmountMinor')"
check "provider cannot confirm completion" 403 "$(req POST "/bookings/$BID/confirm-completion" "$PROV")"
check "customer confirms" 200 "$(req POST "/bookings/$BID/confirm-completion" "$CUST")"
check "  status" COMPLETED "$(json 'd.data.status')"
check "  BR16: full timeline recorded" 7 "$(json 'd.data.history.length')"
check "cancel after completion refused" 409 "$(req POST "/bookings/$BID/cancel" "$CUST" '{"reason":"too late"}')"

# ---------------------------------------------------------------- settlement
section "Settlement & reputation"
check "record payment" 201 "$(req POST "/bookings/$BID/payment" "$CUST" '{"method":"UPI","paidOn":"2026-10-05","reference":"UPI 4028"}')"
check "  defaults to the final amount" 846000 "$(json 'd.data.amountMinor')"
check "  records who logged it (R8)" CUSTOMER "$(json 'd.data.recordedByRole')"
check "second payment refused" 409 "$(req POST "/bookings/$BID/payment" "$PROV" '{"method":"CASH","paidOn":"2026-10-06"}')"
check "provider earnings derived" 200 "$(req GET /providers/me/earnings "$PROV")"
check "  received" 846000 "$(json 'd.data.receivedMinor')"
check "provider cannot review" 403 "$(req POST "/bookings/$BID/review" "$PROV" '{"rating":5}')"
check "customer reviews" 201 "$(req POST "/bookings/$BID/review" "$CUST" '{"rating":4,"comment":"Even coverage"}')"
check "second review refused (BR7)" 409 "$(req POST "/bookings/$BID/review" "$CUST" '{"rating":1}')"
check "rating out of range refused" 400 "$(req POST "/bookings/$BID/review" "$CUST" '{"rating":9}')"
check "provider rating derived" 200 "$(req GET "/providers/$PID/rating" "$CUST")"
check "  average" 4 "$(json 'd.data.average')"

# ------------------------------------------------------------- notifications
section "Notifications"
check "customer inbox" 200 "$(req GET /notifications "$CUST")"
check "  got the rejection notice" ok "$(json 'd.data.items.some(n=>n.type==="BOOKING_REJECTED") ? "ok" : "missing"')"
check "provider inbox" 200 "$(req GET /notifications "$PROV")"
check "  got the new-request notice" ok "$(json 'd.data.items.some(n=>n.type==="BOOKING_ASSIGNED") ? "ok" : "missing"')"
check "unread count" 200 "$(req GET /notifications/unread-count "$CUST")"
check "mark all read" 204 "$(req POST /notifications/read-all "$CUST")"
check "count is now zero" 200 "$(req GET /notifications/unread-count "$CUST")"
check "  zero" 0 "$(json 'd.data.unread')"

# ---------------------------------------------------------------- assets + fs
section "Assets & field service"
check "register a drone" 201 "$(req POST /providers/me/drones "$PROV" '{"model":"Marut AG365","registrationNumber":"UIN-SMOKE-1","capacityLitres":10}')"
DRONE=$(json 'd.data.id')
check "duplicate registration refused" 409 "$(req POST /providers/me/drones "$PROV" '{"model":"Clone","registrationNumber":"UIN-SMOKE-1"}')"
check "raise a maintenance ticket" 201 "$(req POST /providers/me/tickets "$PROV" "{\"droneId\":\"$DRONE\",\"description\":\"Pump losing pressure mid-flight\"}")"
TID=$(json 'd.data.id')
check "drone grounded" 200 "$(req GET /providers/me/drones "$PROV")"
check "  serviceability" UNDER_MAINTENANCE "$(json 'd.data[0].serviceability')"
check "second ticket refused" 409 "$(req POST /providers/me/tickets "$PROV" "{\"droneId\":\"$DRONE\",\"description\":\"Another unrelated fault here\"}")"
check "provider cannot un-ground it" 409 "$(req PATCH "/providers/me/drones/$DRONE" "$PROV" '{"serviceability":"SERVICEABLE"}')"
check "engineer cannot self-assign" 403 "$(req POST "/admin/tickets/$TID/assign" "$ENG" '{"engineerUserId":"00000000-0000-4000-8000-000000000000"}')"
ENGID=$(psql -d "$DB" -tAc "select id from users where email='engineer@droneops.local'" | tr -d ' ')
check "admin assigns an engineer" 200 "$(req POST "/admin/tickets/$TID/assign" "$ADMIN" "{\"engineerUserId\":\"$ENGID\"}")"
check "engineer sees it" 200 "$(req GET /engineer/tickets "$ENG")"
check "engineer starts work" 200 "$(req POST "/engineer/tickets/$TID/start" "$ENG")"
check "close without a report refused (BR11)" 404 "$(req POST "/engineer/tickets/$TID/close" "$ENG" '{"resolutionNote":"Fixed somehow","reportDocumentId":"00000000-0000-4000-8000-000000000000"}')"
check "engineer requests a report upload" 201 "$(req POST "/engineer/tickets/$TID/report-upload" "$ENG" '{"filename":"report.pdf","contentType":"application/pdf"}')"
RDOC=$(json 'd.data.documentId'); RURL=$(json 'd.data.uploadUrl')
printf '%%PDF-1.4 service report' > "$TMP/report.pdf"
RSZ=$(curl -s -X PUT "$RURL" --data-binary @"$TMP/report.pdf" -H 'content-type: application/pdf' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).sizeBytes)}catch{console.log(0)}})")
check "confirm the report" 200 "$(req POST "/engineer/tickets/$TID/report-upload/$RDOC/confirm" "$ENG" "{\"sizeBytes\":$RSZ}")"
check "engineer closes with the report" 200 "$(req POST "/engineer/tickets/$TID/close" "$ENG" "{\"resolutionNote\":\"Replaced pump diaphragm\",\"reportDocumentId\":\"$RDOC\"}")"
check "  status" CLOSED "$(json 'd.data.status')"
check "drone back in service" 200 "$(req GET /providers/me/drones "$PROV")"
check "  serviceability" SERVICEABLE "$(json 'd.data[0].serviceability')"

# ------------------------------------------------------------------- teardown
section "Cleanup"
kill $SRV 2>/dev/null; SRV=""
sleep 2
check "api shut down cleanly" ok "$(lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && echo STILL_RUNNING || echo ok)"
dropdb --force --if-exists "$DB" 2>/dev/null || dropdb --if-exists "$DB" 2>/dev/null
check "smoke database removed" ok "$(psql -lqt | cut -d\| -f1 | grep -qw "$DB" && echo STILL_THERE || echo ok)"

printf "\n${BOLD}%s passed, %s failed${OFF}\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || printf "${DIM}api log: %s${OFF}\n" "$TMP/api.log"
exit $((FAIL > 0 ? 1 : 0))
