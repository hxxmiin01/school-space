# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Azure API step (rooms endpoint skeleton)

- `azure-api/rooms/index.js`: `GET /api/rooms` endpoint skeleton
- `azure-api/reservations/index.js`: `GET /api/reservations` endpoint skeleton with optional `userId`
- `AZURE_POSTGRES_CONNECTION_STRING` 환경 변수(설정값)를 사용해 Azure Database for PostgreSQL의 `rooms` 테이블을 조회
- 연결 문자열이 없으면 오류 메시지를 JSON으로 반환
- 프론트엔드는 `VITE_BACKEND_PROVIDER=azure` 와 `VITE_AZURE_API_BASE_URL` 를 사용해 이 API를 호출
