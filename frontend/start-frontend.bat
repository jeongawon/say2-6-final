@echo off
REM ============================================================
REM say2-6 프론트엔드 실행 스크립트 (Windows)
REM ============================================================

echo ==========================================
echo say2-6 프론트엔드 실행 준비
echo ==========================================
echo.

REM Node.js 확인
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js가 설치되지 않았습니다.
    echo    https://nodejs.org/ 에서 LTS 버전을 다운로드하세요.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js: %NODE_VERSION%

REM npm 확인
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ npm이 설치되지 않았습니다.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm: %NPM_VERSION%
echo.

REM 의존성 설치 확인
if not exist "node_modules" (
    echo 📦 의존성 설치 중... (1-2분 소요)
    call npm install
    echo ✅ 의존성 설치 완료
    echo.
) else (
    echo ✅ 의존성이 이미 설치되어 있습니다.
    echo.
)

REM 백엔드 URL 확인
for /f "tokens=2 delims==" %%i in ('findstr VITE_BACKEND_URL .env.local') do set BACKEND_URL=%%i
echo 🔗 백엔드 URL: %BACKEND_URL%
echo.

echo ==========================================
echo 🚀 say2-6 프론트엔드 시작
echo ==========================================
echo.
echo 📍 접속 주소:
echo    http://localhost:3000
echo.
echo 📄 주요 페이지:
echo    • 홈페이지:        http://localhost:3000/
echo    • 제품 소개:       http://localhost:3000/product
echo    • Live Demo:       http://localhost:3000/demo
echo    • Triage:          http://localhost:3000/demo/triage
echo    • Worklist:        http://localhost:3000/demo/worklist
echo    • Dashboard:       http://localhost:3000/demo/dashboard
echo.
echo 종료하려면 Ctrl+C를 누르세요
echo.

REM 개발 서버 시작
call npm run dev
