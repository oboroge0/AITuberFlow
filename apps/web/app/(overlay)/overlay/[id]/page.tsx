import { Suspense } from 'react';
import OverlayPage from './client-page';

// Required for static export (output: 'export') — generates an HTML shell
// that the SPA fallback serves for any workflow ID at runtime
export function generateStaticParams() {
  return [{ id: '_' }];
}

// Suspense boundary required because OverlayPage uses useSearchParams()
export default function Page() {
  return (
    <Suspense>
      <OverlayPage />
    </Suspense>
  );
}
