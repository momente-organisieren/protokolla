#!/bin/bash
# ============================================
# Transkriptor Diagnose-Skript
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================"
echo "  Transkriptor Diagnose"
echo "============================================"
echo ""

# 1. Prüfe .env Datei
echo -n "1. Prüfe .env Datei... "
if [ -f ".env" ]; then
    echo -e "${GREEN}OK${NC}"
    
    # Prüfe HF_TOKEN
    echo -n "   └─ HF_TOKEN gesetzt... "
    if grep -q "^HF_TOKEN=hf_" .env && ! grep -q "^HF_TOKEN=hf_DEIN_TOKEN_HIER" .env; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FEHLT oder Platzhalter!${NC}"
        echo -e "   ${YELLOW}→ Bitte echten Token in .env eintragen${NC}"
    fi
else
    echo -e "${RED}FEHLT${NC}"
    echo -e "   ${YELLOW}→ Führe aus: cp .env.example .env${NC}"
fi
echo ""

# 2. Prüfe Docker
echo -n "2. Prüfe Docker... "
if command -v docker &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FEHLT${NC}"
    exit 1
fi

# 3. Prüfe Docker Compose
echo -n "3. Prüfe Docker Compose... "
if docker compose version &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FEHLT${NC}"
    exit 1
fi

# 4. Prüfe GPU
echo -n "4. Prüfe NVIDIA GPU... "
if command -v nvidia-smi &> /dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
    GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader | head -1)
    echo -e "${GREEN}OK${NC} - $GPU_NAME ($GPU_MEM)"
else
    echo -e "${YELLOW}nvidia-smi nicht gefunden${NC}"
fi

# 5. Prüfe NVIDIA Container Toolkit
echo -n "5. Prüfe NVIDIA Container Toolkit... "
if docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FEHLT oder nicht konfiguriert${NC}"
    echo -e "   ${YELLOW}→ Installiere nvidia-container-toolkit${NC}"
fi
echo ""

# 6. Prüfe Container Status
echo "6. Container Status:"
if docker compose ps 2>/dev/null | grep -q "whisper-api"; then
    docker compose ps
    echo ""
    
    # Prüfe API
    echo -n "7. Prüfe API Erreichbarkeit... "
    if curl -s http://localhost:9000/ > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
        
        # Hole API Info
        echo ""
        echo "8. API Konfiguration:"
        curl -s http://localhost:9000/ 2>/dev/null | head -20
    else
        echo -e "${RED}Nicht erreichbar${NC}"
        echo -e "   ${YELLOW}→ Warte evtl. noch auf Modell-Download${NC}"
    fi
else
    echo -e "   ${YELLOW}Container nicht gestartet${NC}"
    echo -e "   ${YELLOW}→ Führe aus: docker compose up -d${NC}"
fi
echo ""

# 7. Zeige Logs bei Problemen
echo "============================================"
echo "  Letzte Log-Einträge (whisper-api)"
echo "============================================"
docker compose logs --tail=30 whisper-api 2>/dev/null || echo "Keine Logs verfügbar"

echo ""
echo "============================================"
echo "  Diagnose abgeschlossen"
echo "============================================"
echo ""
echo "Nächste Schritte bei Problemen:"
echo "1. Stelle sicher, dass HF_TOKEN korrekt ist"
echo "2. Akzeptiere Nutzungsbedingungen auf Hugging Face:"
echo "   - https://huggingface.co/pyannote/segmentation-3.0"
echo "   - https://huggingface.co/pyannote/speaker-diarization-3.1"
echo "3. Starte Container neu: docker compose down && docker compose up -d"
echo "4. Warte 2-3 Minuten für Modell-Download"
echo "5. Teste direkt: curl -X POST -F 'audio_file=@test.wav' 'http://localhost:9000/asr?diarize=true&output=json'"
echo ""
