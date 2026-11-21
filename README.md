<div align="center">

# IBPS — Integrated Block Planning System

### AI-Powered Maintenance Block Planning for Indian Railways

**Smart India Hackathon 2026 · Problem Statement SIH-26027**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![OR-Tools](https://img.shields.io/badge/Google%20OR--Tools-CP--SAT-EA4335?style=flat-square&logo=google&logoColor=white)](https://developers.google.com/optimization)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-35%20passing-brightgreen?style=flat-square)](tests/)

**[Live Demo](https://ibps-railway-planner.vercel.app) · [API Docs](https://ibps-api-1d5z.onrender.com/docs) · [Health Check](https://ibps-api-1d5z.onrender.com/api/health)**

</div>

---

## Overview

Indian Railways maintains over 68,000 km of track, overhead electrification, and signalling infrastructure — all requiring periodic maintenance within **traffic blocks**: time windows where a section of track is taken out of service. Coordinating these blocks across four departments (Engineering, Signal & Telecommunication, Traction Distribution, and Operations) is done manually today — over phone calls, paper registers, and siloed legacy systems (TMS, SMMS, TDMS, COA).

The result: critical safety tasks frequently go unscheduled, track possessions overlap wastefully, and planners spend 3–5 hours per week on coordination that should be automated.

**IBPS replaces this process** with a mathematically optimal, constraint-guaranteed scheduling engine built on Google OR-Tools CP-SAT — the same combinatorial AI solver used by Google Flights and large-scale logistics systems. A planning cycle that takes a human 3–5 hours is solved to proven optimality in **about 10 milliseconds** on the 21-task demo fixture; on the 200-task synthetic dataset the solver returns its best feasible plan within its **30-second** time limit.

> **Human-in-the-Loop Notice:** IBPS provides AI-assisted decision support. Final approval and override authority remain with authorized railway controllers and sectional engineers.

---

## Live Deployment

| Service | URL | Platform |
|---|---|---|
| **Frontend (React SPA)** | https://ibps-railway-planner.vercel.app | Vercel Edge CDN |
| **Backend API** | https://ibps-api-1d5z.onrender.com | Render (free web service) |
| **Swagger API Docs** | https://ibps-api-1d5z.onrender.com/docs | FastAPI / OpenAPI |
| **Health Check** | https://ibps-api-1d5z.onrender.com/api/health | — |

---

## Key Results

All numbers are computed on the 200-task, 72-block synthetic dataset in this repo (`data/generated/full_dataset.json`), comparing the IBPS CP-SAT optimizer against a manual first-fit greedy baseline. Solver results at the time limit can vary slightly between machines:

| Metric | Manual Baseline | IBPS Optimized | Improvement |
|---|---|---|---|
| Critical Safety Tasks Cleared | 24 | **32** | **+33.3%** |
| Cross-Department Coordinated Blocks | 16 | **36** | **+125.0%** |
| Average Block Utilization | 89.6% | **98.6%** | **+10.1%** |
| Priority Score Fulfilled | 67.5% | **83.4%** | **+23.6%** |
| Schedule Generation Time | 3–5 hours (human) | **30 s (solver time limit)** | **~360–600×** |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React 19 Frontend                        │
│          Vite 8 · Tailwind v4 · Recharts · React Router        │
│                    Vercel Edge CDN (Global)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │  /api/* (HTTP proxy rewrite)
┌──────────────────────────▼──────────────────────────────────────┐
│                      FastAPI Backend                             │
│                      Render · Python 3.11                        │
│                                                                  │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  Priority     │  │   CP-SAT         │  │  Metrics &       │ │
│  │  Engine       │→ │   Optimizer      │→ │  Comparison      │ │
│  │  (5-factor    │  │  (OR-Tools)      │  │  Engine          │ │
│  │   scoring)    │  │  5 constraints   │  │  KPI Dashboard   │ │
│  └───────────────┘  │  7-term objective│  └──────────────────┘ │
│                     └──────────────────┘                        │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  Baseline     │  │  What-If /       │  │  Data Ingestion  │ │
│  │  Greedy       │  │  Contingency     │  │  CSV · JSON      │ │
│  │  Scheduler    │  │  Replanner       │  │  Template Upload │ │
│  └───────────────┘  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
IBPS-Integrated-Block-Planning-System/
│
├── backend/                        # FastAPI + CP-SAT Optimization Engine
│   ├── app/
│   │   ├── main.py                 # Application factory & ASGI entrypoint
│   │   ├── config.py               # Optimization constants & objective weights
│   │   ├── core/                   # Settings, error handlers, middleware
│   │   ├── api/routes/             # REST endpoints: dashboard, tasks, blocks,
│   │   │                           #   plans, what-if, ingestion, diagnostics
│   │   ├── domain/                 # Pydantic domain models & enums
│   │   ├── services/               # Business logic & state management
│   │   ├── optimization/
│   │   │   ├── optimizer.py        # CP-SAT formulation (constraints + objective)
│   │   │   ├── baseline.py         # Greedy first-fit baseline scheduler
│   │   │   └── candidate_model.py  # Pre-solve feasibility pruning
│   │   ├── scoring/
│   │   │   └── priority_engine.py  # 5-factor weighted priority scoring
│   │   ├── metrics/
│   │   │   └── evaluator.py        # KPI computation & plan comparison
│   │   ├── adapters/               # Synthetic data adapters (TMS/SMMS/TDMS)
│   │   └── data/                   # Fixture loader & synthetic data generator
│   └── .env.example
│
├── frontend/                       # React 19 + Vite 8 + Tailwind v4 SPA
│   ├── src/
│   │   ├── components/             # UI components (dashboard, charts, tables)
│   │   └── api/                    # Typed API client
│   ├── vercel.json                 # Vercel deploy config + API proxy rewrite
│   └── vite.config.ts
│
├── data/
│   ├── fixtures/demo_fixture.json  # 12-element deterministic demo dataset
│   └── generated/full_dataset.json # 200-task synthetic evaluation dataset
│
├── tests/
│   ├── unit/                       # Unit tests: constraints, scoring, metrics
│   ├── integration/                # End-to-end optimization tests
│   ├── api/                        # HTTP endpoint tests
│   └── conftest.py
│
├── docs/                           # Engineering specifications & contracts
├── deliverables/                   # SIH submission artifacts
├── Dockerfile                      # Portable Docker image for the API
├── render.yaml                     # Render Blueprint for the API
├── .github/workflows/keep-alive.yml # Pings the Render API every 10 min
├── requirements.txt                # Python dependencies
└── pytest.ini                      # Test configuration
```

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20.19+ or 22.12+ (required by Vite 8) and npm

### 1. Clone & Configure Environment

```bash
git clone https://github.com/spy-in-shadows/IBPS-Integrated-Block-Planning-System-.git
cd IBPS-Integrated-Block-Planning-System-

cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2. Backend

```bash
# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the API server
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs available at **http://localhost:8000/docs**

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at **http://localhost:5173**

---

## Running Tests

```bash
# Run all unit tests from project root
.venv/bin/pytest

# Verbose output
.venv/bin/pytest -v

# CLI audit benchmark (terminal output of a full optimization run + solver diagnostics)
.venv/bin/python backend/app/cli.py --audit

# Rewrite data/*.json from the generator (otherwise only created when missing)
.venv/bin/python backend/app/cli.py --regenerate
```

The report generator in `tools/` needs one extra package that the API does not:

```bash
pip install -r requirements-tools.txt
python tools/build_sih_project_report.py   # writes deliverables/*.docx
```

**35 tests** (unit, integration and API) covering:

- CP-SAT hard constraints (corridor isolation, crew capacity, precedence, safety incompatibility)
- Priority scoring engine (5-factor weighted formula)
- Objective function terms (clubbing incentive, critical bonus, penalty terms)
- Baseline greedy scheduler
- Metrics evaluator & KPI computation
- What-if emergency replanning and task displacement

---

## Optimization Formulation

IBPS uses **Google OR-Tools CP-SAT** (Constraint Programming with SAT-based search) to solve the multi-department maintenance scheduling problem.

### Decision Variables

$$x_{i,j} \in \{0, 1\} \quad \forall \text{ feasible (task } i\text{, block } j\text{) pair}$$

$$\text{sched}_i \in \{0, 1\}, \quad u_j \in \{0, 1\} \quad \text{(task scheduled indicator, block used indicator)}$$

### Hard Constraints

| # | Constraint | Description |
|---|---|---|
| 1 | $\sum_j x_{i,j} \le 1$ | Each task assigned to at most one block |
| 2 | $\sum_i x_{i,j} \cdot \text{crew}_i \le \text{Capacity}_j$ | Crew resource capacity per block |
| 3 | $\sum_i x_{i,j} \le \text{Slots}_j$ | Available task slot capacity per block |
| 4 | $\text{sched}_B \le \text{sched}_A$ and temporal ordering | Precedence dependencies between tasks |
| 5 | $x_{i,j} + x_{k,j} \le 1$ | Safety incompatibility (mutual exclusion within same block) |

Pre-solve, infeasible pairs are pruned by the **CandidateModel** on corridor mismatch, deadline violations, and train conflict windows — dramatically reducing the problem search space.

### Objective Function (Maximization)

$$\max \; \underbrace{10 \sum_{i,j} P_i \cdot x_{i,j}}_{\text{priority completion}} + \underbrace{500 \sum_{i \in C} \text{sched}_i}_{\text{critical bonus}} - \underbrace{800 \sum_{i \in C} (1-\text{sched}_i)}_{\text{critical penalty}} + \underbrace{350 \sum_j e_j}_{\text{clubbing bonus}} - \underbrace{40 \sum_j H_j \cdot u_j}_{\text{possession hours}} - \underbrace{15 \sum_j D_j \cdot u_j}_{\text{train disruption}} - \underbrace{\sum_j G_j \cdot u_j}_{\text{goods traffic}}$$

Where $P_i$ = task priority score, $C$ = critical tasks, $e_j$ = extra departments per block beyond first (clubbing), $H_j$ = block duration in hours, $D_j$ = train disruption penalty, $G_j$ = goods traffic cost.

---

## API Reference

Full OpenAPI specification: [`/docs`](https://ibps-api-1d5z.onrender.com/docs)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | System health check |
| `GET` | `/api/dashboard` | Aggregated KPI dashboard |
| `GET` | `/api/tasks` | List all maintenance tasks |
| `GET` | `/api/blocks` | List all block windows |
| `POST` | `/api/plans/baseline` | Generate greedy baseline plan |
| `POST` | `/api/plans/optimize` | Run CP-SAT optimizer |
| `GET` | `/api/plans/comparison` | Baseline vs optimized comparison |
| `POST` | `/api/plans/what-if` | Emergency task replanning with diff |
| `POST` | `/api/plans/contingency` | Contingency scenario simulation |
| `GET` | `/api/plans/diagnostics` | Full solver diagnostic report |
| `POST` | `/api/ingest/csv` | Upload tasks/blocks/trains via CSV |
| `GET` | `/api/ingest/templates/{type}` | Download CSV input templates |
| `GET` | `/api/plans/export/csv` | Export schedule as CSV |
| `GET` | `/api/plans/export/json` | Export schedule as JSON |

**Quick test:**

```bash
curl -s -X POST \
  https://ibps-api-1d5z.onrender.com/api/plans/optimize \
  -H "Content-Type: application/json" \
  -d '{"horizon": "WEEKLY", "objective_profile": "balanced"}' | python3 -m json.tool
```

---

## AI Approach: Constraint Programming vs Machine Learning

### What Powers IBPS Today

IBPS uses **Google OR-Tools CP-SAT** — a form of combinatorial AI / Operations Research that does not require training data. It takes the mathematical rules of the problem (safety constraints, crew limits, train timetables, task deadlines, department dependencies) and finds a **provably globally optimal** solution across all of them simultaneously.

This is the correct tool for this problem class. Scheduling under hard constraints is a combinatorial optimization problem — not a prediction problem. ML models predict; they do not guarantee. CP-SAT guarantees that no safety constraint is violated, no block exceeds crew capacity, and no critical task is skipped — by mathematical proof.

### Why ML Is Not Used Yet

Supervised ML modules — demand forecasting, risk scoring, conflict prediction — require **real historical data**: maintenance logs, failure records, sensor readings, inspection histories. This data is held by Indian Railways and is not yet available to the project.

Claiming ML without real training data would be dishonest. So we didn't.

### ML Roadmap (Phase 2)

Once operational data becomes available, six ML modules are architected to feed directly into the existing CP-SAT pipeline as enhanced inputs:

| Module | Technique | Data Required |
|---|---|---|
| Task Priority Scorer | XGBoost Ranker | Maintenance logs + failure records |
| Maintenance Demand Forecaster | LSTM / Prophet | Historical task-submission time series |
| Train Conflict Classifier | Random Forest | Block × train incident history |
| Asset Health Scorer | Autoencoder + Regression | OMS sensor data, relay/catenary logs |
| Block Slot Recommender | Multi-output Regression | Historical block utilization records |
| Inspection Report Parser | Fine-tuned BERT (NER) | Scanned PDF inspection registers |

ML enhances the *quality of inputs*. CP-SAT guarantees the *correctness and constraint-safety of outputs*.

---

## Deployment

### Backend — Render (free web service)

The API runs as a Python 3.11 web service on Render, defined by the Blueprint in [`render.yaml`](render.yaml):

- **Build:** `pip install -r requirements.txt`
- **Start (from the repo root):** `uvicorn --app-dir backend app.main:app --host 0.0.0.0 --port $PORT`
- **Health check:** `/api/health`
- **Env:** `PYTHON_VERSION=3.11.9`; `CORS_ORIGINS` (comma-separated frontend origins) is entered in the Render dashboard

To set it up: Render dashboard → **New → Blueprint** → select this repo → enter `CORS_ORIGINS` → **Apply**. Render redeploys on every push to `main`.

Free instances sleep after about 15 minutes without traffic. The [`keep-alive`](.github/workflows/keep-alive.yml) GitHub Actions workflow pings `/api/health` every 10 minutes (and can be run manually) to avoid cold starts.

The [`Dockerfile`](Dockerfile) remains as a portable option for any container host (`docker build -t ibps-api . && docker run -p 8000:8000 ibps-api`).

### Frontend — Vercel

The frontend deploys as a static SPA on Vercel's Edge CDN. [`frontend/vercel.json`](frontend/vercel.json) rewrites all `/api/*` requests to the Render backend, so the browser only ever talks to the Vercel origin.

```bash
cd frontend
vercel --prod
```

Leave `VITE_API_BASE_URL` **unset** in Vercel's environment variables: the app then calls `/api`, which the rewrite proxies to Render. Setting it would bypass the rewrite.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Optimization Engine** | Google OR-Tools CP-SAT 9.9+ |
| **Backend Framework** | FastAPI 0.110+ · Python 3.11 |
| **Data Validation** | Pydantic v2 |
| **ASGI Server** | Uvicorn |
| **Frontend Framework** | React 19 · TypeScript |
| **Build Tool** | Vite 8 |
| **Styling** | Tailwind CSS v4 |
| **Charts** | Recharts |
| **Routing** | React Router v7 |
| **Testing** | pytest 8+ · httpx |
| **Backend Hosting** | Render (free web service) |
| **Frontend Hosting** | Vercel (Edge CDN) |

---

<div align="center">

Built for **Smart India Hackathon 2026** · Problem Statement SIH-26027  
*Integrated Block Planning System for Railway Maintenance Optimization*

</div>
