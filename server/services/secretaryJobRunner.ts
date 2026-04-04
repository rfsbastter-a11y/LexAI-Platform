export type SecretaryJobKind =
  | "legacy_piece_generation"
  | "media_processing"
  | "signed_agreement_archival"
  | "word_document_delivery";

export async function runSecretaryJob<T>(params: {
  kind: SecretaryJobKind;
  operation: () => Promise<T>;
  onError?: (error: unknown) => void;
}): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await params.operation();
    console.log(`[SecretaryJob] ${params.kind} completed in ${Date.now() - startedAt}ms`);
    return result;
  } catch (error) {
    console.error(`[SecretaryJob] ${params.kind} failed after ${Date.now() - startedAt}ms:`, error);
    params.onError?.(error);
    throw error;
  }
}
