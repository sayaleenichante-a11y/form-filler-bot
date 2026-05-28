@echo off
cd /d "%~dp0backend"

if not exist ".venv" (
    python -m venv .venv
)

call .venv\Scripts\activate

pip install -r requirements.txt

start /min python server.py

exit