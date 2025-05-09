<p align="center">
  <img src="./public/banner.png" alt="VibeCodeDuo Banner" width="100%" />
</p>

# 🚀 VibeCodeDuo - Turn-Based Orchestrator: Revolutionizing AI Collaboration & Advancing Vibe Coding 🔥

Welcome to **VibeCodeDuo**, a cutting-edge platform that pioneers a **Turn-Based Orchestrator** for AI-driven software development! 🎉 We're moving beyond simple prompt-and-response AI into a **stateful, iterative pipeline** where specialized AI agents collaboratively **plan, scaffold, build, review, and refine** software projects—embodying and advancing the principles of **"vibe coding"** with enhanced structure and transparency.

## 💡 The Vision: Orchestrating Intelligent, Collaborative AI Development

VibeCodeDuo is engineered to simulate and augment a sophisticated software development lifecycle using multiple AI agents. Inspired by the "vibe coding" paradigm—where development is driven by natural language and iterative AI collaboration—we add layers of **specialization, review, and observable process** to create robust and high-quality software. Our customizable AI models (OpenAI & Ollama) work in distinct roles, pushing projects from ideation to tangible code.

---

## 🔍 How It Works

```mermaid
sequenceDiagram
    participant User
    participant Frontend (BuildInterface)
    participant API_Route (/api/chat)
    participant Pipeline (collaborationPipeline.ts)
    participant Refiner_AI
    participant Debater_A_AI
    participant Debater_B_AI
    participant Summarizer_AI
    participant Scaffolder_AI
    participant Coder_AI (W1)
    participant Reviewer_AI (W2)
    participant Installer_AI

    User->>Frontend: Enters prompt & selects settings
    Frontend->>API_Route: POST /api/chat with (prompt, worker1/2_cfgs)
    API_Route->>Pipeline: Initiates collaborationPipeline(PipelineParams)
    Pipeline->>Frontend: yield PipelineEvent (pipeline_start)
    
    Pipeline->>Refiner_AI: refineStage(initialPrompt)
    Refiner_AI-->>Pipeline: refinedPrompt & messages
    Pipeline->>Frontend: yield PipelineEvent (prompt_refined, assistant_message_complete for refiner)
    Pipeline->>Pipeline: Update conversationHistory
    
    Pipeline->>Frontend: yield PipelineEvent (stage_change: debating_plan)
    loop Debate Turns (e.g., 2 rounds)
        Pipeline->>Debater_A_AI: debateStage turn (refinedPrompt, history)
        Debater_A_AI-->>Pipeline: Stream chunks (for debate_agent_chunk)
        Pipeline->>Frontend: yield PipelineEvent (debate_agent_chunk for DebaterA)
        Debater_A_AI-->>Pipeline: Full message (for debate_agent_message_complete)
        Pipeline->>Frontend: yield PipelineEvent (debate_agent_message_complete for DebaterA)
        Pipeline->>Pipeline: Update conversationHistory (DebaterA)

        Pipeline->>Debater_B_AI: debateStage turn (refinedPrompt, history + DebaterA's msg)
        Debater_B_AI-->>Pipeline: Stream chunks (for debate_agent_chunk)
        Pipeline->>Frontend: yield PipelineEvent (debate_agent_chunk for DebaterB)
        Debater_B_AI-->>Pipeline: Full message (for debate_agent_message_complete)
        Pipeline->>Frontend: yield PipelineEvent (debate_agent_message_complete for DebaterB)
        Pipeline->>Pipeline: Update conversationHistory (DebaterB)
    end

    Pipeline->>Summarizer_AI: debateStage summary (full_debate_transcript)
    Summarizer_AI-->>Pipeline: Stream summary chunks (for debate_summary_chunk)
    Pipeline->>Frontend: yield PipelineEvent (debate_summary_chunk)
    Summarizer_AI-->>Pipeline: Full JSON summary (parsed for debate_result_summary)
    Pipeline->>Frontend: yield PipelineEvent (debate_result_summary with agreedPlan, etc.)
    Pipeline->>Pipeline: Update conversationHistory (Summarizer)
    Pipeline->>Pipeline: Store agreedPlanFromDebate

    Pipeline->>Frontend: yield PipelineEvent (stage_change: scaffolding_project)
    Pipeline->>Scaffolder_AI: scaffoldStage(agreedPlanFromDebate)
    Scaffolder_AI-->>Pipeline: Yields file_create / folder_create events
    Pipeline->>Frontend: yield PipelineEvent (file_create / folder_create)
    Pipeline->>Pipeline: Update projectFiles state

    Pipeline->>Frontend: yield PipelineEvent (stage_change: coding_turn)
    loop Max Turns (or until approved)
        Pipeline->>Coder_AI (W1): codegenStage(currentFile, agreedPlan, history, projectFiles)
        Coder_AI (W1)-->>Pipeline: Stream chunks (for assistant_chunk)
        Pipeline->>Frontend: yield PipelineEvent (assistant_chunk for W1)
        Coder_AI (W1)-->>Pipeline: Full code & message (for assistant_message_complete)
        Pipeline->>Frontend: yield PipelineEvent (assistant_message_complete for W1)
        Pipeline->>Frontend: yield PipelineEvent (file_update)
        Pipeline->>Pipeline: Update projectFiles & conversationHistory

        Pipeline->>Frontend: yield PipelineEvent (stage_change: reviewing_turn)
        Pipeline->>Reviewer_AI (W2): reviewStage(currentFile, W1_code, history, projectFiles)
        Reviewer_AI (W2)-->>Pipeline: Stream chunks (for assistant_chunk)
        Pipeline->>Frontend: yield PipelineEvent (assistant_chunk for W2)
        Reviewer_AI (W2)-->>Pipeline: Full review JSON (for assistant_message_complete & review_result)
        Pipeline->>Frontend: yield PipelineEvent (assistant_message_complete for W2)
        Pipeline->>Frontend: yield PipelineEvent (review_result)
        Pipeline->>Pipeline: Update conversationHistory
        
        alt Review: APPROVED
            Pipeline->>Frontend: yield PipelineEvent (stage_change: installing_deps)
            Pipeline->>Installer_AI: installStage(projectFiles, history)
            Installer_AI-->>Pipeline: Yields install_command_found / install_summary
            Pipeline->>Frontend: yield PipelineEvent (install_command_found / install_summary)
            Pipeline->>Pipeline: Update requiredPackages
            Pipeline->>Frontend: yield PipelineEvent (stage_change: done)
            Note over Pipeline: Approval received. Exiting coding loop.
            break
        else Review: REVISION_NEEDED
            Pipeline->>Pipeline: Switch worker to W1, increment turn
            Pipeline->>Frontend: yield PipelineEvent (status_update: revision needed)
            Note over Pipeline: Revisions needed. Continuing loop.
        end
    end
    
    Pipeline->>Frontend: yield PipelineEvent (pipeline_finish)
```

---

---

### 🔑 Key Principles & How VibeCodeDuo Elevates "Vibe Coding"

*   **Specialized Multi-Agent Collaboration with Upfront Planning** 🧠💬🤖
    *   VibeCodeDuo employs a team of AI agents, each with a specific role, mirroring real-world development teams and addressing common "vibe coding" concerns about code quality:
        *   **Refiner Bot:** Ensures precise requirements by clarifying user prompts.
        *   **✨ Debate Duo (Debater A & Debater B, Summarizer):** Two AI agents (currently configurable to use Worker 1 & Worker 2 models) engage in critical discussions to propose and critique high-level implementation plans *before* any scaffolding or coding begins. A Summarizer AI then distills this debate into an `agreedPlan`, options, and identifies if further resolution is needed. This proactive planning mitigates issues like technical debt and improves architectural soundness.
        *   **Scaffolder AI:** Generates initial project file/folder structures based on the `agreedPlan` from the Debate Stage, providing a solid foundation.
        *   **Coder Bot (Worker 1):** Focuses on iterative code generation based on the refined plan.
        *   **Reviewer Bot (Worker 2):** Conducts structured code reviews, identifying issues and ensuring alignment with best practices.
    *   This turn-based, role-specific approach, now featuring a dedicated debate/planning phase, differentiates VibeCodeDuo from single-agent generation tools, promoting higher quality and more maintainable code.

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

## 🔥 Current Status & Achievements (feature/debate-stage-implementation Branch)

### 🔧 Backend (`/lib/orchestration/`, `/api/chat/route.ts`)

*   **✅ Fully Functional Orchestration Pipeline with Integrated Debate Stage:**
    *   **✨ `debateStage` Implementation & Integration:**
        *   Successfully implemented `debateStage.ts` where Debater A (Worker 1 config) and Debater B (Worker 2 config) discuss and refine implementation plans based on the `refinedPrompt`.
        *   A Summarizer AI (Refiner config) processes the debate into a structured JSON output: `summaryText`, `agreedPlan`, `options`, and `requiresResolution`.
        *   The `debateStage` is now integrated into `collaborationPipeline.ts`, running after `refineStage` and critically, *before* `scaffoldStage`.
    *   **✨ `scaffoldStage` Driven by Debate Outcome:** The `agreedPlan` (or `refinedPrompt` as fallback) from the `debateStage` is now the primary input for `scaffoldStage`, ensuring the project scaffold aligns with the collaboratively decided plan.
    *   Robust turn-based loop: Refiner ➔ **Debate (Proposer, Critiquer, Summarizer)** ➔ Scaffolder ➔ Coder ➔ Reviewer ➔ Revisions ➔ Installer.
    *   Intelligent review processing and dependency management (`installStage`).
*   **✅ Advanced LLM Service & JSON Parsing:**
    *   Resilient `extractJsonString` (used by `debateStage` and `scaffoldStage`) and `parseReviewOutput` handle diverse LLM outputs, ensuring reliable structured data processing.
*   **✅ Real-Time Streaming (SSE) & Stateful Context Management.**

---

### 🌐 Frontend (`/hooks/useBuildStream.ts`, `/components/ui/BuildInterface.tsx`, Zustand Stores)

*   **✨ Core "Vibe Coding" Enhancement: Full Chat Transparency & Debate Visibility:**
    *   **Complete AI Output Displayed:** AI chat bubbles show full explanations, raw JSON, or complete code blocks from all agents, including Debater A, Debater B, and the Summarizer.
    *   **Dedicated Debate Outcome Panel:** The UI now features a distinct section displaying the `debateSummaryText`, `agreedPlan`, `options`, and `requiresResolution` status, making the planning phase fully transparent.
    *   **"Code Applied" Indicator:** Visually confirms when AI-generated code is active in the editor.
*   **✅ Dynamic & Interactive UI:**
    *   `useBuildStream.ts` hook updated to process and manage new debate-related `PipelineEvents`.
    *   `BuildInterface.tsx` updated with new sender metadata and UI elements for the debate stage.
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

### ✅ **Recently Completed: `debateStage.ts` Integration (feature/debate-stage-implementation)**
*   **Achievement:** Successfully introduced and integrated a pre-coding planning phase (`debateStage.ts`) where AI agents (Debater A, Debater B, Summarizer) collaboratively discuss, critique, and refine implementation strategies. The `agreedPlan` from this stage now directly informs the `scaffoldStage`.
*   **Impact:** Significantly enhances upfront planning, aiming for improved architectural soundness and addressing a key aspect of robust software design.
*   **UI Visibility:** The debate process and its outcomes are now fully visible in the frontend interface.

### 🎈 Near-Term (Improving the Core "Vibe")
*   **Enhanced User Interaction:** Allow users to pause, provide feedback, or guide the AI mid-pipeline more effectively (e.g., during the debate if `requiresResolution` is true).
*   **User Customization:** Implement UI for per-role prompt control, allowing users to fine-tune AI behavior (e.g., reviewer strictness, coder verbosity, debater personas).
*   **Refine Scaffolding & Codegen from Debate:** Further optimize how `scaffoldStage` and `codegenStage` utilize the `agreedPlan` and `options` from the debate, especially for multi-file projects.
*   Address any minor UI warnings and continue refining LLM prompts for all stages.

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
