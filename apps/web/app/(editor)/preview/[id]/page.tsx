import PreviewClient from './PreviewClient';

// For static export - generate demo page
export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return [];
  }
  return [{ id: 'demo' }];
}

// For static export compatibility, set to false
export const dynamicParams = false;

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default function PreviewPage({ params }: PreviewPageProps) {
  return <PreviewClient params={params} />;
}
