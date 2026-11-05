import { useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
import { isServerWaking, subscribeServerWake } from '../utils/serverWake';

/** Shown on every page while a login or page-load request is unusually slow. */
export default function ServerWakeNotice() {
  const waking = useSyncExternalStore(subscribeServerWake, isServerWaking);
  if (!waking) return null;

  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-md flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-md"
    >
      <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
      The server is starting up. This can take a minute or two, so please keep this page open.
    </div>
  );
}
