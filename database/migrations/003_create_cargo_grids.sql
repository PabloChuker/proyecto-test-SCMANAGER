-- Migration: Create cargo_grids table
-- Prefix: 003

CREATE TABLE IF NOT EXISTS cargo_grids (
    id UUID PRIMARY KEY,
    class_name TEXT NOT NULL,
    name TEXT NOT NULL,
    manufacturer_id UUID,
    scu_capacity DOUBLE PRECISION DEFAULT 0,
    -- Dimensiones del contenedor (x, y, z)
    dimensions JSONB DEFAULT '{}'::jsonb,
    mass DOUBLE PRECISION DEFAULT 0,
    volume_scu DOUBLE PRECISION DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cargo_grids_manufacturer ON cargo_grids(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_cargo_grids_class_name ON cargo_grids(class_name);
