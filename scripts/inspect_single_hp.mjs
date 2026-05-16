import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

const id = 'c73a15f8-2bd2-5e5f-ad88-c3f5909df986';
const r = await sql`SELECT loadout_json FROM ship_hardpoints WHERE id::text = ${id} AND game_version = '4.8.0-live.11825000'`;
console.log('loadout_json:', JSON.stringify(r[0].loadout_json, null, 2));

await sql.end({ timeout: 3 });
