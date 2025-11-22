// ============================================
// Transkriptor – Main Application
// ============================================

class Transkriptor {
    constructor() {
        this.apiUrl = '/api';
        this.transcriptData = null;
        this.speakerNames = {};

        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.checkApiStatus();
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
            params.set('min_speakers', '1');
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
            });

            this.speakerList.appendChild(item);
        });

        // Hide speaker panel if no diarization
        const speakerPanel = document.getElementById('speakerPanel');
        speakerPanel.style.display = speakers.size > 0 ? 'block' : 'none';
    }

    updateSpeakerLabels(speakerId) {
        const labels = this.transcriptEditor.querySelectorAll(`[data-speaker="${speakerId}"]`);
        labels.forEach(label => {
            label.textContent = this.speakerNames[speakerId];
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

        this.transcriptData.segments.forEach((seg, index) => {
            const speakerIndex = this.getSpeakerIndex(seg.speaker);
            const segment = document.createElement('div');
            segment.className = 'segment';
            segment.dataset.index = index;

            segment.innerHTML = `
                <div class="segment-meta">
                    ${seg.speaker ? `
                        <div class="segment-speaker speaker-${speakerIndex}" data-speaker="${seg.speaker}">
                            ${this.speakerNames[seg.speaker] || seg.speaker}
                        </div>
                    ` : ''}
                    <div class="segment-time">${this.formatTime(seg.start)} → ${this.formatTime(seg.end)}</div>
                </div>
                <div class="segment-text" contenteditable="true" data-index="${index}">${seg.text}</div>
            `;

            // Track text changes
            const textEl = segment.querySelector('.segment-text');
            textEl.addEventListener('blur', (e) => {
                this.transcriptData.segments[index].text = e.target.textContent;
                this.updateStats();
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
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    window.app = new Transkriptor();
});