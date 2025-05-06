// lib/orchestration/stages/refineStage.ts
import { fetchChatCompletion } from '@/lib/services/ai-service';
import type { AiChatMessage, WorkerConfig } from './types';

export async function refineStage(
    rawPrompt: string,
    config: WorkerConfig
): Promise<{
    refinedPrompt: string;
    messages: AiChatMessage[];
}> {
    console.log('[RefineStage Debug] Starting. Received config.apiKey:', config.apiKey ? config.apiKey.substring(0,10)+'...' : 'undefined');
    console.log('[RefineStage Debug] Full refinerConfig:', JSON.stringify(config, null, 2));


    const systemPrompt = `You are an AI prompt refiner. Your job is to take vague or casual user input and transform it into a clear, concise, actionable software task description for AI web developers. Focus on specifying technologies if mentioned (or infer sensible defaults if a project type is implied), key features, and desired structure. Output ONLY the refined prompt itself, without any conversational fluff, introductory or concluding remarks.`;

    const messagesForRefiner: AiChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please refine this prompt: "${rawPrompt}"` },
    ];

    let fullResult = '';
    try {
        const generator = fetchChatCompletion({
            provider: config.provider, // now strictly 'openai' | 'ollama'
            model: config.model,
            messages: messagesForRefiner,
            apiKey: config.apiKey,
            stream: true, // Changed to true, assuming we want to stream refiner output too
        });

        for await (const chunk of generator) {
            fullResult += chunk;
            // If refineStage itself were a generator, it would yield assistant_chunk here.
            // Since it's an async function returning a Promise, the pipeline handles the "Refiner thinking" status.
        }
    } catch (error: any) {
        console.error(`[RefineStage] Error calling LLM: ${error.message}`);
        throw new Error(`Refinement failed: ${error.message}`); // Re-throw for the pipeline to catch
    }

    if (!fullResult.trim()) {
        console.warn("[RefineStage] Refiner returned empty content. Using initial prompt as fallback.");
        fullResult = `Task: ${rawPrompt} (Refinement process yielded no content or an error).`;
    }

    return {
        refinedPrompt: fullResult.trim(),
        messages: [ // These messages are the context *for this stage's call*
            ...messagesForRefiner,
            { role: 'assistant', name: 'refiner', content: fullResult.trim() }
        ],
    };
}