import "./globals.css";

export const metadata = {
  title: "ClipIA — Cortes de vídeo",
  description: "Transforme seus próprios vídeos em cortes verticais para TikTok e Instagram Reels.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
