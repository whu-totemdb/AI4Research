@echo off
title AI4Research - Stop Services

:: Run PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0stop.ps1"

