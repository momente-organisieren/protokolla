// ============================================
// Transkriptor – Main Application
// ============================================

// ============================================
// IndexedDB Helper - für große Audio-Dateien
// ============================================
class AudioStorage {
    constructor() {
        this.dbName = 'TranscriptorDB';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store für Audio-Dateien
                if (!db.objectStoreNames.contains('audioFiles')) {
                    db.createObjectStore('audioFiles', { keyPath: 'id' });
                }
            };
        });
    }

    async saveAudioFile(file) {
        if (!this.db) {
            console.log('🔧 IndexedDB nicht initialisiert, initialisiere...');
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audioFiles'], 'readwrite');
            const store = transaction.objectStore('audioFiles');

            const data = {
                id: 'current',
                file: file,
                name: file.name,
                type: file.type,
                size: file.size,
                timestamp: Date.now()
            };

            console.log('💾 Schreibe in IndexedDB:', data.name, data.size, 'bytes');

            const request = store.put(data);
            request.onsuccess = () => {
                console.log('✅ IndexedDB Speicherung erfolgreich');
                resolve();
            };
            request.onerror = () => {
                console.error('❌ IndexedDB Speicherung fehlgeschlagen:', request.error);
                reject(request.error);
            };
        });
    }

    async getAudioFile() {
        if (!this.db) {
            console.log('🔧 IndexedDB nicht initialisiert, initialisiere...');
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audioFiles'], 'readonly');
            const store = transaction.objectStore('audioFiles');
            const request = store.get('current');

            request.onsuccess = () => {
                const data = request.result;
                console.log('📂 IndexedDB Abfrage Ergebnis:', data);

                if (data && data.file) {
                    // Prüfe Alter (max 7 Tage)
                    const maxAge = 7 * 24 * 60 * 60 * 1000;
                    const age = Date.now() - data.timestamp;
                    console.log('⏱️ Datei-Alter:', Math.floor(age / 1000 / 60 / 60), 'Stunden');

                    if (age < maxAge) {
                        console.log('✅ Audio-Datei gefunden und gültig:', data.name, data.size, 'bytes');
                        resolve(data.file);
                    } else {
                        console.warn('⚠️ Audio-Datei zu alt, lösche...');
                        this.deleteAudioFile();
                        resolve(null);
                    }
                } else {
                    console.warn('⚠️ Keine Audio-Datei in IndexedDB');
                    resolve(null);
                }
            };
            request.onerror = () => {
                console.error('❌ IndexedDB Abfrage fehlgeschlagen:', request.error);
                reject(request.error);
            };
        });
    }

    async deleteAudioFile() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audioFiles'], 'readwrite');
            const store = transaction.objectStore('audioFiles');
            const request = store.delete('current');

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getStorageEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage,
                quota: estimate.quota,
                usagePercent: (estimate.usage / estimate.quota * 100).toFixed(2)
            };
        }
        return null;
    }
}

// ============================================
// Summary Manager - für KI-Zusammenfassungen
// ============================================
class SummaryManager {
    constructor(transkriptor) {
        this.transkriptor = transkriptor;
        this.ollamaUrl = '/ollama';
        this.summaries = {}; // Objekt mit allen generierten Zusammenfassungen { short: {...}, structured: {...}, etc. }
        this.currentType = 'short'; // Aktuell angezeigter Typ
        this.model = 'qwen2.5:7b';
    }

    async generateSummary(type) {
        const transcriptText = this.getTranscriptText();
        if (!transcriptText) {
            this.transkriptor.showToast('Kein Transkript verfügbar', 'error');
            return;
        }

        const prompt = this.buildPrompt(type, transcriptText);

        try {
            this.showLoading();
            const summary = await this.streamFromOllama(prompt);

            // Speichere Summary im Objekt nach Typ
            this.summaries[type] = {
                type,
                text: summary,
                timestamp: Date.now()
            };
            this.currentType = type;

            this.showSummary(summary);
            this.transkriptor.showToast('Zusammenfassung erstellt', 'success');

            // Auto-Save aller Zusammenfassungen
            await this.transkriptor.saveToStorage();
            console.log('✅ Zusammenfassung gespeichert:', type);
        } catch (error) {
            console.error('Summary generation error:', error);
            this.transkriptor.showToast(`Fehler: ${error.message}`, 'error');
            this.showPlaceholder();
        }
    }

    getTranscriptText() {
        if (!this.transkriptor.transcriptData) return null;

        if (this.transkriptor.transcriptData.segments) {
            return this.transkriptor.transcriptData.segments.map(seg => {
                const speaker = seg.speaker ?
                    `[${this.transkriptor.speakerNames[seg.speaker] || seg.speaker}] ` : '';
                const time = this.transkriptor.formatTime(seg.start);
                return `[${time}] ${speaker}${seg.text}`;
            }).join('\n\n');
        }

        return this.transkriptor.transcriptData.text || '';
    }

    buildPrompt(type, transcriptText) {
        const prompts = {
            short: `Du bist ein professioneller Transkript-Zusammenfasser. Erstelle eine präzise Zusammenfassung des folgenden Transkripts in genau 3-5 Sätzen. Konzentriere dich auf die Hauptthemen und wichtigsten Erkenntnisse.

Transkript:
${transcriptText}

Gib nur die Zusammenfassung aus, ohne zusätzliche Kommentare.`,

            structured: `Analysiere das folgende Transkript und erstelle eine strukturierte Zusammenfassung in diesem Format:

## Hauptthema
[Ein Satz, der das Gesamtthema beschreibt]

## Kernpunkte
- [Erster Hauptpunkt]
- [Zweiter Hauptpunkt]
- [Dritter Hauptpunkt]

## Fazit
[Ein Satz, der das Ergebnis oder die Schlussfolgerung zusammenfasst]

Transkript:
${transcriptText}`,

            timeline: `Erstelle eine chronologische Zusammenfassung dieses Transkripts mit Zeitstempeln. Für jedes wichtige Thema oder Ereignis, gib den Zeitstempel an, wann es beginnt.

Format:
[MM:SS] Beschreibung des Themas/Ereignisses

Transkript mit Zeitstempeln:
${transcriptText}

Gib eine chronologische Zusammenfassung mit den wichtigsten Momenten und deren Zeitstempeln aus.`,

            actions: `Extrahiere alle Aufgaben und Action Items aus dem folgenden Transkript. Formatiere sie als Checkliste.

Transkript:
${transcriptText}

Liste alle Action Items in diesem Format auf:
- [ ] Aufgabe mit verantwortlicher Person (falls erwähnt)

Konzentriere dich nur auf konkrete, umsetzbare Aufgaben. Falls keine Action Items vorhanden sind, antworte mit "Keine Action Items identifiziert."`,

            tags: `Analysiere das folgende Transkript und extrahiere die wichtigsten Schlagworte und Themen. Erstelle eine Liste von relevanten Tags, die den Inhalt gut beschreiben.

Transkript:
${transcriptText}

Gib die Tags in diesem Format aus (sortiert nach Relevanz, maximal 10-15 Tags):
#Tag1 #Tag2 #Tag3 #Tag4 #Tag5

Konzentriere dich auf konkrete Themen, Fachbegriffe, Personen, Orte und zentrale Konzepte. Gib nur die Tags aus, ohne zusätzliche Erklärungen.`
        };

        return prompts[type] || prompts.short;
    }

    async streamFromOllama(prompt) {
        const response = await fetch(`${this.ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                prompt: prompt,
                stream: true,
                options: {
                    temperature: 0.7,
                    num_predict: 1000
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API Fehler: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let summary = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.response) {
                        summary += json.response;
                        this.updateSummaryDisplay(summary);
                    }
                } catch (e) {
                    console.warn('Failed to parse JSON line:', line);
                }
            }
        }

        return summary;
    }

    showLoading() {
        const placeholder = document.getElementById('summaryPlaceholder');
        const loading = document.getElementById('summaryLoading');
        const text = document.getElementById('summaryText');
        const actions = document.getElementById('summaryActions');

        placeholder.classList.add('hidden');
        loading.classList.remove('hidden');
        text.classList.add('hidden');
        actions.classList.add('hidden');
    }

    showPlaceholder() {
        const placeholder = document.getElementById('summaryPlaceholder');
        const loading = document.getElementById('summaryLoading');
        const text = document.getElementById('summaryText');
        const actions = document.getElementById('summaryActions');

        placeholder.classList.remove('hidden');
        loading.classList.add('hidden');
        text.classList.add('hidden');
        actions.classList.add('hidden');
    }

    updateSummaryDisplay(summary) {
        const loading = document.getElementById('summaryLoading');
        const text = document.getElementById('summaryText');

        loading.classList.add('hidden');
        text.classList.remove('hidden');
        text.textContent = summary;
    }

    showSummary(summary) {
        const placeholder = document.getElementById('summaryPlaceholder');
        const loading = document.getElementById('summaryLoading');
        const text = document.getElementById('summaryText');
        const actions = document.getElementById('summaryActions');

        placeholder.classList.add('hidden');
        loading.classList.add('hidden');
        text.classList.remove('hidden');
        text.textContent = summary;
        actions.classList.remove('hidden');
    }

    // Wechsle zu einem anderen Summary-Typ (zeige gespeicherte Summary an, falls vorhanden)
    switchSummaryType(type) {
        this.currentType = type;

        if (this.summaries[type]) {
            // Gespeicherte Summary vorhanden - direkt anzeigen
            this.showSummary(this.summaries[type].text);
            console.log('📋 Gespeicherte Zusammenfassung geladen:', type);
        } else {
            // Keine gespeicherte Summary - zeige Placeholder
            this.showPlaceholder();
        }
    }

    copySummary() {
        const currentSummary = this.summaries[this.currentType];
        if (!currentSummary) return;

        navigator.clipboard.writeText(currentSummary.text).then(() => {
            this.transkriptor.showToast('In Zwischenablage kopiert', 'success');
        }).catch(err => {
            this.transkriptor.showToast('Kopieren fehlgeschlagen', 'error');
        });
    }

    exportSummary() {
        const currentSummary = this.summaries[this.currentType];
        if (!currentSummary) return;

        const filename = `zusammenfassung_${currentSummary.type}_${new Date().toISOString().slice(0, 10)}`;
        const content = currentSummary.text;

        this.transkriptor.downloadFile(content, `${filename}.txt`, 'text/plain');
        this.transkriptor.showToast('Zusammenfassung exportiert', 'success');
    }
}

class Transkriptor {
    constructor() {
        this.apiUrl = '/api';
        this.transcriptData = null;
        this.speakerNames = {};
        this.audioFile = null;
        this.audioBlob = null;
        this.audioStorage = new AudioStorage();
        this.selectedSegments = new Set();
        this.lastClickedIndex = null;
        this.summaryManager = new SummaryManager(this);

        this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        this.checkApiStatus();
        await this.loadFromStorage();
    }

    cacheElements() {
        // Sections
        this.uploadSection = document.getElementById('uploadSection');
        this.progressSection = document.getElementById('progressSection');
        this.editorSection = document.getElementById('editorSection');

        // Upload
        this.uploadZone = document.getElementById('uploadZone');
        this.fileInput = document.getElementById('fileInput');

        // Options
        this.languageSelect = document.getElementById('languageSelect');
        this.minSpeakers = document.getElementById('minSpeakers');
        this.maxSpeakers = document.getElementById('maxSpeakers');
        this.diarizeCheck = document.getElementById('diarizeCheck');
        this.wordTimestamps = document.getElementById('wordTimestamps');

        // Progress
        this.progressTitle = document.getElementById('progressTitle');
        this.progressText = document.getElementById('progressText');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');

        // Editor
        this.speakerList = document.getElementById('speakerList');
        this.addSpeakerBtn = document.getElementById('addSpeakerBtn');
        this.transcriptEditor = document.getElementById('transcriptEditor');
        this.exportBtn = document.getElementById('exportBtn');
        this.exportMenu = document.getElementById('exportMenu');
        this.newTranscriptBtn = document.getElementById('newTranscript');

        // Stats
        this.wordCountEl = document.getElementById('wordCount');
        this.segmentCountEl = document.getElementById('segmentCount');
        this.durationEl = document.getElementById('duration');

        // Status
        this.apiStatus = document.getElementById('apiStatus');
        this.apiStatusText = document.getElementById('apiStatusText');

        // Toast
        this.toastContainer = document.getElementById('toastContainer');

        // Audio Player
        this.audioPlayerPanel = document.getElementById('audioPlayerPanel');
        this.audioPlayer = document.getElementById('audioPlayer');
        this.audioPlayBtn = document.getElementById('audioPlayBtn');
        this.audioSeek = document.getElementById('audioSeek');
        this.audioCurrentTime = document.getElementById('audioCurrentTime');
        this.audioDuration = document.getElementById('audioDuration');
        this.volumeSlider = document.getElementById('volumeSlider');

        // Bulk Edit
        this.bulkEditToolbar = document.getElementById('bulkEditToolbar');
        this.bulkEditCount = document.getElementById('bulkEditCount');
        this.bulkSpeakerSelect = document.getElementById('bulkSpeakerSelect');
        this.bulkApplyBtn = document.getElementById('bulkApplyBtn');
        this.bulkCancelBtn = document.getElementById('bulkCancelBtn');

        // Help Modal
        this.helpBtn = document.getElementById('helpBtn');
        this.helpModal = document.getElementById('helpModal');
        this.helpModalClose = document.getElementById('helpModalClose');

        // Summary Panel
        this.summaryPanel = document.getElementById('summaryPanel');
        this.summaryType = document.getElementById('summaryType');
        this.generateSummaryBtn = document.getElementById('generateSummaryBtn');
        this.copySummaryBtn = document.getElementById('copySummaryBtn');
        this.exportSummaryBtn = document.getElementById('exportSummaryBtn');
        this.regenerateSummaryBtn = document.getElementById('regenerateSummaryBtn');

        // Tabs
        this.tabButtons = document.querySelectorAll('.tab-btn');
        this.tabPanes = {
            transcript: document.getElementById('transcriptTab'),
            summary: document.getElementById('summaryTab')
        };
    }

    bindEvents() {
        // Upload Zone
        this.uploadZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag & Drop
        this.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadZone.classList.add('dragover');
        });

        this.uploadZone.addEventListener('dragleave', () => {
            this.uploadZone.classList.remove('dragover');
        });

        this.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length) {
                this.processFile(files[0]);
            }
        });

        // Export
        this.exportBtn.addEventListener('click', () => {
            this.exportMenu.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!this.exportBtn.contains(e.target) && !this.exportMenu.contains(e.target)) {
                this.exportMenu.classList.remove('show');
            }
        });

        this.exportMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                this.exportTranscript(btn.dataset.format);
                this.exportMenu.classList.remove('show');
            });
        });

        // New Transcript
        this.newTranscriptBtn.addEventListener('click', () => this.resetToUpload());

        // Add Speaker
        this.addSpeakerBtn.addEventListener('click', () => this.addNewSpeaker());

        // Audio Player Events
        this.audioPlayBtn.addEventListener('click', () => this.toggleAudioPlayback());
        this.audioSeek.addEventListener('input', (e) => {
            const time = (e.target.value / 100) * this.audioPlayer.duration;
            this.audioPlayer.currentTime = time;
        });
        this.volumeSlider.addEventListener('input', (e) => {
            this.audioPlayer.volume = e.target.value / 100;
        });
        this.audioPlayer.addEventListener('timeupdate', () => this.updateAudioProgress());
        this.audioPlayer.addEventListener('loadedmetadata', () => this.onAudioLoaded());
        this.audioPlayer.addEventListener('play', () => this.audioPlayBtn.classList.add('playing'));
        this.audioPlayer.addEventListener('pause', () => this.audioPlayBtn.classList.remove('playing'));

        // Bulk Edit Events
        this.bulkApplyBtn.addEventListener('click', () => this.applyBulkSpeakerChange());
        this.bulkCancelBtn.addEventListener('click', () => this.cancelBulkSelection());

        // Help Modal Events
        this.helpBtn.addEventListener('click', () => this.openHelpModal());
        this.helpModalClose.addEventListener('click', () => this.closeHelpModal());
        this.helpModal.addEventListener('click', (e) => {
            if (e.target === this.helpModal) {
                this.closeHelpModal();
            }
        });

        // Close help modal with ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.helpModal.classList.contains('hidden')) {
                this.closeHelpModal();
            }
        });

        // Summary Panel Events
        this.summaryType.addEventListener('change', () => {
            const type = this.summaryType.value;
            this.summaryManager.switchSummaryType(type);
        });
        this.generateSummaryBtn.addEventListener('click', () => {
            const type = this.summaryType.value;
            this.summaryManager.generateSummary(type);
        });
        this.copySummaryBtn.addEventListener('click', () => this.summaryManager.copySummary());
        this.exportSummaryBtn.addEventListener('click', () => this.summaryManager.exportSummary());
        this.regenerateSummaryBtn.addEventListener('click', () => {
            const type = this.summaryType.value;
            this.summaryManager.generateSummary(type);
        });

        // Tab Switching Events
        this.tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Remove active class from all buttons
        this.tabButtons.forEach(btn => btn.classList.remove('active'));

        // Add active class to clicked button
        const activeBtn = Array.from(this.tabButtons).find(btn => btn.dataset.tab === tabName);
        if (activeBtn) activeBtn.classList.add('active');

        // Hide all panes
        Object.values(this.tabPanes).forEach(pane => {
            pane.classList.remove('active');
            pane.classList.add('hidden');
        });

        // Show selected pane
        if (this.tabPanes[tabName]) {
            this.tabPanes[tabName].classList.remove('hidden');
            this.tabPanes[tabName].classList.add('active');
        }
    }

    async checkApiStatus() {
        try {
            // Einfacher GET auf root - folge dem Redirect zu /docs
            const response = await fetch(`${this.apiUrl}/`, {
                method: 'GET',
                redirect: 'follow'
            });
            if (response.ok) {
                this.apiStatus.classList.add('connected');
                this.apiStatus.classList.remove('error');
                this.apiStatusText.textContent = 'API verbunden';
            } else {
                throw new Error('API nicht erreichbar');
            }
        } catch (error) {
            this.apiStatus.classList.add('error');
            this.apiStatus.classList.remove('connected');
            this.apiStatusText.textContent = 'API offline';
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.processFile(file);
        }
    }

    async processFile(file) {
        // Validate file
        const validTypes = ['audio/', 'video/'];
        if (!validTypes.some(type => file.type.startsWith(type))) {
            this.showToast('Bitte eine Audio- oder Videodatei auswählen', 'error');
            return;
        }

        // Store audio file for playback
        this.audioFile = file;
        this.audioBlob = URL.createObjectURL(file);

        // Show progress
        this.showSection('progress');
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);

        // Build form data
        const formData = new FormData();
        formData.append('audio_file', file);

        // Build query params
        const params = new URLSearchParams();
        params.set('output', 'json');

        if (this.languageSelect.value) {
            params.set('language', this.languageSelect.value);
        }

        if (this.diarizeCheck.checked) {
            params.set('diarize', 'true');
            params.set('min_speakers', this.minSpeakers.value);
            params.set('max_speakers', this.maxSpeakers.value);
        }

        if (this.wordTimestamps.checked) {
            params.set('word_timestamps', 'true');
        }

        try {
            this.progressTitle.textContent = 'Transkribiere...';
            this.progressText.textContent = 'Dies kann je nach Dateigröße einige Minuten dauern';

            const response = await fetch(`${this.apiUrl}/asr?${params.toString()}`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Fehler ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            this.transcriptData = data;

            this.showEditor();
            this.showToast('Transkription erfolgreich!', 'success');

        } catch (error) {
            console.error('Transcription error:', error);
            this.showToast(`Fehler: ${error.message}`, 'error');
            this.showSection('upload');
        }
    }

    showEditor() {
        this.showSection('editor');
        this.renderSpeakers();
        this.renderTranscript();
        this.updateStats();
        this.loadAudioPlayer();
        this.showSummaryPanel();
        this.saveToStorage();
    }

    showSummaryPanel() {
        if (this.summaryPanel) {
            this.summaryPanel.classList.remove('hidden');
        }
    }

    loadAudioPlayer() {
        if (this.audioBlob) {
            this.audioPlayer.src = this.audioBlob;
            this.audioPlayerPanel.classList.remove('hidden');
            this.audioPlayer.volume = 0.8; // 80%
        }
    }

    renderSpeakers() {
        // Extract unique speakers
        const speakers = new Set();
        if (this.transcriptData.segments) {
            this.transcriptData.segments.forEach(seg => {
                if (seg.speaker) {
                    speakers.add(seg.speaker);
                }
            });
        }

        // Initialize speaker names
        speakers.forEach(speaker => {
            if (!this.speakerNames[speaker]) {
                this.speakerNames[speaker] = speaker;
            }
        });

        // Render speaker inputs
        this.speakerList.innerHTML = '';
        Array.from(speakers).sort().forEach((speaker, index) => {
            const item = document.createElement('div');
            item.className = 'speaker-item';
            // noinspection CssUnresolvedCustomProperty
            item.innerHTML = `
                <div class="speaker-color" style="background: var(--speaker-${index % 8})"></div>
                <input type="text" 
                       value="${this.speakerNames[speaker]}" 
                       data-speaker="${speaker}"
                       placeholder="${speaker}">
            `;

            const input = item.querySelector('input');
            input.addEventListener('change', (e) => {
                this.speakerNames[speaker] = e.target.value || speaker;
                this.updateSpeakerLabels(speaker);
                this.saveToStorage();
            });

            this.speakerList.appendChild(item);
        });

        // Hide speaker panel if no diarization
        const speakerPanel = document.getElementById('speakerPanel');
        speakerPanel.style.display = speakers.size > 0 ? 'block' : 'none';
    }

    addNewSpeaker() {
        // Finde die höchste SPEAKER_XX Nummer
        const existingSpeakers = Object.keys(this.speakerNames);
        let maxNumber = -1;

        existingSpeakers.forEach(speaker => {
            const match = speaker.match(/^SPEAKER_(\d+)$/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxNumber) maxNumber = num;
            }
        });

        // Erstelle neuen Sprecher mit nächster Nummer
        const newSpeakerId = `SPEAKER_${String(maxNumber + 1).padStart(2, '0')}`;
        this.speakerNames[newSpeakerId] = newSpeakerId;

        // Berechne Index für Farbe
        const speakerIndex = Object.keys(this.speakerNames).sort().indexOf(newSpeakerId);

        // Erstelle neues Speaker-Item
        const item = document.createElement('div');
        item.className = 'speaker-item';
        // noinspection CssUnresolvedCustomProperty
        item.innerHTML = `
            <div class="speaker-color" style="background: var(--speaker-${speakerIndex % 8})"></div>
            <input type="text"
                   value="${newSpeakerId}"
                   data-speaker="${newSpeakerId}"
                   placeholder="${newSpeakerId}">
        `;

        const input = item.querySelector('input');
        input.addEventListener('change', (e) => {
            this.speakerNames[newSpeakerId] = e.target.value || newSpeakerId;
            this.updateSpeakerLabels(newSpeakerId);
            this.saveToStorage();
        });

        // Füge zum DOM hinzu
        this.speakerList.appendChild(item);

        // Update alle Dropdown-Menüs
        this.updateAllDropdownOptions();

        // Speichern
        this.saveToStorage();

        this.showToast(`Sprecher ${newSpeakerId} hinzugefügt`, 'success');

        // Fokus auf neues Input-Feld
        input.focus();
        input.select();
    }

    updateAllDropdownOptions() {
        // Aktualisiere alle Dropdowns mit der neuen Sprecher-Liste
        const allSpeakers = Object.keys(this.speakerNames).sort();
        const allDropdowns = this.transcriptEditor.querySelectorAll('.segment-speaker-select');

        allDropdowns.forEach(dropdown => {
            const currentValue = dropdown.value;

            // Lösche alte Optionen
            dropdown.innerHTML = '';

            // Füge alle Sprecher als Optionen hinzu
            allSpeakers.forEach(spk => {
                const option = document.createElement('option');
                option.value = spk;
                option.textContent = this.speakerNames[spk] || spk;
                option.selected = (spk === currentValue);
                dropdown.appendChild(option);
            });
        });
    }

    updateSpeakerLabels(speakerId) {
        // Update all dropdown options for this speaker
        const allDropdowns = this.transcriptEditor.querySelectorAll('.segment-speaker-select');
        allDropdowns.forEach(dropdown => {
            const options = dropdown.querySelectorAll('option');
            options.forEach(option => {
                if (option.value === speakerId) {
                    option.textContent = this.speakerNames[speakerId];
                }
            });
        });
    }

    renderTranscript() {
        this.transcriptEditor.innerHTML = '';

        if (!this.transcriptData.segments || this.transcriptData.segments.length === 0) {
            // Fallback: just show full text
            const segment = document.createElement('div');
            segment.className = 'segment';
            segment.innerHTML = `
                <div class="segment-meta">
                    <div class="segment-time">00:00:00</div>
                </div>
                <div class="segment-text" contenteditable="true">${this.transcriptData.text || ''}</div>
            `;
            this.transcriptEditor.appendChild(segment);
            return;
        }

        // Get all unique speakers for dropdown
        const allSpeakers = Object.keys(this.speakerNames).sort();

        this.transcriptData.segments.forEach((seg, index) => {
            const speakerIndex = this.getSpeakerIndex(seg.speaker);
            const segment = document.createElement('div');
            segment.className = 'segment';
            segment.dataset.index = index;

            // Build speaker dropdown options
            let speakerOptions = '';
            if (seg.speaker) {
                speakerOptions = allSpeakers.map(spk =>
                    `<option value="${spk}" ${spk === seg.speaker ? 'selected' : ''}>${this.speakerNames[spk] || spk}</option>`
                ).join('');
            }

            segment.innerHTML = `
                <div class="segment-meta">
                    ${seg.speaker ? `
                        <select class="segment-speaker-select speaker-${speakerIndex}" data-index="${index}" title="${this.speakerNames[seg.speaker] || seg.speaker}">
                            ${speakerOptions}
                        </select>
                    ` : ''}
                    <div class="segment-time">${this.formatTime(seg.start)} → ${this.formatTime(seg.end)}</div>
                </div>
                <div class="segment-text" contenteditable="true" data-index="${index}">${seg.text}</div>
            `;

            // Track speaker changes
            if (seg.speaker) {
                const speakerSelect = segment.querySelector('.segment-speaker-select');
                speakerSelect.addEventListener('change', (e) => {
                    const newSpeaker = e.target.value;
                    this.transcriptData.segments[index].speaker = newSpeaker;
                    // Update class for color
                    const newSpeakerIndex = this.getSpeakerIndex(newSpeaker);
                    speakerSelect.className = `segment-speaker-select speaker-${newSpeakerIndex}`;
                    this.showToast(`Sprecher geändert zu ${this.speakerNames[newSpeaker]}`, 'success');
                    this.saveToStorage();
                });
            }

            // Track text changes
            const textEl = segment.querySelector('.segment-text');
            textEl.addEventListener('blur', (e) => {
                this.transcriptData.segments[index].text = e.target.textContent;
                this.updateStats();
                this.saveToStorage();
            });

            // Click segment for multi-select or play audio
            segment.addEventListener('click', (e) => {
                // Don't trigger if clicking on dropdown or editable text
                if (e.target.closest('.segment-speaker-select') || e.target.closest('.segment-text')) {
                    return;
                }

                // Multi-select with Shift or Ctrl
                if (e.shiftKey || e.ctrlKey) {
                    e.preventDefault();
                    this.handleSegmentSelection(index, e.shiftKey, e.ctrlKey);
                } else {
                    this.playSegment(seg);
                }
            });

            this.transcriptEditor.appendChild(segment);
        });
    }

    getSpeakerIndex(speaker) {
        if (!speaker) return 0;
        const speakers = Object.keys(this.speakerNames).sort();
        return speakers.indexOf(speaker) % 8;
    }

    updateStats() {
        // Word count
        let totalWords = 0;
        if (this.transcriptData.segments) {
            this.transcriptData.segments.forEach(seg => {
                totalWords += (seg.text || '').split(/\s+/).filter(w => w).length;
            });
        } else if (this.transcriptData.text) {
            totalWords = this.transcriptData.text.split(/\s+/).filter(w => w).length;
        }
        this.wordCountEl.textContent = `${totalWords} Wörter`;

        // Segment count
        const segmentCount = this.transcriptData.segments?.length || 1;
        this.segmentCountEl.textContent = `${segmentCount} Segmente`;

        // Duration
        let duration = 0;
        if (this.transcriptData.segments?.length) {
            const lastSeg = this.transcriptData.segments[this.transcriptData.segments.length - 1];
            duration = lastSeg.end || 0;
        }
        this.durationEl.textContent = this.formatTime(duration);
    }

    exportTranscript(format) {
        const filename = `transkript_${new Date().toISOString().slice(0,10)}`;

        switch (format) {
            case 'txt':
                this.downloadFile(this.generateTxt(), `${filename}.txt`, 'text/plain');
                break;
            case 'srt':
                this.downloadFile(this.generateSrt(), `${filename}.srt`, 'text/plain');
                break;
            case 'vtt':
                this.downloadFile(this.generateVtt(), `${filename}.vtt`, 'text/vtt');
                break;
            case 'json':
                this.downloadFile(JSON.stringify(this.transcriptData, null, 2), `${filename}.json`, 'application/json');
                break;
            case 'docx':
                this.generateDocx(filename);
                break;
        }

        this.showToast(`Export als ${format.toUpperCase()} erfolgreich`, 'success');
    }

    generateTxt() {
        let output = '';

        if (this.transcriptData.segments) {
            this.transcriptData.segments.forEach(seg => {
                const speaker = seg.speaker ? `[${this.speakerNames[seg.speaker] || seg.speaker}] ` : '';
                output += `${speaker}${seg.text}\n\n`;
            });
        } else {
            output = this.transcriptData.text || '';
        }

        return output.trim();
    }

    generateSrt() {
        let output = '';

        if (this.transcriptData.segments) {
            this.transcriptData.segments.forEach((seg, index) => {
                const speaker = seg.speaker ? `[${this.speakerNames[seg.speaker] || seg.speaker}] ` : '';
                output += `${index + 1}\n`;
                output += `${this.formatSrtTime(seg.start)} --> ${this.formatSrtTime(seg.end)}\n`;
                output += `${speaker}${seg.text}\n\n`;
            });
        }

        return output.trim();
    }

    generateVtt() {
        let output = 'WEBVTT\n\n';

        if (this.transcriptData.segments) {
            this.transcriptData.segments.forEach((seg, index) => {
                const speaker = seg.speaker ? `<v ${this.speakerNames[seg.speaker] || seg.speaker}>` : '';
                output += `${index + 1}\n`;
                output += `${this.formatVttTime(seg.start)} --> ${this.formatVttTime(seg.end)}\n`;
                output += `${speaker}${seg.text}\n\n`;
            });
        }

        return output.trim();
    }

    generateDocx(filename) {
        // Simple HTML-based approach that Word can open
        let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Transkript</title>
    <style>
        body { font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.5; }
        h1 { font-size: 16pt; margin-bottom: 20pt; }
        .segment { margin-bottom: 12pt; }
        .speaker { font-weight: bold; color: #333; }
        .time { color: #666; font-size: 9pt; }
        .text { margin-left: 0; }
    </style>
</head>
<body>
    <h1>Transkript</h1>
    <p><em>Erstellt am ${new Date().toLocaleDateString('de-DE')}</em></p>
    <hr>
`;

        if (this.transcriptData.segments) {
            this.transcriptData.segments.forEach(seg => {
                const speaker = seg.speaker ? this.speakerNames[seg.speaker] || seg.speaker : '';
                html += `
    <div class="segment">
        ${speaker ? `<span class="speaker">${speaker}:</span>` : ''}
        <span class="time">[${this.formatTime(seg.start)}]</span>
        <p class="text">${seg.text}</p>
    </div>`;
            });
        } else {
            html += `<p>${this.transcriptData.text || ''}</p>`;
        }

        html += `
</body>
</html>`;

        // Download as .doc (Word can open HTML files)
        this.downloadFile(html, `${filename}.doc`, 'application/msword');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showSection(section) {
        this.uploadSection.classList.add('hidden');
        this.progressSection.classList.add('hidden');
        this.editorSection.classList.add('hidden');

        switch (section) {
            case 'upload':
                this.uploadSection.classList.remove('hidden');
                break;
            case 'progress':
                this.progressSection.classList.remove('hidden');
                break;
            case 'editor':
                this.editorSection.classList.remove('hidden');
                break;
        }
    }

    resetToUpload() {
        this.transcriptData = null;
        this.speakerNames = {};
        this.fileInput.value = '';
        this.clearStorage();
        this.showSection('upload');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    formatTime(seconds) {
        if (!seconds && seconds !== 0) return '00:00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    formatSrtTime(seconds) {
        if (!seconds && seconds !== 0) return '00:00:00,000';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }

    formatVttTime(seconds) {
        if (!seconds && seconds !== 0) return '00:00:00.000';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    // ============================================
    // Audio Player
    // ============================================

    toggleAudioPlayback() {
        if (this.audioPlayer.paused) {
            this.audioPlayer.play();
        } else {
            this.audioPlayer.pause();
        }
    }

    playSegment(segment) {
        if (!segment || !segment.start) return;

        // Highlight playing segment
        const segments = this.transcriptEditor.querySelectorAll('.segment');
        segments.forEach(s => s.classList.remove('playing'));
        const targetSegment = this.transcriptEditor.querySelector(`[data-index="${this.transcriptData.segments.indexOf(segment)}"]`);
        if (targetSegment) {
            targetSegment.classList.add('playing');
        }

        // Jump to time and play
        this.audioPlayer.currentTime = segment.start;
        this.audioPlayer.play();
    }

    updateAudioProgress() {
        const current = this.audioPlayer.currentTime;
        const duration = this.audioPlayer.duration;

        if (!isNaN(duration)) {
            this.audioSeek.value = (current / duration) * 100;
            this.audioCurrentTime.textContent = this.formatAudioTime(current);
        }

        // Highlight current segment
        if (this.transcriptData && this.transcriptData.segments) {
            const currentSegment = this.transcriptData.segments.find(seg =>
                current >= seg.start && current <= seg.end
            );

            const segments = this.transcriptEditor.querySelectorAll('.segment');
            segments.forEach((seg, index) => {
                if (currentSegment && this.transcriptData.segments[index] === currentSegment) {
                    seg.classList.add('playing');
                } else {
                    seg.classList.remove('playing');
                }
            });
        }
    }

    onAudioLoaded() {
        const duration = this.audioPlayer.duration;
        if (!isNaN(duration)) {
            this.audioDuration.textContent = this.formatAudioTime(duration);
        }
    }

    formatAudioTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // ============================================
    // LocalStorage - Persistenz
    // ============================================

    async saveToStorage() {
        if (!this.transcriptData) return;

        const dataToSave = {
            transcriptData: this.transcriptData,
            speakerNames: this.speakerNames,
            summaries: this.summaryManager.summaries || {},
            timestamp: Date.now()
        };

        // Transkript-Daten in localStorage speichern (ohne Audio)
        try {
            localStorage.setItem('transcriptor_current', JSON.stringify(dataToSave));
            console.log('✅ Transkript in localStorage gespeichert');
        } catch (e) {
            console.error('❌ Fehler beim Speichern:', e);
            this.showToast('Speichern fehlgeschlagen', 'error');
            return;
        }

        // Audio-Datei separat in IndexedDB speichern (für große Dateien)
        if (this.audioFile) {
            try {
                console.log('💾 Speichere Audio in IndexedDB:', this.audioFile.name, this.audioFile.size, 'bytes');
                await this.audioStorage.saveAudioFile(this.audioFile);
                console.log('✅ Audio in IndexedDB gespeichert');
            } catch (e) {
                console.error('❌ Audio konnte nicht in IndexedDB gespeichert werden:', e);
                // Nicht kritisch - Transkript ist trotzdem gespeichert
            }
        } else {
            console.warn('⚠️ Keine Audio-Datei zum Speichern vorhanden');
        }
    }

    async loadFromStorage() {
        try {
            const saved = localStorage.getItem('transcriptor_current');
            if (!saved) {
                console.log('ℹ️ Keine gespeicherten Daten gefunden');
                return;
            }

            const data = JSON.parse(saved);
            console.log('📂 localStorage Daten gefunden:', data);

            // Prüfe ob Daten vorhanden und nicht zu alt (max. 7 Tage)
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 Tage
            if (data.timestamp && (Date.now() - data.timestamp) < maxAge) {
                this.transcriptData = data.transcriptData;
                this.speakerNames = data.speakerNames || {};
                console.log('✅ Transkript-Daten geladen');

                // Zusammenfassungen wiederherstellen
                if (data.summaries && Object.keys(data.summaries).length > 0) {
                    // Neues Format: Mehrere Summaries
                    this.summaryManager.summaries = data.summaries;
                    console.log('✅ Zusammenfassungen geladen:', Object.keys(data.summaries).join(', '));
                } else if (data.summary) {
                    // Altes Format: Einzelne Summary (Rückwärtskompatibilität)
                    this.summaryManager.summaries[data.summary.type] = data.summary;
                    console.log('✅ Zusammenfassung geladen (alt):', data.summary.type);
                }

                // Audio aus IndexedDB wiederherstellen
                try {
                    console.log('🔍 Suche Audio in IndexedDB...');
                    const audioFile = await this.audioStorage.getAudioFile();
                    if (audioFile) {
                        this.audioFile = audioFile;
                        this.audioBlob = URL.createObjectURL(audioFile);
                        console.log('✅ Audio aus IndexedDB geladen:', audioFile.name, audioFile.size, 'bytes');
                    } else {
                        console.warn('⚠️ Keine Audio-Datei in IndexedDB gefunden');
                    }
                } catch (e) {
                    console.error('❌ Audio konnte nicht geladen werden:', e);
                    // Nicht kritisch - Transkript wird trotzdem angezeigt
                }

                this.showEditor();

                // Zusammenfassung im UI anzeigen (falls vorhanden)
                // Zeige die erste verfügbare Zusammenfassung oder die vom aktuellen Typ
                const currentType = this.summaryType.value || 'short';
                if (this.summaryManager.summaries[currentType]) {
                    this.summaryManager.switchSummaryType(currentType);
                } else {
                    // Zeige erste verfügbare Zusammenfassung
                    const firstType = Object.keys(this.summaryManager.summaries)[0];
                    if (firstType) {
                        this.summaryType.value = firstType;
                        this.summaryManager.switchSummaryType(firstType);
                    }
                }

                this.showToast('Letzte Transkription wiederhergestellt', 'success');
            } else {
                console.warn('⚠️ Gespeicherte Daten sind zu alt (>7 Tage)');
            }
        } catch (e) {
            console.error('❌ Fehler beim Laden:', e);
        }
    }

    async clearStorage() {
        localStorage.removeItem('transcriptor_current');

        // Audio aus IndexedDB löschen
        try {
            await this.audioStorage.deleteAudioFile();
        } catch (e) {
            console.warn('Fehler beim Löschen der Audio-Datei:', e);
        }
    }

    // ============================================
    // Multi-Select & Bulk Edit
    // ============================================

    handleSegmentSelection(index, isShift, isCtrl) {
        if (isShift && this.lastClickedIndex !== null) {
            // Shift+Click: Select range
            const start = Math.min(this.lastClickedIndex, index);
            const end = Math.max(this.lastClickedIndex, index);
            for (let i = start; i <= end; i++) {
                this.selectedSegments.add(i);
            }
        } else if (isCtrl) {
            // Ctrl+Click: Toggle single segment
            if (this.selectedSegments.has(index)) {
                this.selectedSegments.delete(index);
            } else {
                this.selectedSegments.add(index);
            }
        }

        this.lastClickedIndex = index;
        this.updateSegmentSelection();
    }

    updateSegmentSelection() {
        // Update visual selection
        const segments = this.transcriptEditor.querySelectorAll('.segment');
        segments.forEach((seg, index) => {
            if (this.selectedSegments.has(index)) {
                seg.classList.add('selected');
            } else {
                seg.classList.remove('selected');
            }
        });

        // Show/hide bulk edit toolbar
        if (this.selectedSegments.size > 0) {
            this.showBulkEditToolbar();
        } else {
            this.hideBulkEditToolbar();
        }
    }

    showBulkEditToolbar() {
        this.bulkEditCount.textContent = `${this.selectedSegments.size} Segment${this.selectedSegments.size === 1 ? '' : 'e'} ausgewählt`;

        // Populate speaker dropdown
        const allSpeakers = Object.keys(this.speakerNames).sort();
        this.bulkSpeakerSelect.innerHTML = '';
        allSpeakers.forEach(spk => {
            const option = document.createElement('option');
            option.value = spk;
            option.textContent = this.speakerNames[spk] || spk;
            this.bulkSpeakerSelect.appendChild(option);
        });

        this.bulkEditToolbar.classList.remove('hidden');
    }

    hideBulkEditToolbar() {
        this.bulkEditToolbar.classList.add('hidden');
    }

    applyBulkSpeakerChange() {
        const newSpeaker = this.bulkSpeakerSelect.value;
        if (!newSpeaker) return;

        let changedCount = 0;
        this.selectedSegments.forEach(index => {
            if (this.transcriptData.segments[index]) {
                this.transcriptData.segments[index].speaker = newSpeaker;
                changedCount++;
            }
        });

        // Re-render to update UI
        this.renderTranscript();
        this.cancelBulkSelection();
        this.saveToStorage();

        this.showToast(`${changedCount} Segment${changedCount === 1 ? '' : 'e'} zu ${this.speakerNames[newSpeaker]} zugewiesen`, 'success');
    }

    cancelBulkSelection() {
        this.selectedSegments.clear();
        this.lastClickedIndex = null;
        this.updateSegmentSelection();
    }

    // ============================================
    // Help Modal
    // ============================================

    openHelpModal() {
        this.helpModal.classList.remove('hidden');
    }

    closeHelpModal() {
        this.helpModal.classList.add('hidden');
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    window.app = new Transkriptor();
});