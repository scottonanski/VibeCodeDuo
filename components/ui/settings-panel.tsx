// components/ui/settings-panel.tsx
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Stubbed model lists
const OPENAI_MODELS = [
  "gpt-4.1-nano-2025-04-14",
  "gpt-3.5-turbo-0125"
];

const DEFAULT_OLLAMA_MODELS = [
  "deepcoder:1.5b",
  "qwen3:4b",
  "gemma3:1b",
  "llama3.2:3b",
  "qwen2.5:7b",
  "gemma3:4b",
  "deepseek-r1:8b"
];

type Provider = "Ollama" | "OpenAI";

export interface Settings {
  provider: Provider;
  worker1Model: string;
  worker2Model: string;
  refinerModel: string; // <<< ADDED
}

interface SettingsPanelProps {
  open: boolean;
  initialSettings: Settings;
  onConfirm: (settings: Settings) => void;
  onCancel: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, initialSettings, onConfirm, onCancel }) => {
  const [provider, setProvider] = useState<Provider>(initialSettings.provider);
  const [worker1Model, setWorker1Model] = useState<string>(initialSettings.worker1Model);
  const [worker2Model, setWorker2Model] = useState<string>(initialSettings.worker2Model);
  // Assuming you might want to select a refiner model in the UI eventually.
  // For now, it's just part of the type. If it needs to be set in the UI, add state for it.
  // const [refinerModel, setRefinerModel] = useState<string>(initialSettings.refinerModel);
  const [error, setError] = useState<string>("");

  const [ollamaModels, setOllamaModels] = useState<string[]>(DEFAULT_OLLAMA_MODELS);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaError, setOllamaError] = useState<string>("");

  useEffect(() => {
    if (open) {
      setProvider(initialSettings.provider);
      setWorker1Model(initialSettings.worker1Model);
      setWorker2Model(initialSettings.worker2Model);
      // if (initialSettings.refinerModel) setRefinerModel(initialSettings.refinerModel);
      setError("");
    }
  }, [open, initialSettings]);

  useEffect(() => {
    if (open && provider === "Ollama") {
      setOllamaLoading(true);
      setOllamaError("");
      fetch("/api/ollama-models")
        .then(async (res) => {
          if (!res.ok) throw new Error("Failed to fetch models");
          const data = await res.json();
          if (data.installed && Array.isArray(data.models) && data.models.length > 0) {
            setOllamaModels(data.models);
          } else if (!data.installed) {
            setOllamaError("Ollama is not installed.");
          } else {
            setOllamaError("No Ollama models found.");
          }
        })
        .catch(() => {
          setOllamaError("Failed to fetch Ollama models.");
        })
        .finally(() => setOllamaLoading(false));
    }
  }, [open, provider]);

  const modelList = provider === "Ollama" ? ollamaModels : OPENAI_MODELS;

  const handleConfirm = () => {
    if (!worker1Model || !worker2Model) {
      setError("Please select models for both workers.");
      return;
    }
    setError("");
    // For now, we'll pass a default/placeholder refiner model or the initial one if available.
    // The UI doesn't yet select it. This needs to be decided based on how refinerModel is managed.
    // If it's fixed, you can hardcode it or derive it. If user-configurable, add UI for it.
    const currentRefinerModel = initialSettings.refinerModel || OPENAI_MODELS[0]; // Example placeholder

    onConfirm({
        provider,
        worker1Model,
        worker2Model,
        refinerModel: currentRefinerModel // <<< PASSING A REFINER MODEL
    });
  };

  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent className="max-w-md w-full p-6">
        <DialogTitle>AI Settings</DialogTitle>
        <h2 className="text-lg font-semibold mb-4">Settings</h2>

        <div className="mb-4">
          <label className="block mb-1 font-medium">Provider</label>
          <select
            className="w-full p-2 border rounded"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
          >
            <option value="Ollama">Ollama</option>
            <option value="OpenAI">OpenAI</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block mb-1 font-medium">Worker 1 Model</label>
          {provider === "Ollama" && ollamaLoading ? (
            <div className="text-gray-500 text-sm">Loading models...</div>
          ) : provider === "Ollama" && ollamaError ? (
            <div className="text-red-600 text-sm">{ollamaError}</div>
          ) : (
            <select
              className="w-full p-2 border rounded"
              value={worker1Model}
              onChange={(e) => setWorker1Model(e.target.value)}
              disabled={provider === "Ollama" && (ollamaLoading || !!ollamaError)}
            >
              <option value="">Select a model</option>
              {modelList.map((model: string) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          )}
        </div>

        <div className="mb-4">
          <label className="block mb-1 font-medium">Worker 2 Model</label>
          {provider === "Ollama" && ollamaLoading ? (
            <div className="text-gray-500 text-sm">Loading models...</div>
          ) : provider === "Ollama" && ollamaError ? (
            <div className="text-red-600 text-sm">{ollamaError}</div>
          ) : (
            <select
              className="w-full p-2 border rounded"
              value={worker2Model}
              onChange={(e) => setWorker2Model(e.target.value)}
              disabled={provider === "Ollama" && (ollamaLoading || !!ollamaError)}
            >
              <option value="">Select a model</option>
              {modelList.map((model: string) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          )}
        </div>

        {/* 
          Optionally, add UI for selecting Refiner Model here if it's user-configurable:
          <div className="mb-4">
            <label className="block mb-1 font-medium">Refiner Model</label>
            <select ... value={refinerModel} onChange={(e) => setRefinerModel(e.target.value)} ...>
              {modelList.map((model) => (...))}
            </select>
          </div>
        */}

        {error && <div className="text-red-600 mb-2">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};