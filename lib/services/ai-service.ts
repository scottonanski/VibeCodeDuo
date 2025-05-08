// lib/services/ai-service.ts
import type { AiChatMessage } from '@/lib/orchestration/stages/types';

type FetchChatCompletionArgs = {
    provider: 'openai' | 'ollama' | 'OpenAI' | 'Ollama';
    model: string;
    messages: AiChatMessage[];
    apiKey?: string;
    ollamaBasePath?: string;
    stream?: boolean;
    signal?: AbortSignal;
};

// ====================================================================
// fetchChatCompletion function (As provided by you - unchanged)
// ====================================================================
export async function* fetchChatCompletion({
    provider,
    model,
    messages,
    apiKey,
    ollamaBasePath = process.env.OLLAMA_BASE_URL || 'http://localhost:11434', // Corrected http link
    stream = true,
    signal
}: FetchChatCompletionArgs): AsyncGenerator<string> {
    const providerNormalized = provider.toLowerCase();
    // console.log(`[fetchChatCompletion Debug] Provider: ${providerNormalized}, Model: ${model}, Received apiKey: ${apiKey ? apiKey.substring(0, 10) + '...' : 'undefined'}`);
    // console.log(`[fetchChatCompletion Debug] Type of apiKey: ${typeof apiKey}, Length: ${apiKey?.length}`);

    let endpoint: string;
    let headers: HeadersInit = { "Content-Type": "application/json" };
    let body: Record<string, any>;

    if (providerNormalized === 'openai') {
        if (!apiKey) {
            console.error("[fetchChatCompletion Error] OpenAI provider: apiKey is falsy here!");
            throw new Error("[AiService] OpenAI provider requires an API key.");
        }
        endpoint = "https://api.openai.com/v1/chat/completions";
        headers["Authorization"] = `Bearer ${apiKey}`;
        body = { model, messages, stream };
        // console.log('[AiService] Calling OpenAI API:', { endpoint, model, apiKeyPreview: `${apiKey.slice(0, 6)}...` });

    } else if (providerNormalized === 'ollama') {
        endpoint = `${ollamaBasePath.replace(/\/$/, '')}/api/chat`;
        body = { model, messages, stream };
        // console.log('[AiService] Calling Ollama API:', { endpoint, model });
    } else {
        throw new Error(`[AiService] Unsupported provider: ${provider}`);
    }

    const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        let errorDetails = `Status: ${response.status}`;
        try {
            const errorBody = await response.text();
            console.error(`[AiService] ${providerNormalized} API Error Response:`, errorBody);
            errorDetails = `${response.status}: ${errorBody}`;
        } catch (err) {
            errorDetails = `${response.status} (Failed to read error body)`;
        }
        throw new Error(`[AiService] ${providerNormalized} API error: ${errorDetails}`);
    }

    if (!response.body) {
        throw new Error("[AiService] No response body to read from.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
        while (true) {
            const { value, done: readerDone } = await reader.read();
            if (readerDone) break;
            buffer += decoder.decode(value, { stream: true });

            if (providerNormalized === 'openai') {
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    if (line.trim().startsWith("data:")) {
                        const json = line.replace(/^data:\s*/, "").trim();
                        if (json === "[DONE]") {
                           if (reader) await reader.cancel().catch(e => console.warn("[AiService] Error cancelling reader on [DONE]:", e));
                           return;
                        }
                        try {
                            const parsed = JSON.parse(json);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) yield content;
                        } catch (err) { /* console.warn("[AiService] OpenAI stream chunk parse error:", json, err); */ }
                    }
                }
            } else if (providerNormalized === 'ollama') {
                let separatorIndex;
                while ((separatorIndex = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.substring(0, separatorIndex).trim();
                    buffer = buffer.substring(separatorIndex + 1);
                    if (line) {
                        try {
                            const parsed = JSON.parse(line);
                            const content = parsed.message?.content;
                            if (content) yield content;
                            if (parsed.done) {
                                if (reader) await reader.cancel().catch(e => console.warn("[AiService] Error cancelling reader on Ollama done:", e));
                                return;
                            }
                        } catch (err) { /* console.warn("[AiService] Ollama stream chunk parse error:", line, err); */ }
                    }
                }
            }
        }
    } catch (error) {
         console.error("[AiService] Error processing stream:", error);
         throw error;
    } finally {
         if (reader && !reader.closed) {
            try { await reader.cancel(); } catch (cancelError) { /* console.warn("[AiService] Error cancelling reader in finally:", cancelError); */ }
        }
    }
}


// ====================================================================
// UPDATED extractJsonString function
// ====================================================================
export function extractJsonString(responseText: string): string | null {
    // Trim whitespace from the input response
    const trimmedResponse = responseText.trim();

    // 1. Attempt strict match with triple backticks for JSON block
    const strictMatch = trimmedResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (strictMatch && strictMatch[1]) {
        const potentialJson = strictMatch[1].trim();
        try {
            JSON.parse(potentialJson); // Validate JSON
            return potentialJson; // Return if valid
        } catch (e) {
            console.warn("extractJsonString: Content within backticks is not valid JSON.", potentialJson);
            // Fall through if content inside backticks is invalid
        }
    }

    // 2. Check if the trimmed response looks like a JSON object or array
    //    by checking start/end characters ({...} or [...])
    if ((trimmedResponse.startsWith('{') && trimmedResponse.endsWith('}')) ||
        (trimmedResponse.startsWith('[') && trimmedResponse.endsWith(']'))) {
        try {
            JSON.parse(trimmedResponse); // Validate the entire trimmed response
            return trimmedResponse; // Return if the whole thing is valid JSON
        } catch (err) {
            console.warn("extractJsonString: Response looks like JSON but failed to parse.", trimmedResponse);
             // Fall through if it looked like JSON but wasn't valid
        }
    }

    // 3. Fallback: Looser search for first '{' and last '}' (less reliable)
    //    Only use this if it causes too many false positives.
    const firstBrace = responseText.indexOf("{"); // Use original responseText for index finding
    const lastBrace = responseText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const possibleJson = responseText.substring(firstBrace, lastBrace + 1);
      try {
        JSON.parse(possibleJson);
        console.warn("extractJsonString: Using loose brace matching fallback.");
        return possibleJson;
      } catch (err) {
         // Ignore error from loose match if it's invalid
      }
    }

    // If none of the above worked
    console.warn("extractJsonString: No valid JSON block or structure found in response:", responseText); // Log the original response for debugging
    return null;
}


// If you have other utilities like parseReviewOutput here, they would remain.
// For example, if parseReviewOutput relies on extractJsonString, ensure it's defined correctly.
/*
export const parseReviewOutput = (response: string): { status: string; key_issues: string[]; next_action_for_w1: string } => {
    const jsonString = extractJsonString(response);
    // ... rest of parseReviewOutput logic ...
};
*/