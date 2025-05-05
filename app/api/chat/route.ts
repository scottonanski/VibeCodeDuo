// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { fetchChatCompletion, AiChatMessage } from "@/lib/services/ai-service";
// Note: eventsource-parser is NOT needed here, we manually format SSE

export const runtime = 'edge'; // Optional: Use Edge Runtime for potential speed/cost benefits
export const dynamic = 'force-dynamic'; // Ensure fresh execution

export async function POST(req: Request) {
  try {
    const { messages, worker1, worker2 } = await req.json();

    // Validate payload (basic)
    if (!messages || !worker1 || !worker2) {
        return NextResponse.json({ error: "Missing required payload fields" }, { status: 400 });
    }

    // Securely get API keys from SERVER environment
    const apiKey1 = process.env.OPENAI_API_KEY_WORKER1;
    const apiKey2 = process.env.OPENAI_API_KEY_WORKER2;

    // --- Initiate worker streams ---
    // Add AbortSignal propagation if AiService supports it
    const controller = new AbortController(); // If you want server-side cancellation based on client disconnect
    const signal = controller.signal;

    const gen1 = fetchChatCompletion({
      ...worker1,
      messages,
      apiKey: worker1.provider === 'openai' ? apiKey1 : undefined,
      signal // Pass signal
    });

    const gen2 = fetchChatCompletion({
      ...worker2,
      messages,
      apiKey: worker2.provider === 'openai' ? apiKey2 : undefined,
      signal // Pass signal
    });

    const encoder = new TextEncoder();

    // --- Create the ReadableStream for the response ---
    const responseStream = new ReadableStream({
      async start(controller) {
        let gen1Done = false;
        let gen2Done = false;

        // Helper to enqueue SSE formatted data
        const sendEvent = (event: string, data: string) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        };

        // Function to process a single generator
        const processGenerator = async (
            id: 1 | 2,
            generator: AsyncGenerator<string>,
            isDoneFlagSetter: (done: boolean) => void
        ) => {
            try {
                for await (const chunk of generator) {
                    if (chunk) { // Ensure chunk is not empty/null
                      // Use the correct event type expected by the frontend
                      sendEvent(`w${id}-chunk`, chunk);
                    }
                }
                // Generator finished successfully
                isDoneFlagSetter(true);
                sendEvent(`w${id}-done`, 'true'); // This event type is already correct
            } catch (error: any) {
                console.error(`Worker ${id} stream error:`, error);
                isDoneFlagSetter(true); // Mark as done even on error
                 // Send error as a plain string, matching frontend expectation
                 const errorMessage = `Worker ${id} failed: ${error.message || 'Unknown error'}`;
                 sendEvent(`w${id}-error`, errorMessage);
            }
        };


        // Process both generators concurrently
        // We don't necessarily need Promise.allSettled here anymore,
        // just run both processes and let them manage their done flags.
        const worker1Promise = processGenerator(1, gen1, (done) => { gen1Done = done; });
        const worker2Promise = processGenerator(2, gen2, (done) => { gen2Done = done; });


        // Wait for both processes to complete (either success or error)
        await Promise.all([worker1Promise, worker2Promise]);

        // All processing finished, close the stream
        console.log("Both workers finished processing. Closing server stream.");
        controller.close();

      }, // End start()

      cancel(reason) {
        console.log("Client disconnected, cancelling server stream.", reason);
        // controller.abort(); // Abort the fetchChatCompletion calls if AiService uses the signal
      }
    }); // End new ReadableStream

    // --- Return the stream response ---
    return new NextResponse(responseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform", // no-transform is important for SSE
        "Connection": "keep-alive",
        // "X-Accel-Buffering": "no", // Useful for Nginx proxying
      },
    });

  } catch (error: any) {
    console.error("API Route Error:", error);
    // Ensure a Response object is returned even for top-level errors
    return NextResponse.json({ error: error.message || 'Failed to process chat request' }, { status: 500 });
  }
}
