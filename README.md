# A2A Orchestrator

A multi-agent orchestration system using A2A (Agent-to-Agent) protocol, featuring a Next.js frontend and separate Node.js backend.

## Architecture

This application is split into two parts:

- **Frontend**: Next.js application (React, TypeScript, Tailwind CSS)
- **Backend**: Express.js server managing world simulation and chat API

```
a2a-orchestrator/
├── app/                    # Next.js frontend
├── backend/                # Express.js backend
└── ...
```

## Features

- **A2A Protocol Integration**: Communicates with external agents using A2A (Agent-to-Agent) protocol
- **4 Historical Korean Agent Personas** engaging in conversations
  - **류성룡 (영의정)**: Prime minister and strategist from the Joseon Dynasty
  - **류운룡 (유학자)**: Confucian scholar and spiritual leader
  - **깨비 (도깨비)**: Goblin spirit representing folk traditions
  - **호랭 (수호신)**: Mountain guardian spirit

- **Real-time Message Streaming**: SSE-based real-time updates
- **Sequential Conversation Flow**: AI-recommended speaker order
- **Block Summarization**: Conversation context compression
- **Conversation Verification**: Automatic stop detection based on goal achievement
- **Separate Frontend/Backend**: Better scalability and maintainability

## Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your LLM API settings
npm run dev
```

The backend will run on `http://localhost:3001`

### 2. Frontend Setup

```bash
# In the root directory
npm install
cp .env.example .env
# Add NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
npm run dev
```

The frontend will run on `http://localhost:3000`

## How It Works

1. User sends a message
2. Block summary is generated with conversation context
3. AI recommends the next most appropriate speaker
4. Recommended agent responds via A2A protocol
5. Verifier checks if conversation goal is achieved
6. If goal not achieved and conversation has progress, next agent responds
7. Process continues until goal is achieved or conversation stalls

## Environment Variables

### Backend (.env in backend/)
```env
# LLM API for Verifier
LLM_API_URL=http://your-llm-server:8000/v1/chat/completions
LLM_MODEL=/path/to/your/model

# A2A Agent URLs
AGENT_RYU_SEONG_RYONG_URL=https://your-agent-server.com/agent/ryu-seong-ryong
AGENT_RYU_UN_RYONG_URL=https://your-agent-server.com/agent/ryu-un-ryong
AGENT_GGAEBI_URL=https://your-agent-server.com/agent/ggaebi
AGENT_HORAENG_URL=https://your-agent-server.com/agent/horaeng

PORT=3001
ALLOWED_ORIGINS=http://localhost:3000
```

### Frontend (.env in root/)
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

## Usage

1. Start the backend server (see Quick Start)
2. Start the frontend server (see Quick Start)
3. Open [http://localhost:3000](http://localhost:3000)
4. Type a message or question
5. Watch as 4 agents discuss and respond
6. Enable "Auto Mode" for continuous conversations
7. Use the Reset button to start fresh

## API Format

The application uses vLLM's chat completions API:
```bash
curl -X POST http://localhost:8000/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
      "model": "/data/models/gpt-oss-120b",
      "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello"}
      ],
      "max_tokens": 100,
      "temperature": 0.7
    }'
```

## Project Structure

```
a2a-orchestrator/
├── app/                       # Next.js frontend
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx              # Main chat UI
├── backend/                   # Express.js backend
│   ├── src/
│   │   ├── server.ts         # Server entry point
│   │   ├── routes/
│   │   │   └── chat.ts       # Chat API routes
│   │   ├── world/            # Orchestration logic
│   │   │   ├── agents.ts     # A2A agent integration
│   │   │   ├── world.ts      # State management
│   │   │   ├── worldManager.ts
│   │   │   ├── messageDAG.ts
│   │   │   ├── requestManager.ts
│   │   │   └── verifier.ts   # Conversation verification
│   │   └── types/
│   │       └── index.ts
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── .env
└── README.md
```

## API Documentation

See [backend/README.md](backend/README.md) for detailed API documentation.

## Technology Stack

### Frontend
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS

### Backend
- Express.js
- TypeScript
- ts-node-dev for development

## Development

### Backend Development
```bash
cd backend
npm run dev      # Development with hot reload
npm run build    # Build for production
npm start        # Run production build
```

### Frontend Development
```bash
npm run dev      # Development server
npm run build    # Build for production
npm start        # Run production build
```

## License

ISC
