// =============================================================================
// SC LABS — extractor de precios MSRP desde RSI Pledge Store
//
// USO:
//   1. Abrir Chrome → https://robertsspaceindustries.com/en/store/pledge/browse/extras/standalone-ships
//   2. Filtros: "All ships" + Sort: "Lowest price" (asc) → más fácil de auditar
//   3. Scrollear hasta abajo del todo para que TODOS los items se carguen en el DOM
//   4. F12 → Console → pegar y enter
//   5. El resultado se copia automáticamente al portapapeles como JSON, listo
//      para pegar acá.
// =============================================================================

(() => {
  // RSI tiene varios layouts. Probamos selectores comunes y nos quedamos con
  // el que devuelva más items.
  const candidateSelectors = [
    ".pledge-item",
    ".store-item",
    ".product-item",
    ".pledge",
    "[data-product-id]",
    ".ship-item",
    "li.item",
    ".upgrade-item",
  ];

  let cards = [];
  for (const sel of candidateSelectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > cards.length) cards = Array.from(found);
  }

  // Si no matcheamos nada, probamos con divs que contengan precio + nombre
  if (cards.length === 0) {
    cards = Array.from(document.querySelectorAll("div, li, article")).filter((el) => {
      const txt = el.textContent || "";
      return /\$\d/.test(txt) && /\b[A-Z]/.test(txt) && el.querySelector("img");
    });
  }

  console.log(`Encontradas ${cards.length} cards candidatas.`);

  const ships = [];
  const seen = new Set();

  for (const card of cards) {
    const txt = card.textContent || "";

    // Buscar el nombre: heading h1-h6 dentro de la card, o algún span/div
    // con tipografía grande.
    const nameEl = card.querySelector("h1, h2, h3, h4, h5, h6, .name, .title, .product-name, .ship-name");
    if (!nameEl) continue;
    let name = (nameEl.textContent || "").trim();
    name = name.replace(/^THE\s+/i, "").trim();
    if (!name || name.length > 80) continue;

    // Buscar el precio: $XX.XX o $XX
    const priceMatch = txt.match(/\$\s*(\d{1,4}(?:[.,]\d{2})?)/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[1].replace(",", "."));
    if (!Number.isFinite(price) || price < 5 || price > 5000) continue;

    // Buscar el manufacturer (suele estar en una línea aparte tipo "By RSI")
    const mfrMatch = txt.match(/(?:By|by)\s+([A-Z][A-Za-z\s.&-]+?)(?:\$|Ship|$|Roberts)/);
    const manufacturer = mfrMatch ? mfrMatch[1].trim().slice(0, 40) : null;

    const key = `${name}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    ships.push({ name, manufacturer, price_usd: price });
  }

  ships.sort((a, b) => a.price_usd - b.price_usd);

  const json = JSON.stringify(ships, null, 2);
  console.log(`Extraídas ${ships.length} naves únicas.`);
  console.table(ships.slice(0, 20));

  // Copiar al clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(json).then(() => {
      console.log("✓ JSON copiado al portapapeles. Pegalo en el chat con Claude.");
    });
  } else {
    console.log("Copialo manualmente desde acá:");
    console.log(json);
  }

  return ships;
})();
