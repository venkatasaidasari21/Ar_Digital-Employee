import type { LLMProvider } from "./provider";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini" as const;
  private readonly apiKey = process.env.GEMINI_API_KEY ?? "";
  private readonly model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
  private readonly baseUrl = (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");

  async complete(system: string, user: string): Promise<string> {
    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] }) });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const content = data.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("").trim();
    if (!content) throw new Error("Gemini response did not contain a completion");
    return content;
  }
}
