# 관찰 가능성(Observability) 파이프라인 — 시작 단계 계획

> 관찰 가능성(observability) = 앱이 지금 잘 돌아가고 있는지, 어디서 느려지거나 실패하는지를
> 나중에 들여다볼 수 있게 기록해 두는 것. "블랙박스"를 다는 것과 비슷해요.

이 문서는 `observability-pipeline` 작업 항목의 결과물입니다. **아직 특정 실행 환경(런타임)을
고르지 않았습니다.** OpenTelemetry / Azure Monitor / Grafana / Prometheus 중 무엇을 실제로
연결할지는 나중에 인프라를 정할 때 결정하고, 그때는 아래 "3. 나중에 실제 백엔드를 연결하는 법"만
바꾸면 됩니다.

## 1. 지금까지 만든 것 (이번 단계에서 구현 완료)

| 파일 | 역할 |
| --- | --- |
| `src/config/observability.js` | 설정값(환경 변수) 모음. 어떤 벤더/런타임도 import하지 않음 |
| `src/lib/telemetry.js` | 프론트엔드에서 쓰는 계측(instrumentation) 도우미 함수들 |
| `src/api/remoteClient.js` | 모든 원격 API 호출(`fetchRemoteJson`, `postRemoteJson`, `resolveWithRemoteFallback`)이 자동으로 계측되도록 연결 |
| `src/App.jsx` | 페이지 이동(page view)과 내비게이션 클릭, 로그아웃을 계측 |
| `src/pages/LoginPage.jsx` | 로그인/회원가입 시도와 실패를 계측 |
| `src/pages/MyPage.jsx` | 입실/퇴실 버튼 클릭과 성공/실패를 계측 |

### `src/lib/telemetry.js`가 제공하는 함수

- `trackPageView(pageName, attributes)` — 화면 이동 기록
- `trackInteraction(name, attributes)` — 버튼 클릭 등 사용자 조작 기록
- `trackApiCall(name, asyncFn, attributes)` — API/DB 호출을 감싸서 걸린 시간과 성공/실패를 자동 기록 (결과와 에러는 그대로 통과시킴)
- `trackError(error, attributes)` — 처리된 에러를 기록
- `registerObservabilityReporter(reporter)` — 기록된 모든 이벤트를 받는 콜백을 등록. **실제 내보내기(export) 로직은 전부 여기로 연결하면 됨**
- `getRecentObservabilityEvents()` — 디버깅/테스트용으로 최근 이벤트 확인

### 지금 동작 방식 (안전한 기본값)

- 어떤 reporter도 기본으로 등록돼 있지 않습니다. 즉, **이 시작 단계 코드는 어디로도 데이터를
  전송하지 않습니다.**
- 개발 모드(`vite dev`)에서는 `console.debug`로만 이벤트가 보입니다(브라우저 개발자 도구 콘솔).
- `VITE_OBSERVABILITY_DEBUG=true|false` 환경 변수로 이 콘솔 로그를 켜고 끌 수 있습니다.

## 2. 이벤트 모양 (event shape)

모든 이벤트는 아래와 비슷한 모양을 가집니다 (OpenTelemetry의 span/log 개념을 참고해 설계했지만,
OpenTelemetry 라이브러리에 의존하지는 않습니다):

```json
{
  "type": "api_call",
  "name": "remote:/api/rooms",
  "service": "school-space-web",
  "timestamp": "2026-08-01T03:00:00.000Z",
  "attributes": { "path": "/api/rooms" },
  "durationMs": 128,
  "status": "ok"
}
```

이렇게 만든 이유: 나중에 OTel span, Azure Monitor custom event, Prometheus 카운터/히스토그램
중 어디로 보내더라도 이 필드들(`name`, `timestamp`, `durationMs`, `attributes`, `status`)을 거의
그대로 매핑할 수 있어서, 호출부 코드를 다시 고칠 필요가 없습니다.

## 3. 나중에 실제 백엔드를 연결하는 법 (아직 하지 않음)

아래 네 가지 모두 **같은 방식**으로 연결합니다: `registerObservabilityReporter(reporter)`를
앱 시작 시점(`src/main.jsx`)에 한 번 호출해서, 이벤트를 원하는 곳으로 전달하는 함수를 등록.

- **OpenTelemetry (OTel Web SDK)**: reporter 안에서 이벤트를 OTel span/로그로 변환해
  `@opentelemetry/sdk-trace-web` + OTLP exporter로 전송. 백엔드가 OTel Collector를 갖추면
  거기서 다시 Azure Monitor/Grafana/Prometheus 등으로 라우팅 가능.
- **Azure Monitor / Application Insights**: `@microsoft/applicationinsights-web` SDK를 초기화하고,
  reporter 안에서 `appInsights.trackEvent(...)` / `trackDependencyData(...)`로 전달.
- **Grafana (Faro Web SDK 등)**: Grafana Faro를 초기화하고, reporter 안에서 대응하는
  `pushEvent`/`pushMeasurement` 호출.
- **Prometheus**: 브라우저에서 Prometheus로 직접 push하기보다는, 보통 reporter가 이벤트를
  자체 백엔드(Azure Functions 등, 아직 미정)로 보내고, 그 백엔드가 `/metrics` 엔드포인트나
  `pushgateway`를 통해 Prometheus가 수집하게 하는 구조가 일반적입니다.

**중요:** 위 네 가지 중 무엇을 고르든, `src/lib/telemetry.js`와 이미 계측된 호출부
(`remoteClient.js`, `App.jsx`, `LoginPage.jsx`, `MyPage.jsx`)는 전혀 수정할 필요가 없습니다.
새 reporter 파일 하나 추가 + `main.jsx`에서 등록 한 줄이면 됩니다.

## 4. 예약된 환경 변수 (아직 값 없음, 나중에 채워도 됨)

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `VITE_OBSERVABILITY_SERVICE_NAME` | `school-space-web` | 이벤트에 붙는 서비스 이름 |
| `VITE_OBSERVABILITY_DEBUG` | (미설정 시 dev에서만 자동 on) | 콘솔 디버그 로그 강제 on/off |
| `VITE_OBSERVABILITY_EXPORTER_URL` | (빈 값) | 나중에 고를 백엔드의 수집 엔드포인트. 지금은 아무 데도 안 씀 |

## 5. 이번 단계에서 하지 않은 것 (의도적으로 보류)

- 특정 벤더 SDK 설치/초기화 (OpenTelemetry, Application Insights, Faro 등) — 런타임을 먼저
  정해야 하는 인프라 결정이라서 추측하지 않았습니다.
- 실제 원격 수집 엔드포인트로 데이터 전송 — reporter가 하나도 등록돼 있지 않아 지금은 전송 자체가
  일어나지 않습니다.
- 서버/백엔드 쪽 계측(예: Azure Functions 내부 로그·트레이스) — 이 단계는 프론트엔드(React)
  계측만 다룹니다.
- `ReservationPage.jsx`, `HomePage.jsx`, `AdminPage.jsx` 등 다른 화면의 세부 계측 — 같은
  `trackInteraction`/`trackApiCall` 패턴을 그대로 이어서 나중에 추가할 수 있습니다.

## 6. 확인해 볼 수 있는 것 (지금 바로)

1. 앱을 `npm run dev`로 실행하고, 브라우저 개발자 도구(F12) → Console 탭을 엽니다.
2. 로그인하거나 화면을 이동하면 `[observability:page_view]`, `[observability:interaction]`,
   `[observability:api_call]` 같은 로그가 찍히는 걸 볼 수 있어요.
3. 입실/퇴실 버튼을 누르면 `[observability:interaction] reservation_checkin_click` 등이 보여요.
