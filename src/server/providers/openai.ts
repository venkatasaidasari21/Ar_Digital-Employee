import type { LLMProvider } from "./provider";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai" as const;
  private readonly apiKey = process.env.OPENAI_API_KEY ?? "";
  private readonly model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  private readonly baseUrl = (
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com"
  ).replace(/\/$/, "");

  async complete(system: string, user: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(`OpenAI request failed (${response.status})`);
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string")
      throw new Error("OpenAI response did not contain a completion");
    return content;
  }
}
