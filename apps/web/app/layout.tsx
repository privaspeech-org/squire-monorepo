import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SQUIRE — Quest Chamber',
  description: 'Command thy autonomous coding agents from the realm',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&family=Fira+Code:wght@300..700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <div className="parchment-texture"></div>
        {children}
      </body>
    </html>
  );
}
