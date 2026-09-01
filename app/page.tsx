export default function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#07080b",
      color: "white",
      fontFamily: "Arial, sans-serif",
      padding: "40px"
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 56, marginBottom: 20 }}>
          ClipIA
        </h1>

        <h2 style={{ fontSize: 36 }}>
          Transforme vídeos longos em cortes que chamam atenção.
        </h2>

        <p style={{ color: "#aaa", fontSize: 20 }}>
          Crie cortes verticais para TikTok e Instagram Reels.
        </p>

        <div style={{
          marginTop: 40,
          padding: 24,
          border: "1px solid #333",
          borderRadius: 16,
          background: "#11131a"
        }}>
          <h3>Criar cortes</h3>

          <input type="file" accept="video/*" />

          <br /><br />

          <button style={{
            background: "#7c3aed",
            color: "white",
            border: 0,
            borderRadius: 10,
            padding: "14px 22px",
            fontWeight: "bold"
          }}>
            Criar cortes com IA
          </button>
        </div>
      </div>
    </main>
  );
}
