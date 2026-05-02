import psycopg2

CONN = "postgresql://postgres.htqfrcxtsghhcmimxdad:CQpCrOz0HzmWF5Ok@aws-1-us-west-2.pooler.supabase.com:5432/postgres"

TABLES = [
    "ships",
    "ship_flight_stats",
    "ship_resistances",
    "ship_fuel",
    "ship_insurance",
    "ship_hardpoints",
    "ship_power_refence",
    "ship_power_reference",
    "ship_pools",
    "cargo_grids",
]

conn = psycopg2.connect(CONN)
cur = conn.cursor()

# List all public tables
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
""")
all_tables = [r[0] for r in cur.fetchall()]
print("=== ALL PUBLIC TABLES ===")
for t in all_tables:
    print(" ", t)
print()

# Show columns for each target table
for table in TABLES:
    if table not in all_tables:
        print(f"=== {table} : NOT FOUND ===")
        print()
        continue
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
    """, (table,))
    rows = cur.fetchall()
    print(f"=== {table} ({len(rows)} cols) ===")
    for col, dtype, nullable, default in rows:
        null_str = "NULL" if nullable == "YES" else "NOT NULL"
        def_str = f"  DEFAULT {default}" if default else ""
        print(f"  {col:<45} {dtype:<25} {null_str}{def_str}")
    print()

cur.close()
conn.close()
