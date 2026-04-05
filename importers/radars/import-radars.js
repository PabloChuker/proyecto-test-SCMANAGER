const fs = require('fs');
const path = require('path');

/**
 * Script de importación para ítems Radar
 * Uso: node db/scripts/import-radars.js [--dry-run] [--input=path] [--output=path]
 */

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const inputPathArg = args.find(a => a.startsWith('--input='))?.split('=')[1];
const outputPathArg = args.find(a => a.startsWith('--output='))?.split('=')[1];

const INPUT_FILE = inputPathArg || path.join(__dirname, '../../ship-items.json');
const OUTPUT_FILE = outputPathArg || path.join(__dirname, '../seeds/radars_seed.sql');
const TARGET_TYPE = 'Radar';

function cleanString(str) {
    if (!str || str.startsWith('@item_') || str === '<= PLACEHOLDER =>' || str.trim() === '') return null;
    return str.trim().replace(/'/g, "''");
}

function run() {
    console.log(`🚀 Iniciando importación de ${TARGET_TYPE}...`);

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ Error: No se encuentra el archivo ${INPUT_FILE}`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    
    // Filtrar y mapear registros
    const records = data
        .filter(item => item.type === TARGET_TYPE)
        .filter(item => item.stdItem && item.stdItem.UUID) // Garantizar UUID
        .map(item => {
            const std = item.stdItem;
            // Estructura específica del radar
            const radar = std.Radar || {};
            const detection = radar.SignatureDetection && radar.SignatureDetection[0] ? radar.SignatureDetection[0] : {};

            // Priorizamos el nombre de primer nivel si el de stdItem es placeholder o genérico
            let finalName = cleanString(item.name) || cleanString(std.Name);
            if (!finalName || finalName === 'Radar') {
                finalName = (item.className || std.ClassName).replace(/_/g, ' ');
            }
            
            return {
                uuid: std.UUID,
                name: finalName,
                description: cleanString(std.DescriptionText) || cleanString(std.Description),
                class_name: item.className || std.ClassName,
                manufacturer_id: (std.Manufacturer && std.Manufacturer.UUID !== '00000000-0000-0000-0000-000000000000') ? std.Manufacturer.UUID : null,
                size: std.Size || 0,
                grade: std.Grade || 0,
                sub_type: item.subType || null,
                sensitivity: detection.Sensitivity || 0,
                ground_vehicle_sensitivity_addition: radar.GroundVehicleSensitivityAddition || 0,
                mass: std.Mass || 0,
                raw: JSON.stringify(item).replace(/'/g, "''")
            };
        })
        .filter(r => !r.uuid.startsWith('0000') && !r.class_name.toLowerCase().includes('fake') && !r.class_name.toLowerCase().includes('test'));

    console.log(`📊 Encontrados ${records.length} registros válidos.`);

    if (records.length === 0) {
        console.log('⚠️ No hay registros para procesar.');
        return;
    }

    // Generar SQL
    let sql = `-- Seed generado automáticamente para radars\n`;
    sql += `insert into radars (uuid, name, description, class_name, manufacturer_id, size, grade, sub_type, sensitivity, ground_vehicle_sensitivity_addition, mass, raw_data)\nvalues\n`;

    const values = records.map(r => {
        return `('${r.uuid}', '${r.name}', ${r.description ? `'${r.description}'` : 'NULL'}, '${r.class_name}', ${r.manufacturer_id ? `'${r.manufacturer_id}'` : 'NULL'}, ${r.size}, ${r.grade}, ${r.sub_type ? `'${r.sub_type}'` : 'NULL'}, ${r.sensitivity}, ${r.ground_vehicle_sensitivity_addition}, ${r.mass}, '${r.raw}')`;
    });

    sql += values.join(',\n') + '\non conflict (uuid) do update set name = excluded.name, description = excluded.description, raw_data = excluded.raw_data;';

    if (isDryRun) {
        console.log('🧪 Dry-run activo. No se guardará el archivo.');
    } else {
        const dir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, sql);
        console.log(`✅ Seed generado con éxito en: ${OUTPUT_FILE}`);
    }
}

run();
