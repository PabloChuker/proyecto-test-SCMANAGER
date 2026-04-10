-- =============================================================================
-- SC LABS — Migration: Ship Loaner Matrix
-- Run this in the Supabase SQL Editor or via psql.
--
-- Stores the official RSI Loaner Ship Matrix: when a pledged ship is not yet
-- Flight Ready, players receive one or more "loaner" ships until the real
-- ship is released. Source:
--   https://support.robertsspaceindustries.com/hc/en-us/articles/360003093114
--
-- Data snapshot: 2026-04-08 (Star Citizen 4.7.1-live.11592622)
--
-- Tables:
--   ship_loaners — One row per (pledged_ship, loaner_ship) pair.
--                  Normalized: querying "all loaners for ship X" is a simple
--                  WHERE on pledged_name_normalized.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ship_loaners (
  id                        BIGSERIAL PRIMARY KEY,

  -- Display name of the pledged ship exactly as it appears on the RSI matrix
  -- (e.g. "600i Explorer and Executive", "Carrack w/ C8X / Carrack Expedition w/C8X").
  pledged_name              TEXT NOT NULL,

  -- Normalized pledged name for fuzzy lookup:
  --   lowercase, strip manufacturer prefix, strip punctuation, collapse spaces.
  -- Built by the seed rows below and by the client helper `normalizeShipName()`.
  pledged_name_normalized   TEXT NOT NULL,

  -- Display name of a single loaner ship (one row per loaner).
  loaner_name               TEXT NOT NULL,

  -- Normalized loaner name (same rules as pledged_name_normalized).
  loaner_name_normalized    TEXT NOT NULL,

  -- Display order within a pledged ship's loaner list (matches the order
  -- the RSI matrix lists them, so the UI can show them in the canonical order).
  sort_order                INT NOT NULL DEFAULT 0,

  -- Free-form note (e.g. "Temporary Prospector loaner for mining HUD issue").
  note                      TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uniqueness: each (pledged, loaner) pair only once.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ship_loaners_pair
  ON ship_loaners (pledged_name_normalized, loaner_name_normalized);

-- Fast lookup by pledged ship.
CREATE INDEX IF NOT EXISTS idx_ship_loaners_pledged
  ON ship_loaners (pledged_name_normalized);

-- Inverse lookup (which pledges grant this loaner).
CREATE INDEX IF NOT EXISTS idx_ship_loaners_loaner
  ON ship_loaners (loaner_name_normalized);

-- Row Level Security: read-only public, writes via service role only.
ALTER TABLE ship_loaners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON ship_loaners;
CREATE POLICY "public read" ON ship_loaners
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "deny writes" ON ship_loaners;
CREATE POLICY "deny writes" ON ship_loaners
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- SEED DATA — RSI Loaner Ship Matrix (snapshot 2026-04-08)
-- =============================================================================
-- The normalized column uses the same rules as the client helper:
--   - lowercase
--   - strip manufacturer prefixes (Anvil, Aegis, Origin, etc.)
--   - strip punctuation (/, ., commas, parentheses, apostrophes)
--   - collapse whitespace
-- Manufacturer-free display names are stored directly for simplicity.
-- If you change a normalization rule, re-run this seed with TRUNCATE first.
-- =============================================================================

-- Clear existing rows so the seed is idempotent.
TRUNCATE ship_loaners RESTART IDENTITY;

INSERT INTO ship_loaners
  (pledged_name, pledged_name_normalized, loaner_name, loaner_name_normalized, sort_order)
VALUES
  -- 400i
  ('400i',                                      '400i',                                   '325a',                       '325a',                       0),
  -- 600i Touring
  ('600i Touring',                              '600i touring',                           '325a',                       '325a',                       0),
  -- 600i Explorer and Executive
  ('600i Explorer and Executive',               '600i explorer and executive',            '325a',                       '325a',                       0),
  ('600i Explorer and Executive',               '600i explorer and executive',            'Cyclone',                    'cyclone',                    1),
  -- 890 Jump
  ('890 Jump',                                  '890 jump',                               '325a',                       '325a',                       0),
  ('890 Jump',                                  '890 jump',                               '85x',                        '85x',                        1),
  -- Arrastra
  ('Arrastra',                                  'arrastra',                               'Prospector',                 'prospector',                 0),
  ('Arrastra',                                  'arrastra',                               'Mole',                       'mole',                       1),
  ('Arrastra',                                  'arrastra',                               'Arrow',                      'arrow',                      2),
  -- Carrack / Carrack Expedition
  ('Carrack / Carrack Expedition',              'carrack',                                'C8 Pisces',                  'c8 pisces',                  0),
  ('Carrack / Carrack Expedition',              'carrack',                                'URSA Rover',                 'ursa rover',                 1),
  ('Carrack / Carrack Expedition',              'carrack expedition',                     'C8 Pisces',                  'c8 pisces',                  0),
  ('Carrack / Carrack Expedition',              'carrack expedition',                     'URSA Rover',                 'ursa rover',                 1),
  -- Carrack w/ C8X / Carrack Expedition w/ C8X
  ('Carrack w/ C8X / Carrack Expedition w/C8X', 'carrack w c8x',                          'C8X Pisces Expedition',      'c8x pisces expedition',      0),
  ('Carrack w/ C8X / Carrack Expedition w/C8X', 'carrack w c8x',                          'URSA Rover',                 'ursa rover',                 1),
  ('Carrack w/ C8X / Carrack Expedition w/C8X', 'carrack expedition w c8x',               'C8X Pisces Expedition',      'c8x pisces expedition',      0),
  ('Carrack w/ C8X / Carrack Expedition w/C8X', 'carrack expedition w c8x',               'URSA Rover',                 'ursa rover',                 1),
  -- Caterpillar
  ('Caterpillar',                               'caterpillar',                            'Buccaneer',                  'buccaneer',                  0),
  -- Centurion
  ('Centurion',                                 'centurion',                              'Aurora MR',                  'aurora mr',                  0),
  -- Constellation Andromeda
  ('Constellation Andromeda',                   'constellation andromeda',                'P-52 Merlin',                'p-52 merlin',                0),
  -- Constellation Aquila
  ('Constellation Aquila',                      'constellation aquila',                   'P-52 Merlin',                'p-52 merlin',                0),
  ('Constellation Aquila',                      'constellation aquila',                   'URSA Rover',                 'ursa rover',                 1),
  -- Constellation Phoenix
  ('Constellation Phoenix',                     'constellation phoenix',                  'P-72 Archimedes',            'p-72 archimedes',            0),
  ('Constellation Phoenix',                     'constellation phoenix',                  'Lynx Rover',                 'lynx rover',                 1),
  -- Constellation Phoenix Emerald
  ('Constellation Phoenix Emerald',             'constellation phoenix emerald',          'P-72 Archimedes',            'p-72 archimedes',            0),
  ('Constellation Phoenix Emerald',             'constellation phoenix emerald',          'Lynx Rover',                 'lynx rover',                 1),
  -- Corsair
  ('Corsair',                                   'corsair',                                'Buccaneer',                  'buccaneer',                  0),
  -- Crucible
  ('Crucible',                                  'crucible',                               'Constellation Andromeda',    'constellation andromeda',    0),
  -- CSV-SM
  ('CSV-SM',                                    'csv-sm',                                 'Aurora MR',                  'aurora mr',                  0),
  -- Cyclone Variants
  ('Cyclone Variants',                          'cyclone variants',                       'Aurora MR',                  'aurora mr',                  0),
  -- Dragonfly
  ('Dragonfly',                                 'dragonfly',                              'Aurora MR',                  'aurora mr',                  0),
  -- E1 Spirit
  ('E1 Spirit',                                 'e1 spirit',                              'A1 Spirit',                  'a1 spirit',                  0),
  -- Endeavor
  ('Endeavor',                                  'endeavor',                               'Starfarer',                  'starfarer',                  0),
  ('Endeavor',                                  'endeavor',                               'Cutlass Red',                'cutlass red',                1),
  -- Expanse
  ('Expanse',                                   'expanse',                                'Prospector',                 'prospector',                 0),
  ('Expanse',                                   'expanse',                                'Reliant Kore',               'reliant kore',               1),
  -- Fury Variants
  ('Fury Variants',                             'fury variants',                          'Aurora MR',                  'aurora mr',                  0),
  -- G12 Variants
  ('G12 Variants',                              'g12 variants',                           'Lynx',                       'lynx',                       0),
  -- Galaxy
  ('Galaxy',                                    'galaxy',                                 'Carrack',                    'carrack',                    0),
  -- Genesis Starliner
  ('Genesis Starliner',                         'genesis starliner',                      'Hercules C2',                'hercules c2',                0),
  -- Hull C
  ('Hull C',                                    'hull c',                                 'Arrow',                      'arrow',                      0),
  -- Hull D, E
  ('Hull D, E',                                 'hull d',                                 'Hull C',                     'hull c',                     0),
  ('Hull D, E',                                 'hull d',                                 'Hercules C2',                'hercules c2',                1),
  ('Hull D, E',                                 'hull d',                                 'Arrow',                      'arrow',                      2),
  ('Hull D, E',                                 'hull e',                                 'Hull C',                     'hull c',                     0),
  ('Hull D, E',                                 'hull e',                                 'Hercules C2',                'hercules c2',                1),
  ('Hull D, E',                                 'hull e',                                 'Arrow',                      'arrow',                      2),
  -- Idris-M & P
  ('Idris-M & P',                               'idris-m',                                'F7C-M Super Hornet',         'f7c-m super hornet',         0),
  ('Idris-M & P',                               'idris-m',                                'MPUV Passenger',             'mpuv passenger',             1),
  ('Idris-M & P',                               'idris-p',                                'F7C-M Super Hornet',         'f7c-m super hornet',         0),
  ('Idris-M & P',                               'idris-p',                                'MPUV Passenger',             'mpuv passenger',             1),
  -- Ironclad (+ Assault)
  ('Ironclad (+ Assault)',                      'ironclad',                               'Caterpillar',                'caterpillar',                0),
  ('Ironclad (+ Assault)',                      'ironclad assault',                       'Caterpillar',                'caterpillar',                0),
  -- Javelin
  ('Javelin',                                   'javelin',                                'Idris-P',                    'idris-p',                    0),
  ('Javelin',                                   'javelin',                                'MPUV Cargo',                 'mpuv cargo',                 1),
  -- Kraken (+ Privateer)
  ('Kraken (+ Privateer)',                      'kraken',                                 'Polaris',                    'polaris',                    0),
  ('Kraken (+ Privateer)',                      'kraken',                                 'Hercules C2',                'hercules c2',                1),
  ('Kraken (+ Privateer)',                      'kraken',                                 'Caterpillar',                'caterpillar',                2),
  ('Kraken (+ Privateer)',                      'kraken',                                 'Buccaneer',                  'buccaneer',                  3),
  ('Kraken (+ Privateer)',                      'kraken privateer',                       'Polaris',                    'polaris',                    0),
  ('Kraken (+ Privateer)',                      'kraken privateer',                       'Hercules C2',                'hercules c2',                1),
  ('Kraken (+ Privateer)',                      'kraken privateer',                       'Caterpillar',                'caterpillar',                2),
  ('Kraken (+ Privateer)',                      'kraken privateer',                       'Buccaneer',                  'buccaneer',                  3),
  -- Liberator
  ('Liberator',                                 'liberator',                              'Hercules M2',                'hercules m2',                0),
  ('Liberator',                                 'liberator',                              'F7C-M Super Hornet',         'f7c-m super hornet',         1),
  -- Legionnaire
  ('Legionnaire',                               'legionnaire',                            'Vanguard Hoplite',           'vanguard hoplite',           0),
  -- Lynx
  ('Lynx',                                      'lynx',                                   'Aurora MR',                  'aurora mr',                  0),
  -- Mantis
  ('Mantis',                                    'mantis',                                 'Aurora LN',                  'aurora ln',                  0),
  -- Merchantman
  ('Merchantman',                               'merchantman',                            'Hull C',                     'hull c',                     0),
  ('Merchantman',                               'merchantman',                            'Defender',                   'defender',                   1),
  ('Merchantman',                               'merchantman',                            'Hercules C2',                'hercules c2',                2),
  ('Merchantman',                               'banu merchantman',                       'Hull C',                     'hull c',                     0),
  ('Merchantman',                               'banu merchantman',                       'Defender',                   'defender',                   1),
  ('Merchantman',                               'banu merchantman',                       'Hercules C2',                'hercules c2',                2),
  -- Mole
  ('Mole',                                      'mole',                                   'Prospector',                 'prospector',                 0),
  -- MPUV-Tractor
  ('MPUV-Tractor',                              'mpuv-tractor',                           'Aurora MR',                  'aurora mr',                  0),
  -- MXC
  ('MXC',                                       'mxc',                                    'Aurora MR',                  'aurora mr',                  0),
  -- Mule
  ('Mule',                                      'mule',                                   'Aurora MR',                  'aurora mr',                  0),
  -- Nautilus
  ('Nautilus',                                  'nautilus',                               'Polaris',                    'polaris',                    0),
  ('Nautilus',                                  'nautilus',                               'Avenger Titan',              'avenger titan',              1),
  -- Nova
  ('Nova',                                      'nova',                                   'Aurora MR',                  'aurora mr',                  0),
  -- Nox
  ('Nox',                                       'nox',                                    'Aurora MR',                  'aurora mr',                  0),
  -- Odyssey
  ('Odyssey',                                   'odyssey',                                'Carrack',                    'carrack',                    0),
  ('Odyssey',                                   'odyssey',                                'Reliant Kore',               'reliant kore',               1),
  -- Orion
  ('Orion',                                     'orion',                                  'Prospector',                 'prospector',                 0),
  ('Orion',                                     'orion',                                  'Mole',                       'mole',                       1),
  -- Pioneer
  ('Pioneer',                                   'pioneer',                                'Caterpillar',                'caterpillar',                0),
  ('Pioneer',                                   'pioneer',                                'Nomad',                      'nomad',                      1),
  -- Polaris
  ('Polaris',                                   'polaris',                                'F7C-M Super Hornet',         'f7c-m super hornet',         0),
  -- Pulse (+ LX)
  ('Pulse (+ LX)',                              'pulse',                                  'Aurora MR',                  'aurora mr',                  0),
  ('Pulse (+ LX)',                              'pulse lx',                               'Aurora MR',                  'aurora mr',                  0),
  -- Railen
  ('Railen',                                    'railen',                                 'Hercules C2',                'hercules c2',                0),
  ('Railen',                                    'railen',                                 'Syulen',                     'syulen',                     1),
  -- RAFT
  ('RAFT',                                      'raft',                                   'F7C Hornet',                 'f7c hornet',                 0),
  -- Ranger CV
  ('Ranger CV',                                 'ranger cv',                              'Cyclone',                    'cyclone',                    0),
  -- Ranger RC
  ('Ranger RC',                                 'ranger rc',                              'Cyclone RC',                 'cyclone rc',                 0),
  -- Ranger TR
  ('Ranger TR',                                 'ranger tr',                              'Cyclone TR',                 'cyclone tr',                 0),
  -- Redeemer
  ('Redeemer',                                  'redeemer',                               'Arrow',                      'arrow',                      0),
  -- Retaliator
  ('Retaliator',                                'retaliator',                             'Gladiator',                  'gladiator',                  0),
  -- SRV
  ('SRV',                                       'srv',                                    'Aurora LN',                  'aurora ln',                  0),
  -- Storm Variants
  ('Storm Variants',                            'storm variants',                         'Aurora MR',                  'aurora mr',                  0),
  -- STV
  ('STV',                                       'stv',                                    'Aurora MR',                  'aurora mr',                  0),
  -- Terrapin (+ Medic)
  ('Terrapin (+ Medic)',                        'terrapin',                               'F7C-M Super Hornet',         'f7c-m super hornet',         0),
  ('Terrapin (+ Medic)',                        'terrapin medic',                         'F7C-M Super Hornet',         'f7c-m super hornet',         0),
  -- UTV
  ('UTV',                                       'utv',                                    'Aurora MR',                  'aurora mr',                  0),
  -- Valkyrie
  ('Valkyrie',                                  'valkyrie',                               'F7C-M Super Hornet',         'f7c-m super hornet',         0),
  -- Vulcan
  ('Vulcan',                                    'vulcan',                                 'Starfarer',                  'starfarer',                  0),
  -- Vulture
  ('Vulture',                                   'vulture',                                'Buccaneer',                  'buccaneer',                  0),
  -- X1 (+ Velocity, Force)
  ('X1 (+ Velocity, Force)',                    'x1',                                     'Aurora MR',                  'aurora mr',                  0),
  ('X1 (+ Velocity, Force)',                    'x1 velocity',                            'Aurora MR',                  'aurora mr',                  0),
  ('X1 (+ Velocity, Force)',                    'x1 force',                               'Aurora MR',                  'aurora mr',                  0),
  -- Zeus Mk II MR
  ('Zeus Mk II MR',                             'zeus mk ii mr',                          'Zeus Mk II ES',              'zeus mk ii es',              0);

-- Known issue note (RSI: 2025-10-16 — Temporary Prospector loaners for mining HUD)
UPDATE ship_loaners
SET note = 'Temporary loaner due to mining HUD issue (STARC-113044, since 2025-10-16)'
WHERE pledged_name_normalized IN ('arrastra', 'mole', 'orion')
  AND loaner_name_normalized = 'prospector';
