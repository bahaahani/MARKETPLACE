# Test fixtures

Recorded responses from the shared API (`apps/web/app/api/v1`), the same API the Next.js web app uses.
If the API contract changes, re-record them with the web app running (`npm run dev:web`, port 3000).

Customer data is per sandbox session (see `api/openapi.yaml`), so each block below starts its own session with
`X-Sahel-Session: new`, like the app does, and sends the returned id on every later call. A fresh session is the
demo customer with no applications or cards, so the recordings do not depend on what else ran on the server.

```sh
B=http://localhost:3000/api/v1
J='Content-Type: application/json'
session() { curl -s -D - -o /dev/null -H 'X-Sahel-Session: new' $B/me | tr -d '\r' | awk -F': ' 'tolower($1)=="x-sahel-session"{print $2}'; }

# Demo customer: catalog, quotes, cards (J3), applications
S=$(session); H="X-Sahel-Session: $S"
curl -s -H "$H" $B/me > me.json
curl -s -H "$H" $B/config > config.json
curl -s $B/vehicles > vehicles.json
curl -s $B/vehicles/v-honda-crv-2026 > vehicle_crv.json
curl -s $B/properties > properties.json
curl -s -H "$H" $B/cards > cards.json
curl -s -X POST $B/quotes/finance -H "$J" \
  -d '{"productLine":"vehicle","assetPriceFils":14900000,"downPaymentFils":3000000,"tenureMonths":60}' > quotes_crv.json
curl -s -X POST $B/quotes/finance -H "$J" \
  -d '{"productLine":"personal","assetPriceFils":5000000,"downPaymentFils":0,"tenureMonths":48}' > quotes_personal.json
curl -s -X POST -H "$H" $B/me/preapproval-token > preapproval_token.json
curl -s -X POST $B/insurance/motor-quotes -H "$J" \
  -d '{"vehicleValueFils":14900000,"cover":"comprehensive"}' > motor_quotes.json
curl -s -X POST -H "$H" $B/cards/imtiaz-world/apply > card_apply.json
curl -s -X POST -H "$H" $B/cards/imtiaz-world-elite/apply > card_apply_declined.json
curl -s -H "$H" $B/me/cards > me_cards.json

# Finance applications (in this order, in the same session)
ID=$(curl -s -X POST $B/applications -H "$J" -H "$H" -H 'Idempotency-Key: fixture-crv-0001' \
  -d '{"productLine":"vehicle","structure":"murabaha","vehicleId":"v-honda-crv-2026","downPaymentFils":3000000,"tenureMonths":60}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -H "$H" $B/applications/$ID > application_crv.json
curl -s -X POST -H "$H" $B/applications/$ID/accept > application_crv_accepted.json
curl -s -X POST $B/applications -H "$J" -H "$H" -H 'Idempotency-Key: fixture-escalade-01' \
  -d '{"productLine":"vehicle","structure":"conventional","vehicleId":"v-cadillac-escalade-2026","downPaymentFils":9300000,"tenureMonths":60}' > application_declined.json
curl -s -X POST $B/applications -H "$J" -H "$H" -H 'Idempotency-Key: fixture-personal-01' \
  -d '{"productLine":"personal","structure":"conventional","amountFils":5000000,"tenureMonths":48}' > application_personal.json
curl -s -H "$H" $B/applications > applications.json

# Onboarding (J1) in its own session: completing it switches that session to the new customer's numbers.
S=$(session); H="X-Sahel-Session: $S"
curl -s -X POST $B/onboarding/ekey -H "$J" -H "$H" -d '{"cpr":"880412345"}' > ekey.json
curl -s -X POST $B/onboarding/pre-approval -H "$J" -H "$H" \
  -d '{"monthlySalaryFils":1400000,"existingObligationsFils":300000,"employer":"Bahrain Co.","consentScopes":["CRB","OPEN_BANKING"]}' > onboarding_preapproval.json
curl -s -H "$H" $B/me > me_onboarded.json
curl -s -H "$H" $B/cards > cards_onboarded.json
curl -s -H "$H" $B/config > config_onboarded.json

# Travel + home insurance and buying a travel policy, in its own session (policies belong to the session customer)
S=$(session); H="X-Sahel-Session: $S"
START=$(node -e 'console.log(new Date(Date.now()+3*36e5+7*864e5).toISOString().slice(0,10))')   # Bahrain date + 7 days
END=$(node -e 'console.log(new Date(Date.now()+3*36e5+13*864e5).toISOString().slice(0,10))')
TRIP="{\"region\":\"gcc\",\"tier\":\"basic\",\"startDate\":\"$START\",\"endDate\":\"$END\",\"adults\":1,\"children\":0}"
curl -s -X POST $B/insurance/travel-quotes -H "$J" -d "$TRIP" > travel_quotes.json
curl -s -X POST $B/insurance/home-quotes -H "$J" -d '{"propertyId":"p-saar-villa-4br"}' > home_quotes.json
curl -s -X POST $B/policies/quotes -H "$J" -H "$H" -d "{\"line\":\"travel\",\"insurerId\":\"pearl-takaful\",\"input\":$TRIP}" > policy_quote_travel.json
QID=$(node -pe 'JSON.parse(require("fs").readFileSync("policy_quote_travel.json")).data.id')
AMT=$(node -pe 'JSON.parse(require("fs").readFileSync("policy_quote_travel.json")).data.premiumFils')
PID=$(curl -s -X POST $B/payments -H "$J" -H "$H" -H 'Idempotency-Key: fixture-travel-01' \
  -d "{\"amountFils\":$AMT,\"method\":\"benefitpay\",\"purpose\":\"insurance_premium\",\"reference\":\"$QID\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -X POST -H "$H" $B/payments/$PID/confirm > /dev/null
curl -s -X POST $B/policies/confirm -H "$J" -H "$H" -d "{\"paymentId\":\"$PID\",\"quoteId\":\"$QID\"}" > policy_travel.json
curl -s -H "$H" $B/me/policies > me_policies.json

# Life-event bundles (demo customer financials) and early settlement / autopay, in their own session
S=$(session); H="X-Sahel-Session: $S"
curl -s $B/life-events > life_events.json
curl -s -H "$H" "$B/life-events/married/bundle?structure=islamic" > bundle_married_islamic.json
curl -s -H "$H" "$B/life-events/married/bundle?structure=conventional" > bundle_married_conventional.json
curl -s -H "$H" "$B/life-events/new-baby/bundle?structure=islamic" > bundle_new_baby_islamic.json
curl -s -H "$H" $B/me/contracts/c-1001/settlement-quote > settlement_c1001.json
curl -s -H "$H" $B/me/contracts/c-1002/settlement-quote > settlement_c1002.json
curl -s -X PATCH $B/me/contracts/c-1002 -H "$J" -H "$H" -d '{"autopay":true}' > contract_autopay_on.json

# Early settlement of c-1001 (new session): pay the quoted amount, confirm, then /me shows it settled
S=$(session); H="X-Sahel-Session: $S"
AMT=$(curl -s -H "$H" $B/me/contracts/c-1001/settlement-quote | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.settlementAmountFils')
PAY=$(curl -s -X POST $B/payments -H "$J" -H "$H" -H 'Idempotency-Key: fixture-settle-c1001' \
  -d "{\"amountFils\":$AMT,\"method\":\"card\",\"purpose\":\"early_settlement\",\"reference\":\"c-1001-settle\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -X POST -H "$H" $B/payments/$PAY/confirm > /dev/null
curl -s -H "$H" $B/me > me_settled.json

# Credit officer review (back office, staff only) of a referred application, in its own session
S=$(session); H="X-Sahel-Session: $S"
ID=$(curl -s -X POST $B/applications -H "$J" -H "$H" -H 'Idempotency-Key: fixture-patrol-01' \
  -d '{"productLine":"vehicle","structure":"conventional","vehicleId":"v-nissan-patrol-2021","downPaymentFils":3900000,"tenureMonths":60}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -X POST $B/backoffice/applications/$ID/decision -H "$J" -H 'X-Sahel-Staff-Role: credit_officer' \
  -d '{"outcome":"APPROVED","note":"Stable employment, approved on review"}' > /dev/null
curl -s -H "$H" $B/applications/$ID > application_reviewed.json
curl -s -X POST -H "$H" $B/applications/$ID/accept > application_reviewed_accepted.json
# Suhail & Suhaila (assistant), in its own session: a balance question, a follow-up settlement (uses the conversation
# memory), the next installment, and an Arabic car search with Arabic-Indic digits (persona Suhail).
S=$(session); H="X-Sahel-Session: $S"
curl -s -X POST $B/assistant/messages -H "$J" -H "$H" -d '{"text":"How much do I still owe on the car?","locale":"en","persona":"suhaila"}' > assistant_balance_en.json
curl -s -X POST $B/assistant/messages -H "$J" -H "$H" -d '{"text":"And what if I pay it all off now?","locale":"en","persona":"suhaila"}' > assistant_settle_en.json
curl -s -X POST $B/assistant/messages -H "$J" -H "$H" -d '{"text":"When is my next installment?","locale":"en","persona":"suhaila"}' > assistant_next_en.json
curl -s -X POST $B/assistant/messages -H "$J" -H "$H" -d '{"text":"أبي سيارة تحت ٢٠٠ بالشهر","locale":"ar","persona":"suhail"}' > assistant_cars_ar.json
# Trade-in (⚠️ rules model, not AI), in its own session: no offer yet, value the My Garage car, the active offer for the
# CR-V (with the down payment it gives), an unknown model (422 with suggestions), withdraw.
S=$(session); H="X-Sahel-Session: $S"
curl -s -H "$H" "$B/me/trade-in?vehicleId=v-honda-crv-2026" > tradein_none.json
curl -s -X POST $B/trade-in/valuations -H "$J" -H "$H" \
  -d '{"garageVehicleId":"v-honda-crv-2026","mileageKm":27850,"condition":"good","accidentHistory":false}' > tradein_offer.json
curl -s -H "$H" "$B/me/trade-in?vehicleId=v-honda-crv-2026" > tradein_active_crv.json
curl -s -X POST $B/trade-in/valuations -H "$J" -H "$H" \
  -d '{"make":"Toyota","model":"Camri","year":2021,"mileageKm":60000,"condition":"good"}' > tradein_unknown_model.json
curl -s -X DELETE -H "$H" $B/me/trade-in > tradein_withdrawn.json

# Motor claim (J6), in its own session: buy motor cover for the garage car, file a collision claim with one photo,
# then the sandbox assessment (advance twice), book a garage, and list the claims.
S=$(session); H="X-Sahel-Session: $S"
curl -s -X POST $B/policies/quotes -H "$J" -H "$H" \
  -d '{"line":"motor","insurerId":"pearl-takaful","input":{"vehicleValueFils":14900000,"cover":"comprehensive","reference":"123456"}}' > policy_quote_motor.json
QID=$(node -pe 'JSON.parse(require("fs").readFileSync("policy_quote_motor.json")).data.id')
AMT=$(node -pe 'JSON.parse(require("fs").readFileSync("policy_quote_motor.json")).data.premiumFils')
PID=$(curl -s -X POST $B/payments -H "$J" -H "$H" -H 'Idempotency-Key: fixture-motor-01' \
  -d "{\"amountFils\":$AMT,\"method\":\"card\",\"purpose\":\"insurance_premium\",\"reference\":\"$QID\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -X POST -H "$H" $B/payments/$PID/confirm > /dev/null
POL=$(curl -s -X POST $B/policies/confirm -H "$J" -H "$H" -d "{\"paymentId\":\"$PID\",\"quoteId\":\"$QID\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -H "$H" $B/me/policies > me_policies_motor.json
NOW=$(node -e 'console.log(new Date().toISOString())')
PHOTO=$(node -e 'console.log(Buffer.from([0xff,0xd8,0xff,0xe0,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,0xff,0xd9]).toString("base64"))')
CID=$(curl -s -X POST $B/claims -H "$J" -H "$H" -H 'Idempotency-Key: fixture-claim-01' \
  -d "{\"policyId\":\"$POL\",\"incidentAt\":\"$NOW\",\"location\":\"Sheikh Khalifa Highway, near Isa Town\",\"latitude\":26.1736,\"longitude\":50.5478,\"type\":\"collision\",\"severity\":\"moderate\",\"description\":\"Rear-ended at a traffic light; bumper and boot damaged.\",\"thirdPartyInvolved\":true,\"photos\":[{\"mimeType\":\"image/jpeg\",\"dataBase64\":\"$PHOTO\"}]}" \
  | tee claim_submitted.json | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -X POST -H "$H" $B/claims/$CID/advance > /dev/null
curl -s -X POST -H "$H" $B/claims/$CID/advance > claim_approved.json
curl -s -X POST $B/claims/$CID/garage -H "$J" -H "$H" -d '{"garageId":"g-sitra-auto-works"}' > claim_repair_booked.json
curl -s -H "$H" $B/me/claims > me_claims.json
```

`money.json` is generated by `node --experimental-strip-types tools/money-fixture.mts` (repo root) and
pins Flutter's money formatting to the web's `formatBhd()`.

Home finance (J4) and server-priced payments (P1), with the same `B`, `J` and `session()` as above. The home
applications need a salary that can carry a home, so this session onboards first. `me_settled.json` (above) also shows
that a settled contract no longer counts in `existingObligationsFils` and the pre-approval.

```sh
S=$(session); H="X-Sahel-Session: $S"
curl -s -X POST $B/onboarding/pre-approval -H "$J" -H "$H" \
  -d '{"monthlySalaryFils":5000000,"existingObligationsFils":0,"employer":"Bahrain Co.","consentScopes":["CRB","OPEN_BANKING"]}' > /dev/null
curl -s -X POST $B/quotes/finance -H "$J" -d '{"productLine":"home","assetPriceFils":98000000}' > quotes_home.json
curl -s -H "$H" "$B/payments/price?purpose=valuation_fee&reference=p-amwaj-apt-2br" > payment_price_valuation.json
curl -s -H "$H" "$B/payments/price?purpose=reservation_deposit&reference=v-honda-crv-2026" > payment_price_deposit.json
ID=$(curl -s -X POST $B/applications -H "$J" -H "$H" -H 'Idempotency-Key: fixture-home-ijara-01' \
  -d '{"productLine":"home","structure":"ijara","propertyId":"p-amwaj-apt-2br","downPaymentFils":19600000,"tenureMonths":240}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -H "$H" $B/applications/$ID > application_home_ijara.json
curl -s -X POST -H "$H" $B/applications/$ID/accept > application_home_ijara_accepted.json
ID=$(curl -s -X POST $B/applications -H "$J" -H "$H" -H 'Idempotency-Key: fixture-home-conv-01' \
  -d '{"productLine":"home","structure":"conventional","propertyId":"p-amwaj-apt-2br","downPaymentFils":19600000,"tenureMonths":240}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -H "$H" $B/applications/$ID > application_home_conventional.json
curl -s -X POST -H "$H" $B/applications/$ID/accept > application_home_conventional_signed.json
PAY=$(curl -s -X POST $B/payments -H "$J" -H "$H" -H 'Idempotency-Key: fixture-valuation-01' \
  -d '{"amountFils":150000,"method":"card","purpose":"valuation_fee","reference":"p-amwaj-apt-2br"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
curl -s -X POST -H "$H" $B/payments/$PAY/confirm > /dev/null
curl -s -X POST -H "$H" $B/applications/$ID/accept > application_home_conventional_completed.json
```
