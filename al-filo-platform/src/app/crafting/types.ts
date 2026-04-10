// Shared types for crafting section — matches API response shapes

export interface MaterialEntry {
  resourceUuid: string;
  resourceName: string;
  /** Internal key from the `resources` table, e.g. "Ore_Agricium". */
  resourceKey: string;
  /** Lore/gameplay description from the `resources` table. */
  description: string;
  /** If this resource is an ore, the name of its refined counterpart. */
  refinedName: string | null;
  /** SCU container sizes this resource is packaged in (from `resources_box_sizes`). */
  boxSizes: number[];
  quantityScu: number;
  minQuality: number;
}

export interface ModifierEntry {
  propertyKey: string;
  qualityMin: number;
  qualityMax: number;
  atMinQuality: number;
  atMaxQuality: number;
}

export interface Part {
  groupKey: string;
  groupName: string;
  requiredCount: number;
  materials: MaterialEntry[];
  modifiers: ModifierEntry[];
}

export interface RewardPool {
  poolUuid: string;
  poolKey: string;
}

export interface Blueprint {
  uuid: string;
  key: string;
  kind: string;
  outputName: string;
  outputClass: string;
  outputType: string;
  outputSubtype: string;
  outputGrade: string;
  tierIndex: number;
  craftTimeSeconds: number;
  isDefault: boolean;
  parts: Part[];
  qualityEffects: Record<string, { atMinQuality: number; atMaxQuality: number }>;
  rewardPools: RewardPool[];
}

export interface SubCategory {
  id: string;
  name: string;
  count: number;
}

export interface Category {
  id: string;
  name: string;
  subCategories: SubCategory[];
  count: number;
}

export interface ResourceInfo {
  resourceUuid: string;
  /** Internal key from the `resources` table, e.g. "Ore_Agricium". */
  resourceKey: string;
  resourceName: string;
  /** Lore/gameplay description from the `resources` table. */
  description: string;
  /** Link to the refined counterpart if this entry is an ore. */
  refinedUuid: string | null;
  refinedName: string | null;
  /** Distinct SCU container sizes this resource is packaged in. */
  boxSizes: number[];
  blueprintCount: number;
  totalScuUsed: number;
}
