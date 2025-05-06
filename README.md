


<p align="center">
  <img src="./public/banner.png" alt="VibeCodeDuo Banner" width="100%" />
</p>

<h1 align="center">VibeCodeDuo</h1>

<p align="center">
  🧠 Two AIs. One Codebase. Infinite Possibilities.  
  <br />
  Collaborative code generation with dual AI workers.
</p>

<p align="center">
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Built%20with-Next.js-000?style=for-the-badge&logo=nextdotjs" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind-CSS-38bdf8?style=for-the-badge&logo=tailwindcss" /></a>
  <a href="https://shadcn.dev/"><img src="https://img.shields.io/badge/UI-Shadcn%2FUI-7c3aed?style=for-the-badge" /></a>
  <a href="#"><img src="https://img.shields.io/github/license/your-username/vibecodeduo?style=for-the-badge" /></a>
</p>

---

## 🚀 Overview

**VibeCodeDuo** is a full-stack web app that lets you chat with **two AI models at once**, offering a dynamic environment for pair programming, code review, and creative collaboration.

With **real-time dual streaming**, **multi-provider LLM support**, and a slick **React + Tailwind UI**, it brings the future of developer tooling into your browser.

---

## 🧠 Features

- ⚡ **Simultaneous dual-AI interaction**
- 🌐 Supports **OpenAI, Ollama**, and more
- 🧵 **Concurrent Server-Sent Events (SSE)**
- 🎨 UI powered by **Shadcn/UI + Tailwind CSS**
- 🧠 AI model selection + role assignment
- 🔑 Secure per-model API key usage

---

## 🔍 How It Works

```mermaid
sequenceDiagram
  participant User
  participant Frontend
  participant Backend
  participant AI1
  participant AI2

  User->>Frontend: Select models + prompt
  Frontend->>Backend: Send chat request
  Backend->>AI1: Stream request (SSE)
  Backend->>AI2: Stream request (SSE)
  AI1-->>Backend: w1-chunk
  AI2-->>Backend: w2-chunk
  Backend-->>Frontend: SSE stream (tagged)
  Frontend-->>User: Live dual-AI chat
````

---

## 📂 Project Structure Highlights

```
src/
├── components/
│   └── ui/chat-interface.tsx
├── hooks/
│   └── useChatStream.ts
├── app/api/chat/
│   └── route.ts  ← Edge API with dual streaming
├── lib/
│   └── fetchChatCompletion.ts
```

---

## 🧪 Tech Stack

| Layer       | Technology                          |
| ----------- | ----------------------------------- |
| Frontend    | React (Next.js)                     |
| UI Library  | Shadcn/UI, TailwindCSS, Radix UI    |
| Streaming   | Server-Sent Events (Edge Runtime)   |
| Backend     | Next.js API Routes + Edge Functions |
| LLM Support | OpenAI, Ollama                      |

---

## 🚧 Roadmap

### 🤝 AI Collaboration Modes

* 🔁 Turn-based refinement
* 🧱 Parallel responsibility (HTML/CSS or FE/BE split)
* 🛠️ Refactorer + Coder pairing

### 🔧 Project Memory & State

* File tree management
* Incremental code synthesis
* Dependency tracking

### 🚀 SaaS Features

* 🔐 Authentication & roles
* 💳 Stripe billing
* 🧰 Dashboard + analytics
* 🧠 Prompt injection protection
* 🔄 Rate limiting & usage metrics

---

## 🛠 Getting Started

```bash
git clone https://github.com/your-username/vibecodeduo
cd vibecodeduo
pnpm install
pnpm dev
```

Create a `.env.local` with:

```bash
OPENAI_API_KEY_WORKER1=your-key-here
OPENAI_API_KEY_WORKER2=your-other-key-here
```

---

## 💬 Contribute & Collaborate

Got ideas? Want to help with the AI loop, UX polish, or deploying this to production?
**Pull requests are welcome** — let's shape the future of AI-assisted development together.

> *Made with 🔥 by developers who vibe with AI.*

---

<p align="center">
  <em>Join the Duo. Build with AI.</em>
</p>