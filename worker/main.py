import os
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from faster_whisper import WhisperModel
from pydantic import BaseModel, Field
from yt_dlp import YoutubeDL

app = FastAPI(title="ClipIA Video Worker", version="1.0.0")

WORKER_TOKEN = os.getenv("CLIP_WORKER_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
WHISPER_MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
MAX_CONCURRENT_JOBS = max(1, int(os.getenv("MAX_CONCURRENT_JOBS", "1")))

_model: WhisperModel | None = None
_model_lock = threading.Lock()
_job_slots = threading.Semaphore(MAX_CONCURRENT_JOBS)


class Source(BaseModel):
    video_id: str | None = None
    url: str
    title: str | None = None


class OutputConfig(BaseModel):
    cuts: int = Field(default=3, ge=1, le=10)
    duration_seconds: int = Field(default=30, ge=10, le=120)
    captions: bool = True
    aspect_ratio: str = "9:16"


class JobRequest(BaseModel):
    job_id: str
    user_id: str
    source: Source
    output: OutputConfig
    callback_url: str


def require_worker_token(authorization: str | None) -> None:
    if not WORKER_TOKEN:
        raise HTTPException(status_code=503, detail="CLIP_WORKER_TOKEN não configurado.")
    token = ""
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if token != WORKER_TOKEN:
        raise HTTPException(status_code=401, detail="Não autorizado.")


def send_callback(job: JobRequest, status: str, progress: int, **extra: Any) -> None:
    payload: dict[str, Any] = {
        "job_id": job.job_id,
        "status": status,
        "progress": progress,
    }
    payload.update(extra)
    try:
        response = requests.post(
            job.callback_url,
            headers={"Authorization": f"Bearer {WORKER_TOKEN}"},
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
    except Exception as exc:
        print(f"callback failed for {job.job_id}: {exc}", flush=True)


def get_whisper_model() -> WhisperModel:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = WhisperModel(
                    WHISPER_MODEL_NAME,
                    device=WHISPER_DEVICE,
                    compute_type=WHISPER_COMPUTE_TYPE,
                )
    return _model


def run(command: list[str]) -> None:
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        tail = result.stderr[-4000:]
        raise RuntimeError(f"Comando de vídeo falhou: {tail}")


def download_video(url: str, workdir: Path) -> Path:
    template = str(workdir / "source.%(ext)s")
    options = {
        "format": "bv*[height<=1080]+ba/b[height<=1080]/best",
        "outtmpl": template,
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "restrictfilenames": True,
    }
    with YoutubeDL(options) as ydl:
        ydl.extract_info(url, download=True)

    preferred = workdir / "source.mp4"
    if preferred.exists():
        return preferred

    candidates = sorted(workdir.glob("source.*"), key=lambda path: path.stat().st_size, reverse=True)
    if not candidates:
        raise RuntimeError("Não foi possível baixar o vídeo informado.")
    return candidates[0]


def extract_audio(video_path: Path, audio_path: Path) -> None:
    run([
        "ffmpeg", "-y", "-i", str(video_path),
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        str(audio_path),
    ])


def transcribe(audio_path: Path) -> list[dict[str, Any]]:
    model = get_whisper_model()
    segments, _info = model.transcribe(
        str(audio_path),
        vad_filter=True,
        word_timestamps=False,
        beam_size=5,
    )
    result: list[dict[str, Any]] = []
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        result.append({
            "start": float(segment.start),
            "end": float(segment.end),
            "text": text,
        })
    if not result:
        raise RuntimeError("Não foi possível transcrever o áudio do vídeo.")
    return result


HOOK_WORDS = {
    "como", "porque", "porquê", "segredo", "segredos", "erro", "erros", "nunca",
    "sempre", "melhor", "piores", "pior", "verdade", "atenção", "dica", "dicas",
    "você", "vocês", "ninguém", "fácil", "rápido", "importante", "resultado",
    "dinheiro", "grátis", "agora", "hoje", "primeiro", "último", "motivo",
}


def score_window(text: str, start: float, end: float, target_duration: int) -> float:
    words = re.findall(r"[\wÀ-ÿ]+", text.lower())
    duration = max(1.0, end - start)
    words_per_second = len(words) / duration
    density_score = max(0.0, 18.0 - abs(words_per_second - 2.4) * 8.0)
    hook_score = sum(1 for word in words if word in HOOK_WORDS) * 2.5
    punctuation_score = text.count("?") * 3.0 + text.count("!") * 2.0
    duration_score = max(0.0, 12.0 - abs(duration - target_duration) * 0.5)
    opening_score = 3.0 if text[:1].isupper() else 0.0
    return density_score + hook_score + punctuation_score + duration_score + opening_score


def overlap_ratio(a: tuple[float, float], b: tuple[float, float]) -> float:
    overlap = max(0.0, min(a[1], b[1]) - max(a[0], b[0]))
    smaller = max(1.0, min(a[1] - a[0], b[1] - b[0]))
    return overlap / smaller


def choose_windows(segments: list[dict[str, Any]], count: int, duration: int) -> list[dict[str, Any]]:
    video_end = max(float(segment["end"]) for segment in segments)
    candidates: list[dict[str, Any]] = []

    for index, segment in enumerate(segments):
        start = max(0.0, float(segment["start"]) - 0.35)
        end = min(video_end, start + duration)
        covered = [
            item for item in segments
            if float(item["end"]) > start and float(item["start"]) < end
        ]
        text = " ".join(str(item["text"]).strip() for item in covered).strip()
        if len(text.split()) < max(8, duration // 3):
            continue
        candidates.append({
            "start": start,
            "end": end,
            "text": text,
            "score": score_window(text, start, end, duration) - index * 0.001,
        })

    candidates.sort(key=lambda item: float(item["score"]), reverse=True)
    selected: list[dict[str, Any]] = []
    for candidate in candidates:
        interval = (float(candidate["start"]), float(candidate["end"]))
        if all(overlap_ratio(interval, (float(item["start"]), float(item["end"]))) < 0.35 for item in selected):
            selected.append(candidate)
            if len(selected) >= count:
                break

    if len(selected) < count and video_end > 0:
        step = max(float(duration), video_end / max(1, count))
        cursor = 0.0
        while len(selected) < count and cursor < video_end:
            start = min(cursor, max(0.0, video_end - duration))
            end = min(video_end, start + duration)
            interval = (start, end)
            if all(overlap_ratio(interval, (float(item["start"]), float(item["end"]))) < 0.35 for item in selected):
                covered = [item for item in segments if float(item["end"]) > start and float(item["start"]) < end]
                text = " ".join(str(item["text"]).strip() for item in covered).strip()
                selected.append({"start": start, "end": end, "text": text, "score": 0.0})
            cursor += step

    selected.sort(key=lambda item: float(item["start"]))
    return selected[:count]


def srt_timestamp(seconds: float) -> str:
    milliseconds = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def write_srt(segments: list[dict[str, Any]], start: float, end: float, path: Path) -> None:
    blocks: list[str] = []
    index = 1
    for segment in segments:
        seg_start = float(segment["start"])
        seg_end = float(segment["end"])
        if seg_end <= start or seg_start >= end:
            continue
        relative_start = max(seg_start, start) - start
        relative_end = min(seg_end, end) - start
        text = str(segment["text"]).strip()
        if not text:
            continue
        blocks.append(
            f"{index}\n{srt_timestamp(relative_start)} --> {srt_timestamp(relative_end)}\n{text}\n"
        )
        index += 1
    path.write_text("\n".join(blocks), encoding="utf-8")


def render_clip(
    video_path: Path,
    segments: list[dict[str, Any]],
    start: float,
    end: float,
    captions: bool,
    output_path: Path,
    subtitle_path: Path,
) -> None:
    duration = max(1.0, end - start)
    filters = [
        "scale=1080:1920:force_original_aspect_ratio=increase",
        "crop=1080:1920",
    ]

    if captions:
        write_srt(segments, start, end, subtitle_path)
        escaped = subtitle_path.as_posix().replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        filters.append(
            "subtitles='{}':force_style='FontName=DejaVu Sans,FontSize=18,"
            "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,"
            "Outline=3,Shadow=0,Alignment=2,MarginV=120'".format(escaped)
        )

    run([
        "ffmpeg", "-y", "-ss", f"{start:.3f}", "-i", str(video_path),
        "-t", f"{duration:.3f}",
        "-vf", ",".join(filters),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        str(output_path),
    ])


def upload_clip(local_path: Path, object_path: str) -> str:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Supabase Storage do worker não configurado.")
    url = f"{SUPABASE_URL}/storage/v1/object/clips/{quote(object_path, safe='/')}"
    with local_path.open("rb") as file_handle:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "video/mp4",
                "x-upsert": "true",
            },
            data=file_handle,
            timeout=180,
        )
    if response.status_code not in {200, 201}:
        raise RuntimeError(f"Falha ao salvar corte: {response.text[:500]}")
    return object_path


def process_job(job: JobRequest) -> None:
    with _job_slots:
        workdir = Path(tempfile.mkdtemp(prefix=f"clipia-{job.job_id[:8]}-"))
        try:
            send_callback(job, "authorizing", 5)
            video_path = download_video(job.source.url, workdir)

            send_callback(job, "transcribing", 25)
            audio_path = workdir / "audio.wav"
            extract_audio(video_path, audio_path)
            segments = transcribe(audio_path)

            send_callback(job, "analyzing", 55)
            windows = choose_windows(segments, job.output.cuts, job.output.duration_seconds)
            if not windows:
                raise RuntimeError("Não encontramos trechos adequados para gerar os cortes.")

            send_callback(job, "rendering", 65)
            clips: list[dict[str, Any]] = []
            total = len(windows)
            for index, window in enumerate(windows, start=1):
                clip_path = workdir / f"clip-{index}.mp4"
                subtitle_path = workdir / f"clip-{index}.srt"
                start = float(window["start"])
                end = float(window["end"])
                render_clip(
                    video_path,
                    segments,
                    start,
                    end,
                    job.output.captions,
                    clip_path,
                    subtitle_path,
                )
                object_path = f"{job.user_id}/{job.job_id}/clip-{index}.mp4"
                upload_clip(clip_path, object_path)
                text = str(window.get("text", "")).strip()
                clips.append({
                    "index": index,
                    "path": object_path,
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "title": (text[:90] + "…") if len(text) > 90 else text,
                })
                progress = 65 + round((index / total) * 30)
                send_callback(job, "rendering", min(progress, 95))

            result = {
                "source_video_id": job.source.video_id,
                "source_video_title": job.source.title,
                "clips": clips,
                "captions": job.output.captions,
                "aspect_ratio": "9:16",
            }
            send_callback(job, "ready", 100, result=result)
        except Exception as exc:
            print(f"job {job.job_id} failed: {exc}", flush=True)
            send_callback(job, "failed", 100, error=str(exc)[:1500])
        finally:
            shutil.rmtree(workdir, ignore_errors=True)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "whisper_model": WHISPER_MODEL_NAME,
        "max_concurrent_jobs": MAX_CONCURRENT_JOBS,
    }


@app.post("/jobs")
def create_job(
    job: JobRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_worker_token(authorization)
    background_tasks.add_task(process_job, job)
    return {"accepted": True, "job_id": job.job_id}
