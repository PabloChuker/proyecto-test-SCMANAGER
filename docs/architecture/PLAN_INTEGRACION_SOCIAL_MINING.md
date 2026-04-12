# SC Labs — Plan de Integración: Social (Party) + Mining & Industry

**Fecha:** 2026-04-12
**Autor:** Claude (asistente de Pablo)
**Estado:** Borrador para revisión
**Alcance:** Integrar el módulo de Party/Social con Mining & Industry, persistir en Supabase, y preparar el pipeline punta a punta (minería → acumulación → transporte → venta).

---

## 1. Estado Actual

### 1.1 Party / Social (Supabase-backed)

| Tabla | Propósito |
|-------|-----------|
| `parties` | id, name, leader_id, activity_type, max_members, status |
| `party_members` | party_id, user_id, role (leader/member) |
| `activity_sessions` | id, party_id, host_id, participants JSON, loot_entries, raffle_mode, results, settlement |
| `profiles` | id, username, display_name, avatar_url, is_online |
| `notifications` | Sistema de invitaciones y alertas en tiempo real |

- Realtime via Supabase broadcast channel `activity-session:{partyId}`
- Settlement engine con reembolso de gastos, profit split, tax simulation (0.5%)
- Loot distribution: Lottery (wishlist-aware), Split (round-robin), Draft

### 1.2 Mining & Industry (100% localStorage)

| localStorage Key | Propósito |
|------------------|-----------|
| `alfilo_wo_sessions` | Lista de sesiones de minería |
| `alfilo_wo_orders` | Work orders (estado, minerales, crew, gastos) |
| `alfilo_wo_inventory` | Inventario de materiales refinados |
| `alfilo_wo_movements` | Log de movimientos (refine, sell, craft, distribute) |

- Crew members son strings planos (no vinculados a profiles)
- No hay sync entre miembros de party
- Crew shares se calculan por sesión individual
- No hay acumulados cross-sesión por persona

### 1.3 Brecha Principal

No hay puente entre `party_members` (DB, user_id vinculado) y `WOCrewMember` (localStorage, nombre string). La integración requiere:

1. Migrar work orders / inventory / movements a Supabase
2. Vincular crew members a user profiles
3. Auto-cargar party como crew
4. Acumular totales cross-sesión por persona
5. Preparar hooks para el pipeline cargo/trade

---

## 2. Modelo de Datos Propuesto (Supabase)

### 2.1 Nuevas Tablas

```sql
-- ═══════════════════════════════════════════════════════════════
-- MINING SESSIONS (reemplaza alfilo_wo_sessions de localStorage)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE mining_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id      UUID REFERENCES parties(id) ON DELETE SET NULL,
  owner_id      UUID NOT NULL REFERENCES auth.users(id),
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'archived')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  notes         TEXT
);

-- Índices para queries frecuentes
CREATE INDEX idx_mining_sessions_owner ON mining_sessions(owner_id);
CREATE INDEX idx_mining_sessions_party ON mining_sessions(party_id);

-- ═══════════════════════════════════════════════════════════════
-- MINING MEMBERS (crew de la sesión, vinculados a profiles)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE mining_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES mining_sessions(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),       -- NULL = guest/manual
  display_name    TEXT NOT NULL,                          -- cache o nombre manual
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'miner'
                  CHECK (role IN ('miner', 'escort', 'pilot', 'logistics', 'refiner', 'scout', 'custom')),
  share_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,       -- % asignado (editable)
  is_from_party   BOOLEAN NOT NULL DEFAULT false,         -- auto-cargado desde party
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(session_id, user_id)                             -- un user por sesión
);

CREATE INDEX idx_mining_members_session ON mining_members(session_id);
CREATE INDEX idx_mining_members_user ON mining_members(user_id);

-- ═══════════════════════════════════════════════════════════════
-- ROLES & SHARE PRESETS (% sugeridos por rol, editables)
-- ═══════════════════════════════════════════════════════════════
-- No es tabla DB, se maneja como constante en el frontend:
-- miner     → 25%  (base, ajusta según cantidad)
-- escort    → 15%
-- pilot     → 20%
-- logistics → 15%
-- refiner   → 10%
-- scout     → 10%
-- custom    → 0% (manual)
-- Los % se recalculan automáticamente al agregar/quitar miembros,
-- manteniendo las proporciones relativas del rol. El usuario puede
-- overridear cualquier % manualmente.

-- ═══════════════════════════════════════════════════════════════
-- WORK ORDERS (reemplaza alfilo_wo_orders de localStorage)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE mining_work_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES mining_sessions(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES auth.users(id),

  -- Tipo de operación
  order_type        TEXT NOT NULL CHECK (order_type IN ('ship', 'roc', 'salvage', 'share')),
  status            TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed', 'collected')),

  -- Refinería (solo ship mining)
  refinery_id       TEXT,
  refinery_name     TEXT,
  refining_method   TEXT,

  -- Minerales (JSONB array de objetos)
  ores              JSONB NOT NULL DEFAULT '[]',
  -- Estructura: [{ id, name, quantity, yieldQty, value }]

  -- Financiero
  total_yield       NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_value       NUMERIC(12,2) NOT NULL DEFAULT 0,
  sell_price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_profit        NUMERIC(12,2) NOT NULL DEFAULT 0,
  motrader_fee      NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Timer de refinería
  countdown_seconds INTEGER NOT NULL DEFAULT 0,
  countdown_ends_at TIMESTAMPTZ,

  -- Metadata
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  collected_at      TIMESTAMPTZ,
  notes             TEXT
);

CREATE INDEX idx_wo_session ON mining_work_orders(session_id);
CREATE INDEX idx_wo_status ON mining_work_orders(status);

-- ═══════════════════════════════════════════════════════════════
-- WORK ORDER EXPENSES (gastos por orden)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE mining_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES mining_work_orders(id) ON DELETE CASCADE,
  claimant_id   UUID REFERENCES auth.users(id),           -- NULL = guest
  claimant_name TEXT NOT NULL,
  expense_name  TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_type  TEXT NOT NULL DEFAULT 'general'
                CHECK (expense_type IN ('fuel', 'ammo', 'repair', 'fee', 'general')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_wo ON mining_expenses(work_order_id);

-- ═══════════════════════════════════════════════════════════════
-- CREW PAYOUTS (lo que le corresponde a cada persona por orden)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE mining_crew_payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID NOT NULL REFERENCES mining_work_orders(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES mining_members(id) ON DELETE CASCADE,
  share_pct       NUMERIC(5,2) NOT NULL,                  -- % al momento del cálculo
  payout_auec     NUMERIC(12,2) NOT NULL DEFAULT 0,       -- dinero asignado
  paid            BOOLEAN NOT NULL DEFAULT false,          -- ¿ya se le transfirió?
  paid_at         TIMESTAMPTZ,

  UNIQUE(work_order_id, member_id)
);

CREATE INDEX idx_payouts_wo ON mining_crew_payouts(work_order_id);
CREATE INDEX idx_payouts_member ON mining_crew_payouts(member_id);

-- ═══════════════════════════════════════════════════════════════
-- INVENTORY (materiales refinados acumulados, por sesión)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE mining_inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES mining_sessions(id) ON DELETE CASCADE,
  mineral_id    TEXT NOT NULL,
  mineral_name  TEXT NOT NULL,
  quantity      NUMERIC(12,4) NOT NULL DEFAULT 0,          -- disponible
  total_received NUMERIC(12,4) NOT NULL DEFAULT 0,         -- acumulado histórico

  UNIQUE(session_id, mineral_id)
);

CREATE INDEX idx_inventory_session ON mining_inventory(session_id);

-- ═══════════════════════════════════════════════════════════════
-- INVENTORY MOVEMENTS (log de transacciones, auditoría completa)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE mining_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES mining_sessions(id) ON DELETE CASCADE,
  work_order_id   UUID REFERENCES mining_work_orders(id) ON DELETE SET NULL,
  mineral_id      TEXT NOT NULL,
  mineral_name    TEXT NOT NULL,
  delta           NUMERIC(12,4) NOT NULL,                  -- ± cantidad
  reason          TEXT NOT NULL
                  CHECK (reason IN (
                    'refine_complete',    -- refinado listo, entra a inventario
                    'sell',               -- venta de material
                    'craft',              -- usado para crafting
                    'distribute',         -- repartido a miembro
                    'transfer_out',       -- enviado a operación de cargo/trade
                    'manual_add',         -- ajuste manual +
                    'manual_remove'       -- ajuste manual -
                  )),
  member_id       UUID REFERENCES mining_members(id),      -- a quién (distribute)
  member_name     TEXT,                                     -- cache nombre
  destination_ref TEXT,                                     -- ref a cargo/trade (futuro)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_movements_session ON mining_movements(session_id);
CREATE INDEX idx_movements_member ON mining_movements(member_id);
CREATE INDEX idx_movements_reason ON mining_movements(reason);

-- ═══════════════════════════════════════════════════════════════
-- MEMBER LEDGER (acumulados cross-sesión por persona)
-- ═══════════════════════════════════════════════════════════════
-- Vista materializada o tabla que acumula totales por user_id
-- a través de TODAS las sesiones. Permite ver "cuánto le debo
-- a cada persona en total" o "cuánto material acumuló fulano".
CREATE TABLE mining_member_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id),
  display_name    TEXT NOT NULL,
  
  -- Acumulados financieros
  total_earned    NUMERIC(14,2) NOT NULL DEFAULT 0,        -- total aUEC ganado
  total_paid      NUMERIC(14,2) NOT NULL DEFAULT 0,        -- total aUEC pagado
  total_expenses  NUMERIC(14,2) NOT NULL DEFAULT 0,        -- total gastos reclamados
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0,        -- earned - paid (lo que se le debe)

  -- Acumulados de participación
  total_orders    INTEGER NOT NULL DEFAULT 0,
  total_sessions  INTEGER NOT NULL DEFAULT 0,

  -- Acumulados de materiales (JSONB: { mineralId: qty })
  materials_received JSONB NOT NULL DEFAULT '{}',
  materials_value    NUMERIC(14,2) NOT NULL DEFAULT 0,

  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

CREATE INDEX idx_ledger_user ON mining_member_ledger(user_id);
CREATE INDEX idx_ledger_balance ON mining_member_ledger(balance DESC);

-- ═══════════════════════════════════════════════════════════════
-- RLS (Row Level Security) — cada usuario ve sus sesiones
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE mining_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own sessions or party sessions"
  ON mining_sessions FOR SELECT
  USING (
    owner_id = auth.uid()
    OR party_id IN (
      SELECT party_id FROM party_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE mining_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members visible to session participants"
  ON mining_members FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM mining_sessions WHERE owner_id = auth.uid()
      UNION
      SELECT ms.id FROM mining_sessions ms
        JOIN party_members pm ON pm.party_id = ms.party_id
        WHERE pm.user_id = auth.uid()
    )
  );

-- Políticas similares para las demás tablas...
```

### 2.2 Diagrama de Relaciones

```
parties ──────┐
              │ party_id
              ▼
        mining_sessions ◄── mining_members ──► profiles (user_id)
              │                    │
              │ session_id         │ member_id
              ▼                    ▼
        mining_work_orders    mining_crew_payouts
              │
              ├──► mining_expenses
              │
              ▼
        mining_inventory ◄── mining_movements ──► mining_members
                                    │
                                    │ destination_ref (futuro)
                                    ▼
                              [cargo_shipments] (fase futura)
```

---

## 3. Roles y Porcentajes Sugeridos

### 3.1 Roles Predefinidos

| Rol | Descripción | % Sugerido Base | Icono |
|-----|-------------|-----------------|-------|
| **Miner** | Opera laser de minería, extrae materiales | 25% | ⛏ |
| **Escort** | Protección militar de la operación | 15% | 🛡 |
| **Pilot** | Pilotea la nave principal (MOLE, etc.) | 20% | ✈ |
| **Logistics** | Transporte, carga, coordinación | 15% | 📦 |
| **Refiner** | Gestiona la refinería y métodos | 10% | 🔥 |
| **Scout** | Escanea y encuentra depósitos | 10% | 🔍 |
| **Custom** | Rol libre, % manual | 0% (manual) | ⚙ |

### 3.2 Auto-Balanceo de Porcentajes

Cuando se agregan o quitan miembros, el sistema recalcula los % manteniendo las proporciones relativas del rol. Ejemplo con 4 personas:

```
Piloto (20%) + 2 Mineros (25% c/u) + Escolta (15%) = 85% raw
Normalizado: Piloto 23.5% + Minero₁ 29.4% + Minero₂ 29.4% + Escolta 17.6% = 100%
```

El usuario puede overridear cualquier % manualmente. Al hacerlo, se marca como "fijo" y los demás se rebalancean alrededor de los fijos.

### 3.3 Gastos por Profesión

Ciertos gastos se asignan automáticamente según el rol:

| Gasto | Rol Default | Editable |
|-------|-------------|----------|
| Combustible (Hydrogen) | Pilot | ✅ |
| Munición | Escort | ✅ |
| Reparación nave | Pilot | ✅ |
| Fee refinería | Refiner / Owner | ✅ |
| moTrader fee (3.75%) | Seller (automático) | ✅ |

---

## 4. Flujo de Integración (UX)

### 4.1 Auto-Carga de Party al Crear Sesión de Minería

```
[Mining Page] → [Dashboard] → [+ Nueva Sesión]
     │
     ├─ ¿Tiene party activa? ──► SÍ: "Cargar miembros de party como crew?"
     │                                [Cargar Party] [Sesión Individual]
     │                                     │
     │                                     ▼
     │                            Auto-populate mining_members
     │                            desde party_members + profiles
     │                            con roles sugeridos editables
     │
     └─ NO: Crear sesión individual (agregar crew manual)
```

### 4.2 Work Order con Crew Integrada

```
[Work Order Calculator]
     │
     ├─ Left: Refinería + Minerales + Timer (sin cambios)
     │
     └─ Right: "Selling & Profit Sharing" MEJORADO:
          │
          ├─ Crew visible con avatar, nombre, rol, % share
          │  (auto-cargados desde mining_members de la sesión)
          │
          ├─ Rol dropdown por persona (miner/escort/pilot/...)
          │  → Cambia el % sugerido automáticamente
          │  → Override manual disponible
          │
          ├─ Gastos con tipo (fuel/ammo/repair/fee/general)
          │  → Se asignan al claimant (dropdown de miembros)
          │
          └─ Submit → mining_work_orders + mining_expenses + mining_crew_payouts
```

### 4.3 Dashboard con Acumulados por Persona

```
[Dashboard] → [CREW SHARES tab] MEJORADO:
     │
     ├─ Tabla por miembro:
     │  │  Avatar | Nombre | Rol | Orders | Ganado | Pagado | Balance | Materiales
     │  │  ───────┼────────┼─────┼────────┼────────┼────────┼─────────┼───────────
     │  │  🟢 Xoli│ Xoli   │ ⛏  │   5    │ 45.2K  │ 30.0K  │ 15.2K   │ 22 SCU
     │  │  🟢 dlv │ dlv16  │ 🛡  │   5    │ 27.1K  │ 27.1K  │  0.0K   │  0 SCU
     │  │  ⚫ garn│ garnok │ ✈  │   3    │ 36.1K  │ 20.0K  │ 16.1K   │ 15 SCU
     │
     ├─ "Balance" = lo que se le debe (earned - paid)
     │   → Botón "💸 Pagar" para registrar transferencia
     │   → Calcula monto neto considerando tax 0.5%
     │
     ├─ Expandir fila → Detalle por orden:
     │   │  Orden #3 | Ship Mining | 2026-04-08 | 21K gross | Share: 29.4% | Payout: 6.2K
     │   │  Orden #5 | Ship Mining | 2026-04-10 | 15K gross | Share: 29.4% | Payout: 4.4K
     │
     └─ Toggle "Acumulado Global" → muestra mining_member_ledger
        (totales cross-sesión de TODAS las sesiones con este usuario)
```

### 4.4 Inventario con Distribución por Persona

```
[Dashboard] → [INVENTORY tab] MEJORADO:
     │
     ├─ Material Inventory (sin cambios grandes)
     │  + Nueva columna: "Asignado" (cuánto ya se distribuyó)
     │  + Nueva columna: "Disponible" (quantity - asignado)
     │
     ├─ [Distribute] button → Modal mejorado:
     │   │  Destino: [Dropdown miembros de la sesión]
     │   │  Tipo:    ○ Materiales  ○ Venta (aUEC)
     │   │
     │   │  Si "Materiales": Cantidad SCU + mineral selector
     │   │  Si "Venta":      Monto aUEC + se registra como payout
     │   │
     │   │  → Actualiza mining_movements + mining_member_ledger
     │
     └─ Nuevo: [Transfer to Cargo] button (futuro, Fase 3)
        → Crea referencia en mining_movements con reason='transfer_out'
        → Link al módulo de Cargo/Trade para vender
```

### 4.5 Stats Tab Enriquecido

```
[Dashboard] → [STATS tab] MEJORADO:
     │
     ├─ KPIs existentes (sin cambios)
     │
     ├─ Nuevo: "Performance por Miembro" chart
     │   → Bar chart horizontal: ganancia por persona
     │   → Color por rol
     │
     ├─ Nuevo: "Distribución de Roles" pie chart
     │   → % de participación por tipo de rol
     │
     └─ Nuevo: "Balance Pendiente" summary card
        → Total que se adeuda al crew
        → Desglose rápido por persona
```

---

## 5. Pipeline Punta a Punta (Visión Futura)

### 5.1 Flujo Completo

```
MINERÍA                  ACUMULACIÓN              TRANSPORTE           VENTA
────────                 ────────────             ──────────           ─────
Work Order       →     Inventario         →     Cargo Shipment  →   Trade Route
  ⛏ Extraer              📦 Stockpile             🚀 Cargar            💰 Vender
  🔥 Refinar              📊 Valorizar             📍 Ruta              📈 Profit
  📥 Collect              👥 Asignar               ⏱ Timer             💸 Settle
                          ⚖ Balance               🛡 Escort            📒 Ledger
```

### 5.2 Hook para Cargo/Trade

La tabla `mining_movements` ya tiene:
- `reason = 'transfer_out'` para registrar salida hacia cargo
- `destination_ref` (TEXT) para vincular al shipment de cargo
- Esto permite rastrear: "estos 50 SCU de Quantanium vinieron de la sesión minera X, se cargaron en el Hull C, y se vendieron en ArcCorp por 120K aUEC"

### 5.3 Tablas Futuras (no implementar ahora, solo diseñar el hook)

```sql
-- FASE FUTURA: Cargo Shipments
-- CREATE TABLE cargo_shipments (
--   id            UUID PRIMARY KEY,
--   session_id    UUID REFERENCES mining_sessions(id),
--   ship_id       TEXT,          -- nave de transporte
--   pilot_id      UUID,          -- quién pilotea
--   origin        TEXT,          -- estación de salida
--   destination   TEXT,          -- estación de destino
--   status        TEXT,          -- loading, in_transit, delivered, lost
--   cargo         JSONB,         -- [{ mineralId, qty, source_movement_id }]
--   created_at    TIMESTAMPTZ
-- );
```

---

## 6. Plan de Implementación por Fases

### Fase 1: Fundación DB + Auto-carga Party (1-2 días)

1. **Crear migraciones SQL** para las tablas nuevas
2. **API routes**: `/api/mining/sessions`, `/api/mining/members`, `/api/mining/work-orders`
3. **Refactorizar `workOrderStore.ts`**: pasar de localStorage a Supabase
   - Mantener localStorage como fallback offline
   - Sync bidireccional (local-first, push a DB)
4. **Auto-carga de party**: al crear sesión, si hay party activa, ofrecer cargar miembros
5. **Vincular crew a profiles**: `mining_members.user_id` → `profiles`

### Fase 2: Roles + Shares + Gastos (1-2 días)

1. **UI de roles**: dropdown por miembro con iconos y % sugeridos
2. **Auto-balanceo de %**: algoritmo de normalización con override manual
3. **Gastos tipados**: fuel/ammo/repair/fee con asignación a claimant
4. **`mining_crew_payouts`**: calcular y persistir payout por orden
5. **`mining_expenses`**: persistir gastos con tipo y claimant

### Fase 3: Acumulados + Ledger (1 día)

1. **`mining_member_ledger`**: trigger o función que actualiza acumulados al insertar payouts/movements
2. **UI Crew Shares mejorado**: tabla con balance, materiales, expandible por orden
3. **Botón "Pagar"**: registrar transferencia (con cálculo de tax)
4. **Toggle Acumulado Global**: mostrar ledger cross-sesión

### Fase 4: Inventario + Distribución Mejorada (1 día)

1. **Columnas nuevas en Inventory**: Asignado, Disponible
2. **Modal de distribución mejorado**: materiales o venta, por miembro
3. **Log de movements enriquecido**: con member_name, destino
4. **Botón "Transfer to Cargo"** (placeholder para Fase futura)

### Fase 5: Stats + Polish (1 día)

1. **Charts de performance por miembro**
2. **Distribución de roles**
3. **Balance pendiente summary**
4. **Realtime sync** para party members viendo el dashboard

---

## 7. Consideraciones Técnicas

### 7.1 Migración de localStorage → Supabase

- **No romper lo existente**: el store actual sigue funcionando con localStorage
- **Estrategia "local-first"**: escribir a localStorage inmediatamente, sync a Supabase en background
- **Detección de conflictos**: timestamp-based (last-write-wins) o merge strategy
- **Offline support**: si no hay conexión, localStorage acumula y sincroniza al reconectar
- **Migration path**: script para importar datos existentes de localStorage a Supabase

### 7.2 Realtime Sync

- Usar Supabase Realtime `postgres_changes` en las tablas de mining
- Canal: `mining-session:{sessionId}` (similar a `activity-session:{partyId}`)
- Eventos: work order created/updated, inventory changed, payout recorded
- Solo el owner/cohosts pueden escribir; viewers ven en tiempo real

### 7.3 RLS (Row Level Security)

- **Owner**: full CRUD en su sesión
- **Party members**: SELECT en sesiones vinculadas a su party
- **Cohosts**: INSERT/UPDATE en work orders de la sesión
- **Público**: nada (todo requiere auth)

### 7.4 Performance

- `mining_member_ledger` se actualiza via trigger SQL on INSERT to `mining_crew_payouts` y `mining_movements`
- Índices en session_id, user_id, status para queries frecuentes
- JSONB para ores y materials_received (flexibilidad sin joins)

---

## 8. Sugerencias Adicionales

### 8.1 "Operación" como Concepto Wrapper

Idea: crear un concepto de **Operación** que agrupa una sesión minera + escoltas + transporte + venta bajo un mismo paraguas. La party inicia una "Operación de Minería" que automáticamente:
- Crea la sesión minera
- Registra escoltas como miembros con rol "escort"
- Al completar, ofrece "¿Transportar materiales?" → crea cargo shipment
- Al vender, cierra la operación con P&L completo

### 8.2 Perfil de Minero en Profile Page

Agregar a la página de perfil (`/profile`) una sección "Mining Stats":
- Total ganado, total órdenes, minerales favoritos
- Roles más frecuentes
- Sesiones participadas
- Rating/reputación (futuro)

### 8.3 Notificaciones de Mining

Usar el sistema de notificaciones existente para:
- "Tu refinado está listo" (countdown terminó)
- "Se distribuyeron materiales de la sesión X"
- "Tienes un balance pendiente de 15.2K aUEC con Xoli"
- "Nueva sesión minera creada en tu party"

### 8.4 Export/Import

- Exportar resumen de sesión como PDF (para el líder de flota)
- Exportar ledger como CSV (para contabilidad de org)
- Import de datos desde localStorage legacy (migración one-time)

---

## 9. Archivos a Crear/Modificar

### Nuevos

| Archivo | Propósito |
|---------|-----------|
| `database/migrations/033_create_mining_sessions.sql` | Tabla mining_sessions |
| `database/migrations/034_create_mining_members.sql` | Tabla mining_members |
| `database/migrations/035_create_mining_work_orders.sql` | Tabla mining_work_orders + expenses |
| `database/migrations/036_create_mining_inventory.sql` | Tabla inventory + movements |
| `database/migrations/037_create_mining_payouts_ledger.sql` | Tablas crew_payouts + member_ledger |
| `src/app/api/mining/sessions/route.ts` | CRUD sesiones |
| `src/app/api/mining/members/route.ts` | CRUD miembros |
| `src/app/api/mining/work-orders/route.ts` | CRUD work orders |
| `src/app/api/mining/inventory/route.ts` | Inventory + movements |
| `src/app/api/mining/ledger/route.ts` | Ledger acumulados |
| `src/lib/miningStore.ts` | Nuevo store (Supabase + localStorage fallback) |

### Modificar

| Archivo | Cambio |
|---------|--------|
| `src/app/mining/WorkOrderCalculator.tsx` | Crew desde mining_members, roles, gastos tipados |
| `src/app/mining/WorkOrderDashboard.tsx` | Crew Shares mejorado, inventario con distribución |
| `src/lib/workOrderStore.ts` | Adapter para sync con Supabase (mantener backwards compat) |
| `src/app/party/page.tsx` | Botón "Iniciar Operación Minera" (futuro) |

---

## 10. Prioridades Inmediatas (Próxima Sesión de Trabajo)

1. ✅ Revisar y aprobar este plan
2. Crear las migraciones SQL (tablas 033-037)
3. Crear API routes básicas (CRUD)
4. Implementar auto-carga de party en el dashboard
5. Conectar WorkOrderCalculator con mining_members

---

*Documento generado para revisión de Pablo y Xoli. Feedback bienvenido antes de empezar a codificar.*
