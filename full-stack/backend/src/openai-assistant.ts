import OpenAI from 'openai';

export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';
export function openAIModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}
export function openAIEnabled() {
  return process.env.ASSISTANT_AI !== 'off' && !!process.env.OPENAI_API_KEY?.trim();
}
export function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY?.trim(),
    baseURL: 'https://api.openai.com/v1',
    timeout: 30000,
    maxRetries: 0,
  });
}

/** The caller supplies only the context already filtered by project permissions. */
export async function askOpenAI(
  question: string,
  context: unknown[],
  instructions: string,
  client: Pick<OpenAI, 'responses'> = createOpenAIClient(),
) {
  const response = await client.responses.create({
    model: openAIModel(),
    instructions,
    input: [{ role: 'user', content: `<data>\n${JSON.stringify(context)}\n</data>\n\nPertanyaan: ${question}` }],
    reasoning: { effort: 'low' },
    max_output_tokens: 2000,
    store: false,
  });
  const refusal = response.output?.flatMap(item => item.type === 'message' ? item.content : [])
    .some(part => part.type === 'refusal');
  if (refusal) return 'Asisten AI tidak dapat menjawab pertanyaan ini. Coba ajukan dengan kalimat lain.';
  if (response.status === 'failed') throw new Error('OpenAI response failed');
  const text = response.output_text?.trim();
  if (!text) throw new Error('OpenAI returned no answer');
  return response.status === 'incomplete'
    ? `${text}\n\n(Jawaban terpotong; persempit pertanyaan atau cakupan proyek.)`
    : text;
}

/** Provider errors can contain credentials or input; never expose their raw message. */
export function openAIFailure(error: unknown) {
  if (error instanceof OpenAI.AuthenticationError) return 'kunci OpenAI tidak valid';
  if (error instanceof OpenAI.PermissionDeniedError) return 'izin API atau model belum tersedia';
  if (error instanceof OpenAI.NotFoundError) return 'model OpenAI tidak tersedia untuk proyek API ini';
  if (error instanceof OpenAI.RateLimitError)
    return ['insufficient_quota','credit_balance_exhausted','billing_hard_limit_reached'].includes(error.code || '') ? 'saldo atau kuota OpenAI API tidak mencukupi' : 'batas pemakaian OpenAI API tercapai';
  if (error instanceof OpenAI.APIConnectionTimeoutError) return 'OpenAI melewati batas waktu respons';
  if (error instanceof OpenAI.APIError) return `OpenAI API mengembalikan galat HTTP ${error.status ?? 'tidak diketahui'}`;
  return 'layanan OpenAI tidak dapat memberikan jawaban';
}
export function openAIErrorStatus(error: unknown) {
  return error instanceof OpenAI.APIError ? error.status : undefined;
}
