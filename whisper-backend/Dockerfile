# Custom Whisper ASR backend with WhisperX and pyannote support
# v1.9.1 includes fix for whisperx diarization pipeline init
FROM onerahmet/openai-whisper-asr-webservice:v1.9.1-gpu

# Install whisperx and pyannote for speaker diarization
# This will upgrade torch, torchaudio, and triton to compatible versions
RUN cd /app && \
    .venv/bin/pip install --no-cache-dir whisperx pyannote.audio && \
    .venv/bin/pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cu118

# Upgrade openai-whisper to latest version compatible with triton 3.x
# This fixes AttributeError with triton kernel.src
RUN cd /app && \
    .venv/bin/pip install --upgrade --no-cache-dir openai-whisper

# Verify installations
RUN cd /app && \
    .venv/bin/python -c "import whisperx; print('✓ whisperx installed successfully')" && \
    .venv/bin/python -c "import pyannote.audio; print('✓ pyannote.audio installed:', pyannote.audio.__version__)" && \
    .venv/bin/python -c "import torch; print('✓ torch:', torch.__version__)"

# NOTE: Language models (like wav2vec2_voxpopuli_base_10k_asr_de.pt for German)
# are downloaded automatically on first use and cached in the whisper_cache volume.
# This ensures you always get the latest model version without rebuilding the image.

# Keep the original entrypoint and command from base image
