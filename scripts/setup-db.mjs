import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Parse .env manually (no dotenv dependency needed for this simple case)
const envText = readFileSync(path.join(root, '.env'), 'utf8')
const env = Object.fromEntries(
  envText.split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
})

// Verify connectivity by checking if the bundles table exists
const { error: pingError } = await supabase.from('bundles').select('bundle_id').limit(1)
if (pingError) {
  if (pingError.code === '42P01') {
    console.error('\n✗ Tables do not exist yet.')
    console.error('  Run the DDL first in the Supabase SQL Editor:')
    console.error(`  https://supabase.com/dashboard/project/${SUPABASE_URL.split('//')[1].split('.')[0]}/sql/new`)
    console.error('  Paste the contents of: supabase/migrations/20260515000000_initial_schema.sql\n')
  } else {
    console.error('✗ Connection error:', pingError.message)
  }
  process.exit(1)
}
console.log('✓ Connected to Supabase — tables confirmed')

// -----------------------------------------------------------------------
// Clear existing seed data (items first — FK dependency)
// -----------------------------------------------------------------------
await supabase.from('items').delete().neq('item_id', '00000000-0000-0000-0000-000000000000')
await supabase.from('bundles').delete().neq('bundle_id', '00000000-0000-0000-0000-000000000000')
console.log('✓ Cleared existing data')

// -----------------------------------------------------------------------
// Seed: Bundles (insert first — items FK references these exact UUIDs)
// -----------------------------------------------------------------------
const bundles = [
  {
    bundle_id: 'b9000000-0000-0000-0000-000000000009',
    bundle_name: "PEZ Collector's Series Lot",
    bundle_price_ebay: 95.00,
    bundle_price_fb: 60.00,
    bundle_description_short: "PEZ Collector's Series lot: Star Trek TNG 25th (8pc), Wizard of Oz 70th Anniv (8pc), KISS tin (4pc), Star Wars Darth Vader tin (4pc).",
    bundle_description_long: "<p>PEZ Collector's Series lot — 4 sets, all limited edition. Includes: Star Trek: The Next Generation 25th Anniversary 8-dispenser boxed set (numbered limited edition); Wizard of Oz 70th Anniversary 8-dispenser boxed set (numbered limited edition of 300,000); KISS Limited Edition 4-dispenser collector's metal tin (Gene Simmons, Paul Stanley, Peter Criss, Ace Frehley); Star Wars Limited Edition Darth Vader helmet tin with 4 crystal dispensers (Darth Vader, R2-D2, C-3PO, Yoda). All sets sealed/near-mint condition. Ships USPS flat rate.</p>",
    rationale: "Same product type — all PEZ Collector's Series limited edition gift sets",
    status: 'PendingReview'
  },
  {
    bundle_id: 'b1000000-0000-0000-0000-000000000010',
    bundle_name: 'Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates Collection (Sets 1-9)',
    bundle_price_ebay: 62.00,
    bundle_price_fb: 35.00,
    bundle_description_short: 'Bradford Exchange NFL 75th Anniversary All-Time Team mini plate collection by Merv Corning — 9 sets (18 plates), each with COA. Sets 1-9 present.',
    bundle_description_long: '<p>Bradford Exchange NFL 75th Anniversary All-Time Team mini plate collection by artist Merv Corning — 9 two-plate sets (18 total mini plates), each with original Certificate of Authenticity. Sets included: 1 Gale Sayers/Jack Lambert, 2 Bob Lilly/Johnny Unitas, 3 Ray Nitschke/Mike Webster, 4 Forrest Gregg/Joe Greene, 5 Raymond Berry/Mel Blount, 6 Marion Motley/Willie Lanier, 7 Kellen Winslow/Gino Marchetti, 8 John Hannah/Larry Wilson, 9 Don Hutson/Dick \'Night Train\' Lane. All plates approx 3.5 inches diameter, gold rim, officially NFL licensed 1995-1996. Ships USPS flat rate padded.</p>',
    rationale: 'Same series/collection — all Bradford Exchange NFL 75th Anniversary All-Time Team mini plates with COAs',
    status: 'PendingReview'
  }
]

const { error: bundlesErr } = await supabase.from('bundles').insert(bundles)
if (bundlesErr) {
  console.error('✗ Bundle insert failed:', bundlesErr.message)
  process.exit(1)
}
console.log(`✓ Inserted ${bundles.length} bundles`)

// -----------------------------------------------------------------------
// Seed: Items
// Note: category values mapped to match schema CHECK constraint:
//   "Books"         → "Books & Media"
//   "Crafts"        → "Other"
//   "Art"           → "Other"
//   "Sporting Goods"→ "Other"
// -----------------------------------------------------------------------
const items = [
  {
    item_name: "Workman Mini House Book Noah's Ark by Peter Lippman",
    brand: 'Workman Publishing',
    category: 'Books & Media', // seed had "Books" — mapped to schema value
    subcategory: "Children's Books / Board Books",
    condition_raw: 'Good',
    condition_ebay: 'Good',
    condition_notes: "Ark-shaped die-cut board book, opens accordion-style. Binding/latch intact. Some wear on exterior edges and cover consistent with use. Interior pages colorful and intact. From the 2.2M copy bestselling Mini House series.",
    is_complete: true,
    keywords: ["Noah's Ark", 'Mini House Book', 'Peter Lippman', 'Workman', 'board book', 'die cut', "children's book", 'collectible book'],
    ebay_search_query: "Mini House Book Noah's Ark Peter Lippman Workman",
    ebay_comps_count: 4,
    ebay_comp_price_median: 9.00,
    ebay_comp_price_range: '$6–$14',
    ebay_price: 9.99,
    list_price_final: 9.99,
    price_confidence: 'Medium',
    description_short: "Workman Mini House Book Noah's Ark by Peter Lippman. Die-cut ark-shaped board book. Used/Good condition.",
    description_long: "<p><strong>Workman Mini House Book: Noah's Ark by Peter Lippman</strong></p><p>The beloved die-cut ark-shaped board book from Peter Lippman's 2.2-million-copy bestselling Mini House series. Opens accordion-style to reveal Noah and a colorful cast of animals on a 40-day cruise. A classic children's collectible from Workman Publishing (1994).</p><p>Condition: Good — exterior shows light wear on edges, interior pages bright and intact, latch functional.</p><p>Ships USPS Media Mail or First Class.</p>",
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  {
    item_name: "Noah's Ark Wood Folk Art Wall Plaque Primitive Decoupage",
    brand: null,
    category: 'Collectibles',
    subcategory: "Noah's Ark / Folk Art / Home Decor",
    condition_raw: 'Good',
    condition_ebay: 'Good',
    condition_notes: 'Rectangular wood plank with decoupage/painted folk art scene: ark with red house, animals two-by-two (horses, bears, lions, sheep, elephants, zebra, giraffe, rabbit, cow, deer). Raffia bow hanger at top. Warm golden-tan tones. Some edge wear and surface patina. Approx 10x5 inches based on photo proportion.',
    is_complete: true,
    keywords: ["Noah's Ark", 'folk art', 'wood plaque', 'wall hanging', 'primitive', 'decoupage', 'animals', 'Christian', 'religious', 'rustic', 'farmhouse'],
    ebay_search_query: "Noah's Ark wood folk art wall plaque primitive decoupage animals",
    ebay_comps_count: 4,
    ebay_comp_price_median: 20.00,
    ebay_comp_price_range: '$12–$32',
    ebay_price: 19.99,
    list_price_final: 19.99,
    price_confidence: 'Medium',
    description_short: "Noah's Ark folk art wood wall plaque. Animals two-by-two, primitive decoupage scene. Raffia hanger. Good condition.",
    description_long: "<p><strong>Noah's Ark Primitive Folk Art Wood Wall Plaque</strong></p><p>Charming rectangular wood plank featuring a folk art Noah's Ark scene with animals two-by-two: horses, bears, lions, sheep, elephants, zebra, giraffe, rabbit, cows, and deer surrounding the ark with a red house on top. Warm golden tones, decoupage or painted technique. Raffia bow at top for hanging.</p><p>Condition: Good — edge wear consistent with age, surface patina, no major damage.</p><p>Perfect for farmhouse, country, or religious decor. Ships USPS flat rate.</p>",
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  {
    item_name: 'Russian Matryoshka Nesting Dolls 4-Piece Set Hand Painted Floral',
    brand: null,
    category: 'Collectibles',
    subcategory: 'Folk Art / Russian Dolls',
    condition_raw: 'Good',
    condition_ebay: 'Good',
    condition_notes: '4-piece set. Traditional Semyonov-style. Yellow/ochre ground with red floral (hibiscus/poppy) and green leaf decoration. Red base/top trim. Largest approx 4-5 inches. Hand painted. Paint wear on largest piece visible. All 4 pieces nest correctly.',
    is_complete: true,
    keywords: ['matryoshka', 'nesting dolls', 'Russian', 'babushka', 'hand painted', 'vintage', 'folk art', 'floral', 'Semyonov'],
    ebay_search_query: 'Russian matryoshka nesting dolls 4 piece hand painted floral vintage',
    ebay_comps_count: 5,
    ebay_comp_price_median: 18.00,
    ebay_comp_price_range: '$12–$28',
    ebay_price: 18.99,
    list_price_final: 18.99,
    price_confidence: 'Medium',
    price_override_reason: '4-piece sets have lower demand than 5+ piece sets. No maker\'s mark visible. Standard Semyonov-style pricing.',
    description_short: 'Russian matryoshka nesting dolls, 4-piece set. Hand painted floral on yellow/ochre ground. Traditional Semyonov style.',
    description_long: '<p><strong>Russian Matryoshka Nesting Dolls — 4-Piece Hand Painted Set</strong></p><p>Traditional Russian nesting dolls (matryoshka/babushka) in classic Semyonov style. Yellow/ochre ground decorated with bold red floral (hibiscus/poppy) and green leaf motifs. Red base trim. All four dolls nest correctly. Largest approximately 4–5 inches tall.</p><p>Condition: Good — hand painted finish shows light wear on largest doll, intact overall.</p><p>Ships USPS First Class with padding.</p>',
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  {
    item_name: "PEZ Star Trek The Next Generation 25th Anniversary Collector's Series 8-Dispenser Set",
    brand: 'PEZ',
    category: 'Collectibles',
    subcategory: 'PEZ / Limited Edition Sets',
    condition_raw: 'VeryGood',
    condition_ebay: 'Like New',
    condition_notes: "PEZ Collector's Series Star Trek TNG 25th Anniversary limited edition boxed set. 8 dispensers: Picard, Riker, Data, Troi, La Forge, Crusher, Worf, and USS Enterprise NCC-1701-D. Numbered limited edition (049151 of 200,000 visible on sticker). Box shows some shelf wear. Dispensers appear sealed inside packaging.",
    is_complete: true,
    keywords: ['PEZ', 'Star Trek', 'Next Generation', 'TNG', '25th anniversary', 'limited edition', "collector's series", 'Picard', 'Data', 'Worf', 'Enterprise'],
    ebay_search_query: "PEZ Star Trek Next Generation 25th anniversary collector's series limited edition",
    ebay_comps_count: 5,
    ebay_comp_price_median: 22.00,
    ebay_comp_price_range: '$15–$30',
    ebay_price: 22.99,
    list_price_final: 22.99,
    price_confidence: 'High',
    description_short: 'PEZ Star Trek TNG 25th Anniversary Collector\'s Series. 8 dispensers, limited edition numbered set (#049151/200,000). Box shows shelf wear.',
    description_long: "<p><strong>PEZ Collector's Series — Star Trek: The Next Generation 25th Anniversary</strong></p><p>Limited edition 8-dispenser boxed set celebrating the 25th anniversary of Star Trek: The Next Generation. Includes dispensers for: Jean-Luc Picard, William T. Riker, Data, Deanna Troi, Geordi La Forge, Beverly Crusher, Worf, and the USS Enterprise NCC-1701-D. Numbered limited edition — this set is #049,151 of 200,000. Made in USA.</p><p>Condition: Very Good — dispensers intact in original packaging, box has light shelf wear.</p><p>Ships USPS flat rate with padding.</p>",
    listing_mode: 'Bundle',
    bundle_id: 'b9000000-0000-0000-0000-000000000009',
    status: 'PendingReview'
  },
  {
    item_name: "PEZ Wizard of Oz 70th Anniversary Collector's Series 8-Dispenser Limited Edition Set",
    brand: 'PEZ',
    category: 'Collectibles',
    subcategory: 'PEZ / Limited Edition Sets',
    condition_raw: 'VeryGood',
    condition_ebay: 'Like New',
    condition_notes: "PEZ Collector's Series Wizard of Oz 70th Anniversary limited edition boxed set. 8 dispensers: Dorothy, Scarecrow, Tin Man, Cowardly Lion, Glinda, Wicked Witch, Toto, and the Wizard. Numbered limited edition of 300,000. Box has some corner wear/denting noted on side panel. Dispensers appear sealed.",
    is_complete: true,
    keywords: ['PEZ', 'Wizard of Oz', '70th anniversary', 'limited edition', "collector's series", 'Dorothy', 'Scarecrow', 'Tin Man', 'Wicked Witch', 'Warner Bros'],
    ebay_search_query: "PEZ Wizard of Oz 70th anniversary limited edition collector's series 300000",
    ebay_comps_count: 6,
    ebay_comp_price_median: 22.00,
    ebay_comp_price_range: '$15–$32',
    ebay_price: 21.99,
    list_price_final: 21.99,
    price_confidence: 'High',
    description_short: "PEZ Wizard of Oz 70th Anniversary Collector's Series. 8 dispensers, numbered limited edition of 300,000. Box has some corner wear.",
    description_long: "<p><strong>PEZ Collector's Series — The Wizard of Oz 70th Anniversary</strong></p><p>Limited edition 8-dispenser boxed set celebrating the 70th anniversary of the classic film. Includes dispensers for: Dorothy, Scarecrow, Tin Man, Cowardly Lion, Glinda the Good Witch, the Wicked Witch, Toto, and the Wizard. Numbered limited edition of 300,000. Made in USA. Warner Bros. licensed.</p><p>Condition: Very Good — dispensers sealed in packaging, box shows light corner wear on side panel.</p><p>Ships USPS flat rate with padding.</p>",
    listing_mode: 'Bundle',
    bundle_id: 'b9000000-0000-0000-0000-000000000009',
    status: 'PendingReview'
  },
  {
    item_name: "PEZ KISS Limited Edition 4-Piece Collector's Tin Set",
    brand: 'PEZ',
    category: 'Collectibles',
    subcategory: 'PEZ / Limited Edition Sets',
    condition_raw: 'VeryGood',
    condition_ebay: 'Like New',
    condition_notes: "KISS PEZ Limited Edition 4-dispenser set in square collector's metal tin. Features all 4 original KISS members: Gene Simmons (Demon), Paul Stanley (Starchild), Peter Criss (Catman), Ace Frehley (Spaceman). Tin in good shape — some surface scuffs visible. Dispensers appear sealed inside.",
    is_complete: true,
    keywords: ['PEZ', 'KISS', 'rock band', 'limited edition', "collector's tin", 'Gene Simmons', 'Paul Stanley', 'Ace Frehley', 'Peter Criss', 'music memorabilia'],
    ebay_search_query: "PEZ KISS limited edition 4pc collector's tin Gene Simmons",
    ebay_comps_count: 5,
    ebay_comp_price_median: 20.00,
    ebay_comp_price_range: '$15–$28',
    ebay_price: 19.99,
    list_price_final: 19.99,
    price_confidence: 'High',
    description_short: "PEZ KISS Limited Edition 4-pc collector's metal tin. All 4 original members. Tin shows light scuffs, dispensers sealed.",
    description_long: "<p><strong>PEZ KISS Limited Edition 4-Piece Collector's Tin</strong></p><p>The iconic KISS band in PEZ form! Limited edition set featuring all four original members in a collectible metal tin: Gene Simmons (The Demon), Paul Stanley (The Starchild), Peter Criss (The Catman), and Ace Frehley (The Spaceman). Classic KISS logo artwork on tin. Made in USA.</p><p>Condition: Very Good — dispensers sealed inside packaging, tin exterior shows light surface scuffs.</p><p>Ships USPS flat rate with padding.</p>",
    listing_mode: 'Bundle',
    bundle_id: 'b9000000-0000-0000-0000-000000000009',
    status: 'PendingReview'
  },
  {
    item_name: 'PEZ Star Wars Limited Edition Darth Vader Helmet Tin 4-Piece Set (Crystal Dispensers)',
    brand: 'PEZ',
    category: 'Collectibles',
    subcategory: 'PEZ / Limited Edition Sets',
    condition_raw: 'VeryGood',
    condition_ebay: 'Like New',
    condition_notes: '2015 Star Wars PEZ limited edition set. Darth Vader helmet-shaped tin container holds 4 crystal (translucent) dispensers: Darth Vader, R2-D2, C-3PO, and Yoda. Tin in excellent shape — no dents observed. Dispensers are crystal/translucent style unique to this 2015 limited edition set. Sealed.',
    is_complete: true,
    keywords: ['PEZ', 'Star Wars', 'Darth Vader', 'limited edition', 'tin', 'crystal', 'R2-D2', 'C-3PO', 'Yoda', '2015', "collector's set", 'Disney'],
    ebay_search_query: 'PEZ Star Wars limited edition Darth Vader tin crystal 2015 R2D2 C3PO Yoda',
    ebay_comps_count: 5,
    ebay_comp_price_median: 16.00,
    ebay_comp_price_range: '$12–$22',
    ebay_price: 16.99,
    list_price_final: 16.99,
    price_confidence: 'High',
    description_short: 'PEZ Star Wars 2015 Limited Edition Darth Vader helmet tin. 4 crystal dispensers: Vader, R2-D2, C-3PO, Yoda. Sealed.',
    description_long: '<p><strong>PEZ Star Wars Limited Edition — Darth Vader Helmet Tin Set (2015)</strong></p><p>The 2015 Star Wars PEZ limited edition collector\'s set housed in a Darth Vader helmet-shaped tin. Includes 4 crystal (translucent) dispensers: Darth Vader, R2-D2, C-3PO, and Yoda. Crystal heads are unique to this limited release. Tin in excellent condition with no dents. Made in USA.</p><p>Condition: Very Good — sealed, tin excellent, dispensers intact.</p><p>Ships USPS flat rate with padding.</p>',
    listing_mode: 'Bundle',
    bundle_id: 'b9000000-0000-0000-0000-000000000009',
    status: 'PendingReview'
  },
  {
    item_name: 'Large Papier-Mâché Rocking Horse Unpainted Craft Blank',
    brand: null,
    category: 'Other', // seed had "Crafts" — mapped to schema value
    subcategory: 'Paper Mache / Craft Blanks',
    condition_raw: 'Good',
    condition_ebay: 'Good',
    condition_notes: 'Large papier-mâché rocking horse on double-rocker base. Unpainted/natural tan finish — craft blank for decorating, decoupage, or painting. Approx 12–14 inches tall. Surface shows typical papier-mâché texture and light handling marks. No cracks or missing pieces. Two photos confirm good structural integrity.',
    is_complete: true,
    keywords: ['papier mache', 'paper mache', 'rocking horse', 'craft blank', 'unpainted', 'decoupage', 'folk art', 'nursery decor', 'decopatch'],
    ebay_search_query: 'large papier mache rocking horse unpainted craft blank',
    ebay_comps_count: 4,
    ebay_comp_price_median: 18.00,
    ebay_comp_price_range: '$12–$28',
    ebay_price: 18.99,
    list_price_final: 18.99,
    price_confidence: 'Medium',
    price_override_reason: 'Craft blank market is niche — Etsy has stronger demand than eBay for this type. Consider listing on Etsy also at $22–28.',
    description_short: 'Large papier-mâché rocking horse craft blank. Unpainted, ready to decorate. Approx 12–14 inches. Good condition.',
    description_long: '<p><strong>Large Papier-Mâché Rocking Horse — Craft Blank</strong></p><p>Beautiful large papier-mâché rocking horse on double-rocker base, unpainted and ready for your creative touch. Perfect for decoupage, painting, mixed media, or folk art projects. Stands approximately 12–14 inches tall.</p><p>Condition: Good — natural tan papier-mâché finish, light handling marks consistent with storage, structurally sound with no cracks or missing pieces.</p><p>Ships USPS flat rate with careful padding.</p>',
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  {
    item_name: "Handmade Wood Noah's Ark Wall Display Shelf with 18 Carved Wooden Animals",
    brand: null,
    category: 'Collectibles',
    subcategory: "Noah's Ark / Folk Art / Home Decor",
    condition_raw: 'VeryGood',
    condition_ebay: 'Very Good',
    condition_notes: "Oak or hardwood ark-shaped wall shelf with multiple tiered display levels and center house structure. Comes with approximately 18 hand-cut wooden animal figures (pairs: elephants x2, giraffes x2, cows x2, hippos x2, ducks x2, bears/lions x2, camels x2, horses/zebras x2, plus Noah figure with staff). Two wall-mount D-ring hooks on back. Very good condition — wood warm and clean, animals all present. Approx 24–26 inches wide x 14–16 inches tall. Appears handmade/artisan quality.",
    is_complete: true,
    keywords: ["Noah's Ark", 'wood shelf', 'wall shelf', 'curio shelf', 'wooden animals', 'handmade', 'folk art', 'Christian', 'religious decor', 'nursery decor', 'oak'],
    ebay_search_query: "handmade wood Noah's Ark wall shelf curio wooden animals folk art",
    ebay_comps_count: 5,
    ebay_comp_price_median: 55.00,
    ebay_comp_price_range: '$35–$85',
    ebay_price: 54.99,
    list_price_final: 54.99,
    price_confidence: 'Medium',
    price_override_reason: 'Handmade artisan quality with full animal set commands premium. Wide comp range. Priced mid-market.',
    description_short: "Handmade oak Noah's Ark wall display shelf with 18 carved wooden animals and Noah figure. Very Good condition. Approx 24-26 inches wide.",
    description_long: "<p><strong>Handmade Wood Noah's Ark Wall Display Shelf with Carved Animal Set</strong></p><p>Beautifully crafted hardwood (oak) Noah's Ark-shaped tiered wall display shelf. The ark features multiple display levels with a center house/cabin structure, two bow/stern sections, and D-ring wall mount hardware. Includes approximately 18 hand-cut wooden animal figures in pairs: elephants, giraffes, cows, hippos, ducks, bears, camels, zebras/horses, and a Noah figure with staff. All animals fit neatly on the tiered shelves.</p><p>Condition: Very Good — warm honey oak finish, animals present and intact, clean overall.</p><p>Approximate size: 24–26 inches wide x 14–16 inches tall. Ships carefully boxed USPS flat rate (multiple boxes may be needed).</p>",
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  {
    item_name: 'Guillows Giant Scale Balsa Flying Model Kit — Chance Vought F4U-4 Corsair #1004',
    brand: 'Guillows / Paul K. Guillow Inc.',
    category: 'Toys & Hobbies',
    subcategory: 'Model Kits / Balsa Aircraft',
    condition_raw: 'Good',
    condition_ebay: 'Good',
    condition_notes: 'Guillows Kit 1004 — Chance Vought F4U-4 Corsair. Giant scale balsa flying model. 30.75 inch wingspan, 1:16 scale. Open box — all major components visible and appear present: balsa wood sheets (scored/die-cut), vacuum-formed plastic parts (cowl, cockpit, wheels), tissue/covering paper, decal sheet (US star roundels, #42 markings), plans/blueprints, rubber band motor, wire, hardware bag. Box shows heavy wear/crushing on corners and edges. Contents appear unstarted. ⚠️ NEEDS COMPLETENESS VERIFICATION before listing — standard flagged action item.',
    is_complete: null,
    keywords: ['Guillows', "Guillow's", 'F4U-4 Corsair', 'balsa model', 'flying model kit', 'WWII aircraft', 'airplane model', 'kit 1004', 'Chance Vought', 'balsa wood'],
    ebay_search_query: 'Guillows F4U-4 Corsair 1004 balsa flying model kit',
    ebay_comps_count: 6,
    ebay_comp_price_median: 52.00,
    ebay_comp_price_range: '$35–$75 open box / $80–$120 sealed',
    ebay_price: 44.99,
    list_price_final: 44.99,
    price_confidence: 'Low',
    price_override_reason: 'Open box — must verify all balsa sheets, vacuum parts, decals, plans, rubber motor, and hardware are present and unstarted before listing. Priced conservatively for open box.',
    description_short: 'Guillows Kit #1004 Chance Vought F4U-4 Corsair giant scale balsa flying model. Open box, appears unstarted. Verify completeness before listing.',
    description_long: "<p><strong>Guillows Giant Scale Balsa Flying Model Kit — Chance Vought F4U-4 Corsair #1004</strong></p><p>Classic Guillows Kit #1004: the Chance Vought F4U-4 Corsair, the WWII U.S. Navy and Marine fighter nicknamed 'Whistling Death.' Giant scale at 30¾ inch wingspan, 1:16 scale. Multi-purpose model — can be built as rubber-powered free-flight, U-control, or static display.</p><p>Contents include: die-cut balsa wood sheets, vacuum-formed plastic detail parts (cowl, cockpit canopy, wheels, armament), tissue covering, full decal sheet (US star roundels, #42 markings), main plans and detail plans, rubber band motor, wire, and hardware.</p><p>Condition: Open box, appears unstarted. Box shows heavy wear. Contents pending completeness verification.</p><p>Ships USPS flat rate.</p>",
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  {
    item_name: 'Pillowfort Felt Shark Head Plush Wall Mount Faux Taxidermy — Target Exclusive',
    brand: 'Pillowfort / Target',
    category: 'Toys & Hobbies',
    subcategory: 'Stuffed Animals / Kids Room Decor',
    condition_raw: 'VeryGood',
    condition_ebay: 'Like New',
    condition_notes: 'Pillowfort brand (Target exclusive) large felt shark head wall mount. Gray felt construction, white felt teeth, hand-stitched seams, button eye, pectoral fin details. Appears to be the larger version — approx 14-18 inches from snout to dorsal fin. Mount backing present with fabric loop for wall hanging. Very Good to Like New condition — clean, no staining, no damage to felt or stitching. Removed from wall for photos.',
    is_complete: true,
    keywords: ['Pillowfort', 'shark', 'wall mount', 'faux taxidermy', 'felt', 'plush', 'Target', 'nursery decor', 'kids room', 'shark week', 'ocean decor'],
    ebay_search_query: 'Pillowfort shark head wall mount plush faux taxidermy Target',
    ebay_comps_count: 5,
    ebay_comp_price_median: 22.00,
    ebay_comp_price_range: '$15–$35',
    ebay_price: 24.99,
    list_price_final: 24.99,
    price_confidence: 'High',
    description_short: 'Pillowfort (Target) felt shark head wall mount faux taxidermy. Large size. Like New condition — clean, stitching intact.',
    description_long: '<p><strong>Pillowfort Felt Shark Head Plush Wall Mount — Target Exclusive</strong></p><p>The iconic Pillowfort shark head faux taxidermy wall mount, a Target exclusive that sells out regularly. Large gray felt shark head with white jagged teeth, hand-stitched detail seams, button eye, pectoral fin detail, and fabric loop mount backing for easy wall hanging. Perfect for kids\' rooms, nurseries, playrooms, or any ocean-themed space.</p><p>Condition: Very Good to Like New — clean, no staining, seams fully intact, no felt damage.</p><p>Ships USPS flat rate with careful packing to maintain shape.</p>',
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  {
    item_name: 'Framed Folk Art Print — Farm Scene with Cows Barn Silo Rolling Hills',
    brand: null,
    category: 'Other', // seed had "Art" — mapped to schema value
    subcategory: 'Folk Art Prints / Farmhouse Decor',
    condition_raw: 'VeryGood',
    condition_ebay: 'Very Good',
    condition_notes: 'Large framed folk art print. Blue-toned pastoral scene with red barn, stone silo, white farmhouse, rolling hills, white fence, and Holstein cows throughout. Warm cream double mat with thin inner accent mat. Dark walnut-tone burl-pattern frame. Print appears on canvas or canvas-textured paper. No artist signature visible from photo. Approx 24x20 inches framed. Very good condition — no glass cracks, no visible foxing or staining. Frame shows minor scuffs.',
    is_complete: true,
    keywords: ['folk art', 'framed print', 'farmhouse decor', 'cow print', 'barn print', 'Holstein', 'pastoral', 'primitive', 'country decor', 'wall art', 'farm scene'],
    ebay_search_query: 'framed folk art print farm cows barn silo rolling hills primitive farmhouse',
    ebay_comps_count: 5,
    ebay_comp_price_median: 28.00,
    ebay_comp_price_range: '$18–$45',
    ebay_price: 29.99,
    list_price_final: 29.99,
    price_confidence: 'Medium',
    price_override_reason: 'Artist unidentified — generic folk art market pricing. If artist identified and known, price could be higher. Check back of frame for artist/publisher markings before listing.',
    description_short: 'Framed folk art print — Holstein cows, red barn, silo, rolling hills. Blue pastoral tones. Cream mat, dark burl frame. Approx 24x20 framed. Very Good condition.',
    description_long: '<p><strong>Framed Folk Art Print — Farm Scene with Cows, Barn & Rolling Hills</strong></p><p>Charming large framed folk art print depicting a classic American pastoral scene: red barn with stone silo, white farmhouse, rolling green-blue hills, white fence, and Holstein cows grazing throughout. Cool blue-tone palette with warm accents. Mounted in a cream double mat with accent inner mat and dark walnut-tone burl-pattern frame.</p><p>Print appears on canvas or canvas-textured paper stock. No artist signature visible. Artist/publisher unknown — check back of frame before listing.</p><p>Condition: Very Good — no glass cracks, clean mat, frame has minor scuffs only.</p><p>Approximate framed dimensions: 24 x 20 inches. Ships carefully packed flat rate.</p>',
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  {
    item_name: 'U.S. Divers Cozumel Adult Snorkel Set — Mask, Seabreeze II Snorkel, ProFlex II Fins, Gear Bag (Large, Blue)',
    brand: 'U.S. Divers / Aqua Lung',
    category: 'Other', // seed had "Sporting Goods" — mapped to schema value
    subcategory: 'Water Sports / Snorkeling',
    condition_raw: 'Mint',
    condition_ebay: 'New',
    condition_notes: 'SKU 18639722 / COZ/SB II PFLX II LG. Complete set in original packaging — mesh bag with label band fully intact. Blue/black colorway. Fin size LARGE (Men\'s 9.5–11.5 / Lady\'s 7.5–9.5). Includes: Cozumel 2-window mask with 3-Way Pro-Glide buckle, Seabreeze II splash-guard snorkel, ProFlex II closed-heel fins, and travel gear bag. All items appear to be in original packaging inside the mesh bag. Retail ~$65–75 new.',
    is_complete: true,
    keywords: ['US Divers', 'U.S. Divers', 'snorkel set', 'snorkeling', 'Cozumel', 'Seabreeze', 'ProFlex', 'fins', 'mask', 'snorkel', 'adult', 'large', 'blue', 'gear bag', 'beach vacation'],
    ebay_search_query: 'US Divers Cozumel snorkel set adult mask fins gear bag new',
    ebay_comps_count: 5,
    ebay_comp_price_median: 38.00,
    ebay_comp_price_range: '$28–$50',
    ebay_price: 38.99,
    list_price_final: 38.99,
    price_confidence: 'High',
    price_override_reason: 'Still sold new at retail ~$65-75. Used/resale eBay market $28-50. Priced competitively at $38.99 for quick sale. FB Marketplace $25-30 is realistic for local sale.',
    description_short: 'U.S. Divers Cozumel snorkel set. Adult Large (men\'s 9.5-11.5). Mask, Seabreeze II snorkel, ProFlex II fins, gear bag. Blue/black. Complete in original packaging.',
    description_long: "<p><strong>U.S. Divers Cozumel Adult Snorkeling Set — Large (Blue/Black)</strong></p><p>Complete snorkel set by U.S. Divers (Aqua Lung). SKU: COZ/SB II PFLX II LG. Includes:</p><ul><li><strong>Cozumel Mask</strong> — 2-window low-profile design, tempered glass lens, 3-Way Pro-Glide easy-adjust buckles, silicone skirt</li><li><strong>Seabreeze II Snorkel</strong> — Splash-Guard top with Hydro-Adhesion technology, purge valve, comfortable mouthpiece</li><li><strong>ProFlex II Fins</strong> — Dual composite vented blades, closed-heel foot pocket, size LARGE (Men's 9.5–11.5 / Lady's 7.5–9.5)</li><li><strong>Travel Gear Bag</strong> — Mesh bag with solid base for storage and quick-dry</li></ul><p>Color: Electric Blue/Black. Complete in original packaging. Retail value ~$65–75.</p><p>Ships USPS flat rate or UPS Ground.</p>",
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  {
    item_name: 'Boston Warehouse Cows Ceramic 3-Piece Canister Set — Holstein Cow Figural',
    brand: 'Boston Warehouse',
    category: 'Collectibles',
    subcategory: 'Kitchen / Cow Collectibles / Farmhouse Decor',
    condition_raw: 'Good',
    condition_ebay: 'Good',
    condition_notes: "Boston Warehouse 'Cows' brand ceramic 3-piece figural Holstein cow canister set. Set forms one lying cow when assembled — head, middle body, and hindquarters are three separate lidded canisters. Black and white Holstein glaze, glossy finish. 8 inches h x 15 inches l assembled per box. Original box present but shows heavy wear/crushing. Pieces appear intact with no chips visible from photos. Made in Taiwan.",
    is_complete: true,
    keywords: ['Boston Warehouse', 'cow canister', 'Holstein', 'ceramic canister set', 'farmhouse', 'cow decor', 'figural canister', 'kitchen decor', '3 piece'],
    ebay_search_query: 'Boston Warehouse cow ceramic canister set 3 piece Holstein figural',
    ebay_comps_count: 5,
    ebay_comp_price_median: 38.00,
    ebay_comp_price_range: '$25–$55',
    ebay_price: 38.99,
    list_price_final: 38.99,
    price_confidence: 'Medium',
    price_override_reason: 'Box present but heavily worn — deducts from top value. Inspect all 3 pieces for chips before listing.',
    description_short: 'Boston Warehouse Cows ceramic 3-piece figural Holstein canister set. Forms a lying cow when assembled. 8"h x 15"l. Original box (worn). Good condition.',
    description_long: "<p><strong>Boston Warehouse Cows Ceramic 3-Piece Figural Canister Set</strong></p><p>Charming Holstein cow figural canister set by Boston Warehouse — the three lidded ceramic canisters assemble to form one complete lying cow: head, mid-body, and hindquarters. Classic black-and-white Holstein glaze with glossy finish. Assembled dimensions: 8 inches tall x 15 inches long.</p><p>Original box included (shows heavy wear/crushing). Made in Taiwan.</p><p>Condition: Good — pieces appear intact, no chips observed. Inspect before listing.</p><p>Ships USPS flat rate with careful padding per piece.</p>",
    listing_mode: 'Individual',
    bundle_id: null,
    status: 'PendingReview'
  },
  // Bradford Exchange NFL 75th Anniversary Sets 1-9
  {
    item_name: 'Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates — Set 1: Gale Sayers & Jack Lambert (w/COA)',
    brand: 'Bradford Exchange',
    category: 'Sports Memorabilia',
    subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood',
    condition_ebay: 'Very Good',
    condition_notes: 'Set 1 of the NFL 75th Anniversary All-Time Team mini plate collection by Merv Corning. Plates: Gale Sayers (Chicago Bears #40) and Jack Lambert (Pittsburgh Steelers #58). Plate No. 3575A. Bradford Exchange 1995. COA present. Approx 3.5 inch diameter, gold rim. No chips or crazing visible.',
    is_complete: true,
    keywords: ['Bradford Exchange', 'NFL 75th Anniversary', 'All-Time Team', 'Gale Sayers', 'Jack Lambert', 'mini plate', 'Merv Corning', 'COA', 'Pittsburgh Steelers', 'Chicago Bears'],
    ebay_search_query: 'Bradford Exchange NFL 75th Anniversary Gale Sayers Jack Lambert mini plate COA',
    ebay_comps_count: 4, ebay_comp_price_median: 8.00, ebay_comp_price_range: '$5–$15 per set',
    ebay_price: 8.99, list_price_final: 8.99, price_confidence: 'High',
    description_short: 'Bradford Exchange NFL 75th Anniversary Set 1: Gale Sayers & Jack Lambert mini plates with COA. Plate #3575A.',
    description_long: '<p><strong>Bradford Exchange NFL 75th Anniversary All-Time Team — Set 1: Gale Sayers & Jack Lambert</strong></p><p>Official licensed mini plate pair by artist Merv Corning. Gale Sayers (Chicago Bears #40) and Jack Lambert (Pittsburgh Steelers #58). Plate No. 3575A. Bradford Exchange 1995. Approx 3.5 inch diameter, gold rim porcelain. Certificate of Authenticity included. Ships USPS First Class padded.</p>',
    listing_mode: 'Bundle', bundle_id: 'b1000000-0000-0000-0000-000000000010', status: 'PendingReview'
  },
  {
    item_name: 'Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates — Set 2: Bob Lilly & Johnny Unitas (w/COA)',
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: 'Set 2. Plates: Bob Lilly (Dallas Cowboys #74) and Johnny Unitas (Baltimore Colts). Plate No. 4698. Bradford Exchange 1995. COA present. No chips visible.',
    is_complete: true,
    keywords: ['Bradford Exchange', 'NFL 75th Anniversary', 'Bob Lilly', 'Johnny Unitas', 'mini plate', 'Merv Corning', 'Dallas Cowboys', 'Baltimore Colts', 'COA'],
    ebay_search_query: 'Bradford Exchange NFL 75th Anniversary Bob Lilly Johnny Unitas mini plate',
    ebay_comps_count: 4, ebay_comp_price_median: 8.00, ebay_comp_price_range: '$5–$15',
    ebay_price: 8.99, list_price_final: 8.99, price_confidence: 'High',
    description_short: 'Bradford Exchange NFL 75th Anniversary Set 2: Bob Lilly & Johnny Unitas mini plates with COA. Plate #4698.',
    description_long: '<p><strong>Bradford Exchange NFL 75th Anniversary All-Time Team — Set 2: Bob Lilly & Johnny Unitas</strong></p><p>Mini plate pair by Merv Corning. Bob Lilly (Dallas Cowboys #74) and Johnny Unitas (Baltimore Colts). Plate No. 4698. Bradford Exchange 1995. Gold rim porcelain ~3.5 inch. COA included. Ships USPS First Class padded.</p>',
    listing_mode: 'Bundle', bundle_id: 'b1000000-0000-0000-0000-000000000010', status: 'PendingReview'
  },
  {
    item_name: 'Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates — Set 3: Ray Nitschke & Mike Webster (w/COA)',
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: 'Set 3. Plates: Ray Nitschke (Green Bay Packers #66) and Mike Webster (Pittsburgh Steelers #52 — AJR patch). Plate No. 4428. Bradford Exchange 1995. COA present. No chips visible.',
    is_complete: true,
    keywords: ['Bradford Exchange', 'NFL 75th Anniversary', 'Ray Nitschke', 'Mike Webster', 'mini plate', 'Merv Corning', 'Green Bay Packers', 'Pittsburgh Steelers', 'COA'],
    ebay_search_query: 'Bradford Exchange NFL 75th Anniversary Ray Nitschke Mike Webster mini plate',
    ebay_comps_count: 4, ebay_comp_price_median: 8.00, ebay_comp_price_range: '$5–$15',
    ebay_price: 8.99, list_price_final: 8.99, price_confidence: 'High',
    description_short: 'Bradford Exchange NFL 75th Anniversary Set 3: Ray Nitschke & Mike Webster mini plates with COA. Plate #4428.',
    description_long: '<p><strong>Bradford Exchange NFL 75th Anniversary All-Time Team — Set 3: Ray Nitschke & Mike Webster</strong></p><p>Mini plate pair by Merv Corning. Ray Nitschke (Green Bay Packers #66) and Mike Webster (Pittsburgh Steelers #52). Plate No. 4428. Bradford Exchange 1995. COA included. Ships USPS First Class padded.</p>',
    listing_mode: 'Bundle', bundle_id: 'b1000000-0000-0000-0000-000000000010', status: 'PendingReview'
  },
  {
    item_name: 'Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates — Set 4: Forrest Gregg & Joe Greene (w/COA)',
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: 'Set 4. Plates: Forrest Gregg (Green Bay Packers #75) and Joe Greene (Pittsburgh Steelers, kneeling pose). Plate No. 200C. Bradford Exchange 1995/1996. COA present. No chips visible.',
    is_complete: true,
    keywords: ['Bradford Exchange', 'NFL 75th Anniversary', 'Forrest Gregg', 'Joe Greene', 'Mean Joe Greene', 'mini plate', 'Merv Corning', 'Green Bay Packers', 'Pittsburgh Steelers', 'COA'],
    ebay_search_query: 'Bradford Exchange NFL 75th Anniversary Forrest Gregg Joe Greene mini plate',
    ebay_comps_count: 4, ebay_comp_price_median: 9.00, ebay_comp_price_range: '$6–$15',
    ebay_price: 9.99, list_price_final: 9.99, price_confidence: 'High',
    price_override_reason: 'Joe Greene (Mean Joe Greene) adds demand — Steelers plates command slight premium.',
    description_short: 'Bradford Exchange NFL 75th Anniversary Set 4: Forrest Gregg & Joe Greene (Mean Joe) mini plates with COA. Plate #200C.',
    description_long: "<p><strong>Bradford Exchange NFL 75th Anniversary All-Time Team — Set 4: Forrest Gregg & Joe Greene</strong></p><p>Mini plate pair by Merv Corning. Forrest Gregg (Green Bay Packers #75) and Joe 'Mean Joe' Greene (Pittsburgh Steelers). Plate No. 200C. Bradford Exchange 1995/1996. COA included. Ships USPS First Class padded.</p>",
    listing_mode: 'Bundle', bundle_id: 'b1000000-0000-0000-0000-000000000010', status: 'PendingReview'
  },
  {
    item_name: 'Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates — Set 5: Raymond Berry & Mel Blount (w/COA)',
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: 'Set 5. Plates: Raymond Berry (Baltimore Colts #82 diving catch) and Mel Blount (Pittsburgh Steelers #47 portrait). Plate No. 22C. Bradford Exchange 1995. COA present.',
    is_complete: true,
    keywords: ['Bradford Exchange', 'NFL 75th Anniversary', 'Raymond Berry', 'Mel Blount', 'mini plate', 'Merv Corning', 'Baltimore Colts', 'Pittsburgh Steelers', 'COA'],
    ebay_search_query: 'Bradford Exchange NFL 75th Anniversary Raymond Berry Mel Blount mini plate',
    ebay_comps_count: 4, ebay_comp_price_median: 8.00, ebay_comp_price_range: '$5–$15',
    ebay_price: 8.99, list_price_final: 8.99, price_confidence: 'High',
    description_short: 'Bradford Exchange NFL 75th Anniversary Set 5: Raymond Berry & Mel Blount mini plates with COA. Plate #22C.',
    description_long: '<p><strong>Bradford Exchange NFL 75th Anniversary All-Time Team — Set 5: Raymond Berry & Mel Blount</strong></p><p>Mini plate pair by Merv Corning. Raymond Berry (Baltimore Colts) and Mel Blount (Pittsburgh Steelers #47). Plate No. 22C. Bradford Exchange 1995. COA included. Ships USPS First Class padded.</p>',
    listing_mode: 'Bundle', bundle_id: 'b1000000-0000-0000-0000-000000000010', status: 'PendingReview'
  },
  {
    item_name: 'Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates — Set 6: Marion Motley & Willie Lanier (w/COA)',
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: 'Set 6. Plates: Marion Motley (Cleveland Browns #76) and Willie Lanier (Kansas City Chiefs #63). Plate No. 67C. Bradford Exchange 1996. COA present.',
    is_complete: true,
    keywords: ['Bradford Exchange', 'NFL 75th Anniversary', 'Marion Motley', 'Willie Lanier', 'mini plate', 'Merv Corning', 'Cleveland Browns', 'Kansas City Chiefs', 'COA'],
    ebay_search_query: 'Bradford Exchange NFL 75th Anniversary Marion Motley Willie Lanier mini plate',
    ebay_comps_count: 4, ebay_comp_price_median: 8.00, ebay_comp_price_range: '$5–$15',
    ebay_price: 8.99, list_price_final: 8.99, price_confidence: 'High',
    description_short: 'Bradford Exchange NFL 75th Anniversary Set 6: Marion Motley & Willie Lanier mini plates with COA. Plate #67C.',
    description_long: '<p><strong>Bradford Exchange NFL 75th Anniversary All-Time Team — Set 6: Marion Motley & Willie Lanier</strong></p><p>Mini plate pair by Merv Corning. Marion Motley (Cleveland Browns #76) and Willie Lanier (Kansas City Chiefs #63). Plate No. 67C. Bradford Exchange 1996. COA included. Ships USPS First Class padded.</p>',
    listing_mode: 'Bundle', bundle_id: 'b1000000-0000-0000-0000-000000000010', status: 'PendingReview'
  },
  {
    item_name: 'Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates — Set 7: Kellen Winslow & Gino Marchetti (w/COA)',
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: 'Set 7. Plates: Kellen Winslow (San Diego Chargers #80) and Gino Marchetti (Baltimore Colts #89). Plate No. 186C. Bradford Exchange 1996. COA present.',
    is_complete: true,
    keywords: ['Bradford Exchange', 'NFL 75th Anniversary', 'Kellen Winslow', 'Gino Marchetti', 'mini plate', 'Merv Corning', 'San Diego Chargers', 'Baltimore Colts', 'COA'],
    ebay_search_query: 'Bradford Exchange NFL 75th Anniversary Kellen Winslow Gino Marchetti mini plate',
    ebay_comps_count: 4, ebay_comp_price_median: 8.00, ebay_comp_price_range: '$5–$15',
    ebay_price: 8.99, list_price_final: 8.99, price_confidence: 'High',
    description_short: 'Bradford Exchange NFL 75th Anniversary Set 7: Kellen Winslow & Gino Marchetti mini plates with COA. Plate #186C.',
    description_long: '<p><strong>Bradford Exchange NFL 75th Anniversary All-Time Team — Set 7: Kellen Winslow & Gino Marchetti</strong></p><p>Mini plate pair by Merv Corning. Kellen Winslow (San Diego Chargers #80) and Gino Marchetti (Baltimore Colts #89). Plate No. 186C. Bradford Exchange 1996. COA included. Ships USPS First Class padded.</p>',
    listing_mode: 'Bundle', bundle_id: 'b1000000-0000-0000-0000-000000000010', status: 'PendingReview'
  },
  {
    item_name: 'Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates — Set 8: John Hannah & Larry Wilson (w/COA)',
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: 'Set 8. Plates: Larry Wilson (St. Louis Cardinals #8) and John Hannah (New England Patriots #73). Plate No. 359C. Bradford Exchange 1995/1996. COA present.',
    is_complete: true,
    keywords: ['Bradford Exchange', 'NFL 75th Anniversary', 'Larry Wilson', 'John Hannah', 'mini plate', 'Merv Corning', 'St. Louis Cardinals', 'New England Patriots', 'COA'],
    ebay_search_query: 'Bradford Exchange NFL 75th Anniversary John Hannah Larry Wilson mini plate',
    ebay_comps_count: 4, ebay_comp_price_median: 8.00, ebay_comp_price_range: '$5–$15',
    ebay_price: 8.99, list_price_final: 8.99, price_confidence: 'High',
    description_short: 'Bradford Exchange NFL 75th Anniversary Set 8: John Hannah & Larry Wilson mini plates with COA. Plate #359C.',
    description_long: '<p><strong>Bradford Exchange NFL 75th Anniversary All-Time Team — Set 8: John Hannah & Larry Wilson</strong></p><p>Mini plate pair by Merv Corning. Larry Wilson (St. Louis Cardinals #8) and John Hannah (New England Patriots #73). Plate No. 359C. Bradford Exchange 1995/1996. COA included. Ships USPS First Class padded.</p>',
    listing_mode: 'Bundle', bundle_id: 'b1000000-0000-0000-0000-000000000010', status: 'PendingReview'
  },
  {
    item_name: "Bradford Exchange NFL 75th Anniversary All-Time Team Mini Plates — Set 9: Don Hutson & Dick 'Night Train' Lane (w/COA)",
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Set 9. Plates: Don Hutson (Green Bay Packers, portrait) and Dick 'Night Train' Lane (Detroit Lions #81 running). Plate No. 225C. Bradford Exchange 1996. COA present. No chips visible.",
    is_complete: true,
    keywords: ['Bradford Exchange', 'NFL 75th Anniversary', 'Don Hutson', 'Dick Night Train Lane', 'mini plate', 'Merv Corning', 'Green Bay Packers', 'Detroit Lions', 'COA'],
    ebay_search_query: 'Bradford Exchange NFL 75th Anniversary Don Hutson Dick Night Train Lane mini plate',
    ebay_comps_count: 4, ebay_comp_price_median: 8.00, ebay_comp_price_range: '$5–$15',
    ebay_price: 8.99, list_price_final: 8.99, price_confidence: 'High',
    description_short: "Bradford Exchange NFL 75th Anniversary Set 9: Don Hutson & Dick 'Night Train' Lane mini plates with COA. Plate #225C.",
    description_long: "<p><strong>Bradford Exchange NFL 75th Anniversary All-Time Team — Set 9: Don Hutson & Dick 'Night Train' Lane</strong></p><p>Mini plate pair by Merv Corning. Don Hutson (Green Bay Packers) and Dick 'Night Train' Lane (Detroit Lions #81). Plate No. 225C. Bradford Exchange 1996. COA included. Ships USPS First Class padded.</p>",
    listing_mode: 'Bundle', bundle_id: 'b1000000-0000-0000-0000-000000000010', status: 'PendingReview'
  },
  // Individual sports/collectible plates
  {
    item_name: "Bradford Exchange 500 Home Run Club Diamond Plates — Mickey Mantle, Babe Ruth, Willie Mays & Ted Williams (4 plates w/COAs)",
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / MLB',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: 'Four diamond-shaped (home plate shaped) Bradford Exchange 500 Home Run Club collector plates all in original foam with COAs. Plate 1: Mickey Mantle (NY Yankees, 536 HR) — No. 7838A, 1st issue, 1996. Plate 2: Babe Ruth (NY Yankees, 714 HR) — No. 2226A, 3rd issue, 1997. Plate 3: Willie Mays (SF Giants, 660 HR) — No. 1340A, 4th issue, 1997. Plate 4: Ted Williams (Boston Red Sox, 521 HR) — No. 5093A, 2nd issue, 1997. All still in original foam packaging with COAs. No chips or damage.',
    is_complete: true,
    keywords: ['Bradford Exchange', '500 Home Run Club', 'Mickey Mantle', 'Babe Ruth', 'Willie Mays', 'diamond plate', 'collector plate', 'Brent Benger', 'MLB', 'Cooperstown', 'COA', 'Ted Williams'],
    ebay_search_query: 'Bradford Exchange 500 Home Run Club Mickey Mantle Babe Ruth Willie Mays diamond plate',
    ebay_comps_count: 5, ebay_comp_price_median: 32.00, ebay_comp_price_range: '$28–$55 for the 4-plate lot',
    ebay_price: 44.99, list_price_final: 44.99, price_confidence: 'Medium',
    price_override_reason: 'Mantle and Ruth are the strongest sellers individually ($12-18 each). Willie Mays adds. Priced as lot — can split if lot doesn\'t sell.',
    description_short: 'Bradford Exchange 500 Home Run Club diamond plates — Mickey Mantle, Babe Ruth, Willie Mays & Ted Williams. All in original foam with COAs. 4-plate lot.',
    description_long: '<p><strong>Bradford Exchange 500 Home Run Club Diamond Plates — Complete 4-Plate Lot</strong></p><p>Four diamond (home plate) shaped collector plates by artist Brent Benger from the Bradford Exchange 500 Home Run Club Cooperstown Collection — all in original foam packaging with COAs. Mickey Mantle (NY Yankees, 536 HR — 1st issue, 1996), Ted Williams (Boston Red Sox, 521 HR — 2nd issue, 1997), Babe Ruth (NY Yankees, 714 HR — 3rd issue, 1997), Willie Mays (SF Giants, 660 HR — 4th issue, 1997). Each approx 6.25 x 6.25 inches. All four COAs included. No chips or damage.</p><p>Ships USPS flat rate padded.</p>',
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  },
  {
    item_name: "Bradford Exchange Mark McGwire '70!' King of Swing Ceramic Plaque Plate with COA (1999)",
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / MLB',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Bradford Exchange 'Mark McGwire: King of Swing' collection, first issue '70!' by Danny O'Leary. Plate No. B1283. 1999. Ceramic plaque (rectangular, not round) with wall-hang D-ring. Features McGwire September 27, 1998 breaking HR record — gold McGwire facsimile signature on front. St. Louis Cardinals. COA present on back. No chips or damage visible. Approx 9x7 inches.",
    is_complete: true,
    keywords: ['Bradford Exchange', 'Mark McGwire', '70 home runs', 'King of Swing', '1998 season', 'St. Louis Cardinals', 'collector plate', "Danny O'Leary", 'COA', 'record breaker'],
    ebay_search_query: 'Bradford Exchange Mark McGwire 70 King of Swing plate 1999 COA',
    ebay_comps_count: 4, ebay_comp_price_median: 15.00, ebay_comp_price_range: '$10–$22',
    ebay_price: 14.99, list_price_final: 14.99, price_confidence: 'Medium',
    price_override_reason: 'McGwire\'s reputation took a hit post-steroid era — demand below what it was in 1999. Still sells to Cardinals/era collectors.',
    description_short: "Bradford Exchange Mark McGwire '70!' King of Swing ceramic plaque. Sept 27, 1998 HR record. 1st issue, Plate #B1283. COA included.",
    description_long: "<p><strong>Bradford Exchange Mark McGwire '70!' — Mark McGwire: King of Swing Collection</strong></p><p>First issue in the Mark McGwire: King of Swing collection by artist Danny O'Leary. Celebrates Mark McGwire's record-breaking 70th home run on September 27, 1998. Rectangular ceramic plaque with gold facsimile signature. Plate No. B1283. Bradford Exchange 1999. St. Louis Cardinals officially licensed. COA on reverse. Wall-hang D-ring. Approx 9x7 inches.</p><p>Ships USPS flat rate padded.</p>",
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  },
  {
    item_name: "Bradford Exchange Babe Ruth 'Sultan of Swat' Yankee Stadium 75th Anniversary 3D Display Plate with Stand & COA (1998)",
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / MLB',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Bradford Exchange Babe Ruth 'The Sultan of Swat' — First issue in the Yankee Stadium: 75th Anniversary Collection. Plate No. A5598. 1998. Round porcelain plate mounted in a 3D resin Yankee Stadium-shaped display stand — white stadium arch ring reads 'THE SULTAN OF SWAT', NY logo inserts, two resin baseballs at base, Yankee Stadium facade at bottom. Babe Ruth batting artwork with facsimile signature. COA on reverse of plate. Plate approx 8.5\" tall x 7.5\" wide in stand. Very good condition — no chips, stand intact.",
    is_complete: true,
    keywords: ['Bradford Exchange', 'Babe Ruth', 'Sultan of Swat', 'Yankee Stadium', '75th Anniversary', 'collector plate', '3D stand', 'Brent Benger', 'NY Yankees', 'COA', '1998'],
    ebay_search_query: 'Bradford Exchange Babe Ruth Sultan of Swat Yankee Stadium 75th anniversary plate stand COA',
    ebay_comps_count: 5, ebay_comp_price_median: 22.00, ebay_comp_price_range: '$15–$35',
    ebay_price: 24.99, list_price_final: 24.99, price_confidence: 'High',
    price_override_reason: 'The 3D Yankee Stadium stand is the differentiator — adds display appeal vs standard round plate. Babe Ruth always sells.',
    description_short: "Bradford Exchange Babe Ruth 'Sultan of Swat' Yankee Stadium 75th Anniversary 3D display plate with stadium stand and COA. Plate #A5598. 1998.",
    description_long: "<p><strong>Bradford Exchange Babe Ruth 'The Sultan of Swat' — Yankee Stadium 75th Anniversary Collection</strong></p><p>Stunning 3D display piece: porcelain round plate featuring Babe Ruth at bat, mounted in a detailed resin Yankee Stadium arch display stand. Stand inscribed 'THE SULTAN OF SWAT' with NY logo details and two ceramic baseballs flanking a Yankee Stadium facade base. First issue in the Yankee Stadium: 75th Anniversary Collection by Brent Benger. Plate No. A5598. Bradford Exchange 1998. Limited to 295 casting days. COA on reverse. Approximately 8.5 inches tall in stand.</p><p>Ships USPS flat rate with foam protection.</p>",
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  },
  {
    item_name: "Bradford Exchange Mark McGwire 'Record 70 Home Runs' Home Run Hero Porcelain Plate — 2nd Issue (1998)",
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / MLB',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Bradford Exchange 'Mark McGwire: Home Run Hero' collection, second issue 'Record 70 Home Runs' by Glen Green. Plate No. 9298A. 1998. Round porcelain collector plate, gold rim. Features McGwire September 27, 1998 — plate reads 'Record 70 Home Runs 9-27-98 Mark McGwire' around border. St. Louis Cardinals. Appears to have a facsimile/printed signature on face. Still in original foam packaging. No COA visible in photos — note this in listing.",
    is_complete: null,
    keywords: ['Bradford Exchange', 'Mark McGwire', '70 home runs', 'Home Run Hero', '1998 season', 'St. Louis Cardinals', 'collector plate', 'Glen Green', 'record breaker'],
    ebay_search_query: 'Bradford Exchange Mark McGwire Record 70 Home Runs Home Run Hero plate 1998',
    ebay_comps_count: 4, ebay_comp_price_median: 12.00, ebay_comp_price_range: '$8–$18',
    ebay_price: 12.99, list_price_final: 12.99, price_confidence: 'High',
    description_short: "Bradford Exchange Mark McGwire 'Record 70 Home Runs' Home Run Hero 2nd issue plate. Plate #9298A. 1998. Still in foam. COA to be confirmed.",
    description_long: "<p><strong>Bradford Exchange Mark McGwire 'Record 70 Home Runs' — Mark McGwire: Home Run Hero Collection</strong></p><p>Second issue in the Mark McGwire: Home Run Hero collection by artist Glen Green. Round porcelain gold-rim plate commemorating McGwire's record 70th home run, September 27, 1998. St. Louis Cardinals officially licensed. Plate No. 9298A. Bradford Exchange 1998. Still in original foam packaging. Approx 8 inches diameter.</p><p>Ships USPS flat rate padded.</p>",
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  },
  {
    item_name: "Bradford Exchange Michael Jordan '5 Time NBA MVP His Airness' Upper Deck Collector Plate — 1st Issue (1998)",
    brand: 'Bradford Exchange / Upper Deck', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NBA',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Bradford Exchange / Upper Deck 'Michael Jordan His Airness' collection, first issue '5 Time NBA MVP' by Jason Walker. Plate No. 1057B. 1998. Round porcelain collector plate in original foam packaging. Still in foam/appears unplayed. No COA confirmed in photos — check packaging. Hard-fire porcelain, edition limited to 95 firing days. Officially NBA licensed.",
    is_complete: null,
    keywords: ['Bradford Exchange', 'Upper Deck', 'Michael Jordan', 'His Airness', '5 Time NBA MVP', 'collector plate', 'Jason Walker', 'Chicago Bulls', 'NBA', '1998'],
    ebay_search_query: 'Bradford Exchange Upper Deck Michael Jordan His Airness 5 Time NBA MVP plate COA',
    ebay_comps_count: 5, ebay_comp_price_median: 18.00, ebay_comp_price_range: '$12–$28',
    ebay_price: 18.99, list_price_final: 18.99, price_confidence: 'Low',
    price_override_reason: 'Jordan plates have solid demand. COA not confirmed from photos — check foam packaging. With COA $18-25; without $12-15. Priced conservatively until COA confirmed.',
    description_short: "Bradford Exchange/Upper Deck Michael Jordan '5 Time NBA MVP His Airness' 1st issue plate. Plate #1057B. 1998. Still in foam. COA to be confirmed.",
    description_long: "<p><strong>Bradford Exchange / Upper Deck Michael Jordan '5 Time NBA MVP' — His Airness Collection</strong></p><p>First issue in the Michael Jordan His Airness collection by artist Jason Walker. Features Michael Jordan as 5-Time NBA MVP. Plate No. 1057B. Bradford Exchange/Upper Deck 1998. Hard-fire porcelain, edition limited to 95 firing days. Officially NBA licensed. Still in original foam packaging.</p><p>Ships USPS flat rate padded.</p>",
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  },
  {
    item_name: "Bradford Exchange Mark McGwire 'Record Breaker 9-8-98' Home Run Hero 1st Issue Plate (1998)",
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / MLB',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Bradford Exchange 'Mark McGwire: Home Run Hero' collection, FIRST issue 'Record Breaker 9-8-98' by Glen Green. Plate No. 4651A. 1998. Round porcelain gold rim ~8 inches. Features McGwire's September 8, 1998 record-breaking 62nd home run. St. Louis Cardinals. Facsimile signature on face. In original foam packaging.",
    is_complete: true,
    keywords: ['Bradford Exchange', 'Mark McGwire', 'Record Breaker', '9-8-98', '62nd home run', 'Home Run Hero', '1998 season', 'St. Louis Cardinals', 'Glen Green'],
    ebay_search_query: 'Bradford Exchange Mark McGwire Record Breaker 9-8-98 Home Run Hero plate 1998',
    ebay_comps_count: 4, ebay_comp_price_median: 12.00, ebay_comp_price_range: '$8–$18',
    ebay_price: 12.99, list_price_final: 12.99, price_confidence: 'Medium',
    price_override_reason: 'McGwire demand muted post-steroid era. Cardinals collectors buy. Check foam for COA before listing.',
    description_short: "Bradford Exchange Mark McGwire 'Record Breaker 9-8-98' Home Run Hero 1st issue. Plate #4651A. 1998. In original foam.",
    description_long: "<p><strong>Bradford Exchange Mark McGwire 'Record Breaker 9-8-98' — Home Run Hero Collection, 1st Issue</strong></p><p>First issue in the Mark McGwire: Home Run Hero collection by Glen Green. Commemorates McGwire's September 8, 1998 record-breaking 62nd home run. Round porcelain gold rim plate, ~8 inches diameter. St. Louis Cardinals licensed. Plate No. 4651A. In original foam. Ships USPS flat rate padded.</p>",
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  },
  {
    item_name: "Bradford Exchange Mark McGwire 'Record Tying 61st Home Run 9-7-98' Home Run Hero 3rd Issue Plate (1999)",
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / MLB',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Bradford Exchange 'Mark McGwire: Home Run Hero' collection, THIRD issue 'Record Tying 61st Home Run' by Glen Green. Plate No. 3047A. 1999. Round porcelain gold rim. Features McGwire hitting HR #61 on 9-7-98, tying Roger Maris. St. Louis Cardinals. Facsimile signature on face. In original foam packaging. Check foam for COA.",
    is_complete: null,
    keywords: ['Bradford Exchange', 'Mark McGwire', '61st home run', 'record tying', 'Home Run Hero', 'Roger Maris', '1998 season', 'St. Louis Cardinals', 'Glen Green'],
    ebay_search_query: 'Bradford Exchange Mark McGwire Record Tying 61st Home Run Hero plate 1999',
    ebay_comps_count: 4, ebay_comp_price_median: 12.00, ebay_comp_price_range: '$8–$18',
    ebay_price: 12.99, list_price_final: 12.99, price_confidence: 'Low',
    price_override_reason: 'COA not confirmed — check foam packaging. With COA $12-15; without $8-10.',
    description_short: "Bradford Exchange Mark McGwire 'Record Tying 61st HR 9-7-98' Home Run Hero 3rd issue. Plate #3047A. 1999. In original foam. COA to be confirmed.",
    description_long: "<p><strong>Bradford Exchange Mark McGwire 'Record Tying 61st Home Run' — Home Run Hero Collection, 3rd Issue</strong></p><p>Third issue in the Mark McGwire: Home Run Hero collection by Glen Green. Commemorates McGwire tying Roger Maris's record with HR #61 on September 7, 1998. Plate No. 3047A. 1999. In original foam. Ships USPS flat rate padded.</p>",
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  },
  {
    item_name: 'Hamilton Collection Star Trek: The Voyagers Plate — U.S.S. Enterprise NCC-1701 (1993)',
    brand: 'Hamilton Collection', category: 'Collectibles', subcategory: 'Collector Plates / Star Trek',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Hamilton Collection 'Star Trek: The Voyagers' plate collection. 'U.S.S. Enterprise NCC-1701' — the original series Enterprise. Plate No. 47388. 1993. Paramount Pictures licensed. Edition limited to 28 firing days. Round plate with gold/dash rim border, dramatic space scene. In original foam. Made in USA.",
    is_complete: true,
    keywords: ['Hamilton Collection', 'Star Trek', 'USS Enterprise', 'NCC-1701', 'The Voyagers', 'collector plate', '1993', 'Paramount', 'original series', 'space'],
    ebay_search_query: 'Hamilton Collection Star Trek Voyagers USS Enterprise NCC-1701 plate 1993',
    ebay_comps_count: 4, ebay_comp_price_median: 15.00, ebay_comp_price_range: '$10–$22',
    ebay_price: 14.99, list_price_final: 14.99, price_confidence: 'High',
    description_short: 'Hamilton Collection Star Trek The Voyagers USS Enterprise NCC-1701 plate. Plate #47388. 1993. Limited to 28 firing days. In original foam.',
    description_long: "<p><strong>Hamilton Collection — Star Trek: The Voyagers, U.S.S. Enterprise NCC-1701</strong></p><p>From the Hamilton Collection's Star Trek: The Voyagers plate series — the iconic U.S.S. Enterprise NCC-1701 in a dramatic space scene with planet and nebula. Plate No. 47388. Paramount Pictures licensed 1993. Edition limited to 28 firing days. Gold dash-border rim. Made in USA. In original foam packaging.</p><p>Ships USPS flat rate padded.</p>",
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  },
  {
    item_name: "Bradford Exchange Emmitt Smith 'Super Bowl XXX' Running to Daylight 1st Issue Plate with COA (1997)",
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Bradford Exchange 'Emmitt Smith: Running to Daylight' collection, first issue 'Super Bowl XXX' by Danny Day. Plate No. 4112A. Dallas Cowboys star logo and blue design. Features Emmitt #22 in multiple action poses. Gold facsimile signature on face. Plate No. 4112A. Bradford Exchange 1997. NFL/QB Club licensed. In original foam. No COA visible in photos — check foam packaging.",
    is_complete: null,
    keywords: ['Bradford Exchange', 'Emmitt Smith', 'Super Bowl XXX', 'Dallas Cowboys', 'Running to Daylight', 'NFL', 'QB Club', '1997', 'Danny Day', '#22'],
    ebay_search_query: 'Bradford Exchange Emmitt Smith Super Bowl XXX Running to Daylight plate 1997 Cowboys',
    ebay_comps_count: 4, ebay_comp_price_median: 14.00, ebay_comp_price_range: '$10–$22',
    ebay_price: 14.99, list_price_final: 14.99, price_confidence: 'Low',
    price_override_reason: 'COA not confirmed — check foam. Emmitt Smith Dallas Cowboys plates have steady moderate demand.',
    description_short: "Bradford Exchange Emmitt Smith 'Super Bowl XXX' Running to Daylight 1st issue. Plate #4112A. 1997. Dallas Cowboys. In foam. COA to be confirmed.",
    description_long: "<p><strong>Bradford Exchange Emmitt Smith 'Super Bowl XXX' — Running to Daylight Collection, 1st Issue</strong></p><p>First issue in the Emmitt Smith: Running to Daylight collection by artist Danny Day. Features Dallas Cowboys running back Emmitt Smith #22 in Super Bowl XXX action. Gold facsimile signature. Plate No. 4112A. Bradford Exchange 1997. NFL QB Club licensed. In original foam. Ships USPS flat rate padded.</p>",
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  },
  {
    item_name: "Bradford Exchange Troy Aikman 'Dallas' Troy Aikman' Game's Greatest 1st Issue Plate (1997)",
    brand: 'Bradford Exchange', category: 'Sports Memorabilia', subcategory: 'Collector Plates / NFL',
    condition_raw: 'VeryGood', condition_ebay: 'Very Good',
    condition_notes: "Bradford Exchange 'The Game's Greatest' collection, first issue 'Dallas' Troy Aikman' by Ron DeFelice. Plate No. 6867A. Dallas Cowboys. Features Aikman #8 in multiple action poses and huddle. Blue rim with silver border. Gold signature. QB Club / NFL licensed. Bradford Exchange 1997. In original foam. Check foam for COA.",
    is_complete: null,
    keywords: ['Bradford Exchange', 'Troy Aikman', 'Dallas Cowboys', "Game's Greatest", 'NFL', 'QB Club', '1997', 'Ron DeFelice', '#8', 'quarterback'],
    ebay_search_query: "Bradford Exchange Troy Aikman Game's Greatest Dallas Cowboys plate 1997",
    ebay_comps_count: 4, ebay_comp_price_median: 13.00, ebay_comp_price_range: '$8–$20',
    ebay_price: 12.99, list_price_final: 12.99, price_confidence: 'Low',
    price_override_reason: 'COA not confirmed — check foam. Troy Aikman has steady Cowboys collector demand.',
    description_short: "Bradford Exchange Troy Aikman 'Game's Greatest' 1st issue plate. Plate #6867A. 1997. Dallas Cowboys #8. In foam. COA to be confirmed.",
    description_long: "<p><strong>Bradford Exchange Troy Aikman — The Game's Greatest Collection, 1st Issue</strong></p><p>First issue in The Game's Greatest collection by artist Ron DeFelice. Features Dallas Cowboys quarterback Troy Aikman #8 in multiple action poses including huddle. Plate No. 6867A. Bradford Exchange 1997. NFL QB Club licensed. Blue and silver design. In original foam. Ships USPS flat rate padded.</p>",
    listing_mode: 'Individual', bundle_id: null, status: 'PendingReview'
  }
]

// Insert items in a single batch
const { error: itemsErr } = await supabase.from('items').insert(items)
if (itemsErr) {
  console.error('✗ Items insert failed:', itemsErr.message)
  console.error('  Code:', itemsErr.code, '| Details:', itemsErr.details)
  process.exit(1)
}
console.log(`✓ Inserted ${items.length} items`)

// -----------------------------------------------------------------------
// Verification
// -----------------------------------------------------------------------
console.log('\n--- Verification ---')

const { count: bundleCount, error: e1 } = await supabase
  .from('bundles').select('*', { count: 'exact', head: true })

const { count: itemCount, error: e2 } = await supabase
  .from('items').select('*', { count: 'exact', head: true })

const { count: bundleItemCount, error: e3 } = await supabase
  .from('items').select('*', { count: 'exact', head: true })
  .not('bundle_id', 'is', null)

if (e1 || e2 || e3) {
  console.error('Verification query error:', e1?.message || e2?.message || e3?.message)
  process.exit(1)
}

console.log(`SELECT COUNT(*) FROM bundles; → ${bundleCount}  (expected: 2)`)
console.log(`SELECT COUNT(*) FROM items;   → ${itemCount}  (expected: 33)`)
console.log(`SELECT COUNT(*) FROM items WHERE bundle_id IS NOT NULL; → ${bundleItemCount}  (expected: 13)`)

const ok = bundleCount === 2 && itemCount === 33 && bundleItemCount === 13
if (ok) {
  console.log('\n✓ All counts match — database seeded successfully')
} else {
  console.error('\n✗ Count mismatch — check errors above')
  process.exit(1)
}
