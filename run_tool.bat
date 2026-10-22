@echo off
title FormExtract Pro - Photo & Signature Separator Studio
cd /d "%~dp0"

echo ===================================================================
echo     FormExtract Pro - AI Photo and Signature Separator Studio
echo ===================================================================
echo.
echo Starting web server and launching your browser...
echo Local URL: http://127.0.0.1:8000
echo.

python server.py
pause
