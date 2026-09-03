"use client";

import { useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type Clip = {
  id: number;
  url: string;
  start: number;
  duration: number;
  name: string;
};

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(url);
      if (Number.isFinite(d)) resolve(d);
      else reject(new Error("Não foi possível ler a duração do vídeo."));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Formato de vídeo não suportado pelo navegador."));
    };
    video.src = url;
  });
}

export default function Home() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cuts, setCuts] = useState(3);
  const [clipDuration, setClipDuration] = useState(20);
  const [status, setStatus] = useState("Selecione um vídeo para começar.");
  const [progress, setProgress] = useState(0);
  const [working, setWorking] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);

  async function loadFFmpeg() {
    if (ffmpegRef.current) return ffmpegRef.current;

    setStatus("Carregando o motor de vídeo pela primeira vez...");
    const ffmpeg = new FFmpeg();

    ffmpeg.on("progress", ({ progress }) => {
      if (Number.isFinite(progress)) {
        setProgress(Math.max(3, Math.min(98, Math.round(progress * 100))));
      }
    });

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }

  async function createCuts() {
    if (!file) {
      setStatus("Escolha um vídeo antes de continuar.");
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setStatus("Para esta versão, use um vídeo de até 500 MB.");
      return;
    }

    setWorking(true);
    setProgress(1);

    clips.forEach((clip) => URL.revokeObjectURL(clip.url));
    setClips([]);

    try {
      const total = await getVideoDuration(file);
      const duration = Math.min(clipDuration, Math.max(3, Math.floor(total)));
      const maxStart = Math.max(0, total - duration);

      const wantedCuts = Math.min(cuts, Math.max(1, Math.floor(total / Math.max(1, duration / 2))));
      const starts = Array.from({ length: wantedCuts }, (_, i) =>
        wantedCuts === 1 ? 0 : Math.round((maxStart * i) / (wantedCuts - 1))
      );

      const ffmpeg = await loadFFmpeg();
      setStatus("Preparando vídeo...");
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const inputName = `entrada.${ext}`;
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      const generated: Clip[] = [];

      for (let i = 0; i < starts.length; i++) {
        const start = starts[i];
        const out = `clip-${i + 1}.mp4`;
        setStatus(`Criando corte ${i + 1} de ${starts.length}...`);
        setProgress(Math.round((i / starts.length) * 90) + 5);

        await ffmpeg.exec([
          "-ss", String(start),
          "-i", inputName,
          "-t", String(duration),
          "-vf",
          "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "25",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "+faststart",
          out,
        ]);

        const data = await ffmpeg.readFile(out);
const bytes =
  data instanceof Uint8Array
    ? new Uint8Array(data)
    : new TextEncoder().encode(data);
const blob = new Blob([bytes], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);

        generated.push({
          id: i + 1,
          url,
          start,
          duration,
          name: `clipia-corte-${i + 1}.mp4`,
        });

        try { await ffmpeg.deleteFile(out); } catch {}
      }

      try { await ffmpeg.deleteFile(inputName); } catch {}

      setClips(generated);
      setProgress(100);
      setStatus(`Pronto! ${generated.length} corte(s) criado(s).`);
    } catch (error) {
      console.error(error);
      setProgress(0);
      setStatus(
        error instanceof Error
          ? `Erro: ${error.message}`
          : "Não foi possível processar o vídeo."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <main>
      <div className="wrap">
        <nav className="nav">
          <div className="brand">ClipIA</div>
          <div className="badge">Processamento no navegador</div>
        </nav>

        <section className="hero">
          <span className="heroTag">Cortes verticais em poucos cliques</span>
          <h1>Transforme vídeos longos em cortes prontos para postar.</h1>
          <p>
            Envie um vídeo que você possui ou tem autorização para reutilizar.
            O processamento acontece no próprio dispositivo e os cortes ficam
            disponíveis para download.
          </p>
        </section>

        <section className="grid">
          <div className="card">
            <h2>Criar cortes</h2>
            <p className="muted">
              Recomendado: MP4, vídeo de até 500 MB e computador/notebook.
            </p>

            <label className="label">Escolha o vídeo</label>
            <input
              className="field"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              disabled={working}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setStatus(e.target.files?.[0] ? `Selecionado: ${e.target.files[0].name}` : "Selecione um vídeo.");
              }}
            />

            <div className="row">
              <div>
                <label className="label">Quantidade</label>
                <select
                  className="field"
                  value={cuts}
                  disabled={working}
                  onChange={(e) => setCuts(Number(e.target.value))}
                >
                  <option value={1}>1 corte</option>
                  <option value={3}>3 cortes</option>
                  <option value={5}>5 cortes</option>
                </select>
              </div>

              <div>
                <label className="label">Duração</label>
                <select
                  className="field"
                  value={clipDuration}
                  disabled={working}
                  onChange={(e) => setClipDuration(Number(e.target.value))}
                >
                  <option value={15}>15 segundos</option>
                  <option value={20}>20 segundos</option>
                  <option value={30}>30 segundos</option>
                  <option value={45}>45 segundos</option>
                </select>
              </div>
            </div>

            <button className="btn" disabled={working || !file} onClick={createCuts}>
              {working ? "Processando vídeo..." : "Gerar cortes verticais"}
            </button>

            <div className="status">
              {status}
              {working && (
                <div className="progress">
                  <span style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>

            <div className="note small">
              A primeira execução demora um pouco mais porque o navegador precisa
              carregar o motor FFmpeg. Não feche a aba durante o processamento.
            </div>
          </div>

          <aside className="card">
            <div className="muted small">PLANO ATUAL</div>
            <h2 style={{ fontSize: 32, marginBottom: 4 }}>Free</h2>
            <p className="muted">Versão de teste do ClipIA.</p>

            <div className="plans">
              <div className="plan"><span>Basic</span><b>R$29/mês</b></div>
              <div className="plan"><span>Pro</span><b>R$59/mês</b></div>
              <div className="plan"><span>Agency</span><b>R$149/mês</b></div>
            </div>

            <div className="note small">
              Nesta versão, os cortes são distribuídos automaticamente pelo vídeo.
              A seleção dos melhores momentos por IA pode ser conectada depois.
            </div>
          </aside>
        </section>

        {clips.length > 0 && (
          <section className="results">
            <h2>Seus cortes</h2>
            <div className="resultGrid">
              {clips.map((clip) => (
                <article className="clip" key={clip.id}>
                  <video src={clip.url} controls playsInline />
                  <div className="clipBody">
                    <strong>Corte {clip.id}</strong>
                    <p className="muted small">
                      Início: {clip.start}s · Duração: {clip.duration}s
                    </p>
                    <a className="download" href={clip.url} download={clip.name}>
                      Baixar MP4
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <footer className="footer">
          © 2026 ClipIA · Use somente conteúdo próprio ou autorizado.
        </footer>
      </div>
    </main>
  );
}
