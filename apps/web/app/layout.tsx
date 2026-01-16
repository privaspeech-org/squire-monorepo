import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SQUIRE // Autonomous Coding Agent',
  description: 'Command your autonomous coding agents from the terminal',
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
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&family=JetBrains+Mono:wght@100..800&display=swap" rel="stylesheet" />
      </head>
      <body className="font-display antialiased">
        <div className="scanlines"></div>
        <div className="grain"></div>
        {children}
      </body>
    </html>
  );
}
