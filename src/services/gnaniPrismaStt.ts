export type PrismaSttRequest = {
  audioBase64: string;
  languageCode: string;
};

export type PrismaSttResponse = {
  transcript: string;
};

export async function transcribeWithGnaniPrisma(
  _request: PrismaSttRequest,
): Promise<PrismaSttResponse> {
  // TODO: Bridge to native audio capture and call Gnani Prisma STT API.
  throw new Error('Gnani Prisma STT integration is not implemented yet.');
}
