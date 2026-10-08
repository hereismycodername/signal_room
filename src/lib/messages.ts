export const SIGNAL_ROOM_CHAIN = "solana:devnet";

type SignInMessageInput = {
  domain: string;
  address: string;
  uri: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};

export function buildSignInMessage(input: SignInMessageInput) {
  return `${input.domain} wants you to sign in with your Solana account:
${input.address}

Sign in to Signal Room. This request will not trigger a transaction or cost SOL.

URI: ${input.uri}
Version: 1
Chain ID: ${SIGNAL_ROOM_CHAIN}
Nonce: ${input.nonce}
Issued At: ${input.issuedAt}
Expiration Time: ${input.expirationTime}`;
}

type ForecastMessageInput = {
  roomId: string;
  questionId: string;
  address: string;
  probabilityBps: number;
  salt: string;
};

export function buildForecastMessage(input: ForecastMessageInput) {
  return `Signal Room Forecast v1
Room: ${input.roomId}
Question: ${input.questionId}
Wallet: ${input.address}
Probability BPS: ${input.probabilityBps}
Salt: ${input.salt}
Chain ID: ${SIGNAL_ROOM_CHAIN}

Signing records this forecast. It does not submit a transaction or spend SOL.`;
}
