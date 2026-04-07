-- =============================================================================
-- AL FILO — Seed: Known Warbond CCU prices
--
-- These are EXAMPLE warbond prices from recent Star Citizen sales events.
-- Run this AFTER the main migration to populate warbond discounts.
--
-- To add new warbond prices during events, use the /api/ccu/prices POST
-- endpoint or run UPDATE queries here.
--
-- IMPORTANT: Warbond CCU prices are NOT simply (target_warbond - source_msrp).
-- RSI sets specific warbond CCU prices during events.
-- Standard CCU price = target_msrp - source_msrp (this is automatic).
-- Warbond CCU price = a flat discount set by RSI (varies per CCU).
--
-- Common pattern: Warbond CCU = Standard CCU - $5 to -$15 discount
-- =============================================================================

-- Helper: Update warbond price for a CCU pair by ship references
-- Usage: Run individual UPDATE statements below

-- ─── Mark all CCUs as "available" by default ────────────────────────────────
UPDATE ccu_prices SET is_available = true WHERE is_available IS NULL;

-- ─── Example: Set warbond prices for popular upgrade paths ──────────────────
-- These are illustrative. Replace with actual event prices.

-- To update warbond prices in bulk, use this pattern:
-- UPDATE ccu_prices cp
-- SET warbond_price = [PRICE],
--     is_warbond_available = true,
--     source = 'manual',
--     last_verified = NOW()
-- FROM ships s1, ships s2
-- WHERE cp.from_ship_id = s1.id AND cp.to_ship_id = s2.id
--   AND s1.reference = '[FROM_REF]' AND s2.reference = '[TO_REF]';

-- ─── Refresh: Recalculate standard prices from current MSRP ────────────────
-- Run this if ship MSRPs have been updated:

UPDATE ccu_prices cp
SET standard_price = ROUND((s2.msrp_usd - s1.msrp_usd)::numeric, 2),
    updated_at = NOW()
FROM ships s1, ships s2
WHERE cp.from_ship_id = s1.id
  AND cp.to_ship_id = s2.id
  AND s1.msrp_usd IS NOT NULL
  AND s2.msrp_usd IS NOT NULL;

-- ─── Mark limited ships ────────────────────────────────────────────────────
-- Ships that typically can't be CCU'd INTO (they're limited/hull-limited)
-- UPDATE ships SET is_limited = true WHERE reference IN (
--   'ORIG_890Jump',
--   'RSI_Idris_M',
--   'RSI_Idris_P',
--   'AEGS_Javelin',
--   'RSI_Polaris'
--   -- Add more as needed
-- );

-- Verify
SELECT COUNT(*) AS total_ccus,
       COUNT(warbond_price) AS with_warbond,
       ROUND(AVG(standard_price)::numeric, 2) AS avg_standard_price
FROM ccu_prices
WHERE is_available = true;
