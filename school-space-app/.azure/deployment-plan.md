# Azure Deployment Plan — school-space-app

**Status:** Validated

---

## Project Overview

| 항목 | 내용 |
|------|------|
| 앱 이름 | school-space-app |
| 프레임워크 | React + Vite (SPA - 화면만 있는 앱) |
| 백엔드 | Supabase (Azure에 따로 배포 불필요) |
| 환경변수 | VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY |

---

## Recipe: AZCLI

**이유:**
- 화면만 있는 SPA라서 복잡한 설정 불필요
- Azure Static Web Apps는 az CLI 명령 몇 개로 충분
- 초보자에게 가장 이해하기 쉬운 방식

---

## Architecture

| 컴포넌트 | Azure 서비스 | 이유 |
|---------|-------------|------|
| React 앱 (화면) | Azure Static Web Apps | SPA 전용, 무료, HTTPS 자동 |
| 데이터/로그인 | Supabase (기존 유지) | Azure에 이전 불필요 |

---

## Deployment Steps

- [x] Phase 1: 리소스 그룹(Resource Group) 생성
- [x] Phase 2: Static Web App 리소스 생성
- [x] Phase 3: 앱 빌드 (`npm run build`)
- [x] Phase 4: 앱 배포 (`swa deploy`)
- [x] Phase 5: 환경변수 설정 (Vite 빌드 시 `.env` 반영)
- [x] Phase 6: 배포 확인

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
