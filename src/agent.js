import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { config } from "./config.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { createTools } from "./tools.js";

export function createAgent(db, userId) {
  const tools = createTools(db, userId);
  const toolMap = Object.fromEntries(tools.map(t => [t.name, t]));
const model = new ChatGroq({
  apiKey: config.groqApiKey,
  model: config.model,
  temperature: 0
}).bindTools(tools);

  // Conversation history is held in memory for this CLI session only.
  const history = [new SystemMessage(SYSTEM_PROMPT)];

  return {
    async ask(text) {
      history.push(new HumanMessage(text));
      try {
        for (let step = 0; step < 6; step++) {
          const response = await model.invoke(history);
          history.push(response);
          if (!response.tool_calls?.length) return response.content || "I'm not sure how to help with that. Could you rephrase?";
          for (const call of response.tool_calls) {
            const selectedTool = toolMap[call.name];
            if (!selectedTool) {
              history.push(new ToolMessage({ tool_call_id: call.id, content: "Tool not found." }));
              continue;
            }
            const result = await selectedTool.invoke(call.args);
            history.push(new ToolMessage({ tool_call_id: call.id, content: String(result), name: call.name }));
          }
        }
        return "I couldn't complete that request in one go. Please try a more specific request.";
      } catch (error) {
        console.error("Agent error:", error.message);
        return "Sorry, I couldn't complete that request. Please check the database/API connection and try again.";
      }
    }
  };
}
