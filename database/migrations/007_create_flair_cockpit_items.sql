-- Migration: Create flair_cockpit_items table
-- Prefix: 007

CREATE TABLE IF NOT EXISTS flair_cockpit_items (
    id UUID PRIMARY KEY,
    class_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    manufacturer_id UUID,
    mass DOUBLE PRECISION DEFAULT 0,
    volume_scu DOUBLE PRECISION DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_flair_cockpit_manufacturer ON flair_cockpit_items(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_flair_cockpit_class_name ON flair_cockpit_items(class_name);
