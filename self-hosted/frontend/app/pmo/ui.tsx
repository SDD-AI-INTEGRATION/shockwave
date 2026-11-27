"use client";
import { useEffect, type ReactNode } from "react";
import { X, Printer, Download } from "lucide-react";
import { SDD_LOGO } from "./logo";
import { printPaper, wordPaper, paperExcel, type Paper } from "./exports";
export function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
  options,
  required = false,
  maxLength = 10000,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
  options?: [string, string][];
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="pmo-field">
      <span>{label}</span>
      {options ? (
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          aria-label={label}
          rows={3}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          type={type}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>("[data-pmo-dialog]")!;
    dialog.querySelector<HTMLElement>("input,button")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "input:not(:disabled),button:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
          ),
        );
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-backdrop">
      <section
        data-pmo-dialog
        className="modal pmo-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Tutup dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function PaperView({
  paper,
  onError,
}: {
  paper: Paper;
  onError: (s: string) => void;
}) {
  const run = async (fn: () => unknown) => {
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <section className="panel pmo-preview">
      <div className="pmo-toolbar">
        <strong>Pratinjau dokumen</strong>
        <button
          className="secondary"
          onClick={() => run(() => printPaper(paper))}
        >
          <Printer size={15} /> Cetak / PDF
        </button>
        <button className="primary" onClick={() => run(() => wordPaper(paper))}>
          <Download size={15} /> Word
        </button>
        <button
          className="secondary"
          onClick={() => run(() => paperExcel(paper))}
        >
          Excel
        </button>
      </div>
      <article className="pmo-paper">
        <header>
          <img src={SDD_LOGO} alt="Logo SDD" />
          <h2>{paper.title}</h2>
          <p>{paper.subtitle}</p>
          {paper.status && (
            <span className="status planning">{paper.status}</span>
          )}
        </header>
        {paper.sections.map((s, i) => (
          <section key={i}>
            <h3>{s.heading}</h3>
            {s.text && <p>{s.text}</p>}
            {s.rows && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {s.columns!.map((c, j) => (
                        <th key={j}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        <div className="pmo-photos">
          {paper.photos?.map((p, i) => (
            <img src={p} key={i} alt={`Dokumentasi ${i + 1}`} />
          ))}
        </div>
      </article>
    </section>
  );
}
