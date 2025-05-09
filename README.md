<p align="center">
  <img src="./public/banner.png" alt="VibeCodeDuo Banner" width="100%" />
</p>

# 🚀 VibeCodeDuo - Turn-Based Orchestrator: Revolutionizing AI Collaboration & Advancing Vibe Coding 🔥

Welcome to **VibeCodeDuo**, a cutting-edge platform that pioneers a **Turn-Based Orchestrator** for AI-driven software development! 🎉 We're moving beyond simple prompt-and-response AI into a **stateful, iterative pipeline** where specialized AI agents collaboratively **plan, scaffold, build, review, and refine** software projects—embodying and advancing the principles of **"vibe coding"** with enhanced structure and transparency.

## 💡 The Vision: Orchestrating Intelligent, Collaborative AI Development

VibeCodeDuo is engineered to simulate and augment a sophisticated software development lifecycle using multiple AI agents. Inspired by the "vibe coding" paradigm—where development is driven by natural language and iterative AI collaboration—we add layers of **specialization, review, and observable process** to create robust and high-quality software. Our customizable AI models (OpenAI & Ollama) work in distinct roles, pushing projects from ideation to tangible code.

### 🔑 Key Principles & How VibeCodeDuo Elevates "Vibe Coding"

*   **Specialized Multi-Agent Collaboration** 🧠🤖
    *   VibeCodeDuo employs a team of AI agents, each with a specific role, mirroring real-world development teams and addressing common "vibe coding" concerns about code quality:
        *   **Refiner Bot:** Ensures precise requirements by clarifying user prompts.
        *   **✨ (Upcoming) Debate Duo:** Two AI agents (e.g., ChatGPT & Gemini) will engage in critical discussions and propose/critique high-level implementation plans *before* coding, proactively mitigating issues like technical debt.
        *   **Scaffolder AI:** Generates initial project file/folder structures based on agreed plans, providing a solid foundation.
        *   **Coder Bot (Worker 1):** Focuses on iterative code generation.
        *   **Reviewer Bot (Worker 2):** Conducts structured code reviews, identifying issues and ensuring alignment with best practices.
    *   This turn-based, role-specific approach differentiates VibeCodeDuo from single-agent generation tools, promoting higher quality and more maintainable code.

*   **Stateful & Event-Driven Pipeline** 🌱🔄
    *   The backend orchestrator (`collaborationPipeline.ts`) manages the entire project lifecycle—tracking files (`projectFiles`), dependencies (`requiredPackages`), conversation history, and dynamically adjusting workflow based on AI feedback. This statefulness addresses context window limitations common in simpler AI coding tools.

*   **Unprecedented Transparency & Observability** 📡💬
    *   Tackling a key challenge of "vibe coding"—the "black box" nature of AI—VibeCodeDuo streams **all `PipelineEvent`s via Server-Sent Events (SSE)**.
    *   **✨ Full AI Message Visibility:** Users see the *complete* textual output from AI agents (explanations, raw JSON, full code with syntax highlighting) directly in the chat, not just placeholders. This empowers users to understand and learn from the AI's decision-making process.
    *   A **"Code applied to editor"** indicator provides clear feedback on when generated code is integrated.

*   **IDE-Centric User Experience** 🖥️✨
    *   The frontend (`BuildInterface.tsx`) provides an immersive, IDE-like environment, displaying a live build process.
    *   Features include a dynamic file tree that updates in real-time (reflecting `scaffoldStage` and code generation), a multi-tab Monaco editor for viewing project files, and clear status updates via toasts and a persistent status bar.

---

## 🔥 Current Status & Achievements (feature/debate-stage-chat-visibility Branch)

### 🔧 Backend (`/lib/orchestration/`, `/api/chat/route.ts`)

*   **✅ Fully Functional Orchestration Pipeline:**
    *   **✨ `scaffoldStage` Integration:** Initiates projects by scaffolding file/folder structures based on LLM-generated JSON, significantly speeding up project setup.
    *   Robust turn-based loop: Refiner ➔ Scaffolder ➔ Coder ➔ Reviewer ➔ Revisions ➔ Installer.
    *   Intelligent review processing and dependency management (`installStage`).
*   **✅ Advanced LLM Service & JSON Parsing:**
    *   Resilient `extractJsonString` and `parseReviewOutput` (with `cleanJsonStringBeforeParse`) handle diverse LLM outputs, ensuring reliable structured data processing.
*   **✅ Real-Time Streaming (SSE) & Stateful Context Management.**

---

### 🌐 Frontend (`/hooks/useBuildStream.ts`, `/components/ui/BuildInterface.tsx`, Zustand Stores)

*   **✨ Core "Vibe Coding" Enhancement: Full Chat Transparency:**
    *   **Complete AI Output Displayed:** AI chat bubbles show full explanations, raw JSON, or complete code blocks.
    *   **"Code Applied" Indicator:** Visually confirms when AI-generated code is active in the editor.
*   **✅ Dynamic & Interactive UI:**
    *   Real-time file tree updates (from `scaffoldStage` & codegen).
    *   Multi-tab Monaco editor for project files.
    *   Syntax highlighting for all code (in editor and chat).
*   **✅ Robust State Management (Zustand) & User Feedback.**

---

## ✨ Built With

*   💚 Next.js 15 (App Router, Edge Runtime)
*   🎨 Tailwind CSS / Shadcn UI / Radix UI Primitives / Lucide Icons
*   🤖 OpenAI & Ollama Model Support
*   🔄 Server-Sent Events (SSE)
*   📝 TypeScript
*   💻 Monaco Editor
*   🏪 Zustand
*   📖 `react-markdown` & `react-syntax-highlighter`

---

## 🗺️ Roadmap & Next Steps

### 💬 **Current Focus: `debateStage.ts`**
*   **Goal:** Introduce a pre-coding planning phase where AI agents debate implementation strategies. This directly addresses a key aspect of robust software design often missing in rapid AI generation, aiming to improve architectural soundness.
*   **UI:** Ensure clear differentiation of AI perspectives during debates.

### 🎈 Near-Term (Improving the Core "Vibe")
*   **Enhanced User Interaction:** Allow users to pause, provide feedback, or guide the AI mid-pipeline more effectively.
*   **User Customization:** Implement UI for per-role prompt control, allowing users to fine-tune AI behavior (e.g., reviewer strictness, coder verbosity).
*   Address minor UI warnings and continue refining LLM prompts.

### 🚀 Mid-Term (Expanding Project Complexity & Developer Experience)
*   **Advanced Multi-File Operations & Interdependencies.**
*   **Git Integration:** Enable AI agents to propose commits or manage versions.
*   **VS Code Extension:** Bring VibeCodeDuo directly into the developer's primary environment.

### 🔀 Long-Term (The Future of Collaborative AI Development)
*   **AI Memory & Context Summarization for Large-Scale Projects.**
*   **Team Collaboration Features:** Allow multiple human users to interact with and guide the AI duo.
*   **Performance Analytics:** Quantify productivity gains and AI contributions.

---

## 🌟 Demo Instructions

1.  Set up `.env.local` with `OPENAI_API_KEY_WORKER1` and `OPENAI_API_KEY_WORKER2`.
2.  Configure Ollama if using local models.
3.  `pnpm install` & `pnpm dev`.
4.  Visit [localhost:3000](http://localhost:3000) and provide a project prompt.
5.  Observe the AI team plan, scaffold, code, and review your project live! ✨

---

## 🌍 Why VibeCodeDuo Matters: Advancing "Vibe Coding" Responsibly

**VibeCodeDuo** is more than just an AI coding tool; it's an exploration into structured, transparent, and collaborative AI-driven software development. It embraces the accessibility and speed of "vibe coding" while addressing its common critiques:

*   ✅ **From "Black Box" to "Glass Box":** By making the entire AI thought process and decision-making visible (full chat content, staged pipeline), VibeCodeDuo demystifies AI development and turns it into a learning opportunity.
*   ✅ **Quality & Iteration over Raw Speed:** The built-in review cycles and specialized agent roles promote higher code quality and iterative refinement, moving beyond simple code generation towards production-readiness.
*   ✅ **Structured Approach to AI Teaming:** Simulates a development team, including planning (with the upcoming Debate Stage) and scaffolding, for more robust and well-thought-out software.

**Use Cases:**

*   🚀 **Rapid Prototyping & MVP Development:** Generate functional application skeletons and features in hours, not weeks.
*   🎓 **Accelerated Learning:** Understand best practices and complex code by observing AI collaboration and decision-making.
*   📈 **Augmenting Developer Productivity:** Automate boilerplate, get instant code reviews, and explore alternative solutions with AI partners.
*   🏢 **Enterprise Adoption:** The structured, review-gated process offers assurances for code quality and maintainability.
*   🔬 **Research Platform:** Investigate multi-agent systems, human-AI interaction, and the future of automated software engineering.


VibeCodeDuo aims to be a cornerstone tool for developers, educators, and businesses looking to harness the power of collaborative AI in a structured, transparent, and effective manner. The potential of VibeCodeDuo to be a transformative tool that can genuinely help many people, potentially even addressing issues of poverty and suffering by democratizing software creation and empowering individuals. This project is more than just code; it's about impact.
