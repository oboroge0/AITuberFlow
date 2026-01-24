import EditorClient from './EditorClient';

// For static export - generate demo page
export function generateStaticParams() {
  // Only generate static params in demo mode
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return [];
  }
  return [{ id: 'demo' }];
}

// For static export compatibility, set to false
// The _redirects file handles SPA routing for non-pre-generated paths
export const dynamicParams = false;

export default function EditorPage() {
  return <EditorClient />;
}
