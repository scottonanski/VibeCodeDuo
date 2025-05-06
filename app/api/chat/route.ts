// /app/api/chat/route.ts

import { type NextRequest } from 'next/server';
import { collaborationPipeline } from '@/lib/orchestration/collaborationPipeline';
import type { PipelineEvent, AiChatMessage, PipelineParams } from '@/lib/orchestration/stages/types'; // Added PipelineParams

export const runtime = 'edge';

interface ChatApiPayload {
    messages: AiChatMessage[];
    worker1: { provider: 'OpenAI' | 'Ollama'; model: string };
    worker2: { provider: 'OpenAI' | 'Ollama'; model: string };
    filename?: string;
    maxTurns?: number;
}

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json() as ChatApiPayload;
        const { messages, worker1, worker2 } = payload;

        console.log('[API Route] Received request. Worker1:', worker1, 'Worker2:', worker2, 'Messages:', messages?.length || 0);
        console.log('[API Route Debug] Value of process.env.OPENAI_API_KEY_WORKER1:', process.env.OPENAI_API_KEY_WORKER1);
        console.log('[API Route Debug] Value of process.env.OPENAI_API_KEY_WORKER2:', process.env.OPENAI_API_KEY_WORKER2);

        if (!messages || messages.length === 0 || !worker1 || !worker2) {
            throw new Error("Invalid request payload. Missing messages, worker1, or worker2 info.");
        }

        const openAIApiKeyWorker1 = process.env.OPENAI_API_KEY_WORKER1;
        const openAIApiKeyWorker2 = process.env.OPENAI_API_KEY_WORKER2;

        if (worker1.provider === 'OpenAI' && !openAIApiKeyWorker1) {
            console.error("[API Route] Missing OPENAI_API_KEY_WORKER1 for Worker 1.");
            throw new Error("Server configuration error: Missing OpenAI API Key for Worker 1.");
        }
        if (worker2.provider === 'OpenAI' && !openAIApiKeyWorker2) {
            console.error("[API Route] Missing OPENAI_API_KEY_WORKER2 for Worker 2.");
            throw new Error("Server configuration error: Missing OpenAI API Key for Worker 2.");
        }

        const pipelineParams: PipelineParams = { // Explicitly type this
            prompt: messages[0]?.content || '',
            refinerConfig: {
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                apiKey: openAIApiKeyWorker1
            },
            worker1Config: { provider: worker1.provider.toLowerCase() as 'openai' | 'ollama', model: worker1.model, apiKey: openAIApiKeyWorker1 },
            worker2Config: { provider: worker2.provider.toLowerCase() as 'openai' | 'ollama', model: worker2.model, apiKey: openAIApiKeyWorker2 },
            projectType: 'nextjs-tailwind', // Example: define a project type
            filename: payload.filename || 'app/page.tsx',
            maxTurns: payload.maxTurns || 6,
        };

        console.log('[API Route Debug] pipelineParams.refinerConfig.apiKey:', pipelineParams.refinerConfig.apiKey);
        console.log('[API Route Debug] pipelineParams.worker1Config.apiKey:', pipelineParams.worker1Config.apiKey);
        console.log('[API Route Debug] pipelineParams.worker2Config.apiKey:', pipelineParams.worker2Config.apiKey);

        const pipelineGenerator = collaborationPipeline(pipelineParams);

        const stream = new ReadableStream({
            async start(controller) {
                console.log('[API Route] ReadableStream started.');
                const encoder = new TextEncoder();

                function sendSseFormattedEvent(eventType: string, dataObject: any) {
                    const dataString = JSON.stringify(dataObject);
                    if (eventType !== 'assistant_chunk') {
                        console.log(`[API Route] Sending SSE - event: ${eventType}, data: ${dataString}`);
                    }
                    try {
                         controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${dataString}\n\n`));
                    } catch (e) {
                        console.error(`[API Route] Error enqueuing event ${eventType}:`, e);
                    }
                }

                try {
                    for await (const event of pipelineGenerator) {
                        sendSseFormattedEvent(event.type, event.data);
                    }
                    console.log('[API Route] Collaboration pipeline finished.');
                } catch (error) {
                    console.error('[API Route] Error processing collaboration pipeline:', error);
                    sendSseFormattedEvent('pipeline_error', { message: error instanceof Error ? error.message : 'Unknown pipeline error' });
                } finally {
                    controller.close();
                }
            },
            cancel(reason) {
                console.log('[API Route] Stream cancelled. Reason:', reason);
            }
        });

        return new Response(stream, {
            status: 200,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        console.error("[API Route] Top-level error in POST handler:", error);
        return new Response(JSON.stringify({ error: "Top-level error in POST handler: " + (error instanceof Error ? error.message : String(error)) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}