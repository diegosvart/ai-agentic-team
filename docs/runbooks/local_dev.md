\# Local Development Runbook

Project: Agentic TI Operating System

Mode: Multi-project

Runtime: Docker + Ollama (host)



---



\## 1. Prerequisites



\### Required Applications



\- Git (CLI)

\- GitHub CLI (`gh`)

\- Docker Desktop (running)

\- Ollama (running locally)

\- Cursor or Claude Code



Optional:

\- Python 3.11 local (only if debugging outside container)



---



\## 2. Create GitHub Repository



\### Step 1 – Create repo



Option A (GitHub UI):

\- Create new repo named: `agentic-ti-os`

\- Initialize empty (no README)



Option B (CLI):

gh repo create agentic-ti-os --private --source=. --remote=origin



---



\## 3. Clone Repository



git clone https://github.com/<your-user>/agentic-ti-os.git

cd agentic-ti-os



---



\## 4. Initialize Project Structure



Create required directories:



mkdir -p plans/phases/00\_documentation

mkdir -p plans/phases/01\_core\_mvp

mkdir -p docs/adr

mkdir -p docs/runbooks

mkdir -p runtime/docker

mkdir -p src

mkdir -p logs artifacts data



Commit baseline:



git add .

git commit -m "Initial project structure"

git push origin main



---



\## 5. Verify Ollama



On host:



ollama list

curl http://localhost:11434/api/tags



Expected: JSON response with model list



---



\## 6. Docker Setup



From runtime/docker:



docker compose up --build



If successful:

\- Container starts without error

\- Logs show Python process running



---



\## 7. Validate Container → Ollama connectivity



Inside container:



docker exec -it agentic-core bash

curl $OLLAMA\_BASE\_URL/api/tags



Expected: same response as host



---



\## 8. Definition of Environment Ready



Environment is ready when:



\- Repo versioned in GitHub

\- Docker container builds

\- Ollama reachable from container

\- Logs/artifacts directories mounted

