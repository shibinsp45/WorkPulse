# WorkPulse

WorkPulse is a personal employee time-tracking web app. It supports punch in, punch out, automatic break confirmation, daily/weekly reports, live workplace location prompts, login/signup, and guest mode.

## Features

- Login and signup with a local Express backend
- Guest mode with browser-local records
- Punch In and Punch Out workflow
- Break confirmation when returning after a gap
- Live timer and daily total
- Weekly and monthly reports
- Work notes and focus tags
- Manual workplace location
- Browser location fetch
- Arrival prompt when you reach your saved workplace while punched out
- Installable PWA with splash icon and Add to Home Screen support

## Run Locally

Install dependencies:

```powershell
npm install
```

Start frontend and backend:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

Backend runs at:

```text
http://127.0.0.1:4000
```

## Open On Mobile During Development

Make sure your phone and computer are on the same Wi-Fi network, then run:

```powershell
npm run dev:mobile
```

Vite will show a network URL like:

```text
http://192.168.x.x:5173
```

Open that URL on your phone.

Important: browser live location and Add to Home Screen work best on HTTPS. Localhost is allowed on the computer, but a phone opening a local Wi-Fi IP may block location because it is plain HTTP.

## Install As A Web App

After deploying to an HTTPS URL:

Android Chrome:

1. Open the WorkPulse URL.
2. Tap the browser menu.
3. Tap `Add to Home screen` or `Install app`.
4. Open WorkPulse from the new home-screen icon.

iPhone Safari:

1. Open the WorkPulse URL in Safari.
2. Tap Share.
3. Tap `Add to Home Screen`.
4. Open WorkPulse from the new home-screen icon.

## Deployment Notes

GitHub Pages can host the frontend and PWA files. Guest mode works fully on GitHub Pages because it stores records in the browser.

Login/signup needs the backend in `server/index.js`, so host the backend separately on a service like Render, Railway, Fly.io, or a VPS.

For a deployed backend, build the frontend with:

```text
VITE_API_BASE_URL=https://your-backend-url.com
```

The backend stores data in:

```text
server/data/workpulse.json
```

That file is ignored by Git so private records are not pushed to GitHub.

## Build

```powershell
npm run build
```

The built frontend is written to:

```text
dist
```

## Project Structure

```text
src/                 React app
server/index.js      Express API
public/              PWA manifest, service worker, app icons
.github/workflows/   GitHub Pages deploy workflow
```
