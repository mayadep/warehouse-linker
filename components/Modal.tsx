"use client";

import { useEffect, useRef } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      className={`m-auto w-full ${maxWidth} rounded-xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]`}
      aria-label={title}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => ref.current?.close()}
            disabled={closeDisabled}
            className="-mr-2 -mt-1 text-muted-foreground"
            aria-label="닫기"
          >
            <XIcon />
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
