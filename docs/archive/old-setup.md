# =============================================================================
# [ARCHIVED] AL FILO — Old Project Setup (Phase 1)
# =============================================================================
# WARNING: This documentation is purely historical and no longer represents
# the current project state. Prisma has been removed from the stack, and
# database access now uses raw SQL via postgres.js.
# =============================================================================
#
# Prerequisitos:
#   - Node.js 18+ (recomendado: 20 LTS)
#   - Python 3.11+
#   - Docker Desktop (para PostgreSQL y Redis)
#   - Git
#
# Estructura del proyecto:
#
#   al-filo-platform/
#   ├── docker/
#   │   └── docker-compose.yml      ← PostgreSQL + Redis
#   ├── prisma/
#   │   └── schema.prisma           ← Modelo de datos
#   ├── scripts/
#   │   ├── ingest_scunpacked.py    ← Pipeline de datamining
#   │   └── requirements.txt        ← Dependencias Python
#   ├── data/
#   │   └── scunpacked/             ← (se crea automáticamente)
#   ├── .env                        ← Variables de entorno
#   ├── package.json
#   └── SETUP.md                    ← Este archivo
#
# =============================================================================


# ─────────────────────────────────────────────────────────────────────────────
# PASO 1: Crear el proyecto Next.js
# ─────────────────────────────────────────────────────────────────────────────

# Desde la carpeta PADRE donde querés el proyecto:
npx create-next-app@latest al-filo-platform --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Entrá al proyecto
cd al-filo-platform

# Copiá los archivos que te generé:
#   - prisma/schema.prisma
#   - docker/docker-compose.yml
#   - scripts/ingest_scunpacked.py
#   - scripts/requirements.txt
#   - .env.example → copialo como .env


# ─────────────────────────────────────────────────────────────────────────────
# PASO 2: Levantar PostgreSQL y Redis con Docker
# ─────────────────────────────────────────────────────────────────────────────

# Levantá los contenedores (desde la raíz del proyecto):
docker compose -f docker/docker-compose.yml up -d

# Verificá que estén corriendo:
docker ps

# Deberías ver:
#   alfilo-db     postgres:16-alpine   0.0.0.0:5432->5432/tcp
#   alfilo-cache  redis:7-alpine       0.0.0.0:6379->6379/tcp

# Test rápido de conexión:
docker exec -it alfilo-db psql -U alfilo -d alfilo_platform -c "SELECT 1;"


# ─────────────────────────────────────────────────────────────────────────────
# PASO 3: Configurar variables de entorno
# ─────────────────────────────────────────────────────────────────────────────

# Copiá el template:
cp .env.example .env

# El .env ya tiene los valores correctos para Docker local:
#   DATABASE_URL="postgresql://alfilo:alfilo_dev_2024@localhost:5432/alfilo_platform?schema=public"
#   REDIS_URL="redis://localhost:6379"


# ─────────────────────────────────────────────────────────────────────────────
# PASO 4: Instalar Prisma y aplicar el esquema
# ─────────────────────────────────────────────────────────────────────────────

# Instalar Prisma como dependencia del proyecto:
npm install prisma --save-dev
npm install @prisma/client

# Generar el cliente de Prisma (lee schema.prisma y crea los tipos TypeScript):
npx prisma generate

# Aplicar el esquema a PostgreSQL (crea las tablas):
npx prisma db push

# Verificar que las tablas se crearon:
npx prisma studio
# Esto abre un explorador web en http://localhost:5555 donde podés ver las tablas.
# Deberías ver: items, ships, hardpoints, component_stats, game_versions

# ALTERNATIVA: Si preferís usar migraciones (recomendado para producción):
# npx prisma migrate dev --name init
# Esto crea archivos SQL versionados en prisma/migrations/


# ─────────────────────────────────────────────────────────────────────────────
# PASO 5: Configurar el entorno Python para Datamining
# ─────────────────────────────────────────────────────────────────────────────

# Crear un entorno virtual (recomendado):
cd scripts
python -m venv venv

# Activarlo:
# En Windows:
#   venv\Scripts\activate
# En macOS/Linux:
#   source venv/bin/activate

# Instalar dependencias:
pip install -r requirements.txt

# Volvé a la raíz del proyecto:
cd ..


# ─────────────────────────────────────────────────────────────────────────────
# PASO 6: Ejecutar el Pipeline de Datamining
# ─────────────────────────────────────────────────────────────────────────────

# OPCIÓN A: Dry run (no escribe en DB, solo muestra lo que parsearía):
python scripts/ingest_scunpacked.py --version 4.0.1 --dry-run

# OPCIÓN B: Ejecución completa (clona scunpacked + escribe en DB):
python scripts/ingest_scunpacked.py --version 4.0.1

# OPCIÓN C: Si ya tenés el repo clonado en otra ubicación:
python scripts/ingest_scunpacked.py --version 4.0.1 --local-path /ruta/a/scunpacked

# OPCIÓN D: Si ya clonaste y no querés que haga git pull:
python scripts/ingest_scunpacked.py --version 4.0.1 --skip-clone


# ─────────────────────────────────────────────────────────────────────────────
# PASO 7: Verificar los datos
# ─────────────────────────────────────────────────────────────────────────────

# Abrir Prisma Studio para ver los datos:
npx prisma studio

# O verificar por SQL directo:
docker exec -it alfilo-db psql -U alfilo -d alfilo_platform -c "
  SELECT name, type, manufacturer, \"gameVersion\"
  FROM items
  WHERE type = 'SHIP'
  ORDER BY name
  LIMIT 20;
"

# Contar items por tipo:
docker exec -it alfilo-db psql -U alfilo -d alfilo_platform -c "
  SELECT type, COUNT(*) as total
  FROM items
  GROUP BY type
  ORDER BY total DESC;
"


# ─────────────────────────────────────────────────────────────────────────────
# PASO 8 (OPCIONAL): Helper de Prisma para Next.js
# ─────────────────────────────────────────────────────────────────────────────

# Creá este archivo para usar Prisma desde tus API routes de Next.js:
# src/lib/prisma.ts
#
#   import { PrismaClient } from '@prisma/client'
#
#   const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
#
#   export const prisma = globalForPrisma.prisma ?? new PrismaClient()
#
#   if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma


# ─────────────────────────────────────────────────────────────────────────────
# COMANDOS ÚTILES
# ─────────────────────────────────────────────────────────────────────────────

# Resetear la base de datos (borra todo y recrea):
# npx prisma db push --force-reset

# Ver logs de PostgreSQL:
# docker logs -f alfilo-db

# Parar los contenedores:
# docker compose -f docker/docker-compose.yml down

# Parar y borrar datos persistidos:
# docker compose -f docker/docker-compose.yml down -v
