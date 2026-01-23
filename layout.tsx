import "./globals.css";

export const metadata = {
  title: "FutPol",
  description: "Bolão FutPol",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
