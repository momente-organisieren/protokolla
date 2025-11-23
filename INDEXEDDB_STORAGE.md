# IndexedDB Storage für große Audio-Dateien

## Problem gelöst ✅

localStorage hat ein Limit von ~5-10 MB, was für große Audio-Dateien nicht ausreicht. Die neue Implementierung nutzt **IndexedDB**, eine Browser-Datenbank, die viel größere Dateien speichern kann.

## Vorteile von IndexedDB

- **Größe**: Speichert oft bis zu 50% des verfügbaren Festplattenspeichers
- **Performance**: Schneller als Base64-Encoding (kein Konvertieren nötig)
- **Native File Support**: Speichert File-Objekte direkt, ohne Encoding
- **Asynchron**: Blockiert die UI nicht beim Speichern/Laden

## Wie es funktioniert

### 1. Getrennte Speicherung

- **localStorage**: Transkript-Daten, Sprecher-Namen (klein, schnell)
- **IndexedDB**: Audio-Dateien (groß, effizient)

### 2. Automatisches Speichern

Jedes Mal, wenn Sie etwas ändern:
- Transkript → localStorage
- Audio → IndexedDB

### 3. Automatisches Laden

Beim Seitenaufruf:
1. Transkript aus localStorage laden
2. Audio aus IndexedDB laden (parallel)
3. Beide zusammenführen und anzeigen

### 4. Automatische Bereinigung

- Daten älter als 7 Tage werden automatisch gelöscht
- Bei "Neue Transkription" werden beide Speicher geleert

## Speicher-Limits

### localStorage (für Transkript-Daten)
- **Limit**: ~5-10 MB
- **Ausreichend für**: JSON-Daten (Transkript, Sprecher-Namen)

### IndexedDB (für Audio-Dateien)
- **Chrome/Edge**: Bis zu 60% der verfügbaren Festplatte
- **Firefox**: Bis zu 50% der verfügbaren Festplatte
- **Safari**: Bis zu 1 GB (dann fragt der Browser nach Erlaubnis)

**Beispiel bei 100 GB freiem Speicher:**
- Chrome: ~60 GB für IndexedDB verfügbar
- Sie können problemlos Audio-Dateien >500 MB speichern

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
4. Klicken Sie auf "TranscriptorDB" → "audioFiles"
5. Sie sehen die gespeicherte Audio-Datei mit Metadaten

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

Falls Sie bereits Daten im alten Format (mit Base64) haben:
1. Die alten Daten bleiben in localStorage
2. Beim nächsten Speichern wird auf IndexedDB umgestellt
3. Alte Base64-Daten werden nicht automatisch migriert

Um manuell aufzuräumen:

```javascript
// In der Browser-Konsole (F12)
localStorage.clear();
```

## Technische Details

### AudioStorage Klasse (app.js Zeile 8-109)

```javascript
class AudioStorage {
    async saveAudioFile(file)    // Speichert File-Objekt in IndexedDB
    async getAudioFile()          // Lädt File-Objekt aus IndexedDB
    async deleteAudioFile()       // Löscht Audio aus IndexedDB
    async getStorageEstimate()    // Zeigt Speicher-Nutzung
}
```

### Verwendung in Transkriptor Klasse

- **saveToStorage()**: Speichert Transkript (localStorage) + Audio (IndexedDB)
- **loadFromStorage()**: Lädt beide Quellen parallel
- **clearStorage()**: Löscht beide Speicher

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
