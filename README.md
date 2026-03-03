# Bazu Time Coder

Podcast live timecode marker app for team use during recordings. A clone of EditingTools.io's marker feature, designed for a small team to drop time-coded markers in real time during live podcast recordings.

Timecodes use wall-clock time in **HH:MM:SS:FF** format at **25fps**, matching camera timecodes set to wall-clock time. Markers can be exported as **EDL files** for DaVinci Resolve or as **PDF reports**.

## Features

- **Live timecode clock** — Wall-clock time at 25fps (HH:MM:SS:FF)
- **One-click shortcut buttons** — Configurable presets (INTRO, ERDEKES, ROSSZ, etc.)
- **Multi-user real-time sync** — All team members see markers instantly via Pusher
- **EDL export** — DaVinci Resolve compatible, with color mapping
- **PDF export** — Professional report with table layout
- **Per-project settings** — Custom shortcut buttons per project
- **No login required** — Anonymous, team-friendly

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Backend:** Vercel Serverless Functions (Node.js)
- **Database:** Vercel Postgres (Neon)
- **Real-time:** Pusher
- **PDF generation:** PDFKit

## Deployment to Vercel

### 1. Push to GitHub

Push this repository to GitHub.

### 2. Create a Vercel Project

1. Go to [vercel.com](https://vercel.com) and import the GitHub repository
2. Vercel will auto-detect the project structure

### 3. Set Up Vercel Postgres

1. In your Vercel project dashboard, go to **Storage**
2. Click **Create Database** → **Postgres**
3. Follow the setup wizard
4. This automatically sets the `POSTGRES_URL` environment variable

### 4. Set Up Pusher

1. Go to [pusher.com](https://pusher.com) and create a free account
2. Create a new **Channels** app
3. Note down the credentials from the app's **Keys** tab

### 5. Set Environment Variables

In your Vercel project, go to **Settings** → **Environment Variables** and add:

| Variable | Description | Where to get it |
|---|---|---|
| `POSTGRES_URL` | PostgreSQL connection string | Auto-set by Vercel Postgres |
| `PUSHER_APP_ID` | Pusher application ID | Pusher dashboard → App Keys |
| `PUSHER_KEY` | Pusher public key | Pusher dashboard → App Keys |
| `PUSHER_SECRET` | Pusher secret key | Pusher dashboard → App Keys |
| `PUSHER_CLUSTER` | Pusher cluster region (e.g., `eu`) | Pusher dashboard → App Keys |

### 6. Deploy

Vercel deploys automatically on push. After deployment:

1. Open your deployed app
2. Click the **Setup DB** button on the project list page to initialize database tables
3. Create your first project and start marking!

## Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your Postgres and Pusher credentials in .env

# Run with Vercel CLI
npx vercel dev
```

## Project Structure

```
├── api/
│   ├── config.js              # Public config (Pusher key/cluster)
│   ├── setup.js               # Database table initialization
│   ├── projects/
│   │   ├── index.js           # GET list / POST create
│   │   └── [id].js            # GET / PUT / DELETE single project
│   ├── markers/
│   │   ├── index.js           # GET by project / POST create
│   │   └── [id].js            # PUT / DELETE single marker
│   └── export/
│       ├── edl.js             # EDL file export
│       └── pdf.js             # PDF report export
├── lib/
│   ├── db.js                  # Database connection & table setup
│   └── pusher.js              # Pusher server instance
├── public/
│   ├── index.html             # Single-page app
│   ├── style.css              # Dark theme styles
│   └── app.js                 # Frontend logic
├── vercel.json                # Vercel routing config
├── package.json
└── .env.example               # Environment variable template
```

## EDL Format

Exports markers in standard EDL format for DaVinci Resolve:

```
TITLE: Project Name
FCM: NON-DROP FRAME

001  001      V     C        01:23:45:12 01:23:45:12 01:23:45:12 01:23:45:12
comment text |C:ResolveColorRed |M:MARKER NAME |D:0
```

### Color Mapping

| App Color | DaVinci Resolve Color |
|---|---|
| Orange | ResolveColorRed |
| Blue | ResolveColorBlue |
| Purple | ResolveColorPurple |
| White | ResolveColorBlue |
| Pink | ResolveColorPink |
| Red | ResolveColorRed |

## Database Schema

**projects**
| Column | Type | Description |
|---|---|---|
| id | SERIAL | Primary key |
| name | TEXT | Project name |
| buttons | JSONB | Array of `{label, color}` shortcut buttons |
| created_at | TIMESTAMP | Creation time |

**markers**
| Column | Type | Description |
|---|---|---|
| id | SERIAL | Primary key |
| project_id | INTEGER | Foreign key → projects.id |
| timecode | TEXT | HH:MM:SS:FF format |
| color | TEXT | Orange, Blue, Purple, White, Pink, Red |
| name | TEXT | Marker label |
| comment | TEXT | Free-text comment |
| created_at | TIMESTAMP | Creation time |
