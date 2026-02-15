import './globals.css';
import ToastContainer from '@/components/ui/ToastContainer';

/**
 * Root Layout
 *
 * Minimal root layout. Route-specific layouts handle their own styling:
 * - (editor)/layout.tsx - Editor pages
 * - (overlay)/layout.tsx - Streaming overlays
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>AITuberFlow</title>
        <meta name="description" content="Build AI-powered virtual streamers with a visual workflow editor" />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
