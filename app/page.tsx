"use client";

import { useMemo, useState } from "react";

type StepStatus = "pending" | "active" | "done";
type Step = { label: string; status: StepStatus };

const initialSteps: Step[] = [
  { label: "Canal do YouTube conectado", status: "pending" },
  { label: "Vídeo encontrado", status: "pending" },
  { label: "Melhores momentos analisados", status: "pending" },
  { label: "Cortes e legendas preparados", status: "pending" },
  { label: "Publicação nas redes", status: "pending" },
];

export default function Home() {
  const [channelUrl, setChannelUrl] = useState("");
  const [cuts, setCuts] = useState(3);
  const [duration, setDuration] = useState(30);
  const [captions, setCaptions] = useState(true);
  const [automation, setAutomation] = useState(false);
  const [instagram, setInstagram] = useState(false);
  const [tiktok, setTiktok] = useState(false);
  const [instagramAuto, setInstagramAuto] = useState(false);
  const [tiktokAuto, setTiktokAuto] = useState(false);
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [status, setStatus] = useState("Cole o link do seu canal para configurar a automação.");

  const validChannel = useMemo(
    () => /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(channelUrl.trim()),
    [channelUrl]
  );

  function saveConfiguration() {
    if (!validChannel) {
      setStatus("Informe um link válido do YouTube.");
      return;
    }

    setSteps(
      initialSteps.map((step, index) => ({
        ...step,
        status: index === 0 ? "done" : index === 1 ? "active" : "pending",
      }))
    );

    setStatus(
      automation
        ? "Automação configurada. Agora falta conectar as APIs e o processamento no servidor."
        : "Configuração salva nesta tela. Ative a automação para processar novos vídeos automaticamente."
    );
  }

  return (
    <main>
      <div className="wrap">
        <nav className="nav">
          <div className="brand">ClipIA</div>
          <div className="badge">Automação de cortes com IA</div>
        </nav>

        <section className="hero">
          <span className="heroTag">YouTube → cortes → redes sociais</span>
          <h1>Transforme seu canal em uma máquina de cortes.</h1>
          <p>
            Conecte o canal do YouTube, escolha como os cortes devem ser criados e deixe o ClipIA preparar seu fluxo de publicação.
          </p>
        </section>

        <section className="grid">
          <div className="card">
            <h2>Configurar automação</h2>
            <p className="muted">Use apenas canais e conteúdos que você possui ou tem autorização para reutilizar.</p>

            <label className="label" htmlFor="channel">Link do canal do YouTube</label>
            <input
              id="channel"
              className="field"
              type="url"
              placeholder="https://www.youtube.com/@seucanal"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
            />

            <div className="row">
              <div>
                <label className="label">Cortes por vídeo</label>
                <select className="field" value={cuts} onChange={(e) => setCuts(Number(e.target.value))}>
                  <option value={3}>3 cortes</option>
                  <option value={5}>5 cortes</option>
                  <option value={10}>10 cortes</option>
                </select>
              </div>
              <div>
                <label className="label">Duração</label>
                <select className="field" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  <option value={15}>15 segundos</option>
                  <option value={30}>30 segundos</option>
                  <option value={45}>45 segundos</option>
                  <option value={60}>60 segundos</option>
                </select>
              </div>
            </div>

            <div className="toggleList">
              <Toggle label="Legendas automáticas" checked={captions} onChange={setCaptions} />
              <Toggle label="Automação para novos vídeos" checked={automation} onChange={setAutomation} />
            </div>

            <div className="socialGrid">
              <SocialCard name="Instagram" enabled={instagram} setEnabled={setInstagram} auto={instagramAuto} setAuto={setInstagramAuto} />
              <SocialCard name="TikTok" enabled={tiktok} setEnabled={setTiktok} auto={tiktokAuto} setAuto={setTiktokAuto} />
            </div>

            <button className="btn" onClick={saveConfiguration}>Salvar configuração</button>
            <div className="status">{status}</div>
          </div>

          <aside className="card">
            <div className="muted small">RESUMO</div>
            <h2>{cuts} cortes · {duration}s</h2>
            <div className="summary">
              <span>Legendas</span><b>{captions ? "ON" : "OFF"}</b>
              <span>Automação</span><b>{automation ? "ON" : "OFF"}</b>
              <span>Instagram</span><b>{instagram ? (instagramAuto ? "Auto" : "Ativo") : "OFF"}</b>
              <span>TikTok</span><b>{tiktok ? (tiktokAuto ? "Auto" : "Ativo") : "OFF"}</b>
            </div>
            <div className="note small">
              Esta interface deixa o fluxo pronto. Para buscar vídeos, gerar cortes reais, criar legendas e publicar automaticamente, ainda é necessário conectar as APIs e um backend de processamento.
            </div>
          </aside>
        </section>

        <section className="history card">
          <div>
            <div className="muted small">HISTÓRICO DA AUTOMAÇÃO</div>
            <h2>Etapas do fluxo</h2>
          </div>
          <div className="steps">
            {steps.map((step, index) => (
              <div className={`step ${step.status}`} key={step.label}>
                <span className="stepDot">{step.status === "done" ? "✓" : index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.status === "done" ? "Concluído" : step.status === "active" ? "Aguardando integração" : "Pendente"}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="footer">© 2026 ClipIA · Use somente conteúdo próprio ou autorizado.</footer>
      </div>
    </main>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggleRow">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function SocialCard({ name, enabled, setEnabled, auto, setAuto }: { name: string; enabled: boolean; setEnabled: (value: boolean) => void; auto: boolean; setAuto: (value: boolean) => void }) {
  return (
    <div className="socialCard">
      <label className="toggleRow">
        <strong>{name}</strong>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) setAuto(false);
          }}
        />
      </label>
      <label className="autoOption">
        <input type="checkbox" checked={auto} disabled={!enabled} onChange={(e) => setAuto(e.target.checked)} />
        Publicação automática
      </label>
    </div>
  );
}
