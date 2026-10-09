# NiveshMitra

NiveshMitra is an empathetic, emotion-aware investment advisor and conversational financial planner for retail investors. It learns a person's goals, time horizon, income, and emotional comfort with market swings through natural conversation, then constructs a personalized, educational asset allocation plan with milestone check-ins.

> **Disclaimer:** This project is for educational guidance and demonstration only. It is not registered financial advice, does not execute trades, and does not guarantee returns.

---

## Key Features

### 1. ChaiUI Design System (`chaicode.com` aesthetic)
* **Warm Restrained Palette:** Near-black background (`#0a0a0a`) in dark mode and warm ivory (`#fafaf9`) in light mode.
* **Typography:** Clean Google Fonts integration using **Manrope** for headlines/body and **Montserrat** for numbers, stats, and signature cream highlight phrases (`#ffedd5`).
* **Asymmetric Action Geometry:** Signature asymmetric primary solid buttons (`border-radius: 0 10px 0 10px`) with mirrored outline companions.
* **Warm Hairline Cards:** Zero drop shadows: depth is created strictly through warm hairline borders (`rgba(255, 247, 237, 0.12)`) and background blurs.
* **Ambient Landing Glow:** Multi-stop ambient top glow and floor vignette scoped exclusively to the landing page.

### 2. Interactive Investment Growth & Compounding Chart
* **Rising Dynamic Height Bars:** Live milestone bars (Yr 1, 5, 10, 15, and 20) that dynamically rise in height as horizon or SIP amounts change.
* **Stacked Principal vs Growth Breakdown:** Visual contrast between the capital you invest (neutral slate) and exponential compounding returns earned (glowing orange-to-cream gradient).
* **Live Figures & Multipliers:** Instant compounding multiplier (e.g. `2.8x growth`) and projected wealth calculations.
* **Hero Visual Switcher:** Segmented toggle on the landing page between the **Growth Chart** and the **AI Companion Preview**.

### 3. Dual-Layer Emotion & Sentiment Safety-Net
* **Hybrid Panic Detection:** Deterministic regex pattern matching (detecting phrases like *"market is crashing"*, *"sell everything"*, *"can't sleep"*) combined with zero-shot LLM emotion classification.
* **Calm Mode:** Gently pauses impulsive decisions, reminds investors why long-term plans are built for volatility, and discourages panic selling.
* **FOMO Coaching:** Steers users away from speculative urgency, encouraging paper-testing and goal alignment before risking real capital.
* **Periodic Check-ins:** Automated check-in prompts triggered every 4 conversational turns.

### 4. Goal-Based Risk Profiling & Plan Generation
* **Mathematical Risk Scoring:** Calculates an objective 0–100 score based on horizon, loss tolerance, investable income ratio, and life stage.
* **Asset Allocation:** Recommends diversified portfolios spanning Large-Cap Index Funds, Flexi-Cap Funds, Debt/Fixed Income, Liquid reserves, and Sovereign Gold Bonds (SGB).
* **Interactive Plan Dashboard:** Per-asset sliders allowing users to simulate local "what-if" allocations and compound interest trajectories.

### 5. Gradient Logo & Orbital Reloading Animations
* **Stylized Compass Pod:** Custom SVG brand mark with linear gradient borders (`#FF7D0C` to `#FFE1B9`), compass growth needle, and glowing brand dot.
* **Orbital Reloader:** Ambient hairline ring with a rotating light comet and pulsing glowing core orb.
* **Interactive History Refresh:** One-click animated reload button (`↻`) in the chat conversation history sidebar.
* **Reflecting Indicator:** Smooth inline gradient spinner replacing static typing dots during AI thought synthesis.

---

## Tech Stack

* **Frontend:** React 18, Vite, ChaiUI custom token system, CSS Variables.
* **Backend:** Node.js, Express, Mongoose.
* **Database:** MongoDB (with automatic in-memory fallback if no database is connected).
* **AI Engine:** Groq SDK (`openai/gpt-oss-20b` or `llama-3.3-70b-versatile`), with built-in offline deterministic mock mode.
* **Authentication:** HTTP-only cookie-based sessions, bcrypt password hashing, optional Google Sign-In.

---

## Getting Started

### Prerequisites
* Node.js 18 or newer
* npm
* Local MongoDB instance or MongoDB Atlas URI (optional; falls back to in-memory)
* Groq API Key (optional; falls back to offline mock mode)

### 1. Backend Setup

Open a terminal in the project root:

```powershell
# Copy the environment template
Copy-Item backend\.env.example backend\.env
```

Open `backend\.env` and configure your settings:

```env
PORT=5000
AUTH_SECRET=replace_with_a_long_random_secret
ALLOWED_ORIGINS=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/niveshmitra
GROQ_API_KEY=your_groq_api_key_here
```

Generate a random secret in PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Start the backend:
```powershell
Set-Location backend
npm install
npm run dev
```

The API will start at `http://localhost:5000`.

### 2. Frontend Setup

In a second terminal:

```powershell
Copy-Item frontend\.env.example frontend\.env
Set-Location frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Vite proxies `/api` calls directly to the Express server.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | API server port | `5000` |
| `AUTH_SECRET` | Secret key used to sign HTTP-only session cookies | Required |
| `AUTH_COOKIE_SAMESITE` | Cookie SameSite policy (`lax` or `none` for cross-site HTTPS) | `lax` |
| `ALLOWED_ORIGINS` | Permitted CORS origins | `http://localhost:5173` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/niveshmitra` |
| `GROQ_API_KEY` | Groq API key (leave empty for deterministic mock mode) | Optional |
| `GROQ_MODEL` | Primary LLM model identifier | `openai/gpt-oss-20b` |
| `GROQ_FALLBACK_MODELS` | Comma-separated fallback models | `llama-3.3-70b-versatile` |
| `MOCK_LLM` | Force offline deterministic mock mode | `false` |
| `GOOGLE_CLIENT_ID` | Optional Google OAuth 2.0 client ID | Optional |

### Frontend (`frontend/.env`)

| Variable | Description |
| :--- | :--- |
| `VITE_GOOGLE_CLIENT_ID` | Optional client ID for Google Sign-In button |

---

## Project Structure

```text
NiveshMitra/
├── backend/
│   ├── src/
│   │   ├── config/          # Database configuration (MongoDB connection)
│   │   ├── data/            # Asset templates and portfolio allocation datasets
│   │   ├── models/          # User, conversation, risk profile, and plan schemas
│   │   ├── prompts/         # Structured LLM prompts and behavioral directives
│   │   ├── routes/          # API endpoints (auth, chat, profile, plan)
│   │   ├── services/        # Store, emotion safety net, risk engine, plan builder
│   │   └── server.js        # Express app entry point and middleware
│   └── package.json
│
├── frontend/
│   ├── public/              # Public assets and favicon
│   ├── src/
│   │   ├── api/             # Backend API client with HTTP cookie support
│   │   ├── components/      # UI components (Landing, GrowthChart, Chat, Dashboard, Logo, Reloader)
│   │   ├── utils/           # Currency and compact formatters
│   │   ├── App.jsx          # Primary chat and dashboard workspace view
│   │   ├── Root.jsx         # View router and authentication container
│   │   ├── styles.css       # ChaiUI design tokens and component stylesheet
│   │   └── main.jsx         # React application entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

---

## Production Build

To validate and build for production:

```powershell
# Build frontend bundle
Set-Location frontend
npm run build

# Start backend server
Set-Location ..\backend
npm start
```
