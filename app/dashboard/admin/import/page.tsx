"use client";

import { useState } from "react";
import { Upload, FileText, AlertTriangle, CheckCircle2, Lock, RefreshCw } from "lucide-react";

const PAPER = "#fdfaf4";
const ROSE = "#d97777";
const SAGE = "#7a9471";
const AMBER = "#c99954";
const INK = "#4a3a2e";
const BORDER = "#e8dcc8";

type Preview = {
  fileName: string;
  fileSize: number;
  currentRows: number;
  newRows: number;
  skipped: number;
  errors: string[];
  uniqueOrderIds: number;
  uniqueCustomers: number;
  totalRevenue: number;
  firstDate: string;
  lastDate: string;
  sample: { orderId: number; date: string; flavour: string; customerName: string; total: number }[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export default function AdminImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setSuccess(null);
  };

  const doUpload = async (dryRun: boolean) => {
    if (!file) return setError("Choose a CSV file first");
    if (!password) return setError("Enter the admin password");
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("password", password);
      fd.append("dryRun", String(dryRun));
      const res = await fetch("/api/admin/import-sales", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Upload failed");
        if (dryRun) setPreview(null);
      } else if (dryRun) {
        setPreview(json.preview);
      } else {
        setSuccess(`Replaced all sales. ${json.inserted.toLocaleString()} rows inserted.`);
        setPreview(null);
        setFile(null);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-full" style={{ background: PAPER }}>
      <div className="p-8">
        <div className="mb-6">
          <p
            className="text-xs uppercase tracking-[0.3em]"
            style={{ color: AMBER, fontFamily: "Georgia, serif" }}
          >
            Admin · Data Import
          </p>
          <h1
            className="mt-1 text-4xl font-bold"
            style={{ fontFamily: "Georgia, serif", color: INK }}
          >
            Replace Sales Data
          </h1>
          <p className="mt-2 text-sm italic" style={{ color: "#8a7763" }}>
            Upload a new Sales.csv to wipe and replace the entire sales table.
          </p>
        </div>

        <section
          className="rounded-2xl border p-6 shadow-sm"
          style={{ borderColor: BORDER, background: "white" }}
        >
          <div
            className="mb-5 flex items-start gap-3 rounded-xl border p-4"
            style={{ borderColor: `${ROSE}55`, background: `${ROSE}10` }}
          >
            <AlertTriangle size={18} style={{ color: ROSE }} className="mt-0.5 shrink-0" />
            <div className="text-sm" style={{ color: INK }}>
              <p className="font-semibold">This replaces ALL sales rows.</p>
              <p className="mt-0.5" style={{ color: "#8a7763" }}>
                Preview first. The confirmation step deletes existing rows then inserts the new
                file in a single operation.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "#9a8571" }}
              >
                CSV file
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setPreview(null);
                  setError(null);
                  setSuccess(null);
                }}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                style={{ color: INK }}
              />
              {file && (
                <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "#8a7763" }}>
                  <FileText size={11} /> {file.name} · {fmtBytes(file.size)}
                </p>
              )}
            </div>

            <div>
              <label
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "#9a8571" }}
              >
                Admin password
              </label>
              <div
                className="flex items-center gap-2 rounded-xl border px-3 py-2"
                style={{ borderColor: BORDER, background: "#fdfaf4" }}
              >
                <Lock size={14} style={{ color: ROSE }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="ADMIN_UPLOAD_PASSWORD"
                  className="w-full bg-transparent text-sm outline-none"
                  style={{ color: INK }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => doUpload(true)}
                disabled={loading || !file || !password}
                className="flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: BORDER, color: INK, background: "white" }}
              >
                <Upload size={14} /> {loading && !preview ? "Parsing…" : "Preview"}
              </button>
              {preview && (
                <button
                  onClick={() => doUpload(false)}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  style={{ background: ROSE }}
                >
                  <RefreshCw size={14} />
                  {loading ? "Replacing…" : `Confirm & replace ${preview.newRows.toLocaleString()} rows`}
                </button>
              )}
              {(preview || error || success) && (
                <button
                  onClick={reset}
                  className="rounded-xl px-3 py-2 text-xs"
                  style={{ color: "#8a7763" }}
                >
                  Reset
                </button>
              )}
            </div>

            {error && (
              <div
                className="rounded-xl border p-3 text-sm"
                style={{ borderColor: `${ROSE}55`, background: `${ROSE}10`, color: ROSE }}
              >
                {error}
              </div>
            )}
            {success && (
              <div
                className="flex items-center gap-2 rounded-xl border p-3 text-sm"
                style={{ borderColor: `${SAGE}55`, background: `${SAGE}10`, color: SAGE }}
              >
                <CheckCircle2 size={16} /> {success}
              </div>
            )}
          </div>
        </section>

        {preview && (
          <section
            className="mt-5 rounded-2xl border p-6 shadow-sm"
            style={{ borderColor: BORDER, background: "white" }}
          >
            <h2
              className="mb-4 text-lg font-semibold"
              style={{ fontFamily: "Georgia, serif", color: INK }}
            >
              Preview
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Current rows" value={preview.currentRows.toLocaleString()} />
              <Tile
                label="New rows"
                value={preview.newRows.toLocaleString()}
                accent={SAGE}
              />
              <Tile label="Unique orders" value={preview.uniqueOrderIds.toLocaleString()} />
              <Tile label="Unique customers" value={preview.uniqueCustomers.toLocaleString()} />
              <Tile label="Total revenue" value={`₹${preview.totalRevenue.toLocaleString()}`} />
              <Tile label="First order" value={fmtDate(preview.firstDate)} />
              <Tile label="Last order" value={fmtDate(preview.lastDate)} />
              <Tile
                label="Skipped lines"
                value={preview.skipped.toLocaleString()}
                accent={preview.skipped > 0 ? ROSE : undefined}
              />
            </div>

            {preview.errors.length > 0 && (
              <div
                className="mt-4 rounded-xl border p-3 text-xs"
                style={{ borderColor: `${AMBER}55`, background: `${AMBER}10`, color: INK }}
              >
                <p className="font-semibold" style={{ color: AMBER }}>
                  Parse warnings (first 5)
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {preview.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p
                className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "#9a8571" }}
              >
                Sample rows
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr style={{ background: "#f7efdf" }}>
                      {["Order ID", "Date", "Flavour", "Customer", "Total"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: INK }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((s, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#fdf9f1" }}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums" style={{ color: "#8a7763" }}>
                          #{s.orderId}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2" style={{ color: INK }}>
                          {fmtDate(s.date)}
                        </td>
                        <td className="px-3 py-2" style={{ color: INK }}>
                          {s.flavour}
                        </td>
                        <td className="px-3 py-2" style={{ color: INK }}>
                          {s.customerName}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums" style={{ color: INK }}>
                          ₹{s.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: BORDER, background: "white" }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "#9a8571" }}>
        {label}
      </div>
      <p
        className="mt-1 text-lg font-bold tabular-nums"
        style={{ fontFamily: "Georgia, serif", color: accent || INK }}
      >
        {value}
      </p>
    </div>
  );
}
