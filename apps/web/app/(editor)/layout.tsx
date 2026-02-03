import type { Metadata } from 'next';
import './editor.css';
import ToastContainer from '@/components/ui/ToastContainer';

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
    <>
      {children}
      <ToastContainer />
    </>
  );
}
