import { useEffect } from 'react';

/** Phím ← → Home End để tua ván (bỏ qua khi đang gõ trong ô nhập) */
export function useKeyboardNav(handlers: { prev: () => void; next: () => void; first: () => void; last: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const map: Record<string, () => void> = {
        ArrowLeft: handlers.prev,
        ArrowRight: handlers.next,
        Home: handlers.first,
        End: handlers.last,
      };
      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}
