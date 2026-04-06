-- =============================================================================
-- self_destruct_systems_seed.sql
-- Generado por: db/scripts/import-self-destruct-systems.js
-- Fecha:        2026-04-04
-- Origen:       ship-items.json (4852 registros totales, 7 de type SelfDestruct)
-- Importados:   7  |  Excluidos: 0
-- =============================================================================

-- Inserción idempotente: filas ya existentes se omiten sin error.
insert into self_destruct_systems (
  id, class_name, item_name, name, description,
  size, grade, manufacturer_id,
  sd_damage, sd_min_radius, sd_radius,
  sd_min_phys_radius, sd_phys_radius, sd_time
)
values
  ('cf46bb34-df66-4794-92f3-6aa35b652f86', 'VHCL_SelfDestruct_80s', 'vhcl_selfdestruct_80s', 'Self Destruct Unit', NULL,
   1, 1, NULL,
   60000, 80, 150,
   90, 120, 80),
  ('55f62c57-b7ea-4ed7-b72e-2e99fc6c5486', 'VHCL_SelfDestruct_45s', 'vhcl_selfdestruct_45s', 'Self Destruct Unit', NULL,
   1, 1, NULL,
   15000, 30, 80,
   30, 50, 45),
  ('54046cfc-2891-4ba5-b7b3-a8e39da0dd95', 'VHCL_SelfDestruct_120s', 'vhcl_selfdestruct_120s', 'Self Destruct Unit', NULL,
   1, 1, NULL,
   120000, 100, 175,
   110, 150, 120),
  ('e5512d65-5462-4270-8095-212efe3fcf99', 'VHCL_SelfDestruct_10s', 'vhcl_selfdestruct_10s', 'Self Destruct Unit', NULL,
   1, 1, NULL,
   500, 5, 10,
   10, 30, 10),
  ('27875030-1290-4098-827f-f1a5b67c0615', 'VHCL_SelfDestruct_30s', 'vhcl_selfdestruct_30s', 'Self Destruct Unit', NULL,
   1, 1, NULL,
   5000, 5, 50,
   10, 30, 30),
  ('88bd4909-630f-4b80-9b47-6e2224d8dc67', 'VHCL_SelfDestruct_60s', 'vhcl_selfdestruct_60s', 'Self Destruct Unit', NULL,
   1, 1, NULL,
   30000, 50, 120,
   60, 100, 60),
  ('e9655bd9-dd74-46ee-8a15-2ac3bd3dfde1', 'VHCL_SelfDestruct_20s', 'vhcl_selfdestruct_20s', 'Self Destruct Unit', NULL,
   1, 1, NULL,
   2500, 10, 30,
   15, 30, 20)
on conflict (id) do nothing;

-- 7 sistema(s) de autodestrucción insertado(s).