"use client";

import { useState, useEffect } from "react";
import type { Blueprint, Category, ResourceInfo } from "./types";

interface CraftingData {
  blueprints: Blueprint[];
  categories: Category[];
  materials: ResourceInfo[];
  loading: boolean;
  error: string | null;
}

let cache: { blueprints: Blueprint[]; categories: Category[]; materials: ResourceInfo[] } | null = null;

export function useCraftingData(): CraftingData {
  const [blueprints, setBlueprints] = useState<Blueprint[]>(cache?.blueprints || []);
  const [categories, setCategories] = useState<Category[]>(cache?.categories || []);
  const [materials, setMaterials] = useState<ResourceInfo[]>(cache?.materials || []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return; // Already loaded

    let cancelled = false;

    async function load() {
      try {
        const [bpRes, matRes] = await Promise.all([
          fetch("/api/crafting/blueprints"),
          fetch("/api/crafting/materials"),
        ]);

        if (!bpRes.ok) throw new Error("Failed to load blueprints");
        if (!matRes.ok) throw new Error("Failed to load materials");

        const bpData = await bpRes.json();
        const matData = await matRes.json();

        if (cancelled) return;

        cache = {
          blueprints: bpData.blueprints || [],
          categories: bpData.categories || [],
          materials: matData.materials || [],
        };

        setBlueprints(cache.blueprints);
        setCategories(cache.categories);
        setMaterials(cache.materials);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load crafting data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { blueprints, categories, materials, loading, error };
}
