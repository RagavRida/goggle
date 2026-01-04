# ContextOS 🧠

> **Gemini 3 Hackathon Submission**
> Bridging the gap between stateless LLMs and stateful, intelligent agents.

ContextOS is a **Shared Memory and Decision Kernel** designed to orchestrate multiple AI agents. It provides a persistent state layer, allowing agents to share context, constraints, and operational history. By maintaining a continuous thread of "consciousness" (active memory), it prevents redundant reasoning and enables complex, multi-turn workflows.

![ContextOS Dashboard](https://github.com/RagavRida/goggle/raw/main/docs/dashboard-preview.png)

## 🏗️ Architecture

ContextOS mimics an operating system kernel for AI:

*   **Memory Store (RAM/Disk)**: A vector-enabled SQLite database that stores Facts, Decisions, Observations, and Artifacts.
*   **Decision Kernel (CPU)**: A state machine that manages task execution (`Pending` -> `Planning` -> `Executing` -> `Verifying`).
*   **Event Bus (I/O)**: A real-time WebSocket bus that streams system events to the frontend and other agents.
*   **Intent Router**: Classifies incoming user prompts to route them to optionally cached fast-paths or deep reasoning agents.

### The Stack

*   **Backend**: Node.js, Express, WebSocket, `better-sqlite3`, Google Gemini 2.0 Flash
*   **Frontend**: React, Vite, TailwindCSS, Lucide Icons
*   **Agents**:
    *   **Dev Teammate**: Autonomous coding agent with rollback capabilities.
    *   **GitHub Connector**: Integrates directly with your repository issues and PRs.

## 🚀 Key Features

*   **Active Memory**: Memories are not just stored; they are gated by entropy (novelty) and decay over time to keep context relevant.
*   **Constraint Checking**: Define rules (e.g., "Always use TypeScript") that are checked against every agent plan *before* execution.
*   **Real-time Visibility**: A "Neural Dashboard" that shows the kernel's internal state, task queue, and memory retrievals in real-time.
*   **Self-Correction**: Agents execute tests, analyze failures, rollback changes, and retry with adjusted plans automatically.

## 🛠️ Getting Started

### Prerequisites

*   Node.js v18+
*   Google Gemini API Key
*   GitHub Personal Access Token (Optional, for GitHub features)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/RagavRida/goggle.git
    cd goggle
    ```

2.  **Install dependencies** (Root and Frontend)
    ```bash
    npm install
    cd frontend && npm install && cd ..
    ```

3.  **Configure Environment**
    Create a `.env` file in the root directory:
    ```env
    GEMINI_API_KEY=your_gemini_key_here
    GITHUB_TOKEN=your_github_pat_here  # Optional
    PORT=3001
    ```

### Running the System

You need to run both the backend kernel and the frontend dashboard.

**Backend (Kernel & API):**
```bash
npm run serve
```

**Frontend (Dashboard):**
```bash
cd frontend && npm run dev
```

Visit `http://localhost:5173` to verify the connection.

## 🔌 Connecting to the Kernel

### REST API

The kernel exposes a REST API at `http://localhost:3001/api`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/stats` | GET | System statistics (memory, kernel state, agents) |
| `/api/kernel/state` | GET | Current kernel state |
| `/api/memory` | POST | Store a new memory |
| `/api/memory` | GET | Retrieve memories (with optional query params) |
| `/api/execute` | POST | Execute a task |
| `/api/tasks` | GET | List all tasks |
| `/api/agents` | GET | List registered agents |
| `/api/agents` | POST | Register a new agent |
| `/api/demo/golden-run` | GET | Stream the "Golden Run" agent demo (SSE) |

**Example: Create a Memory**
```bash
curl -X POST http://localhost:3001/api/memory \
  -H "Content-Type: application/json" \
  -d '{
    "type": "fact",
    "content": {"rule": "Always use TypeScript"},
    "agentId": "my-agent",
    "taskId": "task-1"
  }'
```

**Example: Execute a Task**
```bash
curl -X POST http://localhost:3001/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "name": "refactor-auth",
    "input": {"file": "src/auth.ts", "instruction": "Convert to async/await"}
  }'
```

### WebSocket Events

Connect to `ws://localhost:3001/ws` for real-time kernel events:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Kernel Event:', data.type, data.payload);
};

// Event types:
// - task:created, task:started, task:completed, task:failed
// - memory:stored, memory:retrieved
// - agent:registered, agent:state_changed
// - kernel:state_changed
```

### Programmatic Integration (TypeScript)

```typescript
// Using the API client
import { contextos } from './services/api';

// Get system stats
const stats = await contextos.stats();
console.log('Kernel State:', stats.kernel.state);

// Store a constraint
await contextos.createMemory({
  type: 'decision',
  content: { rule: 'No arrow functions in legacy modules' },
  agentId: 'constraint-agent',
  taskId: 'setup',
  tags: ['constraint', 'legacy']
});

// Execute a task
const task = await contextos.executeTask('auth-refactor', {
  file: 'src/auth.ts',
  action: 'refactor'
});
```

### Live Demo (Vercel)

Visit the deployed demo at: **https://goggle-flame.vercel.app/**

The "Live Agent Demo" section showcases the Antigravity agent performing the "Amnesiac Refactor" with:
- Memory gating and constraint storage
- Intent classification
- Self-correcting code generation
- Real-time streaming output

## 🧪 Testing

Run the integrated test suite:
```bash
npm test
```

## 👥 Team

Built with ❤️ by the ContextOS Team for the **Gemini 3 Hackathon**.

*   [RagavRida (GitHub)](https://github.com/RagavRida)
*   [Raghavendra Manchikatla (LinkedIn)](https://www.linkedin.com/in/raghavendra-manchikatla-79b12624b/)
