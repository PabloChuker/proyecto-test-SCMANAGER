-- =============================================================================
-- SC LABS — 069: shared_chains + chain_votes + chain_comments
--
-- Cadenas de CCU compartidas por la comunidad (Phase B del Chain Board v2).
-- Soporta listing público con voting + comentarios; sólo el owner puede
-- editar/borrar su cadena.
-- =============================================================================

-- ── 1) shared_chains ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_chains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- Snapshot completo del board (BoardSnapshot v2: nodes + edges)
  snapshot_json   JSONB NOT NULL,
  -- Stats denormalizados para sort/filter rápido sin parsear el JSON
  from_ship_name  TEXT,
  to_ship_name    TEXT,
  steps_count     INT  NOT NULL DEFAULT 0,
  msrp_cost       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  savings         NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tags            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- Cache de votos para que el listing no tenga que JOIN/COUNT en cada query.
  -- Se actualiza desde un trigger sobre chain_votes.
  votes_count     INT  NOT NULL DEFAULT 0,
  comments_count  INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_chains_owner       ON public.shared_chains(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_chains_votes       ON public.shared_chains(votes_count DESC);
CREATE INDEX IF NOT EXISTS idx_shared_chains_savings     ON public.shared_chains(savings DESC);
CREATE INDEX IF NOT EXISTS idx_shared_chains_created     ON public.shared_chains(created_at DESC);

ALTER TABLE public.shared_chains ENABLE ROW LEVEL SECURITY;

-- Cualquier user (incluso anónimo) puede LEER las cadenas — son públicas.
DROP POLICY IF EXISTS shared_chains_read ON public.shared_chains;
CREATE POLICY shared_chains_read ON public.shared_chains
  FOR SELECT TO authenticated, anon USING (true);

-- Solo logueados pueden INSERTAR, y solo en nombre propio.
DROP POLICY IF EXISTS shared_chains_insert ON public.shared_chains;
CREATE POLICY shared_chains_insert ON public.shared_chains
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

-- Solo el owner puede UPDATE.
DROP POLICY IF EXISTS shared_chains_update ON public.shared_chains;
CREATE POLICY shared_chains_update ON public.shared_chains
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Solo el owner puede DELETE.
DROP POLICY IF EXISTS shared_chains_delete ON public.shared_chains;
CREATE POLICY shared_chains_delete ON public.shared_chains
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);


-- ── 2) chain_votes — un voto por (chain, user) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.chain_votes (
  chain_id   UUID NOT NULL REFERENCES public.shared_chains(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chain_votes_user ON public.chain_votes(user_id);

ALTER TABLE public.chain_votes ENABLE ROW LEVEL SECURITY;

-- Read público (para mostrar quién votó qué)
DROP POLICY IF EXISTS chain_votes_read ON public.chain_votes;
CREATE POLICY chain_votes_read ON public.chain_votes
  FOR SELECT TO authenticated, anon USING (true);

-- Insert/Delete solo en nombre propio.
DROP POLICY IF EXISTS chain_votes_insert ON public.chain_votes;
CREATE POLICY chain_votes_insert ON public.chain_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chain_votes_delete ON public.chain_votes;
CREATE POLICY chain_votes_delete ON public.chain_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ── 3) chain_comments ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chain_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id    UUID NOT NULL REFERENCES public.shared_chains(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chain_comments_chain   ON public.chain_comments(chain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chain_comments_user    ON public.chain_comments(user_id);

ALTER TABLE public.chain_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chain_comments_read ON public.chain_comments;
CREATE POLICY chain_comments_read ON public.chain_comments
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS chain_comments_insert ON public.chain_comments;
CREATE POLICY chain_comments_insert ON public.chain_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chain_comments_delete ON public.chain_comments;
CREATE POLICY chain_comments_delete ON public.chain_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ── 4) Triggers para mantener votes_count y comments_count en sync ──────────
CREATE OR REPLACE FUNCTION public.refresh_shared_chain_counts(p_chain_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.shared_chains
  SET votes_count    = (SELECT COUNT(*) FROM public.chain_votes    WHERE chain_id = p_chain_id),
      comments_count = (SELECT COUNT(*) FROM public.chain_comments WHERE chain_id = p_chain_id),
      updated_at     = NOW()
  WHERE id = p_chain_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.tg_chain_votes_recount()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_shared_chain_counts(OLD.chain_id);
    RETURN OLD;
  ELSE
    PERFORM public.refresh_shared_chain_counts(NEW.chain_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS chain_votes_recount    ON public.chain_votes;
CREATE TRIGGER chain_votes_recount
AFTER INSERT OR DELETE ON public.chain_votes
FOR EACH ROW EXECUTE FUNCTION public.tg_chain_votes_recount();

CREATE OR REPLACE FUNCTION public.tg_chain_comments_recount()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_shared_chain_counts(OLD.chain_id);
    RETURN OLD;
  ELSE
    PERFORM public.refresh_shared_chain_counts(NEW.chain_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS chain_comments_recount ON public.chain_comments;
CREATE TRIGGER chain_comments_recount
AFTER INSERT OR DELETE ON public.chain_comments
FOR EACH ROW EXECUTE FUNCTION public.tg_chain_comments_recount();


-- ── 5) Vista pública con datos del autor (sin PII) ──────────────────────────
-- Útil para listings: trae el username + avatar del owner. Hacemos JOIN
-- directo contra profiles seleccionando SOLO las columnas seguras
-- (username, display_name, avatar_url). La view se crea con
-- security_invoker = false para que pueda leer profiles sin importar la RLS
-- del invocador (la vista corre con permisos del owner = postgres).
CREATE OR REPLACE VIEW public.shared_chains_public
WITH (security_invoker = false) AS
SELECT
  c.id,
  c.owner_id,
  p.username        AS owner_username,
  p.display_name    AS owner_display_name,
  p.avatar_url      AS owner_avatar_url,
  c.name,
  c.from_ship_name,
  c.to_ship_name,
  c.steps_count,
  c.msrp_cost,
  c.total_cost,
  c.savings,
  c.tags,
  c.votes_count,
  c.comments_count,
  c.created_at,
  c.updated_at
FROM public.shared_chains c
LEFT JOIN public.profiles p ON p.id = c.owner_id;

GRANT SELECT ON public.shared_chains_public TO authenticated, anon;

COMMENT ON VIEW public.shared_chains_public IS
  'Listing público de cadenas compartidas con datos del autor (username, '
  'display_name, avatar_url). NO incluye snapshot_json — usar shared_chains '
  'directamente para cargar el detalle completo (también lectura pública).';
