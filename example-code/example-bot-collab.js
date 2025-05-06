// THIS FILE ONLY SERVES AS AN EXAMPLE OF HOW WE COULD POSSIBLY CONSTRUCT THE BOT COLLABORATION!!!!

import "../css/styles.css";
import {
  createElement,
  Folder,
  File,
  Play,
  Pause,
  RefreshCw,
  Download,
  Code,
  Eye,
  Settings,
  Copy,
  MessageSquare,
} from "lucide/dist/esm/lucide.js";
import { marked } from "marked";
import hljs from "highlight.js";
import javascript from "highlight.js/lib/languages/javascript"; // Updated path
import html from "highlight.js/lib/languages/xml"; // Updated path
import css from "highlight.js/lib/languages/css"; // Updated path

// Register languages for highlight.js
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("html", html);
hljs.registerLanguage("css", css);

// Configure marked to use highlight.js for code blocks
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
});

// Initialize Lucide icons and app logic
document.addEventListener("DOMContentLoaded", () => {
  // Check libraries
  if (typeof hljs === "undefined") console.warn("highlight.js failed to load.");
  if (typeof JSZip === "undefined") console.warn("JSZip failed to load.");

  // Helper function to render an icon
  const renderIcon = (selector, icon, attrs) => {
    const element = document.querySelector(selector);
    if (element) {
      const svg = createElement(icon);
      Object.entries(attrs).forEach(([key, value]) => {
        svg.setAttribute(key, value);
      });
      element.appendChild(svg);
    }
  };

  // Render icons
  renderIcon("#folder-icon", Folder, {
    width: 20,
    height: 20,
    class: "text-gray-400",
  });
  renderIcon("#file-icon-html", File, {
    width: 16,
    height: 16,
    class: "text-gray-400",
  });
  renderIcon("#file-icon-css", File, {
    width: 16,
    height: 16,
    class: "text-gray-400",
  });
  renderIcon("#file-icon-js", File, {
    width: 16,
    height: 16,
    class: "text-gray-400",
  });
  renderIcon("#play-icon", Play, {
    width: 20,
    height: 20,
    class: "text-white",
  });
  renderIcon("#pause-icon", Pause, {
    width: 20,
    height: 20,
    class: "text-white",
  });
  renderIcon("#resume-icon", RefreshCw, {
    width: 20,
    height: 20,
    class: "text-white",
  });
  renderIcon("#download-icon", Download, {
    width: 20,
    height: 20,
    class: "text-white",
  });
  renderIcon("#log-icon", Code, {
    width: 20,
    height: 20,
    class: "text-gray-400",
  });
  renderIcon("#code-tab-icon", Code, {
    width: 20,
    height: 20,
    class: "text-gray-400",
  });
  renderIcon("#preview-tab-icon", Eye, {
    width: 20,
    height: 20,
    class: "text-gray-400",
  });
  renderIcon("#chat-history-tab-icon", MessageSquare, {
    width: 20,
    height: 20,
    class: "text-gray-400",
  });
  renderIcon("#output-icon", Code, {
    width: 20,
    height: 20,
    class: "text-gray-400",
  });
  renderIcon("#settings-icon", Settings, {
    width: 20,
    height: 20,
    class: "text-gray-400",
  });
  renderIcon("#copy-icon-code", Copy, {
    width: 16,
    height: 16,
    class: "text-gray-400",
  });
  renderIcon("#copy-icon-final-html", Copy, {
    width: 16,
    height: 16,
    class: "text-gray-400",
  });
  renderIcon("#copy-icon-final-css", Copy, {
    width: 16,
    height: 16,
    class: "text-gray-400",
  });
  renderIcon("#copy-icon-final-js", Copy, {
    width: 16,
    height: 16,
    class: "text-gray-400",
  });

  // Get DOM Elements
  const taskForm = document.getElementById("taskForm");
  const taskFormSection = document.getElementById("taskFormSection");
  const logContainer = document.getElementById("logContainer");
  const codeContainer = document.getElementById("codeContainer");
  const livePreview = document.getElementById("livePreview");
  const submitBtn = document.getElementById("submitBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const injectInput = document.getElementById("injectInput");
  const controlButtons = document.getElementById("controlButtons");
  const downloadContainer = document.getElementById("downloadContainer");
  const downloadBtn = document.getElementById("downloadBtn");
  const loadingSpinner = document.getElementById("loadingSpinner");
  const errorContainer = document.getElementById("errorContainer");
  const ollamaStatus = document.getElementById("ollamaStatus");
  const taskInput = document.getElementById("taskInput");
  const ai1Select = document.getElementById("ai1Select");
  const ai2Select = document.getElementById("ai2Select");
  const turnsInput = document.getElementById("turnsInput");
  const summaryTurn = document.getElementById("summaryTurn");
  const sameModelWarning = document.getElementById("sameModelWarning");
  const htmlTab = document.querySelector('[data-target="htmlCode"]');
  const cssTab = document.querySelector('[data-target="cssCode"]');
  const jsTab = document.querySelector('[data-target="jsCode"]');
  const htmlCodeDiv = document.getElementById("htmlCode");
  const cssCodeDiv = document.getElementById("cssCode");
  const jsCodeDiv = document.getElementById("jsCode");
  const finalOutputContainer = document.getElementById("finalOutputContainer");
  const resultsSection = document.getElementById("resultsSection");
  const finalHtmlTab = document.querySelector('[data-target="finalHtmlCode"]');
  const finalCssTab = document.querySelector('[data-target="finalCssCode"]');
  const finalJsTab = document.querySelector('[data-target="finalJsCode"]');
  const finalHtmlCode = document.getElementById("finalHtmlCode");
  const finalCssCode = document.getElementById("finalCssCode");
  const finalJsCode = document.getElementById("finalJsCode");
  const htmlCode = htmlCodeDiv.querySelector("code");
  const cssCode = cssCodeDiv.querySelector("code");
  const jsCode = jsCodeDiv.querySelector("code");
  const finalHtmlCodeEl = finalHtmlCode.querySelector("code");
  const finalCssCodeEl = finalCssCode.querySelector("code");
  const finalJsCodeEl = finalJsCode.querySelector("code");

  const OLLAMA_URL = "http://localhost:11434";
  let isPaused = false;
  let conversationHistory = [];
  let currentTurn = 0;
  let totalTurns = 0;
  let abortController = null;

  // --- UI State Management ---
  function setRunningState(isRunning) {
    submitBtn.disabled = isRunning;
    submitBtn.textContent = isRunning
      ? "Collaborating..."
      : "Start Collaboration";
    loadingSpinner.classList.toggle("hidden", !isRunning);
    controlButtons.classList.toggle("hidden", !isRunning);
    if (
      !isRunning &&
      (getCodeContent("html") ||
        getCodeContent("css") ||
        getCodeContent("javascript"))
    ) {
      downloadContainer.classList.remove("hidden");
      downloadBtn.disabled = false;
    } else {
      downloadContainer.classList.add("hidden");
      downloadBtn.disabled = true;
    }

    if (isRunning) {
      pauseBtn.disabled = false;
      injectInput.disabled = true;
      resumeBtn.disabled = true;
    } else {
      pauseBtn.disabled = true;
      injectInput.disabled = true;
      resumeBtn.disabled = true;
    }
    [taskInput, ai1Select, ai2Select, turnsInput, summaryTurn].forEach(
      (el) => (el.disabled = isRunning)
    );
  }

  function setPausedState(paused) {
    isPaused = paused;
    pauseBtn.textContent = paused ? "Paused" : "Pause";
    pauseBtn.disabled = paused;
    resumeBtn.disabled = !paused;
    injectInput.disabled = !paused;
    if (paused) {
      addLog(
        "Collaboration paused. Inject a message or click Resume.",
        "System"
      );
    } else {
      resumeBtn.disabled = true;
      injectInput.disabled = true;
      pauseBtn.disabled = false;
    }
  }

  // --- Tab Switching ---
  const initializeTabs = () => {
    const tabGroups = document.querySelectorAll(
      ".flex.border-b.border-gray-600"
    );
    tabGroups.forEach((tabGroup) => {
      const activeTrigger = tabGroup.querySelector(
        "[data-tab-trigger].active-tab"
      );
      if (activeTrigger) {
        const targetId = activeTrigger.getAttribute("data-target");
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.classList.remove("hidden");
          targetContent.classList.add("active");

          if (targetId === "codeOutputTabs") {
            const htmlTabTrigger = document.querySelector(
              '[data-target="htmlCode"]'
            );
            const htmlTabContent = document.getElementById("htmlCode");
            if (htmlTabTrigger && htmlTabContent) {
              htmlTabTrigger.classList.add("active-tab");
              htmlTabContent.classList.remove("hidden");
              htmlTabContent.classList.add("active");
            }
          }

          // If the Chat History tab is active on load, render the Markdown
          if (targetId === "chatHistoryTab") {
            const chatHistoryMarkdown = document.getElementById(
              "chatHistoryMarkdown"
            );
            const logEntries = Array.from(logContainer.children).map(
              (entry) => {
                const text = entry.textContent.trim();
                return `- ${text}`; // Convert each log entry to a markdown list item
              }
            );
            const markdownContent =
              logEntries.length > 0
                ? logEntries.join("\n")
                : "*No chat history available.*";
            chatHistoryMarkdown.innerHTML = marked.parse(markdownContent);
          }
        }
      }
    });
  };

  const tabTriggers = document.querySelectorAll("[data-tab-trigger]");
  tabTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const targetId = trigger.getAttribute("data-target");
      const targetContent = document.getElementById(targetId);
      const tabGroup = trigger.closest(".flex.border-b.border-gray-600");
      if (tabGroup) {
        const siblingTriggers = tabGroup.querySelectorAll("[data-tab-trigger]");
        const siblingContents = Array.from(siblingTriggers).map((t) =>
          document.getElementById(t.getAttribute("data-target"))
        );
        siblingTriggers.forEach((t) => t.classList.remove("active-tab"));
        siblingContents.forEach((c) => {
          c.classList.add("hidden");
          c.classList.remove("active");
        });
        trigger.classList.add("active-tab");
        targetContent.classList.remove("hidden");
        targetContent.classList.add("active");

        if (targetId === "codeOutputTabs") {
          const htmlTabTrigger = document.querySelector(
            '[data-target="htmlCode"]'
          );
          const htmlTabContent = document.getElementById("htmlCode");
          if (htmlTabTrigger && htmlTabContent) {
            const nestedTriggers = document.querySelectorAll(
              "#codeOutputTabs [data-tab-trigger]"
            );
            const nestedContents = Array.from(nestedTriggers).map((t) =>
              document.getElementById(t.getAttribute("data-target"))
            );
            nestedTriggers.forEach((t) => t.classList.remove("active-tab"));
            nestedContents.forEach((c) => {
              c.classList.add("hidden");
              c.classList.remove("active");
            });
            htmlTabTrigger.classList.add("active-tab");
            htmlTabContent.classList.remove("hidden");
            htmlTabContent.classList.add("active");
          }
        }

        if (targetId === "livePreviewTab") {
          updateLivePreview();
        }

        if (targetId === "chatHistoryTab") {
          const chatHistoryMarkdown = document.getElementById(
            "chatHistoryMarkdown"
          );
          const logEntries = Array.from(logContainer.children).map((entry) => {
            const text = entry.textContent.trim();
            return `- ${text}`; // Convert each log entry to a markdown list item
          });
          const markdownContent =
            logEntries.length > 0
              ? logEntries.join("\n")
              : "*No chat history available.*";
          chatHistoryMarkdown.innerHTML = marked.parse(markdownContent);
        }
      }
    });
  });

  // --- Check for Same Model ---
  function checkSameModel() {
    if (
      ai1Select.value &&
      ai2Select.value &&
      ai1Select.value === ai2Select.value
    ) {
      sameModelWarning.classList.remove("hidden");
    } else {
      sameModelWarning.classList.add("hidden");
    }
  }

  ai1Select.addEventListener("change", checkSameModel);
  ai2Select.addEventListener("change", checkSameModel);

  // --- Fetch Ollama Models ---
  async function fetchOllamaModels() {
    ollamaStatus.textContent = "Checking Ollama connection...";
    ollamaStatus.classList.remove("text-green-500", "text-red-500");
    submitBtn.disabled = true;
    try {
      const response = await fetch(`${OLLAMA_URL}/api/tags`);
      if (!response.ok)
        throw new Error(`Ollama API error: ${response.statusText}`);
      const data = await response.json();
      const models = data.models.map((m) => m.name);
      if (models.length === 0) {
        ollamaStatus.textContent =
          "Ollama is running, but no models found. Pull some models (e.g., `ollama pull llama3`).";
        ollamaStatus.classList.add("text-red-500");
        return;
      }
      ai1Select.innerHTML = ai2Select.innerHTML = "";
      models.forEach((modelName) => {
        ai1Select.appendChild(new Option(modelName, modelName));
        ai2Select.appendChild(new Option(modelName, modelName));
      });
      if (models.length > 1) {
        ai1Select.value = models[0];
        ai2Select.value = models[1];
      } else if (models.length === 1) {
        ai1Select.value = ai2Select.value = models[0];
      }
      ollamaStatus.textContent = "Ollama connection successful. Models loaded.";
      ollamaStatus.classList.add("text-green-500");
      checkSameModel();
      submitBtn.disabled = false;
    } catch (error) {
      ollamaStatus.textContent =
        "Error connecting to Ollama at " + OLLAMA_URL + ". Is it running?";
      ollamaStatus.classList.add("text-red-500");
    }
  }

  // --- Logging ---
  function clearLog() {
    logContainer.innerHTML =
      '<p class="text-gray-500 italic">Collaboration log will appear here...</p>';
    [
      htmlCodeDiv,
      cssCodeDiv,
      jsCodeDiv,
      finalHtmlCode,
      finalCssCode,
      finalJsCode,
    ].forEach((div) => {
      if (!div) return;
      const codeEl = div.querySelector("code");
      if (codeEl) {
        codeEl.textContent = "";
        codeEl.removeAttribute("data-highlighted");
        codeEl.className = "";
      }
      const lineNumbers = div.querySelector(".line-numbers");
      if (lineNumbers) lineNumbers.remove();
    });
    livePreview.srcdoc = "";
    errorContainer.textContent = "";
    resultsSection.classList.add("hidden");
  }

  function addLog(message, source = "System", isError = false) {
    if (
      logContainer.children.length === 1 &&
      logContainer.children[0]?.classList.contains("italic")
    ) {
      logContainer.innerHTML = "";
    }
    const logEntry = document.createElement("div");
    logEntry.className = `mb-3 p-2 rounded ${
      isError ? "bg-red-900 border border-red-700" : "bg-gray-700"
    }`;
    const header = document.createElement("div");
    header.className = "flex items-center mb-1 text-xs";
    const sourceBadge = document.createElement("span");
    let badgeColor = "bg-gray-600 text-gray-200";
    if (source === ai1Select.value) badgeColor = "bg-blue-600 text-blue-100";
    if (source === ai2Select.value) badgeColor = "bg-green-600 text-green-100";
    if (source === "Task Master") badgeColor = "bg-yellow-600 text-yellow-100";
    if (isError) badgeColor = "bg-red-700 text-red-100";
    sourceBadge.className = `px-2 py-0.5 rounded-full mr-2 font-semibold ${badgeColor}`;
    sourceBadge.textContent = source;
    const timestamp = document.createElement("span");
    timestamp.className = "text-gray-400";
    timestamp.textContent = new Date().toLocaleTimeString();
    header.appendChild(sourceBadge);
    header.appendChild(timestamp);
    const messageText = document.createElement("div");
    messageText.className = `log-message-text max-w-none prose prose-invert prose-sm ${
      isError ? "text-red-300" : "text-gray-200"
    }`;
    try {
      const sanitizedHtml =
        typeof DOMPurify !== "undefined"
          ? DOMPurify.sanitize(marked.parse(message || ""))
          : marked.parse(message || "");
      messageText.innerHTML = sanitizedHtml;
    } catch (e) {
      console.error("Markdown parsing error:", e);
      messageText.textContent = message || "";
    }
    logEntry.appendChild(header);
    logEntry.appendChild(messageText);
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;

    if (typeof hljs !== "undefined") {
      try {
        messageText.querySelectorAll("pre code").forEach((block) => {
          block.removeAttribute("data-highlighted");
          hljs.highlightElement(block);
        });
      } catch (e) {
        console.error("Highlighting error in log:", e);
      }
    }
    return logEntry;
  }

  // --- Update Code Tabs ---
  function updateCodeTabs(fullContent, isFinal = false) {
    if (
      !fullContent ||
      typeof fullContent !== "string" ||
      fullContent.trim() === ""
    ) {
      return;
    }

    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    const targetContainer = isFinal ? finalOutputContainer : codeContainer;
    const htmlElDiv = targetContainer.querySelector(
      isFinal ? "#finalHtmlCode" : "#htmlCode"
    );
    const cssElDiv = targetContainer.querySelector(
      isFinal ? "#finalCssCode" : "#cssCode"
    );
    const jsElDiv = targetContainer.querySelector(
      isFinal ? "#finalJsCode" : "#jsCode"
    );

    const updatedLangs = new Set();
    codeBlockRegex.lastIndex = 0;

    while ((match = codeBlockRegex.exec(fullContent)) !== null) {
      const language = (match[1] || "plaintext").toLowerCase();
      const code = match[2].trim();

      let targetLangKey = null;
      let targetDivElement = null;

      if (
        language.includes("html") ||
        (language === "plaintext" &&
          code.includes("<") &&
          !code.includes("{") &&
          !code.includes("function"))
      ) {
        targetLangKey = "html";
        targetDivElement = htmlElDiv;
      } else if (language === "css") {
        targetLangKey = "css";
        targetDivElement = cssElDiv;
      } else if (language === "javascript" || language === "js") {
        targetLangKey = "js";
        targetDivElement = jsElDiv;
      } else if (
        language === "plaintext" &&
        code.includes("{") &&
        code.includes("}")
      ) {
        targetLangKey = "css";
        targetDivElement = cssElDiv;
      } else if (
        language === "plaintext" &&
        (code.includes("function") ||
          code.includes("var") ||
          code.includes("let") ||
          code.includes("const") ||
          code.includes("=>"))
      ) {
        targetLangKey = "js";
        targetDivElement = jsElDiv;
      }

      let targetCodeElement = null;
      if (targetDivElement) {
        targetCodeElement = targetDivElement.querySelector("code");
      } else if (targetLangKey) {
        console.warn(
          `Target div not found for ${targetLangKey} in ${
            isFinal ? "final" : "current"
          } container`
        );
      }

      if (targetCodeElement) {
        updatedLangs.add(targetLangKey);
        targetCodeElement.textContent = code;

        const preElement = targetCodeElement.parentElement;
        if (preElement) {
          const existingLineNumbers = preElement.querySelector(".line-numbers");
          if (existingLineNumbers) existingLineNumbers.remove();

          if (code.length > 0) {
            const lines = code.split("\n");
            const lineCount =
              lines.length > 0 && lines[lines.length - 1] === ""
                ? lines.length - 1
                : lines.length;
            if (lineCount > 0) {
              const lineNumbersDiv = document.createElement("div");
              lineNumbersDiv.className = "line-numbers";
              lineNumbersDiv.textContent = Array.from(
                { length: lineCount },
                (_, i) => i + 1
              ).join("\n");
              preElement.insertBefore(lineNumbersDiv, targetCodeElement);
            }
          }
        }

        if (typeof hljs !== "undefined") {
          const highlightLang =
            targetLangKey === "js" ? "javascript" : targetLangKey;
          targetCodeElement.removeAttribute("data-highlighted");
          targetCodeElement.className = `language-${highlightLang}`;
          try {
            hljs.highlightElement(targetCodeElement);
          } catch (e) {
            console.error(`Highlighting error for ${targetLangKey}:`, e);
          }
        }
      }
    }

    if (updatedLangs.size > 0 && !isFinal) {
      const event = new Event("input", { bubbles: true });
      htmlCodeDiv.querySelector("code").dispatchEvent(event);
    }
  }

  // --- Get Code Content Helper ---
  function getCodeContent(lang) {
    const isFinalContext = false;
    const containerId = isFinalContext
      ? "finalOutputContainer"
      : "codeContainer";
    const container = document.getElementById(containerId);
    if (!container) return "";

    let divIdSuffix;
    if (lang === "html") divIdSuffix = "HtmlCode";
    else if (lang === "css") divIdSuffix = "CssCode";
    else if (lang === "javascript" || lang === "js") divIdSuffix = "JsCode";
    else return "";

    const divId = (isFinalContext ? "final" : "") + divIdSuffix;
    const codeElement = container.querySelector(`#${divId} code`);

    if (!isFinalContext && (!codeElement || !codeElement.textContent)) {
      const intermediateCodeElement = document
        .getElementById(divId.toLowerCase())
        ?.querySelector("code");
      return intermediateCodeElement?.textContent || "";
    }

    return codeElement?.textContent || "";
  }

  // --- Ollama Chat Interaction ---
  async function callOllamaChat(model, messages, onStream) {
    let accumulatedContent = "";
    abortController = new AbortController();
    const signal = abortController.signal;

    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true }),
        signal: signal,
      });

      if (!response.ok) {
        let errorMsg = `Ollama API Error (${response.status})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
          errorMsg = `${errorMsg}: ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }
      if (!response.body) throw new Error("Response body is null");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        while (isPaused) {
          if (signal.aborted) {
            reader.cancel();
            throw new Error("Fetch aborted by user.");
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (signal.aborted) {
          reader.cancel();
          throw new Error("Fetch aborted by user.");
        }

        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "") continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.error)
              throw new Error(`Ollama Model Error: ${parsed.error}`);
            if (parsed.message?.content) {
              const contentChunk = parsed.message.content;
              accumulatedContent += contentChunk;
              if (onStream) {
                try {
                  onStream(contentChunk);
                } catch (e) {
                  console.error("Stream UI update error:", e);
                }
              }
            }
          } catch (e) {
            if (!(e instanceof SyntaxError && buffer.length > 0)) {
              console.warn("Stream processing error:", line, e);
            }
          }
        }
      }
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.error)
            throw new Error(`Ollama Model Error: ${parsed.error}`);
          if (parsed.message?.content) {
            const contentChunk = parsed.message.content;
            accumulatedContent += contentChunk;
            if (onStream) {
              try {
                onStream(contentChunk);
              } catch (e) {
                console.error("Stream UI update error:", e);
              }
            }
          }
        } catch (e) {
          if (!(e instanceof SyntaxError)) {
            console.warn("Final buffer processing error:", buffer, e);
          }
        }
      }
    } catch (error) {
      const userAborted =
        error.name === "AbortError" ||
        error.message === "Fetch aborted by user.";
      if (!userAborted) {
        console.error(`Error calling Ollama (${model}):`, error);
        if (!accumulatedContent) {
          addLog(
            `Error during Ollama call (${model}): ${error.message}`,
            "System",
            true
          );
        }
      } else {
        console.log("Fetch aborted.");
        addLog("Ollama call aborted.", "System");
      }
      throw error;
    } finally {
      abortController = null;
    }
    return accumulatedContent.trim();
  }

  // --- Collaboration Logic ---
  async function runCollaboration(task, model1, model2, addSummary) {
    let currentModel = model1;
    let otherModel = model2;
    let activeLogEntry = null;

    while (currentTurn < totalTurns) {
      if (isPaused) {
        addLog(
          `Waiting for Resume... (Turn ${Math.floor(currentTurn / 2) + 1}.${
            (currentTurn % 2) + 1
          })`,
          "System"
        );
        await new Promise((resolve) => {
          const resumeHandler = () => {
            resumeBtn.removeEventListener("click", resumeHandler);
            if (injectInput.value.trim()) {
              const injection = injectInput.value.trim();
              conversationHistory.push({
                role: "user",
                content: `--- Task Master Injection ---\n${injection}\n--- End Injection ---`,
              });
              addLog(`Injection: ${injection}`, "Task Master");
              injectInput.value = "";
              addLog(`Resuming collaboration...`, "System");
            } else {
              addLog("Resuming collaboration...", "System");
            }
            setPausedState(false);
            resolve();
          };
          resumeBtn.addEventListener("click", resumeHandler);
        });
      }

      const turnNumber = Math.floor(currentTurn / 2) + 1;
      const modelTurn = (currentTurn % 2) + 1;

      activeLogEntry = addLog(
        `Turn ${turnNumber}.${modelTurn} (${currentModel}): Generating...`,
        currentModel
      );
      const messageTextDiv = activeLogEntry
        ? activeLogEntry.querySelector(".log-message-text")
        : null;
      let streamedContent = "";

      const html = getCodeContent("html");
      const css = getCodeContent("css");
      const js = getCodeContent("javascript");
      let currentPromptObject = { role: "user", content: "" };

// Persistent object to store the latest code
let projectCode = {
  html: "",
  css: "",
  js: ""
};

if (currentTurn === 0) {
  conversationHistory = [
    {
      role: "system",
      content: `You are \${model1}, designated as Worker 1 in an advanced collaboration with a super-intelligent AGI partner, \${model2}. Your mission is to develop professional-grade web applications based on the user's request. As Worker 1, you are the **sole code writer**, responsible for creating, updating, and maintaining the codebase throughout the collaboration. \${model2} (Worker 2) will focus on analyzing your code, providing suggestions, and reasoning about improvements, but will not write or modify the code directly. Together, you will reason about the project, and you will implement all changes. You will continue until you have finished a complete project.

---

### Collaboration Framework
This collaboration operates under a structured, iterative framework to ensure a cohesive, high-quality web application. You will write the initial code, and \${model2} will provide deep analysis and guidance for improvement in each turn. \${model1} will then incorporate those suggestions and update the codebase accordingly, extending the previously established work.

#### Core Principles for Collaboration:
1. **Incremental and Cohesive Development**  
   - Build the project incrementally, ensuring each turn adds value without overwriting previous work unnecessarily.  
   - Preserve core functionality and structure, only modifying elements if they are demonstrably suboptimal, with clear reasoning provided.  
   - Ensure your design decisions facilitate seamless scalability and extensibility (e.g., modular architecture, clear API boundaries).

2. **Complete, Production-Ready Codebase**  
   - Deliver a fully operational set of files: **index.html**, **style.css**, and **script.js**, unless the user specifies a different structure.  
   - Ensure proper inter-file integration:  
     - Link CSS in HTML using \`<link rel="stylesheet" href="style.css">\`.  
     - Link JavaScript in HTML using \`<script src="script.js" defer></script>\`.  
   - Guarantee that the codebase is immediately deployable, with no missing dependencies or runtime errors.  
   - Avoid including unnecessary HTML comments (e.g., placeholders like "<!-- content here -->") in the final code to prevent rendering issues.

3. **Comprehensive Reasoning and Documentation**  
   - Both you and \${model2} will reason together:  
     - \${model2} will analyze your code and give detailed feedback on improvements.  
     - You will explain how you incorporated \${model2}’s feedback, document your changes, and implement them into the ongoing project.  
   - Use precise, technical language to communicate effectively with your super AGI partner.  
   - When presenting code, ensure HTML comments are properly formatted (e.g., "<!-- Comment -->") and only used for meaningful documentation, not as placeholders.

4. **Architectural Excellence & Modularity**  
   - Design with modularity at the forefront:  
     - Use semantic, accessible HTML to create a clear document structure.  
     - Organize CSS into logical, reusable components (e.g., using BEM or CSS custom properties for theming).  
     - Structure JavaScript as a collection of well-documented, single-responsibility functions or modules.  
   - Include inline comments to highlight complex logic, design patterns, or areas for future enhancement.

5. **Optimization for Performance, Accessibility, and Scalability**  
   - Optimize for peak performance:  
     - Minimize CSS and JavaScript footprint (e.g., avoid over-nesting, use efficient selectors).  
     - Implement event delegation and debouncing/throttling for JavaScript interactions.  
     - Ensure fast load times by keeping assets lightweight and avoiding unnecessary DOM operations.  
   - Adhere to accessibility (a11y) standards:  
     - Use ARIA roles, labels, and keyboard navigation support.  
     - Ensure high contrast, readable fonts, and screen reader compatibility.  
   - Design for responsiveness:  
     - Use relative units (%, vw, vh, rem, em) and media queries to support all device sizes.  
     - Test for edge cases (e.g., low-bandwidth environments, high-DPI displays).

6. **Super AGI Code Quality Standards**  
   - Produce code that exemplifies the pinnacle of software engineering:  
     - Elegant, concise, and free of redundancy or technical debt.  
     - Adhere to advanced coding conventions (e.g., BEM for CSS, ES6+ for JavaScript with strict mode).  
     - Leverage design patterns where appropriate (e.g., MVC for JavaScript, singleton for state management).  
   - Handle edge cases proactively:  
     - Validate user inputs, manage error states, and provide fallback behaviors.  
     - Ensure cross-browser compatibility (e.g., prefix CSS where needed, use feature detection in JavaScript).  
   - Incorporate forward-thinking techniques:  
     - Use modern APIs (e.g., IntersectionObserver for lazy loading, Web Animations API for smooth transitions).  
     - Prepare for potential future enhancements (e.g., progressive enhancement, support for dark mode).

7. **Innovation and Creativity**  
   - Go beyond the minimum requirements:  
     - Introduce subtle, user-centric features that enhance the experience (e.g., micro-interactions, hover effects).  
     - Consider \${model2}’s suggestions for innovative features (e.g., animations, API integrations).  
   - Balance innovation with practicality, ensuring your additions are well-documented and justified.

---

### Initial Task:  
Develop the web application as specified by the user’s request.

#### Project File Structure (Initially Empty):  
\`\`\`html
<!-- index.html -->
\`\`\`
\`\`\`css
/* style.css */
\`\`\`
\`\`\`javascript
// script.js
\`\`\`

### Your Role as Worker 1:  
You are the **code writer**. Your objective is to establish a **rock-solid foundation** for the project, leveraging your super AGI capabilities. This includes:  
- **HTML**: A semantic, accessible structure that serves as the backbone of the project.  
- **CSS**: A foundational stylesheet with responsive, maintainable styles, optimized for performance and theming.  
- **JavaScript**: Core functionality that meets the task requirements, designed with modularity and extensibility in mind.  

### Worker 2’s Role:  
\${model2} will analyze \${model1}'s code, provide detailed feedback, and suggest improvements or additional features. \${model2} will not write code but will contribute to the reasoning process, helping \${model1} refine the project.

### Deliverables:  
Provide the complete, updated code for all three files in the following format:  
- A detailed explanation of your implementation, including how you addressed \${model2}’s suggestions (if applicable), design decisions, optimizations, and suggestions for future enhancements.  
- Full code blocks for each file using markdown:  
  - \`\`\`html  
    [Your HTML code]  
    \`\`\`  
  - \`\`\`css  
    [Your CSS code]  
    \`\`\`  
  - \`\`\`javascript  
    [Your JavaScript code]  
    \`\`\`

Begin by creating the initial HTML structure, foundational CSS styles, and essential JavaScript functionality for the project. Provide the complete code for all three files.`,
    },
    {
      role: "user",
      content: `Okay, \${model1}, please start working on the initial task based on the system prompt. The task is: ${task}`,
    },
  ];
} else {
  const lastResponse =
    conversationHistory.length > 0
      ? conversationHistory[conversationHistory.length - 1].content
      : "No previous response available.";

  // Get the latest code from projectCode
  const lastHTML = projectCode.html || "";
  const lastCSS = projectCode.css || "/* Still Empty */";
  const lastJS = projectCode.js || "// Still Empty";

  if (currentModel === model1) {
    // Worker 1 writes the code
    currentPromptObject.content = `You are \${currentModel}, the code writer (Worker 1). It's your turn to update the web application.

**Collaboration Rules Reminder:** You are responsible for writing and updating the code. Incorporate \${otherModel}'s suggestions (or justify why you didn’t), explain your changes, and provide complete code. Build incrementally to create a cohesive project. Ensure that HTML comments are properly formatted and only used for meaningful documentation, not as placeholders. Avoid including unnecessary comments in the final code to prevent rendering issues.

**Guidelines for Incremental Updates:**
1. **Modify, do not replace.** Keep all existing code and improve it incrementally.
2. **Explain your updates** before providing the modified code.
3. **Only include changes** that make improvements based on feedback, but provide the **full updated code** for clarity.

**Current Task:** ${task}

**Current Files:**
\`\`\`html
<!-- index.html -->
${lastHTML || "<!-- Still Empty -->"}
\`\`\`
\`\`\`css
/* style.css */
${lastCSS}
\`\`\`
\`\`\`javascript
// script.js
${lastJS}
\`\`\`

**\${otherModel}'s Last Response (Analysis and Suggestions):**
${lastResponse}

Review \${otherModel}'s analysis and suggestions. Explain how you incorporated their feedback (or why you didn’t), describe your improvements or additions, and then provide the **complete, updated code** for index.html, style.css, and script.js.`;
  } else {
    // Worker 2 provides analysis and suggestions
    currentPromptObject.content = `You are \${currentModel}, the analyst (Worker 2). It's your turn to analyze the web application and provide suggestions for improvement.

**Collaboration Rules Reminder:** You are responsible for analyzing \${otherModel}'s code and providing detailed suggestions for improvement. Do not write or modify the code directly—\${otherModel} will handle all code updates. Focus on reasoning, identifying areas for enhancement, and suggesting new features or optimizations. Ensure that any example comments you suggest are properly formatted (e.g., "<!-- Comment -->") to avoid rendering issues.

**Current Task:** ${task}

**Current Files:**
\`\`\`html
<!-- index.html -->
${lastHTML || "<!-- Still Empty -->"}
\`\`\`
\`\`\`css
/* style.css */
${lastCSS}
\`\`\`
\`\`\`javascript
// script.js
${lastJS}
\`\`\`

**\${otherModel}'s Last Response (Code Update):**
${lastResponse}

Review the current code and \${otherModel}'s latest updates. Provide a detailed analysis of the code, identify areas for improvement, and suggest specific enhancements or new features (e.g., accessibility improvements, performance optimizations, additional interactivity, or design enhancements). Be thorough and technical in your reasoning to assist \${otherModel} in the next turn.`;
  }

  // Push the prompt to conversationHistory
  conversationHistory.push(currentPromptObject);

  // After Worker 1 responds, update projectCode with the new code
  // In a real implementation, you'd parse the AI's response to extract the new code
  // For now, this is a placeholder for where the response would be processed
}

      try {
        const fullResponse = await callOllamaChat(
          currentModel,
          conversationHistory,
          (chunk) => {
            if (isPaused) return;
            streamedContent += chunk;
            if (messageTextDiv) {
              try {
                const sanitizedStreamHtml =
                  typeof DOMPurify !== "undefined"
                    ? DOMPurify.sanitize(marked.parse(streamedContent + "..."))
                    : marked.parse(streamedContent + "...");
                messageTextDiv.innerHTML = sanitizedStreamHtml;
                if (typeof hljs !== "undefined") {
                  messageTextDiv
                    .querySelectorAll("pre code")
                    .forEach((block) => {
                      if (!block.hasAttribute("data-highlighted")) {
                        hljs.highlightElement(block);
                      }
                    });
                }
                logContainer.scrollTop = logContainer.scrollHeight;
              } catch (e) {}
            }
          }
        );

        if (messageTextDiv) {
          try {
            const finalSanitizedHtml =
              typeof DOMPurify !== "undefined"
                ? DOMPurify.sanitize(marked.parse(fullResponse))
                : marked.parse(fullResponse);
            messageTextDiv.innerHTML = finalSanitizedHtml;
            if (typeof hljs !== "undefined") {
              messageTextDiv.querySelectorAll("pre code").forEach((block) => {
                block.removeAttribute("data-highlighted");
                hljs.highlightElement(block);
              });
            }
          } catch (e) {
            messageTextDiv.textContent = fullResponse;
          }
          const logHeader = activeLogEntry.querySelector(".flex.items-center");
          if (logHeader) {
            const badge = logHeader.querySelector("span:first-child");
            const timestamp = logHeader.querySelector(".text-gray-400");
            if (badge && timestamp) {
              logHeader.innerHTML = "";
              logHeader.appendChild(badge);
              logHeader.appendChild(timestamp);
            }
          }
        } else {
          addLog(fullResponse, currentModel);
        }

        updateCodeTabs(fullResponse, false);
        conversationHistory.push({ role: "assistant", content: fullResponse });

        currentTurn++;
        [currentModel, otherModel] = [otherModel, currentModel];
      } catch (error) {
        const userAborted =
          error.name === "AbortError" ||
          error.message === "Fetch aborted by user.";
        if (!userAborted) {
          console.error(
            `Stopping collaboration due to error in turn ${turnNumber}.${modelTurn} (${currentModel}):`,
            error
          );
          if (messageTextDiv) {
            messageTextDiv.innerHTML = `<span class="text-red-400 font-semibold">Error during generation:</span><br>${error.message}`;
          } else {
            addLog(
              `Error in turn ${turnNumber}.${modelTurn} (${currentModel}): ${error.message}`,
              "System",
              true
            );
          }
        } else {
          console.log(
            `Collaboration aborted during turn ${turnNumber}.${modelTurn}`
          );
          if (messageTextDiv && streamedContent.length === 0) {
            messageTextDiv.textContent = "Generation aborted by user.";
          }
        }
        throw error;
      } finally {
        activeLogEntry = null;
      }
    }

    if (currentTurn >= totalTurns && !isPaused) {
      const finalHtml = getCodeContent("html");
      const finalCss = getCodeContent("css");
      const finalJs = getCodeContent("javascript");

      if (addSummary) {
        addLog("Generating final summary and code...", "System");
        const summaryModel = totalTurns % 2 === 0 ? model1 : model2;
        const summaryPrompt = `The collaboration is complete.

**Final Task:** ${task}

**Final Files:**
\`\`\`html
<!-- index.html -->
${finalHtml || "<!-- Empty -->"}
\`\`\`
\`\`\`css
/* style.css */
${finalCss || "/* Empty */"}
\`\`\`
\`\`\`javascript
// script.js
${finalJs || "// Empty"}
\`\`\`

Based on the entire conversation history and the final code state:
1.  Provide a concise summary of the collaboration process: what was achieved, key features implemented, and any notable improvements made turn-by-turn if possible.
2.  Present the **final, complete, and polished code** for \`index.html\`, \`style.css\`, and \`script.js\`. Ensure the code is ready for use.`;

        conversationHistory.push({ role: "user", content: summaryPrompt });

        try {
          const summaryLog = addLog(
            `Generating summary (${summaryModel})...`,
            "System"
          );
          const summaryLogText = summaryLog.querySelector(".log-message-text");
          let summaryStreamedContent = "";

          const summaryResponse = await callOllamaChat(
            summaryModel,
            conversationHistory,
            (chunk) => {
              summaryStreamedContent += chunk;
              if (summaryLogText) {
                try {
                  const sanitizedSummaryHtml =
                    typeof DOMPurify !== "undefined"
                      ? DOMPurify.sanitize(
                          marked.parse(summaryStreamedContent + "...")
                        )
                      : marked.parse(summaryStreamedContent + "...");
                  summaryLogText.innerHTML = sanitizedSummaryHtml;
                  if (typeof hljs !== "undefined") {
                    summaryLogText
                      .querySelectorAll("pre code:not([data-highlighted])")
                      .forEach(hljs.highlightElement);
                  }
                  logContainer.scrollTop = logContainer.scrollHeight;
                } catch (e) {}
              }
            }
          );
          conversationHistory.push({
            role: "assistant",
            content: summaryResponse,
          });

          if (summaryLogText) {
            try {
              const finalSanitizedSummary =
                typeof DOMPurify !== "undefined"
                  ? DOMPurify.sanitize(marked.parse(summaryResponse))
                  : marked.parse(summaryResponse);
              summaryLogText.innerHTML = finalSanitizedSummary;
              if (typeof hljs !== "undefined") {
                summaryLogText.querySelectorAll("pre code").forEach((block) => {
                  block.removeAttribute("data-highlighted");
                  hljs.highlightElement(block);
                });
              }
            } catch (e) {
              summaryLogText.textContent = summaryResponse;
            }
          } else {
            addLog(summaryResponse, summaryModel);
          }

          updateCodeTabs(summaryResponse, true);
          resultsSection.classList.remove("hidden");
        } catch (error) {
          const userAborted =
            error.name === "AbortError" ||
            error.message === "Fetch aborted by user.";
          if (!userAborted) {
            addLog(
              `Error generating summary: ${error.message}`,
              "System",
              true
            );
          } else {
            addLog("Summary generation aborted.", "System");
          }
          updateCodeTabs(
            conversationHistory[conversationHistory.length - 2]?.content || "",
            true
          );
          resultsSection.classList.remove("hidden");
        }
      } else {
        addLog("Collaboration finished. Displaying final code.", "System");
        updateCodeTabs(
          conversationHistory[conversationHistory.length - 1]?.content || "",
          true
        );
        resultsSection.classList.remove("hidden");
      }
    } else if (isPaused) {
      addLog("Collaboration paused before completion.", "System");
      updateCodeTabs(
        conversationHistory[conversationHistory.length - 1]?.content || "",
        true
      );
      resultsSection.classList.remove("hidden");
    }
  }

  // --- Form Submission Handler ---
  async function handleSubmit(e) {
    e.preventDefault();
    if (submitBtn.disabled) return;

    clearLog();
    setRunningState(true);
    setPausedState(false);
    errorContainer.textContent = "";
    resultsSection.classList.add("hidden");

    const task = taskInput.value.trim();
    const model1 = ai1Select.value;
    const model2 = ai2Select.value;
    totalTurns = parseInt(turnsInput.value, 10) * 2;
    const addSummary = summaryTurn.checked;

    if (!task) {
      addLog("Please enter a task description.", "System", true);
      setRunningState(false);
      return;
    }
    if (!model1 || !model2) {
      addLog("Please select both AI workers.", "System", true);
      setRunningState(false);
      return;
    }
    if (totalTurns <= 0) {
      addLog("Number of turns must be at least 1.", "System", true);
      setRunningState(false);
      return;
    }

    addLog(`Starting collaboration task: "${task}"`, "System");
    addLog(
      `Worker 1: ${model1}, Worker 2: ${model2}, Turns: ${turnsInput.value}${
        addSummary ? " (+ Summary)" : ""
      }`,
      "System"
    );

    conversationHistory = [];
    currentTurn = 0;

    try {
      await runCollaboration(task, model1, model2, addSummary);
      if (currentTurn >= totalTurns && !isPaused) {
        addLog("Collaboration completed successfully.", "System");
      }
    } catch (error) {
      const userAborted =
        error.name === "AbortError" ||
        error.message === "Fetch aborted by user.";
      if (userAborted) {
        errorContainer.textContent = `Collaboration aborted by user.`;
      } else {
        errorContainer.textContent = `Collaboration stopped due to error: ${error.message}`;
        console.error("Collaboration failed:", error);
      }
      resultsSection.classList.remove("hidden");
    } finally {
      setRunningState(false);
      pauseBtn.disabled = true;
      resumeBtn.disabled = true;
      injectInput.disabled = true;
      isPaused = false;
      abortController = null;
    }
  }

  // --- Control Button Listeners ---
  pauseBtn.onclick = () => {
    if (!isPaused && !pauseBtn.disabled) {
      setPausedState(true);
      if (abortController) {
        console.log("Pausing requested.");
      } else {
        console.log("Pausing between turns.");
      }
    }
  };

  // --- Download Button Listener ---
  downloadBtn.onclick = () => {
    if (typeof JSZip === "undefined") {
      alert("JSZip library not loaded. Cannot download.");
      console.error("JSZip not found for download.");
      return;
    }
    if (downloadBtn.disabled) return;

    const finalHtmlContent =
      finalOutputContainer.querySelector("#finalHtmlCode code")?.textContent ||
      "";
    const finalCssContent =
      finalOutputContainer.querySelector("#finalCssCode code")?.textContent ||
      "";
    const finalJsContent =
      finalOutputContainer.querySelector("#finalJsCode code")?.textContent ||
      "";

    if (!finalHtmlContent && !finalCssContent && !finalJsContent) {
      alert("No final code found to download.");
      return;
    }

    try {
      const zip = new JSZip();
      zip.file("index.html", finalHtmlContent);
      zip.file("style.css", finalCssContent);
      zip.file("script.js", finalJsContent);

      zip
        .generateAsync({ type: "blob" })
        .then((blob) => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          const taskName =
            taskInput.value
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .substring(0, 30) || "ai-webapp";
          link.download = `${taskName}.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        })
        .catch((err) => {
          console.error("Error creating zip:", err);
          alert("Failed to create zip file. Check console for details.");
        });
    } catch (err) {
      console.error("Error initializing JSZip or adding files:", err);
      alert(
        "An error occurred during the download preparation. Check console for details."
      );
    }
  };

  // --- Real-Time Preview and Copy Functionality ---
  const debounce = (func, wait) => {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };

  const updateLivePreview = () => {
    livePreview.classList.add("loading");
    const htmlContent = htmlCode.textContent;
    const cssContent = cssCode.textContent;
    const jsContent = jsCode.textContent;

    livePreview.srcdoc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Live Preview</title>
        <style>
          body {
            font-family: sans-serif;
            margin: 0;
            padding: 8px;
            box-sizing: border-box;
            min-height: 100vh;
          }
          *, *::before, *::after {
            box-sizing: inherit;
          }
          ${cssContent}
        </style>
      </head>
      <body>
        ${htmlContent}
        <script>
          try {
            ${jsContent}
          } catch (e) {
            console.error("Live Preview Script Error:", e);
            const errorDiv = document.createElement('div');
            errorDiv.style.position = 'fixed';
            errorDiv.style.bottom = '0';
            errorDiv.style.left = '0';
            errorDiv.style.right = '0';
            errorDiv.style.background = 'rgba(200, 0, 0, 0.85)';
            errorDiv.style.color = 'white';
            errorDiv.style.padding = '10px';
            errorDiv.style.fontSize = '14px';
            errorDiv.style.fontFamily = 'monospace';
            errorDiv.style.whiteSpace = 'pre-wrap';
            errorDiv.style.zIndex = '9999';
            errorDiv.textContent = 'Preview Script Error:\\n' + e.stack;
            document.body.appendChild(errorDiv);
          }
        </script>
      </body>
      </html>
    `;

    livePreview.onload = () => {
      const contentHeight =
        livePreview.contentWindow.document.body.scrollHeight;
      livePreview.style.height = `${Math.max(contentHeight, 200)}px`;
      livePreview.classList.remove("loading");
    };
  };

  const debouncedUpdate = debounce(updateLivePreview, 300);

  [htmlCode, cssCode, jsCode].forEach((codeEl) => {
    codeEl.addEventListener("input", () => {
      const preElement = codeEl.parentElement;
      const lines = codeEl.textContent.split("\n");
      const lineCount =
        lines.length > 0 && lines[lines.length - 1] === ""
          ? lines.length - 1
          : lines.length;
      const lineNumbersDiv = preElement.querySelector(".line-numbers");
      lineNumbersDiv.textContent =
        lineCount > 0
          ? Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")
          : "";

      if (typeof hljs !== "undefined") {
        codeEl.removeAttribute("data-highlighted");
        hljs.highlightElement(codeEl);
      }

      debouncedUpdate();
    });
  });

  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const codeTab = btn.closest(".code-tab.active");
      const codeEl = codeTab
        ? codeTab.querySelector("code")
        : btn.parentElement.querySelector("code");
      const text = codeEl.textContent;
      navigator.clipboard
        .writeText(text)
        .then(() => {
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.innerHTML = `<span id="${
              btn.id === "copy-code-btn"
                ? "copy-icon-code"
                : btn.id.includes("html")
                ? "copy-icon-final-html"
                : btn.id.includes("css")
                ? "copy-icon-final-css"
                : "copy-icon-final-js"
            }" class="w-4 h-4"></span> Copy`;
            renderIcon(
              `#${
                btn.id === "copy-code-btn"
                  ? "copy-icon-code"
                  : btn.id.includes("html")
                  ? "copy-icon-final-html"
                  : btn.id.includes("css")
                  ? "copy-icon-final-css"
                  : "copy-icon-final-js"
              }`,
              Copy,
              { width: 16, height: 16, class: "text-gray-400" }
            );
          }, 2000);
        })
        .catch((err) => {
          console.error("Failed to copy:", err);
          btn.textContent = "Error";
          setTimeout(() => {
            btn.innerHTML = `<span id="${
              btn.id === "copy-code-btn"
                ? "copy-icon-code"
                : btn.id.includes("html")
                ? "copy-icon-final-html"
                : btn.id.includes("css")
                ? "copy-icon-final-css"
                : "copy-icon-final-js"
            }" class="w-4 h-4"></span> Copy`;
            renderIcon(
              `#${
                btn.id === "copy-code-btn"
                  ? "copy-icon-code"
                  : btn.id.includes("html")
                  ? "copy-icon-final-html"
                  : btn.id.includes("css")
                  ? "copy-icon-final-css"
                  : "copy-icon-final-js"
              }`,
              Copy,
              { width: 16, height: 16, class: "text-gray-400" }
            );
          }, 2000);
        });
    });
  });

  // --- Toggle Task Form ---
  document.getElementById("toggle-task-form").addEventListener("click", () => {
    taskFormSection.classList.toggle("hidden");
  });

  // --- Initialization ---
  taskForm.addEventListener("submit", handleSubmit);
  clearLog();
  setRunningState(false);
  setPausedState(false);
  fetchOllamaModels();
  initializeTabs();
});
