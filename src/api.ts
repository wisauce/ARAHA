import { extractJson } from "./geometry";
import { MODEL_NAME } from "./types";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type LocateRefInput = {
  id: string;
  name: string;
  imageDataUrl: string;
  x: number;
  y: number;
  heading: number;
  room: string;
};

const PARSE_PROMPT = `You are reading a 2D architectural floor plan image. Trace the rooms, corridors, and notable objects onto a 1000 by 1000 grid. The origin is the top-left corner of the image. x increases to the right. y increases downward. Every coordinate is an integer from 0 to 1000.

Ignore title blocks, north arrows, dimension strings, and legends that sit outside the drawing. Read the room names and numbers printed on the plan. Do not invent spaces that are not drawn. If a name is unreadable, use a short descriptive name and set "uncertain" to true.

Return one JSON object and nothing else:
{
  "summary": "one sentence",
  "rooms": [
    {
      "name": "Lobby",
      "kind": "lobby",
      "uncertain": false,
      "polygon": [[x, y], [x, y], [x, y], [x, y]]
    }
  ],
  "objects": [
    {
      "name": "Stairs",
      "kind": "stairs",
      "uncertain": false,
      "polygon": [[x, y], [x, y], [x, y], [x, y]]
    }
  ],
  "labels": [
    { "text": "A-101", "x": 0, "y": 0 }
  ]
}

Room kind must be one of: room, corridor, lobby, restroom, stairs, elevator, outdoor, other.
Object kind must be one of: door, window, stairs, elevator, furniture, column, fixture, other.
Polygons follow the walls, with at least 4 points, and stay inside 0..1000. Cover each space once. Put doors, windows, stairs, and furniture in objects. Put stair halls and elevator shafts in rooms when they occupy a whole space. Labels are only for text that is not already a room name.`;

function locatePrompt(refs: LocateRefInput[]): string {
  const lines = refs
    .map(
      (ref) =>
        `- id: ${ref.id} | name: ${ref.name} | x: ${Math.round(ref.x * 1000)} | y: ${Math.round(ref.y * 1000)} | ${ref.room}`,
    )
    .join("\n");
  return `Match the QUERY photo to the REFERENCE 360 photo taken from the most similar room. Each reference is a 360 photo shot from the middle of one room, and the pin is that middle.

References:
${lines}

The images follow in this order: the QUERY photo first, then each 360 reference in the list order.

Return one JSON object and nothing else:
{
  "matched_reference_id": "the id from the list",
  "confidence": 0.0,
  "reason": "one sentence about what matched",
  "x": 0,
  "y": 0,
  "heading_deg": 0
}

confidence is from 0 to 1. Set x and y to the matched reference pin, on a 1000 by 1000 grid, origin top-left, y downward. heading_deg is the direction the query camera was facing: 0 toward the top of the plan, 90 to the right, 180 down, 270 left. If two rooms look alike, pick the closer visual match and lower the confidence.`;
}

export function parseContent(imageDataUrl: string): ContentPart[] {
  return [
    { type: "text", text: PARSE_PROMPT },
    { type: "image_url", image_url: { url: imageDataUrl } },
  ];
}

export function locateContent(queryDataUrl: string, refs: LocateRefInput[]): ContentPart[] {
  const parts: ContentPart[] = [{ type: "text", text: locatePrompt(refs) }, { type: "image_url", image_url: { url: queryDataUrl } }];
  for (const ref of refs) {
    parts.push({ type: "text", text: `REFERENCE id=${ref.id} name=${ref.name}` });
    parts.push({ type: "image_url", image_url: { url: ref.imageDataUrl } });
  }
  return parts;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return "";
}

function explainHttp(status: number, body: string): string {
  let detail = body.replace(/\s+/g, " ").slice(0, 280);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    detail = parsed.error?.message ?? parsed.message ?? detail;
  } catch {
    /* Keep the raw snippet. */
  }
  if (status === 401 || status === 403) return "SumoPod rejected the API key.";
  if (status === 404) return "glm-5.3-flash is not available for this key.";
  if (status === 402 || status === 429) return "SumoPod refused the request. The key may be out of budget or rate limited.";
  return detail ? `SumoPod returned ${status}. ${detail}` : `SumoPod returned ${status}.`;
}

function sourceText(content: string, reasoning: string): string {
  if (content.includes("{")) return content;
  if (reasoning.includes("{")) return reasoning;
  return content || reasoning;
}

export async function completeJson(
  apiKey: string,
  userContent: ContentPart[],
  maxTokens: number,
  onStatus: (text: string) => void,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch("/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    signal,
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        {
          role: "system",
          content: "You output a single JSON object and nothing else. No markdown fences.",
        },
        { role: "user", content: userContent },
      ],
      max_tokens: maxTokens,
      temperature: 1,
      top_p: 0.95,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(explainHttp(response.status, await response.text()));
  }

  const contentType = response.headers.get("content-type") ?? "";
  let content = "";
  let reasoning = "";

  if (contentType.includes("application/json")) {
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }>;
    };
    const message = json.choices?.[0]?.message;
    content = textOf(message?.content);
    reasoning = textOf(message?.reasoning_content ?? message?.reasoning);
  } else {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("SumoPod returned an empty response.");
    const decoder = new TextDecoder();
    let buffer = "";
    let phase = "";
    const setPhase = (next: string) => {
      if (next === phase) return;
      phase = next;
      onStatus(next);
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } }>;
          };
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;
          const nextReason = textOf(delta.reasoning_content ?? delta.reasoning);
          const nextContent = textOf(delta.content);
          if (nextReason) {
            reasoning += nextReason;
            setPhase("Thinking…");
          }
          if (nextContent) {
            content += nextContent;
            setPhase("Writing the answer…");
          }
        } catch {
          /* Incomplete SSE chunks are handled by the buffer. */
        }
      }
    }
  }

  const text = sourceText(content, reasoning).trim();
  if (!text) throw new Error("The model returned an empty answer. Try again.");
  try {
    return extractJson(text);
  } catch (error) {
    const clipped = text.slice(0, 180);
    const reason = error instanceof Error ? error.message : "The model did not return JSON.";
    throw new Error(`${reason} ${clipped}`);
  }
}
