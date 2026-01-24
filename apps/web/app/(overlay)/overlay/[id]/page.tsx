import { Suspense } from 'react';
import OverlayClient from './OverlayClient';

// For static export - generate demo page
export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return [];
  }
  return [{ id: 'demo' }];
}

// For static export compatibility, set to false
export const dynamicParams = false;

interface OverlayPageProps {
  params: Promise<{ id: string }>;
}

export default function OverlayPage({ params }: OverlayPageProps) {
  return (
    <Suspense fallback={<div className="w-screen h-screen" />}>
      <OverlayClient params={params} />
    </Suspense>
  );
}
