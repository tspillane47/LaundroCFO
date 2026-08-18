import { useEffect, useRef } from "react";

const HIGHLIGHT_CLASS = "form-reveal-highlight";
const HIGHLIGHT_DURATION_MS = 1500;

/** Scrolls to and briefly highlights a form when it opens. Attach ref to the form container. */
export function useFormReveal(isOpen: boolean) {
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const el = formRef.current;
    if (!el) return;

    const scrollFrame = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    el.classList.add(HIGHLIGHT_CLASS);
    const highlightTimer = window.setTimeout(() => {
      el.classList.remove(HIGHLIGHT_CLASS);
    }, HIGHLIGHT_DURATION_MS);

    return () => {
      cancelAnimationFrame(scrollFrame);
      window.clearTimeout(highlightTimer);
      el.classList.remove(HIGHLIGHT_CLASS);
    };
  }, [isOpen]);

  return formRef;
}
