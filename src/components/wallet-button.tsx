"use client";

import { useState } from "react";
import { useSignalWallet } from "@/app/providers";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const {
    address,
    connectedAddress,
    wallets,
    busy,
    error,
    connectAndSignIn,
    signIn,
    disconnect,
  } = useSignalWallet();
  const [open, setOpen] = useState(false);

  if (address) {
    return (
      <div className="wallet-menu">
        <button
          type="button"
          className="wallet-button connected"
          onClick={() => setOpen((value) => !value)}
        >
          <span /> {shortAddress(address)}
        </button>
        {open && (
          <div className="wallet-popover">
            <strong>Wallet verified</strong>
            <small>{address}</small>
            <button type="button" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  if (connectedAddress) {
    return (
      <div className="wallet-menu">
        <button
          type="button"
          className="wallet-button"
          disabled={busy}
          onClick={() => void signIn()}
          title={error ?? undefined}
        >
          <span /> {busy ? "Signing…" : "Verify wallet"}
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-menu">
      <button
        type="button"
        className="wallet-button"
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        title={error ?? undefined}
      >
        <span /> {busy ? "Loading…" : "Connect wallet"}
      </button>
      {open && (
        <div className="wallet-popover">
          <strong>Choose a Solana wallet</strong>
          {wallets.length === 0 ? (
            <p>No compatible wallet detected. Install Phantom, Solflare, or another Wallet Standard wallet.</p>
          ) : (
            wallets.map((wallet) => (
              <button
                type="button"
                key={wallet.name}
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  void connectAndSignIn(wallet);
                }}
              >
                {wallet.name}
              </button>
            ))
          )}
          <small>No transaction. No SOL fee.</small>
        </div>
      )}
    </div>
  );
}
