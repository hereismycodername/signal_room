"use client";

import { createClient } from "@solana/kit";
import { walletSigner } from "@solana/kit-plugin-wallet";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useSignMessage,
  useWallets,
  WalletReadyGate,
} from "@solana/kit-plugin-wallet/react";
import { solanaDevnetRpc } from "@solana/kit-plugin-rpc";
import { ClientProvider } from "@solana/react";
import type { UiWallet } from "@wallet-standard/ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildForecastMessage } from "@/lib/messages";

const client = createClient()
  .use(walletSigner({ chain: "solana:devnet" }))
  .use(
    solanaDevnetRpc({
      rpcUrl:
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
        "https://api.devnet.solana.com",
      transactionConfig: { version: 1 },
    }),
  );

type Session = {
  address: string;
  storage: "memory" | "postgres";
};

type WalletContextValue = {
  address: string | null;
  connectedAddress: string | null;
  session: Session | null;
  wallets: readonly UiWallet[];
  busy: boolean;
  error: string | null;
  connectAndSignIn: (wallet: UiWallet) => Promise<void>;
  signIn: () => Promise<void>;
  disconnect: () => Promise<void>;
  submitSignedForecast: (input: {
    roomId: string;
    questionId: string;
    probability: number;
  }) => Promise<{
    probability: number;
    commitmentHash: string;
    submittedAt: string;
    storage: "memory" | "postgres";
  }>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function readJson(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    [key: string]: unknown;
  };
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body;
}

function WalletBridge({ children }: { children: ReactNode }) {
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const connectAction = useConnect(client);
  const disconnectAction = useDisconnect(client);
  const signMessageAction = useSignMessage(client);
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: { authenticated?: boolean; address?: string; storage?: Session["storage"] }) => {
        if (active && value.authenticated && value.address && value.storage) {
          setSession({ address: value.address, storage: value.storage });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const authenticate = useCallback(
    async (address: string) => {
      const nonce = await readJson(
        await fetch("/api/auth/nonce", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        }),
      );
      const signature = await signMessageAction.dispatchAsync(
        new TextEncoder().encode(String(nonce.message)),
      );
      const verified = await readJson(
        await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            address,
            nonceId: nonce.id,
            signature: bytesToBase64(signature),
          }),
        }),
      );
      setSession({
        address: String(verified.address),
        storage: verified.storage as Session["storage"],
      });
    },
    [signMessageAction],
  );

  const connectAndSignIn = useCallback(
    async (wallet: UiWallet) => {
      setPending(true);
      setError(null);
      try {
        const accounts = await connectAction.dispatchAsync(wallet);
        const account = accounts[0];
        if (!account) throw new Error("Wallet did not return a Solana account.");
        await authenticate(account.address);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Wallet sign-in failed.");
        throw cause;
      } finally {
        setPending(false);
      }
    },
    [authenticate, connectAction],
  );

  const signIn = useCallback(async () => {
    if (!connected) throw new Error("Connect a wallet first.");
    setPending(true);
    setError(null);
    try {
      await authenticate(connected.account.address);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet sign-in failed.");
      throw cause;
    } finally {
      setPending(false);
    }
  }, [authenticate, connected]);

  const disconnect = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      setSession(null);
      await disconnectAction.dispatchAsync();
    } finally {
      setPending(false);
    }
  }, [disconnectAction]);

  const submitSignedForecast = useCallback(
    async ({ roomId, questionId, probability }: {
      roomId: string;
      questionId: string;
      probability: number;
    }) => {
      if (!connected || !session) throw new Error("Sign in with your wallet first.");
      if (connected.account.address !== session.address) {
        throw new Error("Connected wallet does not match the signed-in session.");
      }

      setPending(true);
      setError(null);
      try {
        const probabilityBps = Math.round(probability * 100);
        const salt = randomSalt();
        const message = buildForecastMessage({
          roomId,
          questionId,
          address: session.address,
          probabilityBps,
          salt,
        });
        const signature = await signMessageAction.dispatchAsync(
          new TextEncoder().encode(message),
        );
        const result = await readJson(
          await fetch(`/api/rooms/${roomId}/questions/${questionId}/forecasts`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              probabilityBps,
              salt,
              signature: bytesToBase64(signature),
            }),
          }),
        );
        const forecast = result.forecast as {
          probabilityBps: number;
          commitmentHash: string;
          submittedAt: string;
        };
        return {
          probability: forecast.probabilityBps / 100,
          commitmentHash: forecast.commitmentHash,
          submittedAt: forecast.submittedAt,
          storage: result.storage as Session["storage"],
        };
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Forecast submission failed.");
        throw cause;
      } finally {
        setPending(false);
      }
    },
    [connected, session, signMessageAction],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      address: session?.address ?? null,
      connectedAddress: connected?.account.address ?? null,
      session,
      wallets,
      busy:
        pending ||
        connectAction.isRunning ||
        disconnectAction.isRunning ||
        signMessageAction.isRunning,
      error,
      connectAndSignIn,
      signIn,
      disconnect,
      submitSignedForecast,
    }),
    [
      session,
      connected,
      wallets,
      pending,
      connectAction.isRunning,
      disconnectAction.isRunning,
      signMessageAction.isRunning,
      error,
      connectAndSignIn,
      signIn,
      disconnect,
      submitSignedForecast,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClientProvider client={client}>
      <WalletReadyGate client={client} fallback={children}>
        <WalletBridge>{children}</WalletBridge>
      </WalletReadyGate>
    </ClientProvider>
  );
}

export function useSignalWallet() {
  const value = useContext(WalletContext);
  if (!value) {
    return {
      address: null,
      connectedAddress: null,
      session: null,
      wallets: [] as readonly UiWallet[],
      busy: true,
      error: null,
      connectAndSignIn: async () => undefined,
      signIn: async () => undefined,
      disconnect: async () => undefined,
      submitSignedForecast: async () => {
        throw new Error("Wallet is still loading.");
      },
    } satisfies WalletContextValue;
  }
  return value;
}
