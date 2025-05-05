// src/services/AiService.ts (or wherever you place your services)

// Re-using the message type, assuming Ollama uses a compatible format
export type AiChatMessage = {
    role: "user" | "assistant" | "system";
    content: string;
};

type FetchChatCompletionArgs = {
    provider: 'openai' | 'ollama'; // Determine which API to call
    model: string;
    messages: AiChatMessage[];
    apiKey?: string; // Optional: Only needed for OpenAI
    ollamaBasePath?: string; // Optional: Base URL for Ollama API
    stream?: boolean;
    signal?: AbortSignal;
};

/**
 * Fetches a chat completion stream from the specified AI provider (OpenAI or Ollama).
 *
 * @param {FetchChatCompletionArgs} args - The arguments for the fetch request.
 * @returns {AsyncGenerator<string>} An async generator yielding chat content deltas.
 */
export async function* fetchChatCompletion({
    provider,
    model,
    messages,
    apiKey, // Only used for OpenAI
    ollamaBasePath = process.env.OLLAMA_BASE_URL || 'http://localhost:11434', // Default Ollama URL
    stream = true,
    signal
}: FetchChatCompletionArgs): AsyncGenerator<string> {

    let endpoint: string;
    let headers: HeadersInit = { "Content-Type": "application/json" };
    let body: Record<string, any>;

    // --- Prepare request based on provider ---
    if (provider === 'openai') {
        if (!apiKey) {
            throw new Error("[AiService] OpenAI provider requires an API key.");
        }
        endpoint = "https://api.openai.com/v1/chat/completions";
        headers["Authorization"] = `Bearer ${apiKey}`;
        body = { model, messages, stream };

        // Optional: Add back the warning if you want
        // if (/^(OpenAI:|Ollama:)/i.test(model)) {
        //   console.warn(`[AiService] WARNING: Model name appears prefixed: '${model}'. Ensure it's a valid OpenAI model name.`);
        // }
        console.log('[AiService] Calling OpenAI API:', { endpoint, model, apiKeyPreview: apiKey ? `${apiKey.slice(0, 6)}...` : '(none)' });

    } else if (provider === 'ollama') {
        endpoint = `${ollamaBasePath.replace(/\/$/, '')}/api/chat`; // Ensure no trailing slash
        // Ollama typically doesn't require an Authorization header
        body = { model, messages, stream }; // Ollama structure might differ slightly, adjust if needed

        console.log('[AiService] Calling Ollama API:', { endpoint, model });

    } else {
        throw new Error(`[AiService] Unsupported provider: ${provider}`);
    }

    // --- Make the API call ---
    const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
    });

    // --- Handle errors ---
    if (!response.ok) {
        let errorDetails = `Status: ${response.status}`;
        try {
            const errorBody = await response.text();
            console.error(`[AiService] ${provider} API Error Response:`, errorBody);
            try {
                // Attempt to parse JSON error (common format)
                const parsedError = JSON.parse(errorBody);
                errorDetails = `${response.status}: ${parsedError?.error?.message || parsedError?.error || errorBody}`;
            } catch {
                // If not JSON, use the raw text
                errorDetails = `${response.status}: ${errorBody}`;
            }
        } catch (err) {
            errorDetails = `${response.status} (Failed to read error body)`;
        }
        throw new Error(`[AiService] ${provider} API error: ${errorDetails}`);
    }

    // --- Process the stream ---
    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");

    if (!reader) {
        throw new Error("[AiService] No response body to read from.");
    }

    let buffer = "";
    try {
        while (true) {
            const { value, done: readerDone } = await reader.read();
            if (readerDone) {
                break; // Exit loop if reader is done
            }

            buffer += decoder.decode(value, { stream: true }); // Decode chunk into buffer

            // Process buffer line by line or by JSON object for Ollama
            if (provider === 'openai') {
                const lines = buffer.split("\n");
                buffer = lines.pop() || ""; // Keep the last partial line in the buffer

                for (const line of lines) {
                    if (line.trim().startsWith("data:")) {
                        const json = line.replace(/^data:\s*/, "").trim();
                        if (json === "[DONE]") {
                           await reader.cancel(); // Ensure stream is closed
                           return; // OpenAI stream finished
                        }
                        try {
                            const parsed = JSON.parse(json);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                yield content;
                            }
                        } catch (err) {
                            console.warn("[AiService] Failed to parse OpenAI stream chunk:", json, err);
                        }
                    }
                }
            } else if (provider === 'ollama') {
                // Ollama streams newline-separated JSON objects
                let separatorIndex;
                while ((separatorIndex = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.substring(0, separatorIndex).trim();
                    buffer = buffer.substring(separatorIndex + 1); // Remove processed line from buffer

                    if (line) {
                        try {
                            const parsed = JSON.parse(line);
                            // Ollama yields the message object in each chunk
                            const content = parsed.message?.content;
                            if (content) {
                                yield content;
                            }
                            // Check if Ollama indicates completion in the chunk
                            if (parsed.done) {
                                await reader.cancel(); // Ensure stream is closed
                                return; // Ollama stream finished
                            }
                        } catch (err) {
                            console.warn("[AiService] Failed to parse Ollama stream chunk:", line, err);
                        }
                    }
                }
            }
        } // End while(true) loop
    } catch (error) {
         // Handle potential errors during stream processing
         console.error("[AiService] Error processing stream:", error);
         throw error; // Re-throw the error
    } finally {
         // Ensure the reader is cancelled if the loop exits unexpectedly
         if (reader) {
            try {
                await reader.cancel();
            } catch (cancelError) {
                console.warn("[AiService] Error cancelling reader:", cancelError);
            }
        }
    }
}