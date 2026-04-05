-- Migration: Create emps table
-- Prefix: 006

CREATE TABLE IF NOT EXISTS emps (
    id UUID PRIMARY KEY,
    class_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    manufacturer_id UUID,
    size INTEGER,
    grade INTEGER,
    radius DOUBLE PRECISION DEFAULT 0,
    charge_time DOUBLE PRECISION DEFAULT 0,
    cooldown_time DOUBLE PRECISION DEFAULT 0,
    distortion_damage DOUBLE PRECISION DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_emps_manufacturer ON emps(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_emps_class_name ON emps(class_name);
