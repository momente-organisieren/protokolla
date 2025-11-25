# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Transkriptor is a locally-hosted web application for automatic transcription of audio/video files with speaker diarization. The application uses WhisperX (via onerahmet/openai-whisper-asr-webservice) for speech recognition and pyannote for speaker identification. All processing happens locally with GPU acceleration.

## Architecture

### Three-Service System

The application consists of three Docker containers orchestrated via `docker-compose.yml`:

1. **whisper-api** (Backend)
   - Image: `onerahmet/openai-whisper-asr-webservice:latest-gpu`
   - Port: 9000
   - Provides REST API for transcription (`/asr` endpoint)
   - Requires NVIDIA GPU with Container Toolkit
   - Uses WhisperX engine for ASR with speaker diarization
   - Requires Hugging Face token for pyannote models (segmentation-3.0, speaker-diarization-3.1)

2. **ollama** (LLM Service for Summaries)
   - Image: `ollama/ollama:latest`
   - Port: 11434
   - Provides local LLM for generating transcript summaries
   - Shares GPU with whisper-api (sequential usage)
   - Model: llama3.1:8b (recommended) or llama3.2:3b (for low VRAM)
   - Generates 4 types of summaries: short, structured, timeline, action items

3. **frontend** (Web UI)
   - Custom nginx container serving static files
   - Port: 3000 (exposed), 80 (internal)
   - Single-page application (vanilla JS, no framework)
   - nginx acts as reverse proxy: `/api/*` routes to `whisper-api:9000`, `/ollama/*` routes to `ollama:11434`

### Frontend Architecture

The frontend is a two-class application (`Transkriptor` and `SummaryManager` in `frontend/app.js`):
- **No build process** - vanilla HTML/CSS/JS served directly
- Three main views: Upload → Progress → Editor
- Editable transcript segments with speaker renaming
- **AI Summary Panel** with 4 summary types (short, structured, timeline, action items)
- Export formats: TXT, SRT, VTT, JSON, Word (HTML-based .doc)
- **Audio playback** with synchronized segment highlighting
- **Persistent storage** using IndexedDB (all data) + localStorage (metadata only)
- **Real-time streaming** summary generation with Ollama LLM

Key frontend files:
- `index.html` - Main HTML structure with three sections (upload, progress, editor)
- `app.js` - Main application logic with `Transkriptor` and `AudioStorage` classes
- `styles.css` - Complete styling
- `nginx.conf` - Reverse proxy configuration

### Data Persistence

The application automatically saves your work using **IndexedDB Version 2**:
- **Transcript data** (JSON, speaker names, summaries, stats) → IndexedDB store "transcriptData"
- **Audio files** (original upload) → IndexedDB store "audioFiles"
- **Metadata only** (hasData, timestamp, fileName) → localStorage (~1 KB)
- **Auto-save** on every change (speaker names, text edits, segment reassignments)
- **7-day retention** - data expires after 7 days automatically
- **Automatic migration** from old localStorage-based format on first load
- **No quota issues** - IndexedDB can store up to 50% of available disk space
- See `docs/INDEXEDDB_STORAGE.md` for detailed storage documentation

### API Communication

Frontend calls backend services via nginx proxy:

**Transcription:**
- Frontend: `fetch('/api/asr?...')`
- nginx rewrites to: `http://whisper-api:9000/asr?...`
- API health check: `GET /api/` redirects to `/docs` (FastAPI endpoint)

**AI Summaries:**
- Frontend: `fetch('/ollama/api/generate')`
- nginx rewrites to: `http://ollama:11434/api/generate`
- Streaming: Real-time summary generation with progressive display
- Model: llama3.1:8b (5GB VRAM) or llama3.2:3b (2GB VRAM)

## Common Commands

### Development & Deployment

```bash
# Start the application
docker compose up -d

# View logs (especially useful during first start for model downloads)
docker compose logs -f whisper-api
docker compose logs -f ollama
docker compose logs -f frontend

# First-time setup: Pull Ollama model (after containers are running)
docker exec ollama ollama pull llama3.1:8b

# Alternative for low VRAM systems (2GB instead of 5GB)
docker exec ollama ollama pull llama3.2:3b

# Check installed models
docker exec ollama ollama list

# Restart containers (e.g., after .env changes)
docker compose restart

# Stop and remove containers
docker compose down

# Rebuild frontend after code changes
docker compose up -d --build frontend
```

### Diagnostics

```bash
# Run comprehensive diagnostic script
./diagnose.sh

# Check API directly
curl http://localhost:9000/

# Test transcription
curl -X POST -F 'audio_file=@test.wav' 'http://localhost:9000/asr?diarize=true&output=json'

# Check GPU access in container
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### Configuration

Environment variables in `.env`:
- `HF_TOKEN` - Hugging Face token (required for diarization)
- `ASR_MODEL` - Whisper model size: tiny, base, small, medium, large-v3 (default)
- `OLLAMA_MODEL` - LLM model for summaries: llama3.1:8b (recommended), llama3.2:3b (low VRAM)
- `DEBUG` - Set to "true" for verbose logs

Both `HF_TOKEN` and `HUGGINGFACE_TOKEN` are set to the same value for compatibility.

## Important Technical Details

### nginx Proxy Configuration

The `nginx.conf` has two location blocks for the API:
- `location = /api` - Exact match for root API endpoint
- `location /api/` - Prefix match for all API paths

Both proxy to `http://whisper-api:9000/` with the `/api` prefix removed. This dual-block approach prevents 502 errors from empty path rewrites.

Timeouts are set to 1200s (20 minutes) for long transcription jobs.

### API Parameters

The `/asr` endpoint accepts:
- `audio_file` - Multipart file upload (audio or video)
- `output=json` - Response format
- `language` - Language code (auto-detect if omitted)
- `diarize=true` - Enable speaker diarization
- `min_speakers` / `max_speakers` - Speaker count constraints
- `word_timestamps=true` - Enable word-level timestamps

### Response Format

The API returns JSON with structure:
```json
{
  "text": "full transcript",
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "segment text",
      "speaker": "SPEAKER_00"
    }
  ]
}
```

The frontend stores this in `transcriptData` and renders editable segments.

### GPU Requirements

- NVIDIA GPU with 8+ GB VRAM recommended for large models
- `nvidia-container-toolkit` must be installed and configured
- Docker Compose uses `deploy.resources.reservations.devices` for GPU access
- First startup downloads ~10 GB of models (cached in Docker volumes)

### Volumes

Three named volumes persist model caches:
- `whisper_cache` - Maps to `/root/.cache` (WhisperX models)
- `huggingface_cache` - Maps to `/root/.cache/huggingface` (pyannote models)
- `ollama_models` - Maps to `/root/.ollama` (LLM models, ~5GB per model)

This prevents re-downloading models on container restart.

## Troubleshooting Context

### "API offline" Status
- Check if HF_TOKEN is set correctly in `.env` (must start with `hf_`, not be placeholder)
- Verify pyannote model terms accepted on Hugging Face website
- First startup takes several minutes for model downloads
- Check logs: `docker compose logs whisper-api`

### 502 Bad Gateway
- Usually occurs during model download or initialization
- Wait for startup_period (600s defined in healthcheck)
- Verify whisper-api container is healthy: `docker compose ps`

### GPU Not Detected
- Run: `docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`
- If fails, reconfigure: `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`

### Healthcheck Details
The healthcheck uses Python to fetch `/docs` (FastAPI standard endpoint) because `/health` returns 404. Start period is 600s to account for model downloads on first run.

## Code Modification Guidelines

### Frontend Changes
After modifying `frontend/` files, rebuild the container:
```bash
docker compose up -d --build frontend
```

No build process needed - edit HTML/CSS/JS directly.

### Changing Models
Edit `docker-compose.yml`:
```yaml
environment:
  - ASR_MODEL=medium  # or: tiny, base, small, large-v3
```
Then restart: `docker compose down && docker compose up -d`

### Port Changes
- Frontend: Change `ports: - "3000:80"` in docker-compose.yml
- API direct access: Change `ports: - "9000:9000"`

## File Locations

- Application logic: `frontend/app.js` - `Transkriptor` class
- API proxy config: `frontend/nginx.conf` - Lines 19-63
- Container orchestration: `docker-compose.yml`
- Environment variables: `.env` (copy from `.env.example`)
- Diagnostic tool: `diagnose.sh`
