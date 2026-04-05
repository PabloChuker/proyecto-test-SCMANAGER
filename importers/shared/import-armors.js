const fs = require('fs');
const path = require('path');

/**
 * Script de importación para el tipo 'Armor' de ship-items.json
 */

// Procesamiento manual de argumentos simples para evitar dependencias externas si es posible
const args = process.argv.slice(2);
const getArg = (name) => {
    const found = args.find(a => a.startsWith(`--${name}=`));
    return found ? found.split('=')[1] : null;
};

const INPUT_FILE = getArg('input') || 'ship-items.json';
const OUTPUT_FILE = getArg('output') || 'db/seeds/armors_seed.sql';
const DRY_RUN = args.includes('--dry-run');

console.log(`--- Importador de Armor ---`);
console.log(`Input: ${INPUT_FILE}`);

if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: No se encuentra el archivo ${INPUT_FILE}`);
    process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
const armors = rawData.filter(item => item.type === 'Armor');

console.log(`Encontrados ${armors.length} registros de tipo Armor.`);

const cleanRecords = [];
const errors = {
    test: 0,
    placeholder: 0,
    translation_key: 0,
    no_uuid: 0
};

armors.forEach(item => {
    const std = item.stdItem || {};
    
    // 1. Validaciones de limpieza según reglas de negocio
    if (item.className.toLowerCase().startsWith('test_')) { errors.test++; return; }
    if (std.Name === '<= PLACEHOLDER =>') { errors.placeholder++; return; }
    if (std.Name && std.Name.startsWith('@')) { errors.translation_key++; return; }
    if (!std.UUID) { errors.no_uuid++; return; }

    // 2. Transformación de datos y normalización de tipos
    const record = {
        id: std.UUID,
        class_name: item.className,
        name: (std.Name || '').trim(),
        description: (std.Description || '').trim().replace(/'/g, "''"), // Escape SQL básico
        manufacturer_id: std.Manufacturer ? std.Manufacturer.UUID : null,
        size: parseInt(item.size) || 0,
        grade: parseInt(item.grade) || 0,
        mass: parseFloat(std.Mass) || 0,
        volume_scu: (std.InventoryOccupancy && std.InventoryOccupancy.Volume) ? parseFloat(std.InventoryOccupancy.Volume.SCU) : 0,
        damage_multipliers: std.Armor ? std.Armor.DamageMultipliers : {},
        penetration_resistance: std.Armor ? std.Armor.PenetrationResistance : {},
        signal_multipliers: std.Armor ? std.Armor.SignalMultipliers : {}
    };

    cleanRecords.push(record);
});

console.log(`Registros limpios: ${cleanRecords.length}`);
console.log(`Descartados: ${JSON.stringify(errors)}`);

if (DRY_RUN) {
    console.log('Modo --dry-run activo. No se generará archivo.');
    process.exit(0);
}

// 3. Generación de SQL Seed robusto
let sql = `-- Seed for armors\n-- Generated on ${new Date().toISOString()}\n\n`;

const chunks = [];
const CHUNK_SIZE = 50;

for (let i = 0; i < cleanRecords.length; i += CHUNK_SIZE) {
    const chunk = cleanRecords.slice(i, i + CHUNK_SIZE);
    let insert = `INSERT INTO armors (id, class_name, name, description, manufacturer_id, size, grade, mass, volume_scu, damage_multipliers, penetration_resistance, signal_multipliers)\nVALUES\n`;
    
    const values = chunk.map(r => {
        const m_id = (r.manufacturer_id && r.manufacturer_id !== '00000000-0000-0000-0000-000000000000') 
            ? `'${r.manufacturer_id}'` 
            : 'NULL';
            
        const d_mult = JSON.stringify(r.damage_multipliers).replace(/'/g, "''");
        const p_res = JSON.stringify(r.penetration_resistance).replace(/'/g, "''");
        const s_mult = JSON.stringify(r.signal_multipliers).replace(/'/g, "''");
        
        return `('${r.id}', '${r.class_name}', '${r.name.replace(/'/g, "''")}', '${r.description}', ${m_id}, ${r.size}, ${r.grade}, ${r.mass}, ${r.volume_scu}, '${d_mult}', '${p_res}', '${s_mult}')`;
    });

    insert += values.join(',\n') + `\nON CONFLICT (id) DO UPDATE SET \n` +
              `name = EXCLUDED.name,\n` +
              `description = EXCLUDED.description,\n` +
              `damage_multipliers = EXCLUDED.damage_multipliers,\n` +
              `penetration_resistance = EXCLUDED.penetration_resistance,\n` +
              `signal_multipliers = EXCLUDED.signal_multipliers;\n\n`;
    chunks.push(insert);
}

sql += chunks.join('\n');

// Asegurar que el directorio de salida existe
const dir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(OUTPUT_FILE, sql);
console.log(`\nArchivo generado con éxito en: ${path.resolve(OUTPUT_FILE)}`);
