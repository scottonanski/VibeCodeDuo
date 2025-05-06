// /app/api/chat/route.ts  <-- Make sure this is the correct file path in your project

import { fetchChatCompletion, type AiChatMessage } from '@/lib/services/ai-service'; // Adjust path if needed
import { type NextRequest } from 'next/server';

// Use Edge Runtime for streaming capabilities if possible, otherwise Node.js runtime works too.
export const runtime = 'edge';
// export const dynamic = 'force-dynamic'; // May be needed for Node.js runtime

// Define the expected request body structure
interface ChatApiPayload {
    messages: AiChatMessage[];
    worker1: { provider: 'OpenAI' | 'Ollama'; model: string };
    worker2: { provider: 'OpenAI' | 'Ollama'; model: string };
    // Add other potential payload properties if needed
}


export async function POST(req: NextRequest) {
    try {
        // Use await req.json() which is standard for Next.js Edge/Node API routes
        const payload = await req.json() as ChatApiPayload;
        const { messages, worker1, worker2 } = payload;

        console.log('[API Route] Received request. Worker1:', worker1, 'Worker2:', worker2, 'Messages:', messages?.length || 0);

        if (!messages || !worker1 || !worker2) {
             throw new Error("Invalid request payload. Missing messages, worker1, or worker2 info.");
        }

        // Retrieve API key securely (ensure this is set in your environment)
        const openAIApiKeyWorker1 = process.env.OPENAI_API_KEY_WORKER1;
        const openAIApiKeyWorker2 = process.env.OPENAI_API_KEY_WORKER2;
        // Optional: Add similar check for Ollama base URL if needed
        // const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;

        // Validate OpenAI key if needed
        if (worker1.provider === 'OpenAI' && !openAIApiKeyWorker1) {
            console.error("[API Route] Missing OPENAI_API_KEY_WORKER1 environment variable for OpenAI worker 1.");
            throw new Error("Server configuration error: Missing OpenAI API Key for Worker 1.");
        }
        if (worker2.provider === 'OpenAI' && !openAIApiKeyWorker2) {
            console.error("[API Route] Missing OPENAI_API_KEY_WORKER2 environment variable for OpenAI worker 2.");
            throw new Error("Server configuration error: Missing OpenAI API Key for Worker 2.");
        }

        // Create generators
        const generator1 = fetchChatCompletion({
            provider: worker1.provider.toLowerCase() as 'openai' | 'ollama', // Convert to lowercase
            model: worker1.model,
            messages,
            apiKey: worker1.provider === 'OpenAI' ? openAIApiKeyWorker1 : undefined,
            // ollamaBasePath: ollamaBaseUrl, // Pass if using Ollama and custom URL
            stream: true,
        });

        const generator2 = fetchChatCompletion({
            provider: worker2.provider.toLowerCase() as 'openai' | 'ollama', // Convert to lowercase
            model: worker2.model,
            messages,
            apiKey: worker2.provider === 'OpenAI' ? openAIApiKeyWorker2 : undefined,
            // ollamaBasePath: ollamaBaseUrl, // Pass if using Ollama and custom URL
            stream: true,
        });

        // Create the response stream
        const stream = new ReadableStream({
            async start(controller) {
                console.log('[API Route] ReadableStream started.');

                const encoder = new TextEncoder();

                function sendEvent(event: string, data: string) {
                    // Log before sending
                    console.log(`[API Route] Sending SSE - event: ${event}, data: ${JSON.stringify(data)}`);
                    try {
                         controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
                    } catch (e) {
                        console.error(`[API Route] Error enqueuing event ${event}:`, e);
                        // Decide if you want to try closing the stream here
                    }
                }

                async function processGenerator(gen: AsyncGenerator<string>, prefix: 'w1' | 'w2') {
                    console.log(`[API Route] Starting to process generator ${prefix}`);
                    let yieldedData = false;
                    try {
                        for await (const chunk of gen) {
                            if (typeof chunk === 'string' && chunk.length > 0) { // Ensure chunk is a non-empty string
                                yieldedData = true;
                                sendEvent(`${prefix}-chunk`, chunk);
                            } else if (chunk) {
                                // Log if chunk is not a string or empty, might indicate an issue upstream
                                console.warn(`[API Route] Received non-string or empty chunk from ${prefix} generator:`, chunk);
                            }
                            // No explicit else needed for empty strings if they are expected/ignorable
                        }
                         // Send done event ONLY if the generator finished without errors
                        sendEvent(`${prefix}-done`, JSON.stringify({ finished: true })); // Send valid JSON
                        console.log(`[API Route] Generator ${prefix} finished successfully. Yielded data: ${yieldedData}`);
                    } catch (error: any) {
                        console.error(`[API Route] Error processing generator ${prefix}:`, error);
                        // Send an error event with valid JSON data
                        sendEvent(`${prefix}-error`, JSON.stringify({ message: error.message || 'Failed to process stream' }));
                         console.log(`[API Route] Generator ${prefix} finished with error. Yielded data before error: ${yieldedData}`);
                    }
                }

                // Run both generators concurrently and wait for both to settle (finish or error)
                await Promise.allSettled([ // Use allSettled to ensure both run even if one fails
                    processGenerator(generator1, 'w1'),
                    processGenerator(generator2, 'w2')
                ]).then(results => {
                    console.log("[API Route] Both generator processing settled.");
                    results.forEach((result, index) => {
                        if (result.status === 'rejected') {
                            console.error(`[API Route] Promise for generator ${index + 1} rejected:`, result.reason);
                        }
                    });
                });


                console.log('[API Route] Both generators finished processing. Closing stream.');
                try {
                     controller.close();
                } catch (e) {
                     console.error("[API Route] Error closing stream controller:", e);
                }
            },
            cancel(reason) {
                 console.log('[API Route] Stream cancelled. Reason:', reason);
                 // You might want to signal cancellation to the generators here
                 // This requires passing the AbortSignal down to fetchChatCompletion
                 // and handling it there, potentially using reader.cancel() or aborting fetch.
            }
        });

        return new Response(stream, {
            status: 200, // Ensure status is 200 for successful stream initiation
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform', // Essential for SSE
                'Connection': 'keep-alive', // Essential for SSE
                // 'X-Content-Type-Options': 'nosniff', // Good practice
            },
        });

    } catch (error: any) {
        console.error("[API Route] Error in POST handler:", error);
        // Return a JSON error response if setup fails before streaming starts
        return new Response(JSON.stringify({ error: error.message || 'An unknown error occurred' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}