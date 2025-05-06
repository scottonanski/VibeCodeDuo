<p align="center">
  <img src="./public/banner.png" alt="VibeCodeDuo Banner" width="100%" />
</p>


# **🚀 VibeCodeDuo - Turn-Based Orchestrator: A Revolution in AI Collaboration 🔥**

Welcome to **VibeCodeDuo's** cutting-edge **Turn-Based Orchestrator** branch! 🎉 This powerful feature **redefines the way AI agents collaborate** to create and refine software. We’re moving beyond mere concurrent AI responses and building a **stateful, turn-based pipeline** where AI agents **build, review, and iteratively refine** software projects.

## **💡 The Vision: Orchestrating Seamless Multi-Agent AI Collaboration 🤖💻**

At the heart of VibeCodeDuo is a **game-changing AI collaboration system** designed to simulate a real-world software development process. Multiple **AI models**—customizable for both OpenAI and local Ollama instances—work in tandem to **refine** and **iterate** on each other’s contributions. This isn’t just a chat; this is **live collaboration** between **AI agents** with distinct roles, pushing code forward, reviewing progress, and refining results.

### **🔑 Key Principles of the System:**

* **Multi-Agent Collaboration:** 🧠🤖

  * Orchestrates a "Refiner" bot to clarify user prompts and two "Worker" bots: Worker 1 for code generation, and Worker 2 for structured code review. These bots work in a **turn-based loop** to ensure optimal code output.

* **Stateful Pipeline:** 🌱🔄

  * Managed by the backend orchestrator (`collaborationPipeline.ts`), this system seamlessly handles the entire project lifecycle—tracking files, maintaining conversation history, and adjusting collaboration flow based on feedback from Worker 2 (Review Bot).

* **Structured Communication:** 📡💬

  * Using **Server-Sent Events (SSE)**, this pipeline streams rich `PipelineEvent`s (like file changes and AI output) directly to the frontend for **real-time updates**.

* **IDE-Centric UI:** 🖥️✨

  * The frontend (`BuildInterface.tsx`, `useBuildStream.ts`) mirrors the feel of a real-world IDE, displaying not just a **chat log**, but a **live build process**—showing every update, file change, and agent interaction.

---

## **🔥 Current Branch Status & Achievements 🚀**

### **🔧 Backend (`src/lib/orchestration/`, `src/app/api/chat/route.ts`):**

* ✅ **Fully Functional Orchestration Pipeline:**

  * The system successfully manages the **multi-turn interactions** between the Refiner, Worker 1 (Code), Worker 2 (Review), and Worker 1 (Revisions based on feedback).
  * Tracks state (`CollaborationState`) to ensure smooth transitions across stages (refine → code → review → revise).
  * Implements **conditional logic** to direct collaboration flow based on Worker 2’s JSON feedback (e.g., `APPROVED`, `REVISION_NEEDED`).

* ✅ **Secure & Scalable API Key Management:**

  * API keys are securely loaded from `.env.local` for each worker, ensuring seamless integrations and robust security.

* ✅ **Structured JSON Feedback:**

  * Worker 2 generates structured feedback in **JSON format**, enabling cleaner parsing and precise revisions.

* ✅ **Context Window Management:**

  * Implemented `getTruncatedHistory` to manage conversation history and prevent token overflow in long collaborations.

* ✅ **SSE Streaming:**

  * The API is properly streaming all relevant events to the frontend, keeping the collaboration live and fluid.

* ✅ **Modular Design:**

  * Clean separation of concerns between the orchestrator pipeline, individual stage handlers, and LLM services ensures **scalability** and **maintainability**.

---

### **🌐 Frontend (`src/hooks/useBuildStream.ts`, `src/components/ui/BuildInterface.tsx`):**

* ✅ **`useBuildStream` Hook:**

  * Connects to the SSE endpoint, manages **real-time state**, and ensures smooth, incremental updates for the frontend.
  * Tracks `messages`, `projectFiles`, `pipelineStage`, and other key variables to keep the UI in sync with the backend.

* ✅ **`BuildInterface.tsx` Component:**

  * **Displays the entire live process**:

    * **Live status bar** showing current stage.
    * **Project files in real-time** within a `<pre><code>` tag display.
    * **Dynamic chat/log** displaying the interactions between bots (AI textual output).
  * Features UI controls to **start/stop the pipeline** and manage streaming behavior.

---

### **🎯 Overall:**

* The **multi-agent collaboration system** is **fully operational**—workers are collaborating, refining code, and iterating effectively.
* Backend logic for **API key management**, **JSON parsing**, **SSE streaming**, and **context handling** is **fully functional**.
* The frontend provides a rich, **live interface**, capturing the essence of a **real-time development environment** with **project file updates** and **AI-driven interactions**.

---

## **⚠️ Known Issues & Next Steps 🔧**

### **UI Enhancements (Next Priority):**

* **Syntax Highlighting:** 🌈🖋️

  * Add **syntax highlighting** for the code displayed in `BuildInterface.tsx` to improve readability (consider using `react-syntax-highlighter`).

* **Chat/Log Formatting:** 📜💬

  * Clean up how **AI explanations** and **reviews** are displayed, ensuring smoother UX by distinguishing between message types.

* **Error Handling:** ❌⚠️

  * Ensure **errors** (e.g., `pipeline_error` events) are clearly communicated in the UI.

* **Button State Logic:** 🔲🔳

  * Refine the state of **"Send"** and **"Stop"** buttons, ensuring proper interaction logic during pipeline execution.

---

### **Advanced Context Management (Future):** 🧠📚

* Investigate **advanced summarization** strategies for long collaborations to maintain a lean and manageable context window while keeping critical data intact.

---

### **Multi-File Project Support (Future):** 📂✨

* Expand the system to handle **multiple files** by:

  * Allowing the AI agents to **propose** and **scaffold new files** (`scaffoldStage`).
  * Introducing a tree-like **project file structure**.
  * Allowing the user or AI agents to choose which file to focus on.
  * Updating the frontend to include a **file tree** and **tabbed editors** for easy file navigation.

---

### **In-depth Revision Guidance (Ongoing):** 🔄📝

* Continuously fine-tune the **revision prompts** to ensure that Worker 1 takes **precise actions** based on Worker 2’s review (e.g., addressing `key_issues` with more specificity).

---

## **🚀 How to Run This Branch:**

1. Ensure your `.env.local` is populated with `OPENAI_API_KEY_WORKER1` and `OPENAI_API_KEY_WORKER2`.
2. Run `pnpm install` to install any new dependencies.
3. Start the project with `pnpm run dev`.
4. Open the app in your browser and submit a prompt. **Watch the magic happen** as the AI agents begin their collaborative process!

---
