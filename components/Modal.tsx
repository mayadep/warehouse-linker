"use client";

import { useEffect, useRef } from "react";

/** native <dialog> 모달. 마운트되면 열리고, ESC/✕/onClose 로 닫힌다. */
export default function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-lg",
  closeDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        if (closeDisabled) e.preventDefault();
      }}
      className={`m-auto w-full ${maxWidth} rounded-lg p-0 shadow-xl backdrop:bg-black/40`}
      aria-label={title}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            disabled={closeDisabled}
            className="text-gray-400 hover:text-gray-700"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
