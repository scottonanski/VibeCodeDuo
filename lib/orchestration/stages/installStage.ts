// lib/orchestration/stages/installStage.ts
import type {
    AiChatMessage,
    InstallStageParams, // This comes from types.ts
    StageEvent,         // This comes from types.ts
    // WorkerConfig is also in types.ts
} from './types';
import { fetchChatCompletion, extractJsonString } from '@/lib/services/ai-service';

export async function* installStage(
    params: InstallStageParams
): AsyncGenerator<StageEvent, void, undefined> { // Added undefined for the third generic argument of AsyncGenerator
    const {
        // conversationHistory, // Temporarily unused to simplify initial prompt
        projectFiles,
        workerConfig,
        refinedPrompt,
        projectType,
    } = params;

    // Emit an initial status update via the pipeline, not directly from here.
    // The pipeline will know this stage has started.

    const installCommands: string[] = [];
    
    let packageManager = 'pnpm'; // Default
    if (projectFiles && projectFiles['package-lock.json']) { // Check if projectFiles is not null/undefined
        packageManager = 'npm';
    } else if (projectFiles && projectFiles['yarn.lock']) {
        packageManager = 'yarn';
    }
    const addCommand = packageManager === 'npm' ? 'install' : 'add';

    // Slicing files to keep prompt within context limits
    // Taking all file names and content of package.json if it exists.
    const fileNames = projectFiles ? Object.keys(projectFiles) : [];
    const packageJsonContent = projectFiles ? projectFiles['package.json'] : null;

    const systemPromptContent = `You are an expert build assistant. Your task is to analyze the provided project context and code to identify any new third-party packages that need to be installed.
Consider the project type: ${projectType || 'general web project'}.
The primary package manager for generating commands should be '${packageManager}'.
Your response MUST be a JSON array of strings, where each string is a package name to be installed (e.g., ["react-query", "zustand"]).
Do NOT include the installation command itself (e.g., "pnpm add"), ONLY the package names.
If a package is already likely installed (e.g., 'react', 'next' for a Next.js project, or if present in package.json), do not include it unless explicitly mentioned as new or missing.
If no new packages are needed, return an empty JSON array: [].
Provide ONLY the JSON array. No explanations, no apologies, no introductory text. Ensure the JSON is perfectly valid.`;

    const userPromptContent = `
Project Context:
Refined Task: ${refinedPrompt}

Project File List:
${fileNames.join(', ')}

Current content of package.json (if available):
${packageJsonContent || "package.json not found or not provided."}

Based on the refined task, the project type, and the list of files (especially if new imports are used that are not in package.json), identify new package names that require installation.
Return ONLY a JSON array of package names.
Example: ["lodash", "date-fns"] or []
`;

    const llmMessages: AiChatMessage[] = [
        { role: 'system', content: systemPromptContent },
        { role: 'user', content: userPromptContent }
    ];

    try {
        const generator = fetchChatCompletion({
            provider: workerConfig.provider,
            model: workerConfig.model,
            messages: llmMessages,
            apiKey: workerConfig.apiKey,
            stream: true, // Accumulate stream for a single JSON output
        });
        
        let accumulatedResponse = "";
        for await (const chunk of generator) {
            accumulatedResponse += chunk;
        }
        
        const extractedJson = extractJsonString(accumulatedResponse);

        if (extractedJson) {
            try {
                const parsedPackageNames = JSON.parse(extractedJson);

                if (Array.isArray(parsedPackageNames) && parsedPackageNames.every((pkg): pkg is string => typeof pkg === 'string')) {
                    if (parsedPackageNames.length > 0) {
                        for (const pkgName of parsedPackageNames) {
                            const command = `${packageManager} ${addCommand} ${pkgName}`;
                            installCommands.push(command);
                            // This event type matches StageEventDataMap in types.ts
                            yield { type: 'install_command', data: { command } };
                        }
                        // This event type matches StageEventDataMap in types.ts
                        yield { type: 'install_analysis_complete', data: { commands: installCommands } };
                    } else {
                        // This event type matches StageEventDataMap in types.ts
                        yield { type: 'install_no_actions_needed', data: {} };
                    }
                } else {
                    console.warn("[InstallStage] LLM did not return a valid JSON array of package names. Parsed:", parsedPackageNames, "Original:", accumulatedResponse);
                    yield { type: 'install_no_actions_needed', data: {} }; // Fallback
                }
            } catch (parseError) {
                console.error("[InstallStage] Failed to parse JSON from LLM response. Extracted:", extractedJson, "Error:", parseError, "Original Response:", accumulatedResponse);
                yield { type: 'install_no_actions_needed', data: {} }; // Fallback on parse error
            }
        } else {
            console.warn("[InstallStage] Could not extract JSON from LLM response for installs. Response:", accumulatedResponse);
            yield { type: 'install_no_actions_needed', data: {} }; // Fallback
        }

    } catch (error: any) { // Catch errors from fetchChatCompletion or other unexpected issues
        console.error(`[InstallStage] Error during LLM call or processing: ${error.message}`, error);
        // Instead of yielding pipeline_error directly, throw to let pipeline handle it.
        // This makes the stage's responsibility clear: perform its task or fail.
        throw new Error(`Install stage failed during analysis: ${error.message}`);
    }
}