-- Migration: Create containers table
-- Prefix: 004

CREATE TABLE IF NOT EXISTS containers (
    id UUID PRIMARY KEY,
    class_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    manufacturer_id UUID,
    capacity_scu DOUBLE PRECISION DEFAULT 0,
    mass DOUBLE PRECISION DEFAULT 0,
    volume_scu DOUBLE PRECISION DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_containers_manufacturer ON containers(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_containers_class_name ON containers(class_name);
