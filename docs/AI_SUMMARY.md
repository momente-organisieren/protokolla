# AI-Zusammenfassungen mit Ollama

Dieses Dokument beschreibt die Integration von Ollama (lokales LLM) für die automatische Generierung von Transkript-Zusammenfassungen.

## Übersicht

Das Transkriptor-Tool verwendet Ollama mit dem llama3.1:8b Modell, um vier verschiedene Arten von Zusammenfassungen zu generieren:
1. **Kurze Übersicht** - Executive Summary in 3-5 Sätzen
2. **Strukturierte Zusammenfassung** - Mit Hauptthema, Kernpunkten und Fazit
3. **Zeitstempel-basiert** - Chronologische Zusammenfassung mit Zeitmarken
4. **Action Items** - Extrahierte Aufgaben als Checkliste

## Architektur

### Dienst: Ollama
- **Container**: `ollama/ollama:latest`
- **Port**: 11434
- **GPU**: Shared mit whisper-api (sequentielle Nutzung)
- **Volume**: `ollama_models` (~5GB pro Modell)

### API-Zugriff
Frontend → nginx (`/ollama/*`) → Ollama Container (`11434/api/generate`)

### Streaming
Die Zusammenfassungen werden in Echtzeit gestreamt und progressiv im UI angezeigt.

## Setup

### 1. Container starten

```bash
docker compose up -d
```

Ollama wird automatisch mit den anderen Diensten gestartet.

### 2. Modell herunterladen

**Empfohlen (llama3.1:8b) - 5GB VRAM benötigt:**
```bash
docker exec ollama ollama pull llama3.1:8b
```

**Alternative für weniger VRAM (llama3.2:3b) - 2GB VRAM benötigt:**
```bash
docker exec ollama ollama pull llama3.2:3b
```

### 3. Modell verifizieren

```bash
# Installierte Modelle anzeigen
docker exec ollama ollama list

# Modell testen
docker exec ollama ollama run llama3.1:8b "Hallo, teste kurze Antwort"
```

## Verwendung

### Im Frontend

1. **Transkription erstellen** - Laden Sie eine Audio/Videodatei hoch und transkribieren Sie sie
2. **Summary-Panel öffnen** - Wird automatisch nach der Transkription angezeigt
3. **Typ auswählen** - Wählen Sie den gewünschten Zusammenfassungstyp
4. **Generieren** - Klicken Sie auf "Generieren" und sehen Sie die Streaming-Ausgabe
5. **Exportieren** - Kopieren oder exportieren Sie die Zusammenfassung

### Zusammenfassungstypen

#### 1. Kurze Übersicht
- **Zweck**: Schneller Überblick über das Transkript
- **Länge**: 3-5 Sätze
- **Ideal für**: Meetings, kurze Aufnahmen, schnelle Reviews
- **Dauer**: ~5-10 Sekunden

#### 2. Strukturierte Zusammenfassung
- **Zweck**: Detaillierte Analyse mit klarer Struktur
- **Format**:
  - Hauptthema
  - Kernpunkte (3-5 Bulletpoints)
  - Fazit
- **Ideal für**: Längere Diskussionen, Präsentationen, Interviews
- **Dauer**: ~15-20 Sekunden

#### 3. Zeitstempel-basiert
- **Zweck**: Chronologische Übersicht mit Zeitmarken
- **Format**: `[MM:SS] Beschreibung des Ereignisses`
- **Ideal für**: Navigierbare Zusammenfassungen, lange Aufnahmen
- **Dauer**: ~15-25 Sekunden

#### 4. Action Items
- **Zweck**: Extrahierte Aufgaben und To-Dos
- **Format**: Checkliste `- [ ] Aufgabe`
- **Ideal für**: Meetings, Planungsgespräche, Projektdiskussionen
- **Dauer**: ~10-15 Sekunden

## Performance

### GPU-Speicher

**Shared GPU Usage:**
- WhisperX und Ollama teilen sich die GPU
- Sequentielle Nutzung: Erst Transkription, dann Zusammenfassung
- Ollama entlädt Modell nach 10 Minuten Inaktivität (OLLAMA_KEEP_ALIVE)

**VRAM-Anforderungen:**
- llama3.1:8b: ~5GB
- llama3.2:3b: ~2GB
- Minimum GPU für beide Dienste: 8GB VRAM empfohlen

### Geschwindigkeit

**Typische Generierungszeiten (RTX 3060/4060):**
- Kurze Übersicht (100 Tokens): 3-5 Sekunden
- Strukturiert (300 Tokens): 10-15 Sekunden
- Zeitstempel (300 Tokens): 10-15 Sekunden
- Action Items (200 Tokens): 5-10 Sekunden

**Tokens pro Sekunde:**
- llama3.1:8b: ~30-35 tok/s
- llama3.2:3b: ~60 tok/s

## Konfiguration

### Umgebungsvariablen

In `.env`:
```bash
OLLAMA_MODEL=llama3.1:8b
```

### Modell wechseln

1. Neues Modell pullen:
   ```bash
   docker exec ollama ollama pull mistral:7b
   ```

2. In `frontend/app.js` ändern:
   ```javascript
   this.model = 'mistral:7b';
   ```

3. Frontend neu bauen:
   ```bash
   docker compose up -d --build frontend
   ```

### Verfügbare Modelle

| Modell | VRAM | Tokens/s | Qualität | Download |
|--------|------|----------|----------|----------|
| llama3.2:3b | 2GB | ~60 | Gut | 2GB |
| llama3.1:8b | 5GB | ~35 | Exzellent | 4.7GB |
| mistral:7b | 4.5GB | ~40 | Sehr gut | 4.1GB |
| gemma2:9b | 6GB | ~30 | Exzellent | 5.4GB |

## Troubleshooting

### Modell nicht gefunden

**Symptom**: Fehler "model 'llama3.1:8b' not found"

**Lösung**:
```bash
# Modell herunterladen
docker exec ollama ollama pull llama3.1:8b

# Verifizieren
docker exec ollama ollama list
```

### GPU-Speicher voll

**Symptom**: CUDA out of memory

**Lösungen**:
1. **Kleineres Modell verwenden**:
   ```bash
   docker exec ollama ollama pull llama3.2:3b
   ```

2. **WhisperX-Modell reduzieren** - In `.env`:
   ```bash
   ASR_MODEL=small
   ```

3. **Sequentiell arbeiten** - Warten Sie, bis Transkription fertig ist, bevor Sie Zusammenfassung erstellen

### Langsame Generierung

**Symptom**: Zusammenfassung dauert sehr lange

**Lösungen**:
1. **GPU-Nutzung prüfen**:
   ```bash
   docker exec ollama nvidia-smi
   ```

2. **Kleineres Modell** - llama3.2:3b ist 2x schneller

3. **Modell vorwärmen** - Erstes Request ist immer langsamer (Model Loading)

### Ollama Container startet nicht

**Symptom**: Container "ollama" not healthy

**Lösungen**:
1. **Logs prüfen**:
   ```bash
   docker compose logs ollama
   ```

2. **GPU-Zugriff testen**:
   ```bash
   docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
   ```

3. **Container neu starten**:
   ```bash
   docker compose restart ollama
   ```

### Streaming funktioniert nicht

**Symptom**: Keine progressiven Updates im UI

**Lösungen**:
1. **nginx-Konfiguration prüfen** - `proxy_buffering off` muss gesetzt sein
2. **Browser-Console prüfen** - Fetch-Fehler oder CORS-Probleme?
3. **Frontend neu laden** - Strg+Shift+R für Hard Refresh

## API-Details

### Endpoint

```
POST /ollama/api/generate
Content-Type: application/json
```

### Request

```json
{
  "model": "llama3.1:8b",
  "prompt": "Zusammenfasse dieses Transkript...",
  "stream": true,
  "options": {
    "temperature": 0.7,
    "num_predict": 1000
  }
}
```

### Response (Streaming)

```json
{"model":"llama3.1:8b","response":"Das","done":false}
{"model":"llama3.1:8b","response":" Transkript","done":false}
{"model":"llama3.1:8b","response":" handelt","done":false}
...
{"model":"llama3.1:8b","response":"","done":true,"total_duration":5234567890}
```

## Prompt-Engineering

### Best Practices

1. **Klare Instruktionen** - Spezifizieren Sie genau das gewünschte Format
2. **Beispiele geben** - Zeigen Sie das erwartete Ausgabeformat
3. **Kontext limitieren** - Lange Transkripte können gekürzt werden
4. **Sprache angeben** - "Antworte auf Deutsch" explizit angeben

### Beispiel-Prompts

**Kurze Übersicht:**
```
Du bist ein professioneller Zusammenfasser.
Erstelle eine präzise Zusammenfassung in 3-5 Sätzen.
Konzentriere dich auf Hauptthemen und Erkenntnisse.

Transkript: [...]

Gib nur die Zusammenfassung aus.
```

**Strukturiert:**
```
Analysiere das Transkript und formatiere als:

## Hauptthema
[Beschreibung]

## Kernpunkte
- [Punkt 1]
- [Punkt 2]

## Fazit
[Schlussfolgerung]

Transkript: [...]
```

## Storage

Zusammenfassungen werden in localStorage gespeichert (zusammen mit dem Transkript):
- Auto-save nach Generierung
- 7 Tage Retention
- Export als TXT-Datei möglich

## Sicherheit

- **Vollständig lokal** - Keine Daten verlassen Ihren Server
- **Kein API-Key** - Keine externe API benötigt
- **Offline-fähig** - Funktioniert ohne Internetverbindung
- **DSGVO-konform** - Alle Daten bleiben auf Ihrem System

## Roadmap

Geplante Features:
- [ ] Mehrsprachige Zusammenfassungen
- [ ] Custom Prompts im UI
- [ ] Vergleich mehrerer Modelle
- [ ] Batch-Verarbeitung mehrerer Transkripte
- [ ] Speaker-spezifische Zusammenfassungen

## Weitere Ressourcen

- [Ollama Dokumentation](https://ollama.com/docs)
- [Ollama API Reference](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Llama3 Model Card](https://huggingface.co/meta-llama/Meta-Llama-3-8B)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)
