# Cloudflare Pages Deployment Guide

## Demo Mode Configuration

This guide explains how to deploy the AITuberFlow demo to Cloudflare Pages.

### Build Settings

| Setting | Value |
|---------|-------|
| **Framework preset** | None |
| **Build command** | `cd apps/web && npm install && NEXT_PUBLIC_DEMO_MODE=true npm run build` |
| **Build output directory** | `apps/web/out` |
| **Root directory** | `/` (repository root) |

### Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_DEMO_MODE` | `true` | Enables demo mode (localStorage, no WebSocket) |
| `NODE_VERSION` | `20` | Node.js version for build |

### How It Works

1. **Static Export**: Next.js generates static HTML pages at build time
2. **Demo Pages**: Only `/editor/demo`, `/preview/demo`, `/overlay/demo` are pre-rendered
3. **Redirects**: `_redirects` file handles routing:
   - Direct access to demo pages returns the static HTML (200)
   - Any other workflow ID redirects to demo (302)
4. **No Backend**: Uses localStorage for data persistence, WebSocket is disabled

### Deploy via CLI

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Build the project
cd apps/web
NEXT_PUBLIC_DEMO_MODE=true npm run build

# Deploy
wrangler pages deploy out --project-name=aituber-flow-app
```

### Deploy via Dashboard

1. Go to [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages)
2. Click "Create a project" → "Connect to Git"
3. Select your repository
4. Configure build settings as shown above
5. Add environment variables
6. Deploy

### Custom Domain (app.aituber-flow.dev)

1. In your Cloudflare Pages project, go to "Custom domains"
2. Add `app.aituber-flow.dev`
3. Since the domain is already on Cloudflare, DNS will be configured automatically

### Testing Locally

```bash
# Build in demo mode
NEXT_PUBLIC_DEMO_MODE=true npm run build

# Serve locally (note: _redirects won't work)
npx serve out -l 3000

# Access at http://localhost:3000/editor/demo
```
