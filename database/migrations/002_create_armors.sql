-- Migration: Create armors table
-- Prefix: 002

CREATE TABLE IF NOT EXISTS armors (
    id UUID PRIMARY KEY,
    class_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    manufacturer_id UUID,
    size INTEGER,
    grade INTEGER,
    mass DOUBLE PRECISION,
    volume_scu DOUBLE PRECISION,
    -- Almacenamos los multiplicadores y resistencias en JSONB por flexibilidad de balanceo del juego
    damage_multipliers JSONB DEFAULT '{}'::jsonb,
    penetration_resistance JSONB DEFAULT '{}'::jsonb,
    signal_multipliers JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para búsquedas comunes
CREATE INDEX IF NOT EXISTS idx_armors_manufacturer ON armors(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_armors_class_name ON armors(class_name);
