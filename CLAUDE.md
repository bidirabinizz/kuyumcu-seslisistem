# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Çapar Kuyumculuk is a voice-controlled jewelry shop management system with three components:

- **Flutter mobile app** — Voice control interface for shop staff (Android)
- **Python backend** — FastAPI server handling voice recognition, transaction processing, and TTS
- **React frontend** — Dashboard for operations, reports, and user management

Communication between app and backend is via WebSocket.

## Build & Run Commands

### Flutter App (`kuyumcu_sesli_sistem/`)
```bash
flutter run                    # Run on connected device
flutter run -d <device_id>     # Run on specific device
flutter build apk --debug      # Build debug APK
flutter build apk --release    # Build release APK
```

### Backend (`backend/`)
```bash
cd backend
# Requires Python 3.x with venv in backend/venv
./venv/Scripts/python.exe main.py    # Windows
# or: source venv/bin/activate && python main.py
```

### Frontend (`frontend/`)
```bash
cd frontend
npm install
npm run dev          # Development server
npm run build        # Production build
```

## Architecture

### Backend (`backend/main.py`)
- **FastAPI** server with WebSocket endpoint for real-time voice
- **Vosk** (KaldiRecognizer) for wake word detection, **Whisper** for transcription
- **edge-tts** / **pyttsx3** for text-to-speech responses
- **PostgreSQL** via psycopg2 for ERP data (`kuyumcu_erp` database)
- Gold pricing with **MILYEM_MAP** (24/22/18/14 ayar) and **SARRAFIYE_CONFIG** (çeyrek, yarım, tam, ata)
- **Pirlanta** keyword detection for diamond transactions
- PDF report generation via **FPDF**

### Flutter App (`kuyumcu_sesli_sistem/`)
- `lib/main.dart` — Main UI: VoiceControlPage with animations, WebSocket connection
- `lib/voice_service.dart` — VoiceService handling mic recording, WebSocket communication
- `lib/config.dart` — AppConfig with server IP/port settings
- `lib/models/personel.dart` — Personel model

### React Frontend (`frontend/src/`)
- `pages/Dashboard.jsx` — Main operations view
- `pages/Raporlar.jsx` — Reports with filtering
- `pages/Kullanicilar.jsx` — User/personnel management
- `components/IslemTable.jsx` — Operations table with filtering
- `hooks/useSocket.js` — WebSocket connection management
- `hooks/useMarket.js` — Market data hook

### Database Schema
PostgreSQL `kuyumcu_erp` — structure inferred from backend queries. Key tables include personnel and operations (islem).

### Voice Models
Vosk model in `backend/model/` — lightweight model for wake word detection.
