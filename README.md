# 🎙️ Transkriptor – Lokale Spracherkennung mit KI-Zusammenfassungen

Eine vollständig lokal gehostete Web-Anwendung zur automatischen Transkription von Audio- und Videodateien mit Sprecherzuweisung und intelligenten KI-Zusammenfassungen.

**🚀 Neu:** Integriertes KI-System für automatische Zusammenfassungen mit 5 verschiedenen Typen – vollständig lokal und DSGVO-konform!

## ✨ Features

- **🎯 Lokale Verarbeitung** – Deine Daten verlassen nie deinen Server
- **👥 Sprecher-Diarisierung** – Automatische Erkennung verschiedener Sprecher (bis zu 30 Sprecher)
- **🌍 Multi-Sprache** – Unterstützt 20+ Sprachen (Deutsch, Englisch, etc.)
- **⏱️ Zeitstempel** – Wortgenaue oder Segment-Zeitstempel mit automatischer Drift-Korrektur
- **✏️ Editor** – Transkripte direkt im Browser bearbeiten mit Karaoke-Style Word-Highlighting
- **🤖 KI-Zusammenfassungen** – 5 verschiedene Zusammenfassungstypen mit lokalem LLM (Ollama)
- **🗂️ Tab-Navigation** – Übersichtliche Trennung von Transkript und Zusammenfassungen
- **💾 Persistenz** – Automatisches Speichern von Transkripten und Zusammenfassungen
- **📁 Export** – TXT, SRT, VTT, JSON, Word-Format

## 🖥️ Systemanforderungen

- **Docker** mit Docker Compose
- **NVIDIA GPU** mit mindestens 8 GB VRAM (für große Modelle)
- **NVIDIA Container Toolkit** installiert
- **Hugging Face Account** (kostenlos)

### GPU Setup (falls noch nicht vorhanden)

```bash
# NVIDIA Container Toolkit installieren (Ubuntu/Debian)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

## 🚀 Installation

### 1. Repository klonen/Dateien kopieren

```bash
mkdir whisper-transcriber && cd whisper-transcriber
# Alle Dateien in dieses Verzeichnis kopieren
```

### 2. Hugging Face Token einrichten

1. Erstelle einen kostenlosen Account auf [huggingface.co](https://huggingface.co)
2. Generiere einen **READ** Token unter: https://huggingface.co/settings/tokens
3. Akzeptiere die Nutzungsbedingungen für diese Modelle:
   - https://huggingface.co/pyannote/segmentation-3.0
   - https://huggingface.co/pyannote/speaker-diarization-3.1

### 3. Konfiguration erstellen

```bash
# .env Datei aus Vorlage erstellen
cp .env.example .env

# Token eintragen
nano .env
# Ersetze "hf_DEIN_TOKEN_HIER" mit deinem echten Token
```

### 4. Starten

```bash
docker compose up -d
```

⏳ **Erster Start dauert länger** – Die Modelle werden heruntergeladen (~10 GB für WhisperX).

### 5. Ollama LLM für Zusammenfassungen einrichten (Optional)

Das Ollama LLM für KI-Zusammenfassungen wird automatisch mit gestartet. Lade das empfohlene Modell herunter:

```bash
# Empfohlenes Modell (4.5 GB, benötigt ~5 GB VRAM)
docker exec ollama ollama pull qwen2.5:7b

# Alternative für weniger VRAM (2 GB, benötigt ~2 GB VRAM)
docker exec ollama ollama pull llama3.2:3b
```

**Hinweis:** WhisperX und Ollama teilen sich die GPU sequentiell. Erst wird transkribiert, dann können Zusammenfassungen generiert werden.

### 6. Öffnen

Öffne im Browser: **http://localhost:3000**

## 📋 Nutzung

### Transkription erstellen

1. **Datei hochladen** – Audio (MP3, WAV, M4A...) oder Video (MP4, MKV...)
2. **Optionen wählen**:
   - Sprache (automatisch oder manuell)
   - Min./Max. Anzahl Sprecher (1-30)
   - Sprecher-Erkennung ein/aus
   - Wort-Zeitstempel ein/aus
3. **Warten** – Je nach Dateigröße einige Sekunden bis Minuten
4. **Bearbeiten** – Im **Transkript-Tab**:
   - Sprecher umbenennen
   - Text korrigieren
   - Segmente zusammenführen oder teilen
   - Bulk-Edit für mehrere Segmente
5. **Exportieren** – Format wählen und herunterladen

### KI-Zusammenfassungen nutzen

Nach der Transkription wechselst du zum **Zusammenfassung-Tab**:

1. **Typ auswählen** aus dem Dropdown:
   - **Kurze Übersicht** – Executive Summary in 3-5 Sätzen
   - **Strukturierte Zusammenfassung** – Mit Hauptthema, Kernpunkten und Fazit
   - **Zeitstempel-basiert** – Chronologische Zusammenfassung mit Zeitmarken
   - **Action Items** – Extrahierte Aufgaben als Checkliste
   - **Tags / Schlagworte** – Relevante Themen und Schlagworte

2. **Generieren klicken** – Die Zusammenfassung wird in Echtzeit gestreamt

3. **Zwischen Typen wechseln** – Bereits generierte Zusammenfassungen werden sofort geladen, ohne neu zu generieren

4. **Exportieren oder Kopieren** – Zusammenfassungen als TXT exportieren oder in Zwischenablage kopieren

**Hinweis:** Alle Zusammenfassungen werden automatisch gespeichert und sind auch nach einem Neuladen verfügbar.

## ⚠️ Audio-Encoding Empfehlungen

Für optimale Zeitstempel-Genauigkeit sollten Audio-Dateien korrekt kodiert sein:

### Problem: VBR MP3 mit korrupten Metadaten

**Variable Bitrate (VBR) MP3-Dateien** können fehlerhafte Metadaten enthalten, die zu Zeitstempel-Drift führen:
- Metadaten sagen: "Dauer = 3:10:11"
- Tatsächliche Audio-Dauer: "3:10:27"
- Ergebnis: Timestamps driften über die gesamte Datei (bis zu 16+ Sekunden bei 3 Stunden)

### ✅ Empfohlene Einstellungen

Verwende **Constant Bitrate (CBR)** statt VBR für MP3-Dateien:

```bash
# Mit ffmpeg neu kodieren (empfohlen)
ffmpeg -i input.mp3 -c:a libmp3lame -b:a 128k -ar 44100 -write_xing 0 output.mp3
```

**Parameter-Erklärung:**
- `-c:a libmp3lame` – LAME MP3 Encoder (beste Qualität)
- `-b:a 128k` – Konstante Bitrate 128 kbps
- `-ar 44100` – Sample Rate 44.1 kHz (Standard)
- `-write_xing 0` – Deaktiviert VBR-Header (erzwingt CBR)

**Alternative Tools:**
- **XMedia Recode** (Windows): Unter Audio → Bitrate-Modus → "Konstant (CBR)" wählen
- **Handbrake** (Cross-Platform): Audio-Tab → Bitrate auf konstanten Wert setzen

### Automatische Drift-Korrektur

Die Anwendung erkennt und korrigiert Zeitstempel-Drift automatisch:
- Beim Laden wird die tatsächliche Audio-Dauer mit den Transkript-Timestamps verglichen
- Alle Timestamps werden mathematisch skaliert (z.B. ×1.0014 bei 0.14% Drift)
- In der Konsole erscheint: `📊 Drift Analysis: ... Total drift: 16.0s ... Drift factor: 1.001402 (+0.140%)`
- Das UI zeigt: `Drift: +0.14% (Auto)`

**Manuelle Feinabstimmung:** Falls nötig, kann der Drift-Slider (±1%) für Feinkorrektur verwendet werden.

### Andere Format-Empfehlungen

- **WAV** – Unkomprimiert, keine Metadaten-Probleme, aber große Dateien
- **M4A/AAC** – Gute Alternative zu MP3, meist korrekte Metadaten
- **FLAC** – Verlustfrei, zuverlässige Metadaten

## 🎛️ Modelle & Performance

### WhisperX ASR-Modelle

| Modell | VRAM | Qualität | Geschwindigkeit |
|--------|------|----------|-----------------|
| `tiny` | ~1 GB | ⭐⭐ | ⚡⚡⚡⚡⚡ |
| `base` | ~1 GB | ⭐⭐⭐ | ⚡⚡⚡⚡ |
| `small` | ~2 GB | ⭐⭐⭐⭐ | ⚡⚡⚡ |
| `medium` | ~5 GB | ⭐⭐⭐⭐ | ⚡⚡ |
| `large-v3` | ~10 GB | ⭐⭐⭐⭐⭐ | ⚡ |

Modell ändern in `.env`:
```bash
ASR_MODEL=small  # oder: tiny, base, medium, large-v3
```

### Ollama LLM-Modelle (für Zusammenfassungen)

| Modell | VRAM | Download | Tokens/s | Qualität |
|--------|------|----------|----------|----------|
| `llama3.2:3b` | ~2 GB | 2 GB | ~60 | Gut |
| `qwen2.5:7b` | ~5 GB | 4.5 GB | ~35 | ⭐ Exzellent (Empfohlen) |
| `llama3.1:8b` | ~5 GB | 4.7 GB | ~35 | Sehr gut |
| `mistral:7b` | ~4.5 GB | 4.1 GB | ~40 | Sehr gut |

**Empfehlung:** `qwen2.5:7b` – Beste Qualität für strukturierte Zusammenfassungen

Modell ändern in `.env`:
```bash
OLLAMA_MODEL=qwen2.5:7b
```

Dann neues Modell herunterladen:
```bash
docker exec ollama ollama pull qwen2.5:7b
docker compose restart frontend
```

**GPU-Speicher:** WhisperX und Ollama teilen sich die GPU. Empfohlen sind mindestens 8 GB VRAM für beide Dienste.

## 🔧 Konfiguration

### Umgebungsvariablen (.env)

```bash
# Hugging Face Token (ERFORDERLICH für Sprecher-Diarisierung)
HF_TOKEN=hf_deinTokenHier

# WhisperX ASR-Modell
ASR_MODEL=small  # tiny, base, small, medium, large-v3

# Ollama LLM-Modell für Zusammenfassungen
OLLAMA_MODEL=qwen2.5:7b  # qwen2.5:7b, llama3.1:8b, llama3.2:3b, mistral:7b
```

### docker-compose.yml Optionen

```yaml
environment:
  # ASR Engine (whisperx für Diarization)
  - ASR_ENGINE=whisperx

  # Modellgröße (von .env)
  - ASR_MODEL=${ASR_MODEL}

  # Hugging Face Token (für Sprecher-Erkennung)
  - HF_TOKEN=${HF_TOKEN}
```

### Ports ändern

Frontend: Port `3000` → z.B. `8080`:
```yaml
frontend:
  ports:
    - "8080:80"
```

Dienste-Ports:
- **Frontend:** 3000 (Web-UI)
- **API:** 9000 (WhisperX)
- **Ollama:** 11434 (LLM)

### Persistenz & Speicherung

Die Anwendung speichert automatisch mit **IndexedDB Version 2**:

- **Transkript-Daten, Zusammenfassungen, Sprecher-Namen, Performance-Stats** → IndexedDB (Store "transcriptData")
- **Audio-Dateien** → IndexedDB (Store "audioFiles", bis zu 50% freier Speicherplatz)
- **Metadaten** → localStorage (~1 KB, nur für schnellen Check)
- **Modell-Cache** → Docker Volumes (`whisper_cache`, `ollama_models`)

**Vorteile:**
- ✅ Keine localStorage-Quota-Fehler mehr (auch bei großen Transkripten mit KI-Zusammenfassungen)
- ✅ Automatische Migration von alten Daten beim ersten Laden
- ✅ Transaktionale Sicherheit für Datenintegrität

**Retention:** 7 Tage automatische Aufbewahrung, danach werden Daten gelöscht.

## 🐛 Troubleshooting

### "API offline"

```bash
# Logs prüfen
docker compose logs whisper-api

# Container neustarten
docker compose restart whisper-api
```

### GPU nicht erkannt

```bash
# NVIDIA Docker testen
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# Falls Fehler: nvidia-container-toolkit neu konfigurieren
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Diarization funktioniert nicht

1. HF_TOKEN in `.env` korrekt eingetragen?
2. Nutzungsbedingungen der pyannote-Modelle akzeptiert?
3. Container neu starten nach Token-Änderung

### Zeitstempel-Drift (Timestamps werden ungenau)

Wenn Zeitstempel über die Laufzeit der Datei immer ungenauer werden:

1. **Audio-Datei neu kodieren** (empfohlen) – Siehe [Audio-Encoding Empfehlungen](#️-audio-encoding-empfehlungen)
   - VBR MP3 mit korrupten Metadaten ist die häufigste Ursache
   - Mit CBR neu kodieren löst das Problem dauerhaft
2. **Wort-Zeitstempel aktivieren** – Checkbox in den Optionen
3. **Automatische Drift-Korrektur** – Wird beim Laden automatisch angewendet
4. Bessere Audio-Qualität verwenden (weniger Hintergrundrauschen)
5. Größeres Modell nutzen (`medium` oder `large-v3`)

Siehe **[docs/TIMESTAMP_DRIFT_FIX.md](docs/TIMESTAMP_DRIFT_FIX.md)** für detaillierte Lösungen.

### Out of Memory (GPU)

Kleineres Modell verwenden:
```bash
# In .env ändern:
ASR_MODEL=small  # statt large-v3
OLLAMA_MODEL=llama3.2:3b  # statt qwen2.5:7b

# Container neu starten
docker compose restart
```

**Tipp:** Ollama entlädt Modelle nach 10 Minuten Inaktivität automatisch, um VRAM freizugeben.

### Zusammenfassungen werden nicht generiert

```bash
# Prüfe ob Ollama läuft
docker compose ps ollama

# Prüfe ob Modell heruntergeladen wurde
docker exec ollama ollama list

# Falls nicht, Modell herunterladen
docker exec ollama ollama pull qwen2.5:7b

# Container neu starten
docker compose restart ollama frontend
```

### Zusammenfassungen sind langsam

- **Erstes Request ist langsamer** (Model Loading ~5-10 Sekunden)
- **Kleineres Modell nutzen:** `llama3.2:3b` ist 2x schneller als `qwen2.5:7b`
- **GPU-Nutzung prüfen:** `docker exec ollama nvidia-smi`

## 📁 Verzeichnisstruktur

```
whisper-transcriber/
├── docker-compose.yml    # Container-Konfiguration (whisper-api, ollama, frontend)
├── .env                  # Secrets (HF_TOKEN, ASR_MODEL, OLLAMA_MODEL)
├── .env.example          # Vorlage
├── docs/                 # Detaillierte Dokumentation
│   ├── CLAUDE.md         # Vollständige Projektdokumentation
│   ├── AI_SUMMARY.md     # Ollama Integration & Zusammenfassungen
│   ├── DIARIZATION_FIX.md
│   ├── GPU_MEMORY_FIX.md
│   └── INDEXEDDB_STORAGE.md
└── frontend/
    ├── Dockerfile
    ├── nginx.conf        # Reverse Proxy für /api und /ollama
    ├── index.html        # UI mit Tab-Navigation
    ├── styles.css        # Styling
    └── app.js            # Transkriptor + SummaryManager Klassen
```

## 🔒 Sicherheit & Datenschutz

- **100% lokal** – Alle Daten werden auf deinem Server verarbeitet
- **Keine Cloud-Dienste** – WhisperX, Ollama und alle Modelle laufen lokal
- **Keine Datenübertragung** – Audio, Transkripte und Zusammenfassungen verlassen nie deinen Server
- **DSGVO-konform** – Ideal für sensible Inhalte (Meetings, Interviews, vertrauliche Aufnahmen)
- **Offline-fähig** – Funktioniert ohne Internetverbindung (nach Model-Download)
- **Hugging Face Token** – Wird nur für einmaligen Model-Download verwendet

## 📄 Lizenz

MIT License – Frei verwendbar für private und kommerzielle Zwecke.

## 🙏 Credits

- [WhisperX](https://github.com/m-bain/whisperX) – ASR mit Alignment und Diarization
- [whisper-asr-webservice](https://github.com/ahmetoner/whisper-asr-webservice) – API Backend
- [pyannote-audio](https://github.com/pyannote/pyannote-audio) – Speaker Diarization
- [Ollama](https://ollama.com) – Lokale LLM-Integration für KI-Zusammenfassungen
- [Qwen2.5](https://huggingface.co/Qwen/Qwen2.5-7B) – Exzellentes LLM für strukturierte Zusammenfassungen

## 📚 Weitere Dokumentation

Detaillierte Dokumentation findest du im `docs/` Verzeichnis:

- **[docs/CLAUDE.md](docs/CLAUDE.md)** – Vollständige Projektübersicht und Architektur
- **[docs/AI_SUMMARY.md](docs/AI_SUMMARY.md)** – Ollama Integration, Prompts und Modellvergleiche
- **[docs/INDEXEDDB_STORAGE.md](docs/INDEXEDDB_STORAGE.md)** – Datenspeicherung mit IndexedDB (Version 2)
- **[docs/GPU_MEMORY_FIX.md](docs/GPU_MEMORY_FIX.md)** – CUDA Memory Troubleshooting
- **[docs/DIARIZATION_FIX.md](docs/DIARIZATION_FIX.md)** – Speaker Diarization Optimierung
