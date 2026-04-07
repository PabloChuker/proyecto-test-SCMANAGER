"use client";

import { useRef, useState } from "react";
import { useHangarStore, type ImportSummary } from "@/store/useHangarStore";

interface ImportModalProps {
  onClose: () => void;
}

interface ImportResult {
  ships: number;
  ccus: number;
  summary: ImportSummary | null;
  errors: string[];
}

export function ImportModal({ onClose }: ImportModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFromJSON = useHangarStore((state) => state.importFromJSON);
  const clearAll = useHangarStore((state) => state.clearAll);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith(".json")) {
      setParseError("Please select a JSON file");
      return;
    }
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // Clear existing data before importing new file
        clearAll();

        // Guildswarm v1.1 format: pass the whole object
        if (data && !Array.isArray(data) && (data.myHangar || data.myBuyBack)) {
          const result = importFromJSON(data);
          setImportResult(result);
          return;
        }

        // SC Labs backup format: { version, ships, ccus, chains }
        if (data && !Array.isArray(data) && data.ships && Array.isArray(data.ships)) {
          const combined = [...data.ships, ...(data.ccus || [])];
          const result = importFromJSON(combined);
          setImportResult(result);
          return;
        }

        // Array format (legacy guildswarm, CCU Game, etc.)
        if (Array.isArray(data)) {
          const result = importFromJSON(data);
          setImportResult(result);
          return;
        }

        setParseError("Unrecognized file format. Expected Guildswarm, CCU Game, or SC Labs backup JSON.");
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) handleFileSelect(file);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 border-b border-zinc-800/50 p-6 flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-wide text-zinc-100">
            Import Hangar
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-300 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {importResult ? (
            // ═══ Results View ═══
            <div className="space-y-4">
              {/* Format detected badge */}
              {importResult.summary && (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/40 rounded text-[11px] text-cyan-400 font-medium tracking-wide">
                    {importResult.summary.format}
                  </span>
                  <span className="text-[11px] text-zinc-500">detected</span>
                </div>
              )}

              {/* Success summary */}
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-sm space-y-3">
                <p className="text-sm text-emerald-400 font-medium">
                  Import Complete
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <SummaryCell label="Ships" value={importResult.ships.toString()} />
                  <SummaryCell label="CCU Upgrades" value={importResult.ccus.toString()} />
                  {importResult.summary && (
                    <>
                      <SummaryCell
                        label="From Hangar"
                        value={importResult.summary.hangarItemCount.toString()}
                      />
                      <SummaryCell
                        label="From Buyback"
                        value={importResult.summary.buybackItemCount.toString()}
                      />
                      {importResult.summary.skippedItems > 0 && (
                        <SummaryCell
                          label="Skipped (paints/flair)"
                          value={importResult.summary.skippedItems.toString()}
                        />
                      )}
                      {importResult.summary.totalValue > 0 && (
                        <SummaryCell
                          label="Total Value"
                          value={`$${importResult.summary.totalValue.toLocaleString()}`}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Errors / warnings */}
              {importResult.errors.length > 0 && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-sm">
                  <p className="text-sm text-red-400 font-medium mb-2">
                    Warnings ({importResult.errors.length})
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.map((error, i) => (
                      <li key={i} className="text-[11px] text-red-300">
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Privacy note */}
              <div className="p-3 bg-zinc-800/40 border border-zinc-700/30 rounded-sm">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  All data is stored locally in your browser. Nothing is sent to
                  any server. You can export or clear your data at any time.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setImportResult(null); onClose(); }}
                  className="flex-1 px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
                >
                  Done
                </button>
                <button
                  onClick={() => setImportResult(null)}
                  className="flex-1 px-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-all duration-300"
                >
                  Import Another
                </button>
              </div>
            </div>
          ) : (
            // ═══ Upload View ═══
            <>
              {/* Error message */}
              {parseError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm">
                  <p className="text-[12px] text-red-400">{parseError}</p>
                </div>
              )}

              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-sm p-10 text-center transition-all duration-300 ${
                  isDragging
                    ? "border-amber-500/60 bg-amber-500/10"
                    : "border-zinc-700/50 bg-zinc-800/20 hover:border-zinc-600/50"
                }`}
              >
                <div className="text-3xl mb-3 opacity-40">
                  {isDragging ? "📂" : "📁"}
                </div>
                <p className="text-sm text-zinc-300 font-medium">
                  Drag and drop your hangar JSON file here
                </p>
                <p className="text-[12px] text-zinc-500 mt-1">
                  or click the button below to browse
                </p>
              </div>

              {/* File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {/* File Picker Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-2.5 bg-amber-500/20 border border-amber-500/50 rounded-sm text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-all duration-300"
              >
                Choose File
              </button>

              {/* Supported Formats */}
              <div className="border-t border-zinc-800/50 pt-4 space-y-3">
                <p className="text-[12px] text-zinc-400 font-medium tracking-wide">
                  SUPPORTED FORMATS
                </p>
                <div className="space-y-2">
                  <FormatItem
                    name="Guildswarm v1.1"
                    desc="Extension download from RSI hangar"
                    recommended
                  />
                  <FormatItem
                    name="CCU Game"
                    desc="fleetview.json export"
                  />
                  <FormatItem
                    name="SC Labs Backup"
                    desc="Previously exported SC Labs data"
                  />
                </div>
              </div>

              {/* How to get data */}
              <div className="border-t border-zinc-800/50 pt-4">
                <p className="text-[12px] text-zinc-400 font-medium tracking-wide mb-2">
                  HOW TO GET YOUR HANGAR DATA
                </p>
                <ol className="text-[11px] text-zinc-500 space-y-1.5 list-decimal ml-4">
                  <li>Install the <span className="text-cyan-400">Guild Swarm</span> Chrome extension</li>
                  <li>Go to <span className="text-zinc-300">robertsspaceindustries.com</span> → My Hangar</li>
                  <li>Click <span className="text-zinc-300">&quot;Download Hangar data&quot;</span></li>
                  <li>Drop the downloaded JSON file here</li>
                </ol>
              </div>

              {/* Privacy notice */}
              <div className="p-3 bg-zinc-800/40 border border-zinc-700/30 rounded-sm">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  🔒 Your data stays in your browser. We never send it to any
                  server. 100% client-side processing.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 bg-zinc-900/60 rounded">
      <p className="text-[10px] text-zinc-500 tracking-wide uppercase">{label}</p>
      <p className="text-sm text-zinc-100 font-medium mt-0.5">{value}</p>
    </div>
  );
}

function FormatItem({ name, desc, recommended }: { name: string; desc: string; recommended?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-2 bg-zinc-800/30 rounded">
      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/60 shrink-0" />
      <div className="flex-1">
        <span className="text-[12px] text-zinc-300">{name}</span>
        {recommended && (
          <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-[9px] text-amber-400 rounded tracking-wide">
            RECOMMENDED
          </span>
        )}
        <p className="text-[10px] text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}
