-- Merge 318 duplicate lens records into their surviving twin.
--
-- Candidates come from docs/redesign/research/duplicates.md: same brand, same
-- mount, same year and same focal length, aperture and weight, differing only
-- in word order or punctuation ("Nikon Nikkor Z MC 105mm F/2.8 VR S" and
-- "Nikon NIKKOR Z 105mm F/2.8 VR MC S"). Version markers such as [I], [II] and
-- [MC] are treated as significant, so distinct generations are NOT merged.
--
-- The attached data moves first. Setting merged_into_id alone would have taken
-- 2,600 sale records, 318 mount rows and 160 memberships out of circulation,
-- leaving survivors with worse prices than before the merge.
--
-- The pairs live in a scratch table rather than a repeated VALUES list: at
-- 318 rows inlined nine times the file reached 63 KB, which drizzle-kit
-- accepted and then silently declined to run.
--
-- Reversible: null merged_into_id to restore a row. Safe to rerun; every
-- statement is a no-op once applied.

CREATE TABLE IF NOT EXISTS lens_merge_map (
  loser integer PRIMARY KEY,
  survivor integer NOT NULL
);

--> statement-breakpoint

INSERT INTO lens_merge_map (loser, survivor) VALUES (278,257),(19005,257),(3252,3005),(3372,3005),(18467,997),(19001,251),(19668,6316),(19666,6344),(19462,5683),(19217,4877),(19700,6846),(3759,3760),(18987,3608),(19415,5352),(7709,17761),(19940,8006),(18553,1832),(19933,7968),(19015,271),(19407,5343),(17952,6755),(18967,3477),(4627,17543),(19014,269),(5565,2321),(3463,9),(18985,3622),(1781,1779),(2260,17804),(3766,3767),(2555,2556),(20088,8171),(6173,6172),(20167,8390),(3807,3808),(18882,17475),(19841,328),(7900,19929),(7610,7611),(18531,1704),(3366,3368),(19939,8005),(19932,7962),(3356,3361),(19000,250),(19011,263),(5563,2317),(18863,2441),(19875,7612),(4397,4399),(7609,17801),(2129,2128),(5559,2322),(6751,17951),(934,17638),(6936,6931),(19129,4096),(19133,4099),(19836,321),(18536,1713),(18543,1726),(3062,3063),(19941,8007),(5355,19417),(19691,6850),(18377,786),(19413,5351),(18966,3423),(8613,8647),(6171,17878),(19343,5144),(18482,999),(18378,856),(19359,5216),(20111,8297),(19965,8077),(6676,17870),(1926,1925),(18971,3669),(4261,17929),(19117,3840),(875,877),(19008,3571),(19344,5118),(18861,2564),(19119,3839),(19926,5519),(19118,3838),(19125,3921),(19126,3923),(19127,3924),(19130,4121),(19132,4098),(19025,301),(19160,313),(6429,6342),(19966,8078),(3782,3781),(4973,4970),(19908,13),(18546,1830),(19340,5032),(19346,5124),(19930,7904),(19016,273),(19845,332),(3739,3738),(5342,19409),(8298,8299),(19967,8082),(19708,6899),(19342,5142),(19688,6642),(19692,6849),(19709,6925),(19842,329),(19131,4097),(6464,6432),(20091,8215),(18986,3623),(5560,2313),(19341,5033),(19839,326),(19838,324),(19843,330),(6491,6492),(18991,3612),(19925,5506),(18992,3613),(19924,5500),(19928,7899),(19937,8003),(19971,8086),(18539,1718),(19963,8075),(20160,8381),(19345,5119),(19347,5139),(3731,3732),(18557,1834),(18533,1707),(20141,8517),(20157,8375),(19002,252),(7991,7990),(19360,5217),(19361,5223),(4435,4437),(19665,6343),(19667,6315),(19876,7613),(5562,2316),(5022,5017),(5127,5088),(18988,3621),(18993,238),(18994,240),(18999,248),(18997,244),(18998,246),(19006,258),(19003,254),(19004,256),(19027,3626),(19009,259),(19010,261),(19017,280),(5636,5635),(19938,8004),(18537,1715),(19852,338),(18354,350),(18538,1717),(1936,1938),(1937,1935),(3300,3266),(12,2312),(18379,895),(19026,3609),(18444,1334),(18480,998),(18488,1000),(3751,3752),(18547,1831),(3823,3824),(18558,1835),(18995,241),(19128,3926),(19222,4878),(19672,6347),(19687,6847),(19846,333),(19840,327),(19850,335),(19942,8010),(19349,5140),(19690,6848),(19909,14),(20089,8198),(20143,8514),(20142,8519),(18515,1652),(19537,5817),(19968,8084),(19931,7961),(18974,213),(2318,5564),(3502,3482),(5561,2315),(5558,5566),(18996,243),(19012,265),(19013,267),(7806,7804),(18541,1722),(18535,1711),(18554,1833),(1818,1819),(18977,225),(1207,1205),(1443,1446),(18544,1727),(18593,1909),(1924,1927),(2240,2239),(2559,2560),(2557,2558),(2875,2876),(2958,2959),(2983,2984),(3276,3272),(3338,3336),(3615,3596),(3815,3814),(4422,17918),(5146,5151),(19410,5347),(5350,19414),(19416,5353),(19419,5357),(5349,19412),(5639,5641),(18981,233),(6346,6430),(6474,6466),(6475,6468),(6470,6476),(20170,8395),(20164,8387),(6645,17909),(6652,17867),(6667,17876),(6662,20515),(6668,17905),(6666,17848),(6664,17897),(6673,20516),(6674,17812),(18540,1720),(6756,17950),(18975,224),(18980,230),(18982,235),(19970,8085),(19969,8088),(20090,8213),(8291,8294),(8310,8300),(20159,8380),(8374,20155),(20158,8379),(20162,8383),(20163,8384),(20165,8388),(20172,8401),(20174,8403),(19019,284),(18532,1706),(18534,1709),(18542,1724),(20169,8525),(8660,8610),(20512,2269),(2561,2562),(3545,3554),(5340,19408),(4250,17930),(3334,3344),(19423,5486),(20153,8523),(4241,17928),(4528,4529),(20152,8521),(5108,5134),(5345,19411),(6643,17908),(6644,17860),(7154,7155),(19536,5800),(8286,8285),(8289,8288),(8322,8323),(20154,8372),(20166,8389),(20161,8382),(20168,8391),(20171,8399),(8516,8486),(3664,3470),(3264,3293),(5071,5138),(19405,5361),(19024,299),(19020,286),(19022,294),(19021,291),(19023,297),(3617,3630)
ON CONFLICT (loser) DO NOTHING;

--> statement-breakpoint

-- 1a. Duplicate records captured the same eBay sale twice, once against each
-- twin, so the market data was inflated. price_history is unique on
-- (entity_type, entity_id, source_url), and moving both copies onto one
-- survivor would violate it. Drop a loser's copy when the survivor already
-- holds that sale, or when an earlier loser row for the same survivor does.
DELETE FROM price_history p
USING lens_merge_map m
WHERE p.entity_type = 'lens'
  AND p.entity_id = m.loser
  AND p.source_url IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM price_history s
      WHERE s.entity_type = 'lens'
        AND s.entity_id = m.survivor
        AND s.source_url = p.source_url
    )
    OR EXISTS (
      SELECT 1 FROM price_history o
      JOIN lens_merge_map om ON om.loser = o.entity_id
      WHERE o.entity_type = 'lens'
        AND om.survivor = m.survivor
        AND o.source_url = p.source_url
        AND o.id < p.id
    )
  );

--> statement-breakpoint

-- 1b. What remains moves across, so the survivor's price keeps its evidence.
UPDATE price_history p SET entity_id = m.survivor
FROM lens_merge_map m
WHERE p.entity_type = 'lens' AND p.entity_id = m.loser;

--> statement-breakpoint

-- 2. Mounts the survivor did not already list.
INSERT INTO lens_systems (lens_id, system_id)
SELECT m.survivor, ls.system_id
FROM lens_systems ls JOIN lens_merge_map m ON ls.lens_id = m.loser
ON CONFLICT DO NOTHING;

--> statement-breakpoint

-- 3. Collection and series memberships.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT m.survivor, lc.collection_id
FROM lens_collections lc JOIN lens_merge_map m ON lc.lens_id = m.loser
ON CONFLICT DO NOTHING;

--> statement-breakpoint

INSERT INTO lens_series_memberships (lens_id, series_id)
SELECT m.survivor, lsm.series_id
FROM lens_series_memberships lsm JOIN lens_merge_map m ON lsm.lens_id = m.loser
ON CONFLICT DO NOTHING;

--> statement-breakpoint

-- 4. Ratings, unless that visitor already rated the survivor.
INSERT INTO lens_ratings (lens_id, ip_hash, rating, created_at)
SELECT m.survivor, r.ip_hash, r.rating, r.created_at
FROM lens_ratings r JOIN lens_merge_map m ON r.lens_id = m.loser
ON CONFLICT ON CONSTRAINT uq_lens_ratings_lens_ip DO NOTHING;

--> statement-breakpoint

-- 5. Comparisons naming a merged row would go self-referential or collide.
DELETE FROM lens_comparisons c
USING lens_merge_map m
WHERE c.lens_id_1 = m.loser OR c.lens_id_2 = m.loser;

--> statement-breakpoint

-- 6. Fill gaps in the survivor from the row being merged away.
UPDATE lenses s SET
  description          = coalesce(s.description, l.description),
  year_introduced      = coalesce(s.year_introduced, l.year_introduced),
  weight_g             = coalesce(s.weight_g, l.weight_g),
  filter_size_mm       = coalesce(s.filter_size_mm, l.filter_size_mm),
  min_focus_distance_m = coalesce(s.min_focus_distance_m, l.min_focus_distance_m),
  max_magnification    = coalesce(s.max_magnification, l.max_magnification),
  lens_elements        = coalesce(s.lens_elements, l.lens_elements),
  lens_groups          = coalesce(s.lens_groups, l.lens_groups),
  diaphragm_blades     = coalesce(s.diaphragm_blades, l.diaphragm_blades),
  coverage             = coalesce(s.coverage, l.coverage),
  era                  = coalesce(s.era, l.era),
  production_status    = coalesce(s.production_status, l.production_status),
  images               = CASE
                           WHEN s.images IS NULL OR jsonb_array_length(s.images) = 0
                           THEN l.images ELSE s.images END
FROM lens_merge_map m JOIN lenses l ON l.id = m.loser
WHERE s.id = m.survivor;

--> statement-breakpoint

-- 7. The merge itself. The entity page already follows this with a 308.
UPDATE lenses SET merged_into_id = m.survivor
FROM lens_merge_map m
WHERE lenses.id = m.loser AND lenses.merged_into_id IS NULL;

--> statement-breakpoint

-- 8. Rating aggregates on survivors that gained ratings.
UPDATE lenses s SET rating_count = agg.n, average_rating = agg.avg
FROM lens_merge_map m,
LATERAL (
  SELECT count(*)::int n, avg(rating)::real avg
  FROM lens_ratings r WHERE r.lens_id = m.survivor
) agg
WHERE s.id = m.survivor AND agg.n > 0;

--> statement-breakpoint

-- 9. Superseded estimates on the merged rows.
DELETE FROM price_estimates p
USING lens_merge_map m
WHERE p.entity_type = 'lens' AND p.entity_id = m.loser;

--> statement-breakpoint

DROP TABLE lens_merge_map;
