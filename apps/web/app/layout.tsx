import './globals.css';
import ToastContainer from '@/components/ui/ToastContainer';
import PortSwitchNotice from '@/components/ui/PortSwitchNotice';

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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <title>AITuberFlow</title>
        <meta name="description" content="Build AI-powered virtual streamers with a visual workflow editor" />
        {/* No-flash: apply the persisted theme before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('aituber-flow-theme');var t='dark';if(s){var p=JSON.parse(s);if(p&&p.state&&p.state.theme){t=p.state.theme;}}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();",
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ToastContainer />
        <PortSwitchNotice />
      </body>
    </html>
  );
}
