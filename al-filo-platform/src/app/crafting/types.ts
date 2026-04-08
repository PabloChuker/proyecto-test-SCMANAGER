// Shared types for crafting section — matches API response shapes

export interface MaterialEntry {
  resourceUuid: string;
  resourceName: string;
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
  resourceName: string;
  blueprintCount: number;
  totalScuUsed: number;
}
