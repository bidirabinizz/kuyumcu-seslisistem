@echo off
title CAPAR KUYUMCULUK ERP - Sistem Baslatici
color 0A

echo =======================================================
echo         CAPAR KUYUMCULUK - ERP SISTEMI
echo         v1.0 - Tek Tikla Baslatma
echo =======================================================
echo.

REM Dizin yollarini ayarla
set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "VENV_ACTIVATE=%BACKEND_DIR%\venv\Scripts\activate.bat"

REM On-kontrol: venv mevcut mu?
if not exist "%VENV_ACTIVATE%" (
    echo [HATA] Sanal ortam bulunamadi: %VENV_ACTIVATE%
    echo Lutfen once backend klasorunde kurulum yapin.
    echo.
    pause
    exit /b 1
)

REM On-kontrol: node_modules mevcut mu?
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [HATA] node_modules bulunamadi: %FRONTEND_DIR%\node_modules
    echo Lutfen once frontend klasorunde "npm install" calistirin.
    echo.
    pause
    exit /b 1
)

REM 1. BACKEND BASLAT
echo [1/2] Backend sunucusu baslatiliyor...
start "CAPAR-BACKEND" cmd /k "cd /d "%BACKEND_DIR%" && call venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

REM Backend'in ayaga kalkmasi icin bekle
timeout /t 3 /nobreak >nul

REM 2. FRONTEND BASLAT
echo [2/2] Frontend (React) baslatiliyor...
start "CAPAR-FRONTEND" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev"

echo.
echo =======================================================
echo  SISTEM BASLATILDI
echo  Backend  : http://localhost:8000
echo  Frontend : http://localhost:3000
echo =======================================================
echo.
echo Tarayici 3 saniye icinde otomatik acilacak...
timeout /t 3 /nobreak >nul

REM Tarayiciyi ac
start http://localhost:3000

echo.
echo Bu pencereyi kapatabilirsiniz. Arka plandaki
echo siyah pencereler acik kaldigi surece sistem calisir.
echo.
pause