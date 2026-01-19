import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AITuberFlow - Visual Workflow Editor',
  description: 'Build AI-powered virtual streamers with a visual workflow editor',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
