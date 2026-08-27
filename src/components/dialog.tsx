"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

export function Dialog({ open, onClose, title, children, className = "" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`dialog ${className}`} aria-labelledby={titleId} onCancel={onClose} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-content">
        <div className="dialog-topline"><h2 id={titleId}>{title}</h2><button className="icon-button close-button" type="button" aria-label="閉じる" onClick={onClose}><Icon name="close" size={19} /></button></div>
        {children}
      </div>
    </dialog>
  );
}
