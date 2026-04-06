-- Seed for emps
-- Generated on 2026-04-04T12:51:34.867Z

INSERT INTO emps (id, class_name, name, description, manufacturer_id, size, grade, radius, charge_time, cooldown_time, distortion_damage)
VALUES
('5b592245-58a7-4ce9-9c96-3145d0424da8', 'AEGS_EMP_Device_S4', 'REP-8 EMP Generator', 'Manufacturer: Behring
Item Type: EMP Generator

The REP-8 is a highly regarded EMP-focused burst generator from Behring. It balances a manageable charge time with a strong blast of distortion damage that knocks out electronic components caught within its radius. Solid engineering and centuries of use have made this a standard non-lethal deterrent across the Empire.', NULL, 4, 1, 750, 20, 22, 2750),
('b171c0f3-7e9b-49b7-a6b4-8422315d4a6e', 'MXOX_EMP_Device_S2', 'TroMag Burst Generator', 'Manufacturer: MaxOx
Item Type: Burst Generator
Size: 1
Damage Type: EMP

The TroMag from MaxOx is a well-designed and reliable EMP-focused burst generator. Its popularity has risen over the years as pilots look for alternatives to Behring’s REP-8. The TroMag boasts a faster charge time than their main competitor but has a smaller effective radius, leaving pilots to decide whether they prefer speed or size.', 'de0d3594-9f18-42c0-8a90-6edd723d80f8', 2, 1, 600, 15, 12, 2750),
('154a4629-e503-4bb6-bdaa-c1f8f13fc39c', 'TMBL_EMP_Device_S1', 'TroMag Burst Generator', 'Manufacturer: MaxOx
Item Type: Burst Generator
Size: 1
Damage Type: EMP

The TroMag from MaxOx is a well-designed and reliable EMP-focused burst generator. Its popularity has risen over the years as pilots look for alternatives to Behring’s REP-8. The TroMag boasts a faster charge time than their main competitor but has a smaller effective radius, leaving pilots to decide whether they prefer speed or size.', 'bb1024bc-b82e-491c-820c-36662c36feb3', 1, 1, 400, 12, 6, 1000),
('6557820b-a5d1-4630-80aa-44d41058e488', 'ANVL_Hawk_EMP_Device_S2', 'TroMag Burst Generator', 'Manufacturer: MaxOx
Item Type: Burst Generator
Size: 1
Damage Type: EMP

The TroMag from MaxOx is a well-designed and reliable EMP-focused burst generator. Its popularity has risen over the years as pilots look for alternatives to Behring’s REP-8. The TroMag boasts a faster charge time than their main competitor but has a smaller effective radius, leaving pilots to decide whether they prefer speed or size.', NULL, 2, 1, 750, 12, 12, 2475),
('76b4d67d-4854-474a-b012-3d2c1041349b', 'RSI_Mantis_EMP_Device', 'TroMag Burst Generator', 'Manufacturer: MaxOx
Item Type: Burst Generator
Size: 1
Damage Type: EMP

The TroMag from MaxOx is a well-designed and reliable EMP-focused burst generator. Its popularity has risen over the years as pilots look for alternatives to Behring’s REP-8. The TroMag boasts a faster charge time than their main competitor but has a smaller effective radius, leaving pilots to decide whether they prefer speed or size.', NULL, 2, 1, 750, 12, 12, 1800),
('3d521e8c-4249-4987-b544-d32634ab0d2a', 'RSI_Scorpius_EMP_Device', 'Magstrand EMP Generator', 'Item Type: Burst Generator
Manufacturer: RSI
Size: 4

The Magstrand from RSI is an EMP burst generator designed specifically for the Scorpius Antares. When fully charged, the device creates a powerful wave of distortion damage that can disable electric components within its blast radius.', NULL, 4, 1, 1100, 22, 16, 3300),
('19210f79-9618-42e0-9b88-6f59cad9fe2c', 'AEGS_EMP_Sentinel_S4', 'REP-VS EMP Generator', 'Manufacturer: Behring
Item Type: Burst Generator
Size: 4
Damage Type: EMP

Deliver distortion damage with the REP-VS burst generator built specifically for the Aegis Vanguard Sentinel. Behring modified the technology used in their reputable REP-8 to design an effective non-lethal weapon that integrates seamlessly with the Sentinel.', NULL, 4, 1, 900, 26, 40, 3300)
ON CONFLICT (id) DO UPDATE SET 
name = EXCLUDED.name, radius = EXCLUDED.radius, distortion_damage = EXCLUDED.distortion_damage;

