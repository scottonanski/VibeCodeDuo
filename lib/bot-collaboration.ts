export type BotRole = "worker1" | "worker2";
export type Message = { role: BotRole | "system" | "user"; content: string };

export interface CollaborationOptions {
  task: string;
  model1: string;
  model2: string;
  initialCode?: { html: string; css: string; js: string };
  callModel: (
    model: string,
    messages: Message[],
    role: BotRole,
    codeState: { html: string; css: string; js: string }
  ) => Promise<string>; // returns model's response (code or feedback)
}

export async function runCollaborationLoop(opts: CollaborationOptions): Promise<Message[]> {
  const { task, model1, model2, initialCode, callModel } = opts;
  const totalTurns = 6; // 3 turns per bot, hardcoded
  let currentModel = model1;
  let otherModel = model2;
  let currentRole: BotRole = "worker1";
  let otherRole: BotRole = "worker2";
  let codeState = initialCode || { html: "", css: "", js: "" };

  // Initialize conversation history
  let conversation: Message[] = [
    {
      role: "system",
      content: `You are ${model1} (Worker 1) and ${model2} (Worker 2), collaborating on a web application. Worker 1 writes code, Worker 2 reviews and suggests improvements. Alternate turns for a total of 6 turns. The task is: ${task}`
    },
    {
      role: "user",
      content: `Begin collaboration. Initial task: ${task}`
    }
  ];

  for (let turn = 0; turn < totalTurns; turn++) {
    // Call the current model with the conversation and code state
    const response = await callModel(currentModel, conversation, currentRole, codeState);
    conversation.push({ role: currentRole, content: response });

    // Optionally, update codeState if Worker 1 (the code writer) just acted
    if (currentRole === "worker1") {
      // You may want to parse response for code updates here
      // For now, we just keep codeState as is (or implement a parser later)
    }

    // Swap roles/models for next turn
    [currentModel, otherModel] = [otherModel, currentModel];
    [currentRole, otherRole] = [otherRole, currentRole];
  }

  return conversation;
}
