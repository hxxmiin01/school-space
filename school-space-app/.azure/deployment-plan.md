# Azure Deployment Plan — school-space-app

**Status:** Validated

---

## Project Overview

| 항목 | 내용 |
|------|------|
| 앱 이름 | school-space-app |
| 프레임워크 | React + Vite (SPA - 화면만 있는 앱) |
| 백엔드 | Supabase + 기존 Azure Functions (예약/도우미 API) |
| 환경변수 | 프론트엔드 VITE 설정 및 기존 Functions 앱 설정 |

---

## Recipe: AZCLI + Azure Functions Core Tools

**이유:**
- 화면만 있는 SPA라서 복잡한 설정 불필요
- Azure Static Web Apps는 az CLI 명령 몇 개로 충분
- 초보자에게 가장 이해하기 쉬운 방식

---

## Architecture

| 컴포넌트 | Azure 서비스 | 이유 |
|---------|-------------|------|
| React 앱 (화면) | Azure Static Web Apps | SPA 전용, 무료, HTTPS 자동 |
| 데이터/로그인 | Supabase (기존 유지) | 인증/프로필 등에서 사용 |
| 예약/도우미 API | 기존 Azure Functions 앱 | 기존 앱의 코드만 업데이트 |

---

## Deployment Steps

- [x] Phase 1: 리소스 그룹(Resource Group) 생성
- [x] Phase 2: Static Web App 리소스 생성
- [x] Phase 3: 앱 빌드 (`npm run build`)
- [x] Phase 4: 앱 배포 (`swa deploy`)
- [x] Phase 5: 환경변수 설정 (Vite 빌드 시 `.env` 반영)
- [x] Phase 6: 배포 확인
- [x] Phase 7: Azure Functions 도우미 오류 처리 배포 (`func azure functionapp publish school-space-api2-9726`)

---

## Azure Context

| 항목 | 값 |
|------|-----|
| 구독(Subscription) | 무료 평가판 (0abaecf7-4338-45d6-a39f-c5bebf6c286f) |
| 리전(Region) | koreacentral (한국 중부 - 빠른 속도) |
| 리소스 그룹 | school-space-rg |
| Static Web App 이름 | school-space-app |

---

## Validation Checklist (AZCLI)

All validation checks pass

- [x] Azure CLI is installed and authenticated to the confirmed subscription.
- [x] The React/Vite production build completes successfully.
- [x] The existing resource group and Azure Static Web App are available.
- [x] The deployed site responds successfully over HTTPS.
- [x] Static role verification is reviewed; no additional RBAC assignment is required for this static-site deployment.
- [x] The assistant Function App test suite passes, including empty reservation error responses.
- [x] The existing Function App health endpoint responds successfully.
- [x] No production reservation is created during validation.

---

## Section 7: Validation Proof

검증 시각(현지): 2026-10-24 11:12 KST

1. Azure CLI 설치 및 인증 확인
   - 명령: `az version --output json`, `az account show --query "{id:id,name:name,state:state}" --output json`
   - 결과: 성공 (Azure CLI 2.87.0, 활성 구독 `0abaecf7-4338-45d6-a39f-c5bebf6c286f`; 구독 이름은 Azure 구독 목록에서 확인)

2. 앱 빌드 확인
   - 명령: `npm run build`
   - 결과: 성공 (Vite 프로덕션 빌드, `dist/` 생성)

3. Azure 리소스 확인
   - 명령: `az group show --name school-space-rg`, `az staticwebapp show --name school-space-app --resource-group school-space-rg`
   - 결과: 성공 (리소스 그룹 위치: koreacentral, Static Web App 호스트: `mango-pebble-0d76ff000.7.azurestaticapps.net`, 앱 위치: East Asia)

4. 기존 사이트 HTTPS 응답 확인
   - 명령: `curl.exe --head --location https://mango-pebble-0d76ff000.7.azurestaticapps.net/`, `curl.exe --location https://mango-pebble-0d76ff000.7.azurestaticapps.net/`
   - 결과: 두 요청 모두 HTTP 200

5. Static Web App RBAC 확인
   - 명령: Azure role assignment list at `/subscriptions/0abaecf7-4338-45d6-a39f-c5bebf6c286f/resourceGroups/school-space-rg/providers/Microsoft.Web/staticSites/school-space-app`
   - 결과: 성공 (`assignments: []`; 정적 사이트 배포에 별도 역할 할당 없음)

## Function App Update (Code-Only)

- 대상 함수 앱: `school-space-api2-9726`
- 엔드포인트: `https://school-space-api2-9726.azurewebsites.net`
- 코드 위치: `school-space-app/azure-api`
- 변경 범위: Supabase 예약 경로 정리, 내부 room ID 정규화, A-D 단답 인식, 사용자 답변의 방 이름 표시 통일, 예약 확인 전 인원·목적 검증
- 인프라 및 앱 설정 변경: 없음
- 검증: `npm test -- --runInBand`, `node --check reserve/index.js`, `GET /api/ping`
- 실제 예약 생성 요청은 배포 검증에서 실행하지 않음
- 배포 명령: `func azure functionapp publish school-space-api2-9726` (2026-11-08 완료)

### Function App Validation Proof (2026-11-08)

- `npm test -- --runInBand`: 3 suites passed, 36 tests passed.
- `node --check assistant/index.js`, `node --check reserve/index.js`, `node --check __tests__/reserve.test.js`: passed.
- Supabase-path regression test: reservation response returned with status 201; PostgreSQL client cleanup was not called.
- Room ID regression test: `study-room-1` was queried as integer ID `1` and inserted as numeric `1`.
- `GET https://school-space-api2-9726.azurewebsites.net/api/ping`: `{"ok":true,"message":"pong"}`.
- Bicep/Terraform files: none in the application; this code-only update adds no RBAC assignments.
- Production reservation creation: not run.

### Function App Deployment Proof (2026-11-08)

- `func azure functionapp publish school-space-api2-9726`: deployment completed successfully.
- `GET /api/ping`: returned `{"ok":true,"message":"pong"}`.
- Invalid past-date `POST /api/reserve`: returned a JSON validation error before database access; no reservation was created.
- `POST /api/assistant` greeting: returned a valid JSON reply.

### Reservation Cleanup Fix Deployment Proof (2026-11-08)

- Root cause: the Supabase reservation path left the PostgreSQL client unset, but the `finally` block still called `client.end()`, causing an uncaught error after a response had been prepared.
- `npm test -- --runInBand`: 3 suites passed, 35 tests passed, including the Supabase-path regression test.
- `func azure functionapp publish school-space-api2-9726`: deployment completed successfully.
- `GET /api/ping`: returned `{"ok":true,"message":"pong"}`.
- `POST /api/assistant` greeting: returned a valid JSON reply.
- `POST /api/reserve` with missing required fields: returned a JSON validation error; no reservation was created.

### Room ID Normalization Deployment Proof (2026-11-08)

- Root cause: the assistant sent `study-room-1` while Supabase `room_id` is an integer; the conflict lookup failed before insertion.
- `npm test -- --runInBand`: 3 suites passed, 36 tests passed, including string-to-integer room ID coverage.
- `func azure functionapp publish school-space-api2-9726`: deployment completed successfully.
- `GET /api/ping`: returned `{"ok":true,"message":"pong"}`.
- `POST /api/assistant` greeting: returned a valid JSON reply.
- `POST /api/reserve` with `roomId: "study-room-1"` and an out-of-range past date: reached date validation rather than integer parsing; no reservation was created.

### Local Conversation Fix (Not Deployed)

- The assistant now replaces a premature confirmation with questions when its summary omits the member count or purpose.
- Room answers A/a through D/d map to the corresponding internal room IDs and are displayed as alphabetic room names.
- Local Functions test suite: 3 suites passed, 54 tests passed.
- Local Foundry conversation was checked with all eight letter forms; replies use alphabetic room names.
- This follow-up remains local; the deployed Function App has not been updated with it.

### Final Pre-Deployment Verification (2026-11-08)

- `npm test -- --runInBand`: 3 suites passed, 54 tests passed.
- `node --check assistant/index.js`, `node --check reserve/index.js`, `node --check __tests__/assistant.test.js`, and `node --check __tests__/reserve.test.js`: passed.
- Function App `school-space-api2-9726`: Running; `GET /api/ping` returned `{"ok":true,"message":"pong"}`.
- No code was published and no resource or application setting was modified during this preparation.

### User-Authorized Live Room Checks (2026-11-08)

- B룸 reservation `#35`, C룸 reservation `#36`, and D룸 reservation `#37` were created for 2026-11-09 08:00-10:00, 3 people, purpose `수학 숙제`.
- My Page confirmed all three as pending approval. The user intends to remove these records; they remain in the database until then.
