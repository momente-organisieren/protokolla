# IndexedDB Storage für große Dateien

## Problem gelöst ✅

localStorage hat ein Limit von ~5-10 MB, was für große Audio-Dateien und umfangreiche Transkripte mit KI-Zusammenfassungen nicht ausreicht. Die neue Implementierung nutzt **IndexedDB**, eine Browser-Datenbank, die viel größere Datenmengen speichern kann.

## Vorteile von IndexedDB

- **Größe**: Speichert oft bis zu 50% des verfügbaren Festplattenspeichers
- **Performance**: Schneller als Base64-Encoding (kein Konvertieren nötig)
- **Native File Support**: Speichert File-Objekte direkt, ohne Encoding
- **Asynchron**: Blockiert die UI nicht beim Speichern/Laden
- **Transaktional**: Datenintegrität garantiert

## Wie es funktioniert

### 1. Hauptspeicherung in IndexedDB

**Version 2 (aktuell):**
- **IndexedDB Store "audioFiles"**: Audio-Dateien (File-Objekte)
- **IndexedDB Store "transcriptData"**: Transkripte, Sprecher-Namen, KI-Zusammenfassungen, Performance-Stats
- **localStorage**: Nur kleine Metadaten (hasData, timestamp, fileName) für schnellen Check

Diese Architektur löst das localStorage-Quota-Problem auch bei großen Transkripten mit mehreren KI-Zusammenfassungen.

### 2. Automatisches Speichern

Jedes Mal, wenn Sie etwas ändern:
- Transkript, Sprecher-Namen, Zusammenfassungen, Stats → **IndexedDB** (transcriptData Store)
- Audio-Datei → **IndexedDB** (audioFiles Store)
- Metadaten → **localStorage** (klein, schnell)

### 3. Automatisches Laden

Beim Seitenaufruf:
1. Metadaten aus localStorage prüfen (schnell)
2. Transkriptionsdaten aus IndexedDB laden (transcriptData Store)
3. Audio aus IndexedDB laden (audioFiles Store, parallel)
4. Alles zusammenführen und anzeigen

### 4. Automatische Bereinigung

- Daten älter als 7 Tage werden automatisch gelöscht
- Bei "Neue Transkription" werden beide Speicher geleert

## Speicher-Limits

### localStorage (nur für Metadaten)
- **Limit**: ~5-10 MB
- **Verwendung**: Nur kleine Metadaten (~1 KB: hasData, timestamp, fileName)
- **Kein Problem mehr**: Große Daten liegen in IndexedDB

### IndexedDB (für alle großen Daten)
- **Chrome/Edge**: Bis zu 60% der verfügbaren Festplatte
- **Firefox**: Bis zu 50% der verfügbaren Festplatte
- **Safari**: Bis zu 1 GB (dann fragt der Browser nach Erlaubnis)

**Beispiel bei 100 GB freiem Speicher:**
- Chrome: ~60 GB für IndexedDB verfügbar
- Audio-Dateien >500 MB ✅
- Transkripte mit mehreren KI-Zusammenfassungen ✅
- Mehrere hundert Seiten Text ✅

## Speicher-Nutzung prüfen

Öffnen Sie die Browser-Konsole (F12) und geben Sie ein:

```javascript
app.audioStorage.getStorageEstimate().then(estimate => {
    console.log('Genutzt:', (estimate.usage / 1024 / 1024).toFixed(2), 'MB');
    console.log('Verfügbar:', (estimate.quota / 1024 / 1024).toFixed(2), 'MB');
    console.log('Prozent:', estimate.usagePercent + '%');
});
```

## Developer Tools - IndexedDB ansehen

1. Öffnen Sie die Developer Tools (F12)
2. Tab "Application" (Chrome) oder "Storage" (Firefox)
3. Expandieren Sie "IndexedDB"
4. Klicken Sie auf "TranscriptorDB"
5. Sie sehen zwei Stores:
   - **"audioFiles"**: Gespeicherte Audio-Datei mit Metadaten
   - **"transcriptData"**: Komplettes Transkript mit allen Zusammenfassungen

## Was passiert bei sehr großen Dateien?

### Datei > 100 MB
✅ **Kein Problem** - wird in IndexedDB gespeichert

### Datei > 500 MB
✅ **Funktioniert** - abhängig vom verfügbaren Speicher

### Datei > verfügbares Quota
⚠️ Audio wird nicht gespeichert, aber:
- Transkript bleibt erhalten
- Sie können weiter bearbeiten
- Beim Neuladen ist das Audio weg (müssen Sie neu hochladen)

## Vorher vs. Nachher

### Vorher (Base64 + localStorage)
```
Audio-Datei: 50 MB
↓
Base64-Encoding: ~66 MB
↓
localStorage: ❌ FEHLER (zu groß)
```

### Nachher (IndexedDB)
```
Audio-Datei: 50 MB
↓
IndexedDB: ✅ Direkt gespeichert (kein Encoding)
↓
Beim Laden: ✅ Sofort verfügbar
```

## Migration von alten Daten

Die Anwendung migriert automatisch von alten Formaten:

### Automatische Migration beim ersten Laden
1. **localStorage-Format erkannt**: Alte Daten in `transcriptor_current`
2. **Automatische Migration**: Daten werden nach IndexedDB kopiert
3. **Cleanup**: Alte localStorage-Einträge werden gelöscht
4. **Neue Metadaten**: Nur kleine Metadaten bleiben in localStorage

Keine manuelle Aktion erforderlich! Die Migration geschieht transparent beim nächsten Seitenaufruf.

## Technische Details

### AudioStorage Klasse (app.js Zeile 8-228)

```javascript
class AudioStorage {
    // Version 2 mit zwei Stores: audioFiles + transcriptData

    // Audio-Dateien
    async saveAudioFile(file)           // Speichert File-Objekt in IndexedDB
    async getAudioFile()                // Lädt File-Objekt aus IndexedDB
    async deleteAudioFile()             // Löscht Audio aus IndexedDB

    // Transkriptionsdaten (NEU in Version 2)
    async saveTranscriptData(data)      // Speichert Transkript, Sprecher, Summaries, Stats
    async getTranscriptData()           // Lädt Transkriptionsdaten aus IndexedDB
    async deleteTranscriptData()        // Löscht Transkriptionsdaten aus IndexedDB

    // Hilfsmethoden
    async getStorageEstimate()          // Zeigt Speicher-Nutzung
}
```

### Verwendung in Transkriptor Klasse

- **saveToStorage()**:
  - Speichert große Daten (Transkript, Summaries, Sprecher, Stats) → IndexedDB (transcriptData Store)
  - Speichert Audio → IndexedDB (audioFiles Store)
  - Speichert nur Metadaten → localStorage (~1 KB)
- **loadFromStorage()**:
  - Prüft Metadaten in localStorage
  - Migriert alte Daten automatisch (falls vorhanden)
  - Lädt Transkriptionsdaten und Audio aus IndexedDB parallel
- **clearStorage()**:
  - Löscht beide IndexedDB-Stores
  - Löscht localStorage-Metadaten

## Troubleshooting

### Audio wird nicht geladen nach Reload

1. **Prüfen Sie die Konsole** (F12): Gibt es Fehlermeldungen?
2. **Prüfen Sie IndexedDB**: Application Tab → IndexedDB → TranscriptorDB
3. **Speicher voll?** Prüfen Sie mit `getStorageEstimate()`

### "QuotaExceededError"

Der Browser hat keinen Platz mehr. Lösungen:
1. Alte Daten löschen (Application Tab → Clear Storage)
2. Browser-Cache leeren
3. Anderen Browser verwenden (Chrome hat größere Limits)

### Inkognito-Modus

⚠️ **Vorsicht**: In Inkognito/Private Browsing:
- IndexedDB funktioniert
- ABER: Daten werden beim Schließen des Tabs gelöscht

## Best Practices

### Für normale Nutzung (<100 MB Audio)
- ✅ Einfach nutzen, alles funktioniert automatisch
- ✅ Keine Konfiguration nötig

### Für große Dateien (>100 MB Audio)
- ✅ Funktioniert, aber prüfen Sie Speicher-Limits
- ✅ Verwenden Sie Chrome/Edge für größte Limits
- ⚠️ Export regelmäßig durchführen (Sicherung)

### Für sehr große Dateien (>500 MB Audio)
- ⚠️ Überlegen Sie, Audio zu splitten (z.B. 30-Min-Chunks)
- ⚠️ Speicher-Limits prüfen mit `getStorageEstimate()`
- ✅ Export sofort nach Fertigstellung

## Zukunft: File System Access API

Für noch größere Dateien könnte in Zukunft die **File System Access API** genutzt werden:
- Speichert Dateien direkt auf der Festplatte (außerhalb des Browsers)
- Unbegrenzte Größe
- Nutzer wählt Speicherort

Aktuell noch nicht implementiert, da Browser-Support eingeschränkt.
