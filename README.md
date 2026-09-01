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
│   │   └── [id].js            # GET / PUT / DELETE single project;
│   │                          #   id 'active' = Stream Deck target (GET/POST)
│   ├── quick-marker.js        # GET/POST one-shot marker (Stream Deck)
│   ├── markers/
│   │   ├── index.js           # GET by project / POST create
│   │   └── [id].js            # PUT / DELETE single marker
│   └── export/
│       ├── edl.js             # EDL file export
│       └── pdf.js             # PDF report export
├── lib/
│   ├── db.js                  # Database connection & table setup
│   ├── active-project.js      # Stream Deck target read/write + route handler
│   └── pusher.js              # Pusher server instance
├── public/
│   ├── index.html             # Single-page app
│   ├── style.css              # Dark theme styles
│   └── app.js                 # Frontend logic
├── vercel.json                # Vercel routing config
├── package.json
└── .env.example               # Environment variable template
```

## Stream Deck / external triggers

`GET|POST /api/quick-marker` creates a single marker in one request. The
timecode is computed **server-side** (Europe/Budapest wall clock, 25 fps), so
the caller only needs to fire the URL — no client-side timecode math, and no
browser tab has to be focused.

| Param | Required | Notes |
|---|---|---|
| `name` | yes | Marker name, e.g. `INTRO`. Matched case-insensitively against the project's shortcut buttons to pick a color. |
| `project_id` | no | Defaults to the current **Stream Deck target** project. |
| `color` | no | Overrides the color looked up from the buttons. Falls back to `Orange` when no button matches. |
| `comment` | no | Free-text comment. |

The target project is set explicitly in the web app: open a project and press
**Set as Stream Deck target**. Only one project can be the target at a time,
and the project list badges it with 🎛️. The new marker is broadcast over
Pusher, so open clients see it appear live.

```
https://<host>/api/quick-marker?name=INTRO
https://<host>/api/quick-marker?name=ROSSZ&comment=retake
```

### macOS Stream Deck setup

The Stream Deck app has no built-in "call a URL" action on macOS, so go through
Shortcuts:

1. **Shortcuts.app** → new shortcut per marker, one `Get Contents of URL` action,
   method `GET`, URL as above. Name it e.g. `PD MARKER - INTRO`.
2. **Stream Deck** → install the *Mac Shortcuts Runner* plugin, drag one action
   per key, and pick the matching shortcut.
3. Set the key title/color to match the marker.

Because the URL carries no `project_id`, the keys never need reconfiguring
between recordings — only the target project changes in the web app.

> **Serverless function budget.** The Vercel Hobby plan allows 12 functions per
> deployment and this project sits exactly at 12. Adding a file under `api/`
> makes the build succeed and then fail at "Deploying outputs". Fold new
> endpoints into an existing handler instead — that is why the Stream Deck
> target lives in `lib/active-project.js`, served by `api/projects/[id].js`.

## EDL Format

Exports markers in standard EDL format for DaVinci Resolve:

```
TITLE: Project Name
FCM: NON-DROP FRAME

001  001      V     C        01:23:45:12 01:23:45:12 01:23:45:12 01:23:45:12
comment text |C:ResolveColorRed |M:MARKER NAME |D:0
```

### Color Mapping

Every app color maps to a **distinct** DaVinci Resolve color, so markers keep
their colors apart after import.

| App Color | DaVinci Resolve Color | Default use |
|---|---|---|
| Pink | ResolveColorPink | BROLL |
| Yellow | ResolveColorYellow | SPONSOR / AD-SPOT |
| Blue | ResolveColorBlue | INTRO |
| Red | ResolveColorRed | ROSSZ |
| Purple | ResolveColorPurple | KEZDÉS |
| Orange | ResolveColorSand | _legacy / backward-compat_ |
| White | ResolveColorCream | _legacy / backward-compat_ |

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
| color | TEXT | Pink, Yellow, Blue, Red, Purple (+ legacy Orange, White) |
| name | TEXT | Marker label |
| comment | TEXT | Free-text comment |
| created_at | TIMESTAMP | Creation time |

**checklist_template**
| Column | Type | Description |
|---|---|---|
| id | SERIAL | Primary key |
| project_id | INTEGER | `NULL` = shared base item (all projects); a project id = extra item for that project only |
| label | TEXT | Item label |
| drops_marker | BOOLEAN | If true, checking the item also drops a marker |
| color | TEXT | Marker color |
| sort_order | INTEGER | Display order within its scope |

**checklist_state**
| Column | Type | Description |
|---|---|---|
| id | SERIAL | Primary key |
| project_id | INTEGER | Foreign key → projects.id |
| checklist_item_id | INTEGER | Foreign key → checklist_template.id |
| checked | BOOLEAN | Per-project checked state |

**app_state**
| Column | Type | Description |
|---|---|---|
| key | TEXT | Primary key. `active_project_id` holds the Stream Deck target. |
| value | TEXT | Stored value. |
