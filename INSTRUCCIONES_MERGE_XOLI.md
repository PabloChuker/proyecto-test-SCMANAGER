# Instrucciones para Merge con la Estructura de Xoli

## Resumen de lo que hizo Xoli

Xoli reorganizo el repo sacando todo de `al-filo-platform/` a la raiz:

```
ANTES (tu local):                    AHORA (GitHub):
al-filo-platform/src/app/    -->     src/app/
al-filo-platform/src/components/ --> src/components/
al-filo-platform/src/data/    -->    src/data/
al-filo-platform/prisma/      -->    prisma/
al-filo-platform/public/      -->    public/
```

Tambien creo carpetas nuevas: `database/`, `docker/`, `docs/`, `importers/`, `scripts/`

Los assets publicos ahora tienen doble ubicacion:
- `/public/videos/` (original)
- `/public/media/videos/` (nueva)
- `/public/media/images/` (logo: sclabs-logo.png)
- `/public/media/ships/` (miniaturas de naves)

## Lo que ya esta en GitHub (Xoli sincronizo)

- Toda la seccion de Mining (5 archivos en `src/app/mining/`)
- Datos de mining (4 JSON en `src/data/mining/`)
- Todos los componentes existentes (ships, compare, dps)

## Lo que FALTA en GitHub (lo que prepare)

Los archivos estan en la carpeta `new-structure-files/`:

### 1. Seccion Crafting (NUEVA)
```
src/app/crafting/
  page.tsx                  (hub con 4 tabs)
  BlueprintBrowser.tsx      (75 blueprints navegables)
  CraftingCalculator.tsx    (cola de crafteo + shopping list)
  MaterialBrowser.tsx       (28 materiales con filtros)
  QualitySimulator.tsx      (simulador calidad 0-1000)

src/data/crafting/
  blueprints.json           (75 blueprints: ammo, weapons, armor)
  categories.json           (3 categorias, 19 subcategorias)
  materials.json            (28 materiales de crafteo)
```

### 2. API Mining Lasers
```
src/app/api/mining/lasers/
  route.ts                  (JOIN items + mining_stats)
```

### 3. Cambios en page.tsx (Home)
El home page de Xoli todavia tiene mining y crafting con `href: "#"`.
Hay que cambiarlos a `href: "/mining"` y `href: "/crafting"`.

---

## Pasos para hacer el merge

### Paso 1: Sincronizar con Xoli
Abri una terminal en la carpeta del repo y ejecuta:

```bash
cd "C:\Users\carsd\OneDrive\Escritorio\web alfilo\al-filo-platform"
git fetch origin
git reset --hard origin/master
```

> Esto reemplaza tu local con la version de Xoli. No te preocupes, los archivos nuevos de crafting ya los tenes en `new-structure-files/`.

### Paso 2: Copiar archivos nuevos
Desde la raiz del repo:

```bash
# Copiar seccion Crafting
xcopy /E /I "..\new-structure-files\src\app\crafting" "src\app\crafting"
xcopy /E /I "..\new-structure-files\src\data\crafting" "src\data\crafting"

# Copiar API mining lasers
xcopy /E /I "..\new-structure-files\src\app\api\mining" "src\app\api\mining"
```

### Paso 3: Actualizar Home Page
Editar `src/app/page.tsx` y cambiar:
- Linea ~24: `href: "#",` (mining) --> `href: "/mining",`
- Linea ~30: `href: "#",` (crafting) --> `href: "/crafting",`

### Paso 4: Commit y Push

```bash
git add src/app/crafting/ src/data/crafting/ src/app/api/mining/
git add src/app/page.tsx
git commit -m "feat: add Crafting section + mining lasers API + enable panel links"
git push origin master
```

---

## Notas importantes

- Los imports de crafting usan `@/data/crafting/...` que funciona igual en la nueva estructura
- El logo en crafting/page.tsx ya esta actualizado a `/media/images/sclabs-logo.png`
- El video de crafting usa `/videos/crafting.mp4` (hay que verificar que exista en public/videos/)
- Si falta el video de crafting, se puede crear un placeholder o usar otro video temporalmente
