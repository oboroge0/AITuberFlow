import EditorPage from './client-page';

// Required for static export (output: 'export') — generates an HTML shell
// that the SPA fallback serves for any workflow ID at runtime
export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <EditorPage />;
}
