import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Squire - Autonomous Coding Agent',
  description: 'Manage and monitor your autonomous coding tasks',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
