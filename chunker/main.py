"""
Audio Chunker Middleware for Protokolla.

Sits between nginx and whisper-api. For audio files longer than CHUNK_MINUTES,
splits into overlapping chunks, transcribes each sequentially, and merges
the results with corrected timestamps.
"""

import asyncio
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response

app = FastAPI(title="Protokolla Audio Chunker")
logger = logging.getLogger("chunker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Configuration
WHISPER_URL = os.environ.get("WHISPER_URL", "http://whisper-api:9000")
CHUNK_MINUTES = int(os.environ.get("CHUNK_MINUTES", "30"))
OVERLAP_SECONDS = int(os.environ.get("OVERLAP_SECONDS", "30"))
# Timeout per chunk (seconds) — large-v3 on GPU: ~0.3-0.5x realtime
CHUNK_TIMEOUT = int(os.environ.get("CHUNK_TIMEOUT", "3600"))


def get_audio_duration(file_path: str) -> float:
    """Get audio duration in seconds using ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            file_path,
        ],
        capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def split_audio(file_path: str, chunk_seconds: int, overlap: int, tmp_dir: str) -> list[dict]:
    """
    Split audio into chunks using ffmpeg.
    Returns list of dicts: {"path": ..., "start_offset": seconds}
    """
    duration = get_audio_duration(file_path)
    chunks = []
    start = 0.0
    idx = 0

    while start < duration:
        chunk_path = os.path.join(tmp_dir, f"chunk_{idx:03d}.wav")
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-i", file_path,
            "-t", str(chunk_seconds + overlap),
            "-ar", "16000",  # 16kHz mono for Whisper
            "-ac", "1",
            "-c:a", "pcm_s16le",
            chunk_path,
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        chunks.append({"path": chunk_path, "start_offset": start})
        start += chunk_seconds
        idx += 1

    logger.info(f"Split {duration:.0f}s audio into {len(chunks)} chunks of ~{chunk_seconds}s")
    return chunks


def merge_transcripts(chunk_results: list[dict], chunk_seconds: int, overlap: int) -> dict:
    """
    Merge transcript chunks into a single result.

    For overlapping regions, we keep segments from the earlier chunk
    (they tend to be more accurate at the end than the beginning of the next chunk).
    """
    merged_segments = []
    full_text_parts = []
    # Track speaker mapping: try to maintain consistent IDs across chunks
    speaker_map = {}
    next_speaker_id = 0

    for ci, chunk_data in enumerate(chunk_results):
        offset = chunk_data["start_offset"]
        transcript = chunk_data["transcript"]
        segments = transcript.get("segments", [])

        # Determine the cutoff: don't include segments past our boundary
        # (the overlap region will be covered by the next chunk)
        if ci < len(chunk_results) - 1:
            # Not the last chunk: cut off at chunk_seconds (before overlap region)
            boundary = chunk_seconds
        else:
            # Last chunk: include everything
            boundary = float("inf")

        for seg in segments:
            seg_start = seg.get("start", 0)
            seg_end = seg.get("end", 0)

            # Skip segments that are entirely in the overlap region (handled by next chunk)
            if seg_start >= boundary:
                continue

            # Adjust timestamps by chunk offset
            adjusted_seg = dict(seg)
            adjusted_seg["start"] = round(seg_start + offset, 3)
            adjusted_seg["end"] = round(seg_end + offset, 3)

            # Adjust word timestamps if present
            if "words" in adjusted_seg:
                adjusted_words = []
                for w in adjusted_seg["words"]:
                    aw = dict(w)
                    if "start" in aw:
                        aw["start"] = round(aw["start"] + offset, 3)
                    if "end" in aw:
                        aw["end"] = round(aw["end"] + offset, 3)
                    adjusted_words.append(aw)
                adjusted_seg["words"] = adjusted_words

            # Map speaker IDs to be consistent across chunks
            if "speaker" in adjusted_seg and adjusted_seg["speaker"]:
                chunk_speaker = f"chunk{ci}_{adjusted_seg['speaker']}"
                if chunk_speaker not in speaker_map:
                    speaker_map[chunk_speaker] = f"SPEAKER_{next_speaker_id:02d}"
                    next_speaker_id += 1
                adjusted_seg["speaker"] = speaker_map[chunk_speaker]

            merged_segments.append(adjusted_seg)
            full_text_parts.append(adjusted_seg.get("text", ""))

    # Sort by start time (should already be ordered, but ensure it)
    merged_segments.sort(key=lambda s: s.get("start", 0))

    return {
        "text": " ".join(full_text_parts).strip(),
        "segments": merged_segments,
    }


async def transcribe_chunk(
    client: httpx.AsyncClient,
    chunk_path: str,
    query_params: str,
) -> dict:
    """Send a single chunk to whisper-api for transcription."""
    with open(chunk_path, "rb") as f:
        files = {"audio_file": ("chunk.wav", f, "audio/wav")}
        response = await client.post(
            f"{WHISPER_URL}/asr?{query_params}",
            files=files,
            timeout=CHUNK_TIMEOUT,
        )
        response.raise_for_status()
        return response.json()


@app.get("/health")
async def health():
    return {"status": "ok", "chunking": True, "chunk_minutes": CHUNK_MINUTES}


@app.post("/asr")
async def asr(
    request: Request,
    audio_file: UploadFile = File(...),
    output: str = Query("json"),
    language: str = Query(None),
    diarize: bool = Query(False),
    min_speakers: int = Query(None),
    max_speakers: int = Query(None),
    word_timestamps: bool = Query(False),
):
    """
    Main ASR endpoint. Proxies small files directly to whisper-api.
    For large files, splits into chunks and merges results.
    """
    chunk_threshold = CHUNK_MINUTES * 60

    with tempfile.TemporaryDirectory(prefix="chunker_") as tmp_dir:
        # Save uploaded file
        input_path = os.path.join(tmp_dir, "input_audio")
        with open(input_path, "wb") as f:
            content = await audio_file.read()
            f.write(content)

        # Check duration
        try:
            duration = get_audio_duration(input_path)
        except (ValueError, subprocess.CalledProcessError):
            # Can't determine duration — pass through directly
            logger.warning("Could not determine audio duration, passing through to whisper-api")
            duration = 0

        logger.info(f"Audio duration: {duration:.0f}s, threshold: {chunk_threshold}s")

        # Build query params for whisper-api
        params = {"output": output}
        if language:
            params["language"] = language
        if diarize:
            params["diarize"] = "true"
            if min_speakers is not None:
                params["min_speakers"] = str(min_speakers)
            if max_speakers is not None:
                params["max_speakers"] = str(max_speakers)
        if word_timestamps:
            params["word_timestamps"] = "true"
        query_string = "&".join(f"{k}={v}" for k, v in params.items())

        # Small file: proxy directly
        if duration <= chunk_threshold:
            logger.info("File is short enough, proxying directly to whisper-api")
            async with httpx.AsyncClient() as client:
                with open(input_path, "rb") as f:
                    files = {"audio_file": (audio_file.filename or "audio", f, audio_file.content_type or "audio/wav")}
                    response = await client.post(
                        f"{WHISPER_URL}/asr?{query_string}",
                        files=files,
                        timeout=CHUNK_TIMEOUT,
                    )
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    media_type=response.headers.get("content-type", "application/json"),
                )

        # Large file: split and transcribe
        logger.info(f"Large file detected ({duration:.0f}s). Splitting into ~{CHUNK_MINUTES}min chunks...")
        chunks = split_audio(input_path, chunk_threshold, OVERLAP_SECONDS, tmp_dir)

        chunk_results = []
        async with httpx.AsyncClient() as client:
            for i, chunk in enumerate(chunks):
                logger.info(f"Transcribing chunk {i+1}/{len(chunks)} (offset: {chunk['start_offset']:.0f}s)...")
                try:
                    transcript = await transcribe_chunk(client, chunk["path"], query_string)
                    chunk_results.append({
                        "start_offset": chunk["start_offset"],
                        "transcript": transcript,
                    })
                    logger.info(f"Chunk {i+1}/{len(chunks)} done: {len(transcript.get('segments', []))} segments")
                except Exception as e:
                    logger.error(f"Error transcribing chunk {i+1}: {e}")
                    return JSONResponse(
                        status_code=500,
                        content={"error": f"Fehler bei Chunk {i+1}/{len(chunks)}: {str(e)}"},
                    )

        # Merge results
        logger.info("Merging chunk transcripts...")
        merged = merge_transcripts(chunk_results, chunk_threshold, OVERLAP_SECONDS)
        logger.info(f"Merged result: {len(merged['segments'])} segments, {len(merged['text'])} chars")

        return JSONResponse(content=merged)
