export const metadata = {
  title: "ClipIA",
  description: "Transforme vídeos longos em cortes para TikTok e Instagram.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
