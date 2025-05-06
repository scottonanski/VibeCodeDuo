import { exec } from 'child_process';

/**
 * Checks if Ollama is installed by trying to run `ollama --version`.
 * Returns true if installed, false otherwise.
 */
export function isOllamaInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('ollama --version', (error) => {
      resolve(!error);
    });
  });
}

/**
 * Lists available Ollama models by calling `ollama list --json`.
 * Returns an array of model names, or an empty array if Ollama is not installed or an error occurs.
 */
export async function getOllamaModels(): Promise<string[]> {
  return new Promise((resolve) => {
    exec('ollama list', (error, stdout) => {
      if (error) return resolve([]);
      const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean);
      // The first line is the header, skip it
      const models: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/\s+/); // split by whitespace
        if (parts.length > 0) {
          // The model name may have a colon (e.g. deepcoder:1.5b)
          models.push(parts[0]);
        }
      }
      resolve(models);
    });
  });
}
