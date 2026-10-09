import { Suspense } from "react";
import { PublicRoomClient } from "./room-client";

export default function PublicRoomPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading room…</div>}>
      <PublicRoomClient />
    </Suspense>
  );
}
