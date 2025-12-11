# Speaker Diarization Optimierung

## ✅ PROBLEM GELÖST (Dezember 2025)

**Root Cause gefunden**: Das Backend-Image `v1.5.0-gpu` hatte einen Bug, der verhinderte, dass WhisperX Diarization korrekt funktioniert.

### Die Lösung

**Update auf v1.9.1-gpu** - In `whisper-backend/Dockerfile` Zeile 3:
```dockerfile
FROM onerahmet/openai-whisper-asr-webservice:v1.9.1-gpu
```

Version v1.9.1 enthält den Fix für "whisperx diarization pipeline init". Nach diesem Update:
- ✅ Speaker Labels erscheinen korrekt (SPEAKER_00, SPEAKER_01, etc.)
- ✅ Diarization funktioniert wie erwartet
- ✅ Keine zusätzlichen Konfigurationen nötig

**Wichtig**: Die erste Transkription mit Diarization dauert länger (~2-3 Minuten extra), da Sprachmodelle heruntergeladen werden. Diese werden im `whisper_cache` Volume gecacht und spätere Transkriptionen sind schneller.

### Modell-Updates

Sprachmodelle (z.B. `wav2vec2_voxpopuli_base_10k_asr_de.pt` für Deutsch) werden automatisch beim ersten Gebrauch heruntergeladen und im Docker Volume `whisper_cache` gespeichert.

**Um Modelle zu aktualisieren**:
```bash
# Volume löschen um Modelle neu zu laden
docker compose down
docker volume rm protokolla_whisper_cache
docker compose up -d
```

Dies stellt sicher, dass Sie immer die neuesten Modellversionen von PyTorch erhalten.

---

## Frühere Verbesserungen

✅ **Min/Max Sprecher UI-Kontrolle hinzugefügt** - Sie können jetzt beide Parameter direkt im Frontend einstellen.

### Empfohlene Einstellungen für 8 Sprecher:

**Aktueller Stand: 6 von 8 Sprechern erkannt ✅**

Für optimale Ergebnisse:

- **Min. Sprecher**: **8** (Standard: 8) ⚡ NEU
  - Zwingt das Modell, mindestens 8 verschiedene Cluster zu finden
  - Bei genau 8 Sprechern: Setzen Sie Min = 8
- **Max. Sprecher**: 12-15 (Standard: 10)
  - Sollte höher als Min sein, um Flexibilität zu geben
- **Sprache**: **Deutsch** (nicht "Automatisch")
  - Beschleunigt Verarbeitung erheblich
  - Verbessert Genauigkeit
- **Sprecher erkennen**: ✓ Aktiviert

## Problem (Gelöst: 1→2 Sprecher, weiteres Tuning nötig)
Die Speaker Diarization erkannte anfangs nur einen Sprecher (SPEAKER_00). Nach Fixes werden jetzt 2 erkannt, aber bei 8 sprechenden Personen sollten mehr erkannt werden.

## Ursachen

### 1. Pyannote Version Mismatch
Das Backend-Image (`onerahmet/openai-whisper-asr-webservice:latest-gpu`) verwendet eine neuere pyannote.audio Version (3.3.2), während die Modelle mit einer älteren Version (0.0.1) trainiert wurden. Dies verursacht Warnungen in den Logs:

```
Model was trained with pyannote.audio 0.0.1, yours is 3.3.2. Bad things might happen
```

### 2. Fehlende API-Parameter
Die Speaker Diarization benötigt möglicherweise zusätzliche Parameter für optimale Ergebnisse.

## Lösungen

### Lösung 1: Optimierte API-Parameter (Frontend-Anpassung)

Passen Sie die API-Anfrage in `frontend/app.js` an, um zusätzliche Diarization-Parameter zu senden:

```javascript
// In processFile(), Zeile 161-165 ersetzen:
if (this.diarizeCheck.checked) {
    params.set('diarize', 'true');
    params.set('min_speakers', '1');
    params.set('max_speakers', this.maxSpeakers.value);
    // NEU: Clustering-Threshold senken für bessere Speaker-Trennung
    params.set('diarization_threshold', '0.4');  // Standard: 0.5
}
```

**Erklärung**: Ein niedrigerer `diarization_threshold` Wert (z.B. 0.3-0.4) macht die Speaker-Erkennung sensibler und trennt Sprecher aggressiver. Werte:
- `0.5` = Standard (konservativ)
- `0.4` = Mehr Sprecher-Trennung
- `0.3` = Sehr aggressive Trennung (Risiko: zu viele Sprecher)

### Lösung 2: Modell explizit angeben (Docker-Compose)

✅ **BEREITS IMPLEMENTIERT** in `docker-compose.yml`:

```yaml
environment:
  - DIARIZATION_MODEL=pyannote/speaker-diarization-3.1
```

Dies stellt sicher, dass das neueste Diarization-Modell verwendet wird.

### Lösung 3: Alternative Backend-Images

Falls das Problem weiterhin besteht, können Sie auf ein anderes Backend-Image wechseln:

#### Option A: Älteres Image mit stabiler pyannote Version
```yaml
whisper-api:
  image: onerahmet/openai-whisper-asr-webservice:v1.5.0-gpu  # Ältere stabile Version
```

#### Option B: Eigenes Docker-Image mit aktualisierter pyannote
Erstellen Sie ein eigenes Dockerfile basierend auf dem offiziellen Image und aktualisieren Sie pyannote:

```dockerfile
FROM onerahmet/openai-whisper-asr-webservice:latest-gpu

# Aktualisiere pyannote auf kompatible Version
RUN pip install --upgrade pyannote.audio==3.1.1
```

### Lösung 4: Audio-Qualität prüfen

Speaker Diarization funktioniert am besten mit:
- Klarer Audio-Qualität (wenig Hintergrundrauschen)
- Deutlich unterscheidbaren Stimmen
- Nicht zu vielen überlappenden Sprechern
- Audio mit mindestens 16 kHz Sampling-Rate

**Test**: Versuchen Sie die Diarization mit einer hochwertigen Aufnahme (z.B. Interview, Podcast) statt einer Meeting-Aufnahme mit vielen Nebengeräuschen.

## Empfohlene Vorgehensweise (AKTUALISIERT)

### ✅ UI-Kontrollen bereits implementiert

Das Frontend wurde aktualisiert und bietet jetzt:
- **Min. Sprecher**: Dropdown mit Werten 1-6 (Standard: 4)
- **Max. Sprecher**: Dropdown mit Werten 2-15 (Standard: 10)

### Schritt 1: Optimale Einstellungen wählen

Öffnen Sie http://localhost:3000 und stellen Sie ein:

1. **Min. Sprecher**: `4` oder `6`
   - Bei 8 Sprechern: Setzen Sie auf 6, um das Modell zu "trainieren", mehr Sprecher zu finden
   - Niedriger = flexibler, höher = aggressivere Sprecher-Trennung

2. **Max. Sprecher**: `10` oder `15`
   - Immer höher als die tatsächliche Anzahl setzen
   - Gibt dem Modell Raum, alle Sprecher zu finden

3. **Sprache**: `Deutsch` (nicht "Automatisch")
   - Beschleunigt die Verarbeitung
   - Verhindert Fehler bei der Spracherkennung

### Schritt 2: Testen

1. Laden Sie die Anwendung neu (http://localhost:3000)
2. Laden Sie eine Audio-Datei hoch
3. Stellen Sie sicher, dass "Sprecher erkennen" aktiviert ist
4. Setzen Sie "Max. Sprecher" auf eine realistische Zahl (z.B. 8-10)

## Tipps für 8-Sprecher-Erkennung

### Warum werden nur 6 statt 8 erkannt?

Mögliche Gründe:
1. **Ähnliche Stimmen**: 2 Sprecher haben sehr ähnliche Stimm-Eigenschaften (Tonhöhe, Tempo)
2. **Kurze Segmente**: Einige Sprecher reden sehr kurz, zu wenig Daten für Clustering
3. **Clustering-Schwellwert**: pyannote fasst ähnliche Stimmen zusammen (konservativ)

### Was hilft:

#### 1. Min. Sprecher = 8 setzen (JETZT VERFÜGBAR)
- **Wichtigste Änderung!**
- Dropdown jetzt erweitert: Sie können Min=8 auswählen
- Dies zwingt das Clustering-Modell, 8 verschiedene Cluster zu bilden

#### 2. Längere Aufnahmen
- Jeder Sprecher sollte idealerweise >30 Sekunden sprechen
- Bei sehr kurzen Beiträgen (<10 Sek.) ist Zuordnung schwierig

#### 3. Manuelle Nachbearbeitung
- Nach der Transkription: Prüfen Sie die Segmente
- Schauen Sie nach Mustern: "Welche SPEAKER_XX Segmente könnten von derselben Person sein?"
- Im Editor können Sie Sprecher umbenennen/zusammenfassen

#### 4. Audio-Vorverarbeitung (Advanced)
Falls technisch möglich:
- **Normalisierung**: Lautstärke-Unterschiede können Clustering verwirren
- **Equalizer**: Extreme Bass/Höhen können reduziert werden
- **Rauschunterdrückung**: Nur bei starkem Hintergrundrauschen

#### 5. Mehrere Versuche
Testen Sie verschiedene Kombinationen:

**Konservativ** (zusammenfassend):
- Min: 4, Max: 10

**Balanced** (aktueller Standard):
- Min: 6, Max: 12

**Aggressiv** (trennend):
- Min: 8, Max: 15

**Sehr aggressiv** (bei sehr ähnlichen Stimmen):
- Min: 10, Max: 20
- ⚠️ Kann zu viele falsche Sprecher erzeugen!

## Debugging

### Logs prüfen
```bash
docker compose logs whisper-api -f
```

Suchen Sie nach:
- `>>Performing speaker diarization...`
- Anzahl der erkannten Sprecher
- Fehler oder Warnungen bezüglich pyannote

### API direkt testen
```bash
curl -X POST \
  -F "audio_file=@test.mp3" \
  "http://localhost:9000/asr?diarize=true&min_speakers=2&max_speakers=8&output=json" \
  | jq '.segments[] | .speaker' | sort -u
```

Dies zeigt alle eindeutigen Sprecher in der Antwort.

### JSON-Antwort prüfen
Im Browser:
1. Öffnen Sie Developer Tools (F12)
2. Tab "Network"
3. Führen Sie eine Transkription aus
4. Klicken Sie auf die `/asr` Anfrage
5. Prüfen Sie die JSON-Antwort unter "Preview" oder "Response"
6. Zählen Sie die eindeutigen `speaker` Werte in `segments`

## Bekannte Limitierungen

1. **WhisperX/pyannote Modell-Kompatibilität**: Das Backend-Image ist möglicherweise nicht optimal für die neuesten pyannote-Modelle konfiguriert
2. **Clustering-Algorithmus**: Bei sehr ähnlichen Stimmen kann pyannote Schwierigkeiten haben, Sprecher zu trennen
3. **Kurze Segmente**: Sehr kurze Sprachsegmente (<2 Sekunden) können schwer zuzuordnen sein

## Nächste Schritte

Wenn die obigen Lösungen nicht helfen:

1. Überprüfen Sie, ob die Hugging Face Nutzungsbedingungen akzeptiert wurden
2. Prüfen Sie, ob der HF_TOKEN gültig ist
3. Testen Sie mit verschiedenen Audio-Dateien (hochwertige Aufnahmen)
4. Erwägen Sie einen Wechsel zu einem anderen Backend-Image oder Fork des whisper-asr-webservice Projekts
5. Öffnen Sie ein Issue im offiziellen Repository: https://github.com/ahmetoner/whisper-asr-webservice/issues
