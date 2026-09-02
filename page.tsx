'use client';

import { useState } from 'react';

export default function Home() {
  const data = await ffmpeg.readFile(out);

if (typeof data === "string") {
  throw new Error("Falha ao gerar o vídeo.");
}

const blob = new Blob([new Uint8Array(data)], { type: "video/mp4" });

  function criar() {
    setStatus(
      file
        ? 'Vídeo selecionado. O processamento por IA será conectado na próxima etapa.'
        : 'Escolha um vídeo para começar.'
    );
  }

  return (
    <main>
      <div className="wrap">
        <nav className="nav">
          <div className="brand">ClipIA</div>
          <div className="actions">
            <a className="outline" href="#planos">Planos</a>
            <a className="btn" href="#criar">Começar</a>
          </div>
        </nav>

        <section className="hero">
          <span className="tag">IA para vídeos curtos</span>
          <h1>Transforme vídeos longos em cortes que chamam atenção.</h1>
          <p>
            Envie seu vídeo, escolha o formato e prepare cortes verticais para TikTok e Instagram Reels.
          </p>
        </section>

        <section className="grid" id="criar">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Criar cortes</h2>
            <p className="muted">
              Use apenas vídeos que você possui ou tem autorização para reutilizar.
            </p>

            <label className="label">Vídeo</label>
            <input
              className="input"
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />

            <div className="row">
              <div>
                <label className="label">Quantidade de cortes</label>
                <select className="select" defaultValue="5">
                  <option>3</option>
                  <option>5</option>
                  <option>10</option>
                </select>
              </div>
              <div>
                <label className="label">Duração</label>
                <select className="select" defaultValue="30 segundos">
                  <option>20 segundos</option>
                  <option>30 segundos</option>
                  <option>45 segundos</option>
                  <option>60 segundos</option>
                </select>
              </div>
            </div>

            <button className="btn wide" onClick={criar}>Criar cortes com IA</button>
            {status && <div className="status">{status}</div>}
          </div>

          <aside className="card" id="planos">
            <div className="muted" style={{ fontSize: 13 }}>PLANO ATUAL</div>
            <h2 style={{ fontSize: 32, margin: '8px 0' }}>Free</h2>
            <p className="muted">3 cortes por mês</p>

            <div className="plan"><span>Basic</span><b>R$29/mês</b></div>
            <div className="plan"><span>Pro</span><b>R$59/mês</b></div>
            <div className="plan"><span>Agency</span><b>R$149/mês</b></div>

            <button className="outline wide">Ver planos</button>
          </aside>
        </section>

        <section className="features">
          <div className="feature">
            <h3>⚡ Cortes rápidos</h3>
            <p className="muted">Prepare vários vídeos curtos a partir de um único conteúdo.</p>
          </div>
          <div className="feature">
            <h3>📱 Formato vertical</h3>
            <p className="muted">Interface pensada para TikTok e Instagram Reels.</p>
          </div>
          <div className="feature">
            <h3>💬 Legendas</h3>
            <p className="muted">Estrutura preparada para legendas automáticas e títulos por IA.</p>
          </div>
        </section>

        <footer className="footer">© 2026 ClipIA. Todos os direitos reservados.</footer>
      </div>
    </main>
  );
}
