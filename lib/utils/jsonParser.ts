// Utility function to extract a JSON block from a response string
export function extractJsonString(responseText: string): string | null {
    // Try to capture JSON wrapped in triple backticks
    const match = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (match && match[1]) {
        return match[1]; // Return the JSON block within the backticks
    }

    // Fallback: Try to find the first { and last } to extract the JSON block
    const firstBrace = responseText.indexOf('{');
    const lastBrace = responseText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        return responseText.substring(firstBrace, lastBrace + 1); // Return the JSON substring
    }

    return null; // Return null if no JSON is found
}

// Function to parse the review output into actionable data
export const parseReviewOutput = (response: string): { status: string; key_issues: string[]; next_action_for_w1: string } => {
    const jsonString = extractJsonString(response);
    if (!jsonString) {
        console.error("Could not extract JSON block from Worker 2's review.");
        return { status: "UNKNOWN", key_issues: [], next_action_for_w1: "ERROR_NO_JSON_FOUND" };
    }

    try {
        const parsed = JSON.parse(jsonString);
        const { status, key_issues, next_action_for_w1 } = parsed;

        // Validate parsed fields
        if (!status || !Array.isArray(key_issues) || !next_action_for_w1) {
            throw new Error("Invalid response format.");
        }

        return { status, key_issues, next_action_for_w1 };
    } catch (error) {
        console.error("Failed to parse Worker 2's review:", error);
        return { status: "UNKNOWN", key_issues: [], next_action_for_w1: "ERROR_PARSING_JSON" };
    }
};


/*
Explanation:

extractJsonString: This function first tries to extract the JSON block
if it's wrapped in triple backticks. If it doesn't find that, it tries to extract
JSON by locating the first { and last } in the string.

parseReviewOutput: This function uses extractJsonString to grab the JSON block and
then parses it. If the parsing is successful,
it returns the status, key_issues, and next_action_for_w1. If there’s any error
in extracting or parsing, it logs the issue and returns a fallback value.

Now we can import this utility in the appropriate places where we need it
(e.g., in collaborationPipeline.ts).
*/