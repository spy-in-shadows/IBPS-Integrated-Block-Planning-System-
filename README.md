# IBPS — Integrated Block Planning System
### AI-Powered Automated Railway Maintenance Block Planning for Indian Railways
**Smart India Hackathon (SIH) — Problem Statement 26027**

[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![OR-Tools](https://img.shields.io/badge/Google%20OR--Tools-CP--SAT-red.svg)](https://developers.google.com/optimization)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📌 Executive Summary

Railway maintenance in India has historically operated within departmental silos — **Engineering** (track & civil), **Signal & Telecommunication (S&T)**, and **Traction Distribution (TRD / OHE)** independently request maintenance traffic blocks through legacy systems (TMS, SMMS, TDMS). When coordinated manually via Control Office Applications (COA), this results in fragmented track possessions, severe train disruptions, and suboptimal asset utilization.

**IBPS (Integrated Block Planning System)** delivers an AI-driven, constraint-satisfaction optimization engine (powered by Google OR-Tools CP-SAT) paired with a high-density operational cockpit. It automates cross-department block clubbing, enforces strict precedence and safety rules, eliminates high-priority passenger conflicts, and supports dynamic what-if emergency replanning.

> **Decision-Support Notice:** *IBPS provides AI-assisted decision support for maintenance block planning. Final approval and override remain with authorized railway controllers and sectional engineers.*

---

## 🏗 System Architecture & Repository Structure

```
IBPS-Integrated-Block-Planning-System/
├── .env.example                       # Root environment configuration template
├── .gitignore                          # Production-grade gitignore (Python, Node, OS, Env)
├── pytest.ini                          # Pytest configuration for root execution
├── README.md                           # Master project documentation
├── requirements.txt                    # Root Python dependencies for API deployment
├── render.yaml                         # Infrastructure blueprint for Render deployment
│
├── backend/                            # FastAPI backend + CP-SAT Optimization Engine
│   ├── .env.example                    # Backend environment configuration template
│   ├── app/
│   │   ├── main.py                     # FastAPI application factory & server entrypoint
│   │   ├── config.py                   # Domain configuration & optimization constants
│   │   ├── core/                       # Core settings, error handlers, and middleware
│   │   ├── api/routes/                 # REST API routes (dashboard, tasks, blocks, plans, what-if)
│   │   ├── domain/                     # Pydantic schemas, models, and domain enums
│   │   ├── services/                   # Business logic, state management, and export services
│   │   ├── optimization/               # Google OR-Tools CP-SAT formulation & baseline scheduler
│   │   ├── scoring/                    # Transparent 5-factor priority scoring engine
│   │   ├── metrics/                    # Operational evaluator & KPI comparison engine
│   │   ├── adapters/                   # Siloed system adapters (TMS, SMMS, TDMS, COA)
│   │   ├── data/                       # Fixture loader and synthetic dataset generator
│   │   └── cli.py                      # Terminal audit runner & CLI optimizer demonstration
│
├── frontend/                           # Modern React 19 + Vite 8 + Tailwind v4 Web Application
│   ├── .env.example                    # Frontend environment configuration template
│   ├── package.json                    # Frontend dependencies and npm scripts
│   ├── vite.config.ts                  # Vite build configuration
│   └── src/                            # Components, API clients, and UI views
│
├── data/                               # Standardized Benchmark Datasets & Fixtures
│   ├── fixtures/demo_fixture.json      # 12-element deterministic demonstration fixture
│   └── generated/full_dataset.json     # Scaled 200-task synthetic evaluation dataset
│
├── tests/                              # Comprehensive Automated Test Suite (35 tests)
│   ├── api/                            # API endpoints & HTTP request tests
│   ├── integration/                    # End-to-end multi-department optimization tests
│   ├── unit/                           # Objective, constraint, scoring, and metrics tests
│   └── conftest.py                     # Pytest fixtures and test environment setup
│
├── docs/                               # Engineering Documentation & Specifications
│   ├── 00_MASTER_PROMPT.md             # Master specification
│   ├── 01_PROJECT_SPEC.md              # Functional specifications
│   ├── 02_AGENT_RULES.md               # Architectural guidelines
│   ├── 03_DATA_CONTRACT.md             # Data model contracts
│   ├── 04_ARCHITECTURE.md              # High-level architecture
│   ├── 05_OPTIMIZATION_SPEC.md         # Mathematical optimization formulation
│   ├── 06_BUILD_PLAN.md                # Milestone plan
│   ├── 07_DEMO_ACCEPTANCE.md           # SIH acceptance criteria
│   ├── 08_DECISIONS_AND_ASSUMPTIONS.md # Modeling assumptions & design decisions
│   ├── 09_MODEL_ASSUMPTIONS.md         # Model parameters & boundaries
│   ├── 10_API_CONTRACT.md              # REST API contract
│   ├── prompts/                        # LLM prompts & system instructions
│   ├── design/                         # UI/UX design specifications
│   └── starter/                        # Original SIH problem starter templates
│
├── deliverables/                       # Submission Artifacts & Project Reports
│   ├── IBPS_SIH_Internal_Hackathon_Detailed_Project_Report.docx
│   └── SIH_26027_Block_Planning_Solution.md.docx
│
└── tools/                              # Automation Scripts
    └── build_sih_project_report.py     # Script to generate formatted Word project reports
```

---

## ⚡ Quick Start Guide

### Prerequisites
- **Python 3.11+**
- **Node.js 20+** and **npm**

### 1. Environment Setup
Copy the environment configuration templates:
```bash
# Root and backend environment
cp .env.example .env
cp backend/.env.example backend/.env

# Frontend environment
cp frontend/.env.example frontend/.env
```

### 2. Backend Installation & Startup
```bash
# Create and activate Python virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the FastAPI server (starts on http://localhost:8000)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation will be available at:
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

### 3. Frontend Installation & Startup
In a separate terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Verification

The repository includes a comprehensive 35-test suite covering unit, API, and end-to-end integration scenarios.

### Run All Pytest Tests
```bash
# From repository root
.venv/bin/pytest
```

### Run the CLI Optimizer & Audit Benchmark
```bash
.venv/bin/python backend/app/cli.py --audit
```

### Build the Frontend for Production
```bash
cd frontend
npm run build
```

---

## 📐 Optimization Formulation

IBPS uses Google OR-Tools **CP-SAT (Constraint Programming with SAT)** to solve the multi-department block planning problem:

- **Hard Constraints:**
  - $\sum_j x_{i,j} \le 1$: Each task assigned at most once.
  - $\sum_{i} x_{i,j} \cdot \text{crew}_i \le \text{Capacity}_j$: Resource and crew limits per block.
  - Precedence constraints: $x_{A, j_A} + x_{B, j_B} \le 1$ when $B$ depends on $A$ and $\text{start}(j_B) < \text{end}(j_A)$.
  - Pruning of high-priority passenger train conflict windows (e.g. Vande Bharat, Rajdhani).

- **Objective Function (Maximization):**
  $$\max \quad 10 \sum_{i,j} \text{PriorityScore}_i \cdot x_{i,j} + 500 \sum_{i \in \text{Critical}} \text{sched}_i - 800 \sum_{i \in \text{Critical}} (1 - \text{sched}_i) + 350 \sum_j \max(0, |\text{Depts}_j| - 1) - 40 \sum_j \text{Hours}_j \cdot u_j - 15 \sum_j \text{Disruptions}_j \cdot u_j$$

---

## 🚀 Deployment

The system is configured for continuous zero-downtime deployment on Render via [`render.yaml`](render.yaml):
- **API Web Service:** Deployed as Python runtime running Uvicorn.
- **Frontend Static Site:** Built with Vite and served globally with SPA rewrite rules.
