# Azure Deployment Plan — school-space-app

**Status:** Draft

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

- [ ] Phase 1: 리소스 그룹(Resource Group) 생성
- [ ] Phase 2: Static Web App 리소스 생성
- [ ] Phase 3: 앱 빌드 (`npm run build`)
- [ ] Phase 4: 앱 배포 (`az staticwebapp deploy`)
- [ ] Phase 5: 환경변수 설정 (Supabase URL, Key)
- [ ] Phase 6: 배포 확인

---

## Azure Context

| 항목 | 값 |
|------|-----|
| 구독(Subscription) | 무료 평가판 (0abaecf7-4338-45d6-a39f-c5bebf6c286f) |
| 리전(Region) | koreacentral (한국 중부 - 빠른 속도) |
| 리소스 그룹 | school-space-rg |
| Static Web App 이름 | school-space-app |
