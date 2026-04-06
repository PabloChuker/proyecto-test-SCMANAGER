"use client";

import { useRef, useState } from "react";
import { useHangarStore } from "@/store/useHangarStore";

interface ImportModalProps {
  onClose: () => void;
}

export function ImportModal({ onClose }: ImportModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<{ ships: number; ccus: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFromJSON = useHangarStore((state) => state.importFromJSON);

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
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith(".json")) {
      setImportResult({ ships: 0, ccus: 0, errors: ["Please select a JSON file"] });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // Extract ships array from various formats
        let itemsToImport = data;
        if (data.ships && Array.isArray(data.ships)) {
          itemsToImport = data.ships;
        } else if (!Array.isArray(data)) {
          throw new Error("Expected JSON array or object with 'ships' property");
        }

        const result = importFromJSON(itemsToImport);
        setImportResult(result);
      } catch (err) {
        setImportResult({
          ships: 0,
          ccus: 0,
          errors: [err instanceof Error ? err.message : "Failed to parse JSON file"],
        });
      }
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800/50 rounded-sm max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 border-b border-zinc-800/50 p-6 flex items-center justify-between">
          <h2 className="text-lg font-medium tracking-wide text-zinc-100">Import Fleet</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-300 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {importResult ? (
            // Results view
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
                <p className="text-sm text-emerald-400 font-medium">Import Complete</p>
                <p className="text-[13px] text-emerald-300 mt-2">
                  {importResult.ships} ships and {importResult.ccus} CCUs imported successfully
                </p>
              </div>

              {importResult.errors.length > 0 && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-sm">
                  <p className="text-sm text-red-400 font-medium mb-2">Warnings</p>
                  <ul className="space-y-1">
                    {importResult.errors.map((error, i) => (
                      <li key={i} className="text-[12px] text-red-300">
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setImportResult(null);
                    onClose();
                  }}
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
            // Import options
            <>
              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-sm p-8 text-center transition-all duration-300 ${
                  isDragging
                    ? "border-amber-500/60 bg-amber-500/10"
                    : "border-zinc-700/50 bg-zinc-800/20 hover:border-zinc-600/50"
                }`}
              >
                <p className="text-sm text-zinc-300 font-medium">Drag and drop JSON file here</p>
                <p className="text-[12px] text-zinc-500 mt-1">or use the button below</p>
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
                className="w-full px-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-sm text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-all duration-300"
              >
                Choose File
              </button>

              {/* Manual Add Option */}
              <div className="border-t border-zinc-800/50 pt-4">
                <p className="text-[12px] text-zinc-500 mb-3">Supported formats:</p>
                <ul className="text-[11px] text-zinc-400 space-y-1 ml-4 list-disc">
                  <li>Guildswarm format</li>
                  <li>CCU Game fleetview.json</li>
                  <li>SC Labs backup format</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
