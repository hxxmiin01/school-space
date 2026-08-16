# 스쿨스페이스 Azure 배포 참고서 (프론트 + 백엔드 통합)

이 문서는 배포(만든 앱을 인터넷에 올리는 작업)할 때
"프론트엔드는 어디에 올리고, 백엔드는 어떻게 운영할지"를 한 번에 보는 용도입니다.

---

## 1) 추천 배포 구조 (현재 코드 기준)

| 영역 | Azure 서비스 | 설명 |
|---|---|---|
| 프론트엔드(사용자 화면) | Azure Static Web Apps | React + Vite 정적 파일 배포에 맞는 서비스 |
| 백엔드 API | Azure Functions (Node.js) | `/api/*` 엔드포인트(요청 창구) 실행 |
| 예약/방 상태 데이터 | Azure Database for PostgreSQL | `AZURE_POSTGRES_CONNECTION_STRING`로 Functions에서 조회/수정 |
| AI 도우미 모델 호출 | Azure AI Foundry(OpenAI Responses API) | `FOUNDRY_*` 설정값으로 assistant 함수에서 호출 |
| 로그인/프로필/일부 데이터 | Supabase | 현재 코드에서 Auth/프로필/패널티를 일부 직접 사용 |

핵심 요약:
- 화면은 Azure Static Web Apps.
- API는 Azure Functions.
- 데이터는 현재 "혼합" 상태(일부 Azure PostgreSQL, 일부 Supabase).

---

## 2) 왜 이 구조를 쓰나

- 프론트엔드와 백엔드를 분리하면(역할을 나누면) 문제가 생겼을 때 원인 찾기가 쉽습니다.
- React 정적 파일은 Static Web Apps가 빠르고 단순합니다.
- 예약 상태 변경 같은 서버 로직(검증/업데이트)은 Functions가 관리하기 쉽습니다.

---

## 3) 프론트엔드 배포 기준

서비스: Azure Static Web Apps

필수 환경 변수(설정값):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BACKEND_PROVIDER` : `azure` 또는 `supabase`
- `VITE_REMOTE_API_BASE_URL` : 배포된 Azure Functions 기본 URL
- `VITE_AZURE_API_BASE_URL` : 레거시(기존 호환) fallback 값
- `VITE_AI_ASSISTANT_PATH` : 기본 `/api/assistant` (필요 시만 변경)

권장 값 예시:
- `VITE_BACKEND_PROVIDER=azure`
- `VITE_REMOTE_API_BASE_URL=https://<function-app-name>.azurewebsites.net`

주의:
- `VITE_REMOTE_API_BASE_URL`이 비어 있으면 프론트가 로컬/Supabase fallback으로 동작합니다.
- 배포 환경에서는 "어떤 소스를 읽는지"(Azure API인지 Supabase인지) 마이페이지 안내 문구로 확인할 수 있습니다.

---

## 4) 백엔드 배포 기준

서비스: Azure Functions (Node.js)

현재 주요 엔드포인트:
- `POST /api/assistant`
- `POST /api/reserve`
- `GET /api/reservations`
- `POST /api/reservations/{id}/status`
- `POST /api/reservations/{id}/survey`
- `GET /api/rooms`
- `POST /api/rooms/{id}/status`

필수 앱 설정(App Settings):
- `AZURE_POSTGRES_CONNECTION_STRING`
- `FOUNDRY_ENDPOINT`
- `FOUNDRY_API_KEY`
- `FOUNDRY_MODEL`

참고:
- 로컬 개발 시에는 `azure-api/local.settings.sample.json` 형식으로 값을 준비합니다.
- 배포 후에는 Function App 설정 화면(환경 변수 메뉴)에 같은 키를 넣어야 합니다.

---

## 5) 실제 배포 순서 (안전한 순서)

1. 백엔드 먼저 배포
- 이유: 프론트가 참조할 API 주소가 먼저 살아 있어야 화면 오류를 줄일 수 있음.

2. 백엔드 헬스 체크
- `GET /api/rooms`, `GET /api/reservations` 같은 읽기 API부터 확인.
- 상태 변경 API(`/status`, `/survey`)도 샘플 호출로 확인.

3. 프론트 환경 변수 설정
- `VITE_REMOTE_API_BASE_URL`을 방금 배포한 Functions URL로 반영.

4. 프론트 배포
- Static Web Apps에 빌드 결과 업로드.

5. 화면 시나리오 점검
- 예약 생성 → 승인 → 입실 → 퇴실 → 설문 완료 버튼까지 순서대로 클릭 테스트.

---

## 6) 운영 중 자주 나는 문제와 빠른 확인

### A. 설문 완료 버튼에서 404
원인:
- 배포된 Functions에 `/api/reservations/{id}/survey` 엔드포인트가 아직 없음.

확인:
- Function App 배포 버전에 `reservations-survey` 함수가 포함됐는지 확인.

### B. 입실/퇴실 실패 (ID 형식 오류)
원인:
- `study-room-1` 같은 문자열 ID를 숫자로 처리하는 오래된 코드/배포본.

확인:
- `/api/rooms/{id}/status`가 문자열 ID로 정상 업데이트 되는지 확인.

### C. 같은 질문 반복(시간 입력)
원인:
- 종료 시간 재입력 단계 로직이 구버전.

확인:
- 최신 `assistant`/`mock-server` 배포본인지 확인.

---

## 7) 배포 전 체크리스트

- [ ] 백엔드 함수(특히 `reservations-status`, `rooms-status`, `reservations-survey`)가 배포 대상에 포함됨
- [ ] Function App 환경 변수 4개 설정 완료
- [ ] 프론트의 `VITE_REMOTE_API_BASE_URL`이 실제 Functions URL과 일치
- [ ] Supabase 키 2개 설정 완료
- [ ] 사용자 흐름 E2E(예약~설문 완료) 점검 완료

---

## 8) 지금 당장 선택해야 할 운영 모드

### 모드 A: Azure API 중심(권장)
- `VITE_BACKEND_PROVIDER=azure`
- 장점: 서버 로직을 통합해서 관리 가능.
- 조건: Functions와 PostgreSQL/Foundry 설정을 정확히 맞춰야 함.

### 모드 B: Supabase 중심(임시)
- `VITE_BACKEND_PROVIDER=supabase`
- 장점: 빠르게 화면 동작 확인 가능.
- 한계: Azure Functions 기반 기능 검증이 약해짐.

프로젝트 발표/운영 직전에는 모드 A로 최종 점검을 권장합니다.
