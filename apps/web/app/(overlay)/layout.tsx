import type { Metadata } from 'next';
import './overlay.css';

export const metadata: Metadata = {
  title: 'AITuberFlow Overlay',
  description: 'Streaming overlay for OBS',
};

/**
 * Overlay Layout
 *
 * Optimized for OBS Browser Source:
 * - Fully transparent background (html + body)
 * - No editor styles applied
 * - Minimal CSS for performance
 */
export default function OverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
