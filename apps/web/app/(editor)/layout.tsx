import type { Metadata } from 'next';
import './editor.css';

export const metadata: Metadata = {
  title: 'AITuberFlow - Visual Workflow Editor',
  description: 'Build AI-powered virtual streamers with a visual workflow editor',
};

/**
 * Editor Layout
 *
 * Layout for the workflow editor and preview pages.
 * Includes editor-specific styles (dark theme, React Flow, etc.)
 */
export default function EditorLayout({
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
