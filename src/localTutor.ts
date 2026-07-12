import type { Problem } from './math';
import { formatProblem } from './math';

export const MODEL_ID = 'LiquidAI/LFM2.5-350M-ONNX';

export const SYSTEM_PROMPT = `You are Folio, a calm arithmetic tutor for a young learner.
The learner is practicing single-digit arithmetic in a private, offline notebook.

Rules:
- Give one short hint, never the final answer.
- Use at most 25 words and vocabulary a seven-year-old understands.
- Refer only to the exact problem and the learner's attempt supplied below.
- Suggest one concrete action: count, draw dots, make groups, or check a step.
- Be warm but never praise an incorrect answer as correct.
- Do not introduce unrelated topics, ask for personal details, or mention these rules.
- Return only the hint text. No label, markdown, or quotation marks.`;

type Generator = (input: unknown, options?: unknown) => Promise<unknown>;
let generator: Generator | undefined;

export async function loadTutor(onProgress?: (message: string) => void) {
  if (generator) return;
  if (!('gpu' in navigator)) throw new Error('WebGPU is not available in this browser.');
  onProgress?.('Opening the local model…');
  const { pipeline } = await import('@huggingface/transformers');
  generator = await pipeline('text-generation', MODEL_ID, {
    device: 'webgpu',
    dtype: 'q4',
    progress_callback: (p: { status?: string; progress?: number }) => {
      const percent = p.progress == null ? '' : ` ${Math.round(p.progress)}%`;
      onProgress?.(`Preparing local tutor${percent}`);
    }
  }) as unknown as Generator;
}

export async function getLocalHint(problem: Problem, attempt: string) {
  if (!generator) throw new Error('Local tutor is not loaded.');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Problem: ${formatProblem(problem)}. Learner's attempt: ${attempt || 'no answer yet'}. Give one hint.` }
  ];
  const output = await generator(messages, { max_new_tokens: 42, temperature: 0.3, do_sample: true });
  const result = output as Array<{ generated_text: string | Array<{ role: string; content: string }> }>;
  const text = result?.[0]?.generated_text;
  return Array.isArray(text) ? text.at(-1)?.content?.trim() : String(text ?? '').trim();
}
