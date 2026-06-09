import { useEffect, useRef } from "react";

interface BuilderKeyboardOptions {
  onCopy: () => void;
  onPaste: () => void;
  onEscape: () => void;
}

export function useBuilderKeyboard({ onCopy, onPaste, onEscape }: BuilderKeyboardOptions) {
  const onCopyRef = useRef(onCopy);
  const onPasteRef = useRef(onPaste);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => { onCopyRef.current = onCopy; }, [onCopy]);
  useEffect(() => { onPasteRef.current = onPaste; }, [onPaste]);
  useEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTextInput =
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        (target.tagName === "INPUT" &&
          !["checkbox", "radio"].includes(
            (target as HTMLInputElement).type
          ));
      if (isTextInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        onCopyRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        onPasteRef.current();
      } else if (e.key === "Escape") {
        onEscapeRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []); // stable — callbacks accessed via refs
}
