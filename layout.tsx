import "./globals.css";

export const metadata = {
  title: "ClipIA",
  description: "Transforme vídeos em cortes curtos para TikTok e Instagram."
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
