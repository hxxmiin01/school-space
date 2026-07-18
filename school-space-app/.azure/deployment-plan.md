# Azure Deployment Plan — school-space-app

**Status:** Validated (Deployed)

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

- [x] 1. Azure CLI Installation (`az version`)
- [x] 2. Authentication (`az account show`)
- [x] 3. Build Verification (`npm run build`)
- [x] 4. Azure Resource Validation (RG/SWA 존재 확인)
- [x] 5. Static Role Verification (RBAC 코드 검토 결과 기록)

---

## Section 7: Validation Proof

검증 시각(로컬): 2026-07-18 11:13 KST

1. Azure CLI 설치 확인
   - 명령: `az version --output json`
   - 결과: 성공 (azure-cli 2.87.0)

2. 인증 확인
   - 명령: `az account show --output json`
   - 결과: 성공 (subscription: `0abaecf7-4338-45d6-a39f-c5bebf6c286f`)

3. 빌드 검증
   - 명령: `npm run build`
   - 결과: 성공 (`dist/` 생성)

4. 리소스 존재 검증
   - 명령: `az group show --name school-space-rg`, `az staticwebapp show --name school-space-app --resource-group school-space-rg`
   - 결과: 성공 (호스트: `mango-pebble-0d76ff000.7.azurestaticapps.net`)

5. 배포 실행
   - 명령: `npx @azure/static-web-apps-cli deploy ./dist --deployment-token <token> --env production`
   - 결과: 성공

6. 엔드포인트 확인
   - 명령: `curl -I https://mango-pebble-0d76ff000.7.azurestaticapps.net`
   - 결과: 성공 (HTTP 200 OK)

7. Live Role Verification
   - 명령: `az role assignment list --scope <static-web-app-resource-id>`
   - 결과: `[]` (추가 RBAC 할당 없음, 현재 구성에서 문제 없음)
