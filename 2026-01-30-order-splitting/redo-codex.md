Tip: Run /review to get a code review of your current changes.


› Hey first I need you to get acquainted with what happened here - ideally we determine how the system was working before all of this work because it turns out that
  splitting a single order with multiple shipments into multiple orders was correct so some of the work done here needs to be reverted: (i) /Users/danielplant/
  Desktop/cursor_ceo_s_latest_system_feedback.md (ii) /Users/danielplant/Desktop/cursor_2_2_ceo_fixes_phase_5_edit_mode.md (iii) /Users/danielplant/Desktop/
  cursor_major_shipment_update.md


• Explored
  └ Read cursor_ceo_s_latest_system_feedback.md, cursor_2_2_ceo_fixes_phase_5_edit_mode.md, cursor_major_shipment_update.md

• I'm preparing to check the AGENTS.md file and use git logs to understand how order splitting worked before the recent changes and identify what needs reverting.

• Explored
  └ List ls -la

• I'm searching the project directory for an AGENTS.md file or related instructions to include.

• Explored
  └ List rg --files -g AGENTS.md
    List 2026-01-30-order-splitting

• I'm identifying key code paths and git history to understand original behavior of splitting single orders into multiple ones versus keeping one order with multiple
  shipments, aiming to analyze and propose what changes to revert.

  Searching for order splitting functions

  I'm targeting functions like "getOrderGroupKey" and order creation code to find changes that shifted from multiple orders per shipment back to single orders,
  preparing to identify what needs reverting.

• Explored
  └ Search getOrderGroupKey|order splitting|split order|split into in src

• I'm focusing on order-related comments in orders.ts to understand how order splitting is handled before proceeding with implementation.

• Explored
  └ Read orders.ts

• The comments suggest a shift from splitting orders by group key to using planned shipments as a single order in Phase3, so I'm verifying if legacy split logic still
  exists around getOrderGroupKey to confirm how order grouping evolved.

• Ran rg -n "getOrderGroupKey" -n src/lib/data/actions/orders.ts src/app/api/drafts/[id]/submit/route.ts src/app/buyer/(shop)/my-order/client.tsx src/components/buyer/
  │ order-form.tsx src/lib/schemas/order.ts
  └ zsh:1: no matches found: src/app/api/drafts/[id]/submit/route.ts

• Noted the need to quote brackets in paths to avoid zsh globbing issues; I'll rerun commands with quoted paths.

• Explored
  └ Search getOrderGroupKey in orders.ts

• I'm investigating where the pre-order flag is set, especially if deriveIsPreOrderFromSkus is used beyond createOrder, since splitting seems disabled; next I'll
  inspect draft submit routes to review related code.

• Explored
  └ Read route.ts
    Search plannedShip|deriveShipments|split in route.ts

• I'm investigating the commit history to find the baseline behavior before the planned shipments change, aiming to understand how order splitting was implemented
  initially and locate relevant code or commits.

• Ran git log --oneline -n 30
  └ 7ab2083 fix: normalize export triggeredBy to string
    c4f8108 Merge pull request #3 from danielplant/feature/debugging-feb1
    … +30 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-fbnlzPDY' (errno=Operation not permitted)

• I'm focusing on identifying the commit where order splitting changed from multiple splits to a single order, targeting commits around "Phase 3" and "wip main 2026-
  01-30." I'll inspect earlier commits and possibly the directory named by date to reconstruct the baseline system behavior before recent changes.

  Mapping old order-splitting logic

  I'm reviewing code comments and history for the old order-splitting logic, focusing on functions like grouping by collection and order type, and tracking which
  commits and code replaced it with planned shipments. This will help produce a detailed summary of changes and identify what to revert to restore splitting behavior.

• Ran rg -n "order group|order grouping|groupKey|group key|grouping" src/lib/data/actions/orders.ts src/app/api/drafts/[id]/submit/route.ts src/app/buyer/(shop)/
  │ my-order/client.tsx src/components/buyer/order-form.tsx src/lib/schemas/order.ts
  └ zsh:1: no matches found: src/app/api/drafts/[id]/submit/route.ts

• Explored
  └ Search order group|order grouping|groupKey|group key|grouping in orders.ts

• I'm identifying the need to keep old shipment grouping logic, possibly extracting new functions to derive shipments from items, and will inspect the order client
  file next to understand the existing shipment planning.

• Ran sed -n '1,220p' src/app/buyer/(shop)/my-order/client.tsx
  └ zsh:1: no matches found: src/app/buyer/(shop)/my-order/client.tsx

• Explored
  └ Read client.tsx

• I'm pinpointing the commit that introduced planned shipments, likely linked to "Phase 3" changes, and planning to review the orders.ts diffs around that commit to
  understand original logic before that feature was added.

  Listing recent commits for orders.ts

  I'm retrieving recent commit history for the orders.ts file to identify key changes and locate the commit that introduced planned shipments.

• Ran git log --oneline -- src/lib/data/actions/orders.ts | head -n 20
  └ 4c27120 fix: resolve TypeScript errors for production deployment
    1160ad2 wip: snapshot messy main
    … +17 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-sQ99uyOr' (errno=Operation not permitted)

• Focusing on commit 8d9f99a due to its mention of ship window grouping and draft sync, which relates to shipment grouping and order splitting. Next, I'll inspect the
  orders.ts file at this commit to understand its role and track when planned shipments were introduced.

• Ran git show 8d9f99a:src/lib/data/actions/orders.ts | sed -n '250,520p'
  └     select: { OrderNumber: true },
      })
    … +271 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-v8tF1rcV' (errno=Operation not permitted)

• The older commit splits orders by ship window and category, creating multiple orders per ship window, while the current code groups by collection and order type but
  uses planned shipments without splitting. I'll next examine the current createOrder and draft submit code to verify if the original splitting logic was replaced or
  remains unused.

  Tracing transition from order splitting to planned shipments

  I identified a key early commit implementing order splitting by ship window and order type without planned shipments and noted a later commit that likely introduced
  planned shipments. Next, I'll verify the old draft submit route in that early commit to confirm how order grouping and submission worked before planned shipments
  were added.

• Ran git show 8d9f99a:src/app/api/drafts/[id]/submit/route.ts | sed -n '1,220p'
  └ zsh:1: no matches found: 8d9f99a:src/app/api/drafts/[id]/submit/route.ts

• Noticed that the path contains brackets, which require quoting the whole path in the git show command to work properly.

• Ran git show 8d9f99a:"src/app/api/drafts/[id]/submit/route.ts" | sed -n '1,220p'
  └ import { NextRequest, NextResponse } from 'next/server'
    import { prisma } from '@/lib/prisma'
    … +220 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-leSvotjO' (errno=Operation not permitted)

• Ran git show 8d9f99a:"src/app/api/drafts/[id]/submit/route.ts" | sed -n '220,520p'
  └       shipWindowEnd: string | null
        }> = []
    … +198 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-VX0ccJDj' (errno=Operation not permitted)

• The original logic split a single order into multiple orders based on SKU categories, which was correct, but recent changes replaced this with planned shipments
  consolidating into one order. Reverting requires restoring splitting in both order creation and draft submission, while selectively keeping ship window validation
  and possibly other fixes.

  Planning detailed analysis of order splitting revert

  I'm outlining a stepwise review to compare pre- and post-planned shipment logic, inspect front-end changes around orders versus shipments, list all affected
  components including email templates and Prisma schema, and locate planned shipment code references. I'll summarize findings with file and commit references and
  propose a revert plan for confirmation before changes.

• Explored
  └ Read order.ts

• The original splitting by category/ship window and planned shipments likely needs undoing, but some features like ship window validation might remain differently
  implemented. Next, I'll identify all relevant code and data model changes tied to planned shipments for a thorough revert.

  Reviewing email templates for shipment grouping

  I'll check current email templates for references to shipment groupings to confirm changes from order splitting and note how to revert them back to order-level
  grouping based on pre-change commits.

• Explored
  └ Search shipment|shipments in templates.ts

• I'm clarifying that reverting to the previous behavior involves undoing many planned shipments features tied to order splitting, and I need to verify if the system
  originally split orders by category (using SKU categories and ship windows) versus the current use of collections and their ship windows to align with the current
  data model.

  Clarifying original splitting logic and revert scope

  I'm confirming the original system split orders into multiple CustomerOrders by collection or ship window, but new planned shipments replaced this with single orders
  containing multiple shipments. I'll summarize findings from code and docs, list key files and migrations linked to planned shipments, and identify which changes to
  revert versus keep for features unrelated to splitting.

• Explored
  └ Search PlannedShipment|plannedShipment in schema.prisma
    Read schema.prisma

• The old order splitting logic is largely replaced by planned shipments grouped in the new data model, confirmed by inspecting git history around commit 8d9f99a. Key
  references include comments in src/lib/data/actions/orders.ts and the draft submit route about removing getOrderGroupKey. Current features like planned shipments UI,
  admin views, email/PDF grouping, and shipment linking all assume a single order with planned shipments.

  Summarizing pre- and post-planned shipments behavior with revert plan

  I reviewed the three docs and traced code plus git history around commit 8d9f99a to understand the system before planned shipments.

  Before planned shipments (pre-commit 8d9f99a):

  - createOrder grouped items by order type (ATS vs PreOrder) and ship window category, splitting one order into multiple CustomerOrders with distinct order numbers.
  - Draft submission followed the same multi-order logic.
  - Emails, API, and UI handled multiple orders per checkout.
  - Relevant files include src/lib/data/actions/orders.ts and src/app/api/drafts/[id]/submit/route.ts.
  - Splitting was based on category-level ship window and order type (SkuCategories.IsPreOrder), not collection.

  Current state (post-planned shipments):

  - createOrder now creates a single CustomerOrder containing multiple planned shipments linked via the PlannedShipments table.
  - Draft submit and order inputs rely on planned shipments; validations and derivations use collection-level dates.
  - UI, emails, and PDFs present grouped shipments within a single order.
  - Planned shipments-related files include src/lib/utils/shipment-helpers.ts, src/lib/contexts/order-context.tsx, buyer and admin UI components, and email/PDF
    templates referencing shipments.

  Revert surface area to restore order splitting:

  - Order creation and draft submit logic in src/lib/data/actions/orders.ts and src/app/api/drafts/[id]/submit/route.ts need to revert to multi-order grouping,
    reinstating getOrderGroupKey or equivalent.
  - Data model changes: the PlannedShipments table and related foreign keys in CustomerOrdersItems, Shipments, and ShipmentItems; consider dropping or leaving unused
    migrations like manual_add_planned_shipments.sql and pending-migration.sql.
  - Buyer and admin UIs using planned shipments (shipment cards, edit modes, planned shipments section) in components like src/components/buyer/order-form.tsx and src/
    components/admin/order-detail/planned-shipments-section.tsx.
  - Email and PDF grouping features relying on shipments in src/lib/email/templates.ts and src/lib/pdf/order-confirmation.ts.
  - Shipment fulfillment references in src/lib/data/actions/shipments.ts and src/components/admin/shipment-modal.tsx.

  Open questions to confirm:

  - Should order splitting be by collection ID, ship window dates, or original category-based grouping?
  - Should ATS vs PreOrder splitting persist?
  - Should planned shipments DB tables and columns be fully removed or retained but unused?
  - Should ship window validation logic remain?
  - Should planned shipments UI and related features be kept or discarded?

  Next steps:
  If confirmed, I can map a detailed revert plan or diff from commit 8d9f99a to current HEAD to generate a rollback patch. Some fixes outside splitting (e.g., product
  search) appear safe to keep. This ensures a clean restore aligned to the user’s preferred order splitting approach.

─ Worked for 4m 21s ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• I read the three exports and traced the current code against the pre‑planned‑shipments logic in git. Here’s the “before” behavior and what changed.

  Before the planned‑shipments work (pre‑change behavior)

  - Orders were split into multiple OHN orders when a cart had mixed delivery windows and/or ATS vs Pre‑Order. The grouping key combined order type + ship window/
    category; each group created its own CustomerOrders header + items, with a unique A/P order number. This is in commit 8d9f99a in src/lib/data/actions/orders.ts.
  - Draft submission did the same multi‑order split: it deleted the draft, then created one order per group, and emailed each order separately. Commit 8d9f99a in src/
    app/api/drafts/[id]/submit/route.ts.
  - Ship windows came from category fields (SkuCategories.OnRouteAvailableDate/End) and Pre‑Order from SkuCategories.IsPreOrder, not from Collection.

  Current state (after the planned‑shipments work)

  - createOrder now always creates ONE order and builds PlannedShipments within it; the comment explicitly says it replaced order splitting. src/lib/data/actions/
    orders.ts.
  - Draft submission also switched to PlannedShipments; the comment says getOrderGroupKey was removed. src/app/api/drafts/[id]/submit/route.ts.
  - PlannedShipments are persisted as first‑class DB objects and linked from items and fulfillments. prisma/schema.prisma.
  - UI, emails, and PDFs now present shipments rather than multiple orders. src/components/buyer/order-form.tsx, src/app/buyer/(shop)/my-order/client.tsx, src/lib/
    email/templates.ts, src/lib/email/send-order-emails.ts, src/lib/pdf/order-confirmation.ts.

  What likely needs reverting to restore “split into multiple orders”

  - Order creation + draft submit: re‑introduce grouping and multi‑order creation (using an order‑group key). src/lib/data/actions/orders.ts, src/app/api/drafts/[id]/
    submit/route.ts.
  - Input schemas / client payloads: remove PlannedShipments input from creation if we no longer persist them. src/lib/schemas/order.ts.
  - PlannedShipment data model + migrations: decide whether to drop or leave unused. prisma/schema.prisma, prisma/migrations/manual_add_planned_shipments.sql, pending-
    migration.sql.
  - Buyer/admin shipment UI + edit‑mode logic: remove/disable shipment cards, combine/split tools, edit‑mode shipment reconciliation. src/components/buyer/order-
    form.tsx, src/app/buyer/(shop)/my-order/client.tsx, src/lib/contexts/order-context.tsx, src/components/admin/order-detail/planned-shipments-section.tsx.
  - Email/PDF grouping by shipment: revert to per‑order rendering. src/lib/email/templates.ts, src/lib/email/send-order-emails.ts, src/lib/pdf/order-confirmation.ts.
  - Fulfillment links to planned shipments: if planned shipments go away, remove plannedShipment FK flows. src/lib/data/actions/shipments.ts, src/components/admin/
    shipment-modal.tsx.

  Key decision points before I map a concrete revert plan

  1. Should splitting be by collection (current source of truth) or by ship‑window dates (older behavior via category)?
  2. Do we still want ATS vs Pre‑Order always split into separate orders?
  3. Should the PlannedShipment tables be dropped or just left unused for now?
  4. Keep ship‑window validation (no earlier dates) even after reverting to split orders?

  If you confirm those, I can give you a precise revert plan (or implement it) based on the pre‑change logic from 8d9f99a while preserving unrelated fixes like the
  product search and order‑notes bug.


› If we just reverted the order creation logic- explain from there which NEW UX actions would feel inconsistent with the REVERTED order splitting. It turns out
    that this bit in green "What they like is to place one order and when they submit the order for the system to split the order by delivery dates" was an
    affirmation of the way it had been working but I misread it as a need to keep the order as one order even though it had multiple shipments/collections (stay in
    read only)      [Image #1]


• Splitting shipments back into separate orders would conflict with these UX actions designed for multi-shipment within a single order: shipment timeline (breaks at
  order-level), shipment grouping UI (no longer groups shipments but separate orders), edit mode shipments and moving items between shipments (cross-order edits feel
  inconsistent), shipment count badges (badge meaning changes), order confirmation grouping (per-shipment grouping lost), per-shipment overrides (now per-order),
  cross-shipment fulfillment features, planned shipment selection and collection warnings in shipment modals, and the "planned shipments" section in admin detail
  (redundant if orders already split). These features assume consolidated order context, so splitting orders would disrupt flow, visuals, and management consistency.

  Highlighting UX mismatches when reverting to split orders

  Reverting order creation to multiple orders while keeping current single-order shipment UI causes inconsistent UX where actions assume shipments within one order but
  system has separate orders. Key mismatches include:

  - Buyer checkout and review features like shipment date cards, timelines, shipment grouping, and per-shipment overrides no longer align since shipments become
    distinct orders.
  - Edit mode shipment actions such as combining, splitting, and moving items between shipments become nonsensical across separate orders.
  - Admin order detail’s planned shipments section loses meaning because orders are already split.
  - Order lists showing shipment count badges and first shipment dates would misrepresent multiple orders as a single order’s shipments.
  - Email and PDF confirmations grouping shipments within one order conflict with multiple actual order numbers after submission.
  - Fulfillment linking and collection change warnings per planned shipment assume a single order context, causing confusion.

  From the user perspective, order review and confirmation should adapt to show multiple order numbers rather than a single order with multiple shipments to maintain
  consistency.

• If we revert order creation back to “one cart → multiple orders split by delivery date,” then any UX that implies one order with internal shipments becomes
  inconsistent. The biggest mismatches would be these actions:

  - Combine/split shipments inside a single order (buyer/rep flow). If the system splits into multiple orders, there’s no “one order” container where a user can merge
    or split shipments.
  - Edit shipment dates or move items between shipments inside an order. That assumes shipments are sub-entities of one order; after revert, those items would live in
    different orders instead.
  - Shipment timeline / shipment summary for a single order. The UI currently suggests “one order with multiple planned shipments,” which conflicts with “multiple
    order numbers created at submit.”
  - Edit‑mode shipment UI (loading and reconciling planned shipments in an order). Editing an existing order would only have one delivery window if it was already
    split at creation.
  - Admin “Planned Shipments” section and any per‑shipment override flow. With split orders, shipment‑level management belongs to each order, not a shared order
    header.
  - Shipment count badges / “first shipment date + count” summaries on order lists. Those imply multiple shipments within one order; after revert you’d expect multiple
    orders in the list instead.
  - Email/PDF confirmation grouped by shipments under one order number. The customer would instead receive multiple order numbers (one per split), so “shipment
    grouping” language becomes misleading.
  - Fulfillment linking to planned shipments for a single order. With split orders, fulfillment naturally ties to each order; cross‑shipment fulfillment inside one
    order no longer applies.
  - Collection change warnings tied to planned shipments (single order impact). In split‑order mode, impacts are per‑order, not per planned shipment in one order.

  In short: any UX that lets a user organize, edit, or view multiple shipments within a single order becomes inconsistent once order creation is reverted to “split
  into multiple orders on submit.” If you want, I can map each of these to the exact files/screens to target for rollback.


› map each of these to the exact files/screens to target for rollback


• I'm preparing a precise mapping of key features like combine/split shipments to their related files, specifying logic locations in order-context and UI in order-form
  and shipment card components, referencing exact paths with inline code.

• Explored
  └ Search combineShipments|splitShipment|shipmentGroups|ShipmentDateCard|plannedShipments in components

• I'm detailing file and screen mappings for each inconsistency: combining/splitting shipments in buyer's "My Order" and "Order Form" screens across related
  components; shipment date edits and item moves in buyer and admin orders with distinct admin move-item and planned shipments files; and the shipment timeline
  component usage in buyer and possibly admin screens. This read-only overview sets the foundation for pinpointing affected areas.

• Explored
  └ Search ShipmentTimeline in src

• I've identified key files and screens where shipment-related UI and logic appear across buyer and admin views, highlighting potential inconsistencies with edit-mode
  shipments and pointing out where overrides, counts, and email/PDF grouping tie into planned shipments. Next, I'll use this mapping to guide targeted UI and backend
  updates consistently.

  Confirming planned shipment use in collection warnings

  I'll search for explicit mentions of planned shipments in collection-related admin files to verify if collection change warnings are tied to planned shipments and
  ensure accurate mapping.

• Ran rg -n "plannedShipment|planned shipment|shipment" src/components/admin/collections src/app/admin/(protected)/(admin)/collections src/lib/data/actions/
  │ collections.ts src/lib/data/queries/collections.ts
  └ zsh:1: no matches found: src/app/admin/(protected)/(admin)/collections

• Explored
  └ Search plannedShipment|planned shipment|shipment in collections

• Combine/split shipments inside one order (buyer/rep)

  - Buyer: My Orders screen — src/app/user/orders/page.tsx (or equivalent)
  - Rep: Orders list — src/app/rep/orders/page.tsx
  - Shared: Collection modal — relevant component file, e.g., src/app/components/CollectionModal.tsx

  Shipment count badges

  - Admin: Orders list — src/app/admin/(protected)/(admin)/orders/page.tsx
  - Rep: Orders list — src/app/rep/orders/page.tsx
  - Admin: Order detail summary with timeline — src/app/admin/(protected)/(admin)/orders/[id]/page.tsx

  Planned shipment count (backend queries/types)

  - Queries: src/lib/data/queries/orders.ts
  - Types: src/lib/types/order.ts

  Refining action-to-file mapping format

  The mapping will use bullet lines per action, mentioning screens and files separated by semicolons without nesting. Each file path appears inline with backticks
  individually separated by commas. Screens are named plainly (e.g., "Buyer My Order," "Admin Order Detail"). For email/PDF grouping, relevant templates, sending
  logic, PDF generation, API routes, and confirmation modal components will be included as separate inline file paths. This format meets instructions and keeps
  listings clear and concise.

• Explored
  └ Search email-confirmation in components
    Search split in email-confirmation-modal.tsx
    Read email-confirmation-modal.tsx

• I'm preparing a bullet list mapping each new UX action (emails, PDF, timeline, confirmation modal, order summary badge, multi-shipment edit mode) to their relevant
  screens and files, highlighting how shipment data like planned counts and timelines tie into various UI components in both user and admin views.

  Structuring UX action mappings with screens and files

  I'm deciding to list each UX action on its own line with associated screens and file paths, grouped by Buyer/Rep and Admin contexts but without nesting, following
  formatting constraints and ensuring file paths are clear and standalone for clicking.

• Explored
  └ Search shipment-date-change in email
    Search date change in email

• I'm deciding to focus the response on mapping the specific UX actions inconsistent with the revert, organizing them with a Rollback Targets header and including
  relevant file paths clearly in parentheses per bullet point. I'll avoid referencing unrelated UX badges or broader fulfillment issues.

  Finalizing rollback mapping format

  I'm settling on a clean single-level bullet list under a Rollback Targets header, detailing each UX action with precise file paths. I'll include the draft API route
  as part of combine/split shipments since it supports the feature, but avoid unrelated ephemeral UI notes.

─ Worked for 1m 54s ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Rollback Targets

  - Combine/split shipments inside one order (Buyer/Rep “My Order”): src/app/buyer/(shop)/my-order/page.tsx, src/app/buyer/(shop)/my-order/client.tsx, src/components/
    buyer/order-form.tsx, src/components/buyer/shipment-date-card.tsx, src/lib/contexts/order-context.tsx, src/app/api/drafts/[id]/route.ts
  - Per‑shipment date editing in buyer flow (ShipmentDateCard / multi‑shipment UI): src/components/buyer/shipment-date-card.tsx, src/components/buyer/order-form.tsx,
    src/app/buyer/(shop)/my-order/client.tsx
  - Shipment timeline + “Multiple Shipments” messaging (Buyer My Order, Admin Orders list, Rep Orders list, Admin Order Detail): src/components/ui/shipment-
    timeline.tsx, src/app/buyer/(shop)/my-order/client.tsx, src/components/admin/orders-table.tsx, src/components/rep/rep-orders-table.tsx, src/app/admin/(protected)/
    (admin)/orders/[id]/page.tsx
  - Edit‑mode shipment reconciliation (buyer/rep editing an order): src/lib/contexts/order-context.tsx, src/lib/data/queries/orders.ts, src/app/buyer/(shop)/my-order/
    client.tsx, src/components/buyer/order-form.tsx, src/lib/data/actions/orders.ts, src/lib/types/order.ts
  - Admin planned‑shipments management (edit shipment dates, move items between shipments, overrides): src/components/admin/order-detail/planned-shipments-section.tsx,
    src/components/admin/order-detail/planned-shipment-card.tsx, src/components/admin/order-detail/move-item-modal.tsx, src/components/admin/order-detail-client.tsx,
    src/app/admin/(protected)/(admin)/orders/[id]/page.tsx, src/lib/data/actions/planned-shipments.ts
  - Shipment count badges / per‑order shipment summaries (Admin/Rep orders lists): src/components/admin/orders-table.tsx, src/components/rep/rep-orders-table.tsx, src/
    lib/data/queries/orders.ts, src/lib/types/order.ts
  - Email/PDF grouped by shipments under one order number (confirmation + attachments): src/components/buyer/email-confirmation-modal.tsx, src/lib/email/templates.ts,
    src/lib/email/send-order-emails.ts, src/lib/pdf/order-confirmation.ts, src/app/api/orders/[id]/pdf/route.ts
  - Fulfillment linking to planned shipments (admin fulfillment modal + shipment actions): src/components/admin/shipment-modal.tsx, src/lib/data/actions/shipments.ts,
    prisma/schema.prisma
  - Collection ship‑window change workflow tied to planned shipments: src/components/admin/collections/collection-modal.tsx, src/components/admin/collections/affected-
    orders-preview-dialog.tsx, src/app/admin/(protected)/(admin)/collections/[id]/affected-orders/client.tsx, src/lib/data/queries/collections.ts, src/lib/data/
    actions/collections.ts, src/lib/email/shipment-date-change.ts


› Consider the discussion I have been having with another agent - review carefully as we continue to think through what to (a) rollback, (b) what to keep as-is, and
  (c) what needs to be reset/re-applied/re-purposed: Summary: What Was Done

    Original System Behavior (Before All This Work)

    When a cart contained items from multiple collections with different ship windows, the system would split the cart into multiple separate orders (e.g., P10001,
    P10002, P10003), each with its own order number.

    How The CEO's Feedback Was Interpreted

    Devika said: "Since we're allowing the rep to place one master order per customer and then split it by collection..."

    This was interpreted as: Don't split into multiple orders. Keep ONE order number with multiple "planned shipments" inside it.

    What Was Implemented

    A major architectural change was built:

    1. New PlannedShipment table added to the database (migration already applied to prod)
    2. createOrder() was refactored to create ONE order with multiple PlannedShipment records instead of splitting
    3. Multi-shipment UI in buyer flow with per-collection date cards
    4. Admin planned shipments UI with inline editing and item movement
    5. Collection date change workflow with affected orders dashboard
    6. Edit mode shipment support (Phase 5 - partially done)
    7. Email/PDF templates updated to show shipment groupings
    8. Language cleanup to change "split orders" to "shipments"

    The Work Spans:

    - Multiple phases (1-8+) documented in plan files
    - Changes to ~15+ files across queries, actions, contexts, and UI components
    - Significant schema additions (PlannedShipment model, FK columns)

    ---
    What You're Now Saying

    The original splitting behavior (multiple orders) was actually CORRECT, and some of this work needs to be reverted.

    ---
    Key Questions Before Proceeding

    1. How much needs to be reverted?
      - Just the order creation logic (go back to splitting)?
      - Or also remove the PlannedShipment infrastructure entirely?
    2. What about the PlannedShipment table that's already in production?
      - Keep it for potential future use?
      - Remove it with a rollback migration?
    3. What parts of the work (if any) should be kept?
      - Ship date validation against collection windows?
      - Order notes clearing fix?
      - Product search fix (mode: 'insensitive' removal)?

    Let me know your direction and I can help identify exactly which changes need to be reverted.

  ✻ Cooked for 1m 0s

  ❯ If we just reverted the order creation logic- explain from there which NEW UX actions would feel inconsistent with the REVERTED order splitting. It turns out
    that this bit in green "What they like is to place one order and when they submit the order for the system to split the order by delivery dates" was an
    affirmation of the way it had been working but I misread it as a need to keep the order as one order even though it had multiple shipments/collections (stay in
    read only)
    ⎿  [Image #1]

  ⏺ I understand now. The green text was confirming the existing behavior: "place one order (in the cart/UI) and the system splits it into multiple orders (on
    submission)". Not: "keep it as one order with multiple shipments inside."

    Let me trace through what would feel inconsistent if we revert to order splitting:

    ---
    New UX Features That Would Be Inconsistent With Order Splitting

    1. Multi-Shipment Cards in Buyer Flow

    What was built: When cart has items from 3 collections, buyer sees 3 "Shipment" cards with separate date pickers.

    Inconsistency: If the system splits into 3 separate orders on submit, why show them as "shipments" within one order? The preview doesn't match the outcome.

    Resolution needed: Either remove the multi-shipment UI, or rename to "Orders" preview showing what will be created.

    ---
    2. Email Confirmation Modal Language

    What was built: Changed from "Your cart was split into X orders" → "Your order will ship in X shipments"

    Inconsistency: If orders ARE splitting, the old language was correct.

    Resolution needed: Revert the language change (or leave as-is since we just changed it).

    ---
    3. Shipment Count Badge on Orders Table

    What was built: Orders table shows a badge like "3" when plannedShipmentCount > 1

    Inconsistency: If each split order is one collection, most orders would have plannedShipmentCount = 1, making the badge rarely appear.

    Resolution needed: Badge becomes less useful; could remove or repurpose.

    ---
    4. Admin Planned Shipments Section

    What was built: Order detail page has a "Planned Shipments" section showing multiple shipments with dates, items, collection info.

    Inconsistency: If each order is one collection, this section would show just one shipment per order. Still works, but feels over-engineered.

    Resolution needed: Could simplify or keep as-is (single shipment still displays fine).

    ---
    5. Item Movement Between Shipments

    What was built: Admin can move items from one planned shipment to another within the same order.

    Inconsistency: If orders are split by collection, items can't move between shipments in the same order (there's only one shipment). Moving items would mean moving
    them to a different order.

    Resolution needed: This feature becomes largely unused, or needs redesign for cross-order moves.

    ---
    6. Edit Mode Multi-Shipment UI

    What was built (partially): When editing an order, show multiple shipment cards.

    Inconsistency: Split orders mean one collection per order, so edit mode would show one shipment card per order.

    Resolution needed: The Phase 5 work becomes unnecessary; edit mode stays single-shipment.

    ---
    Features That Would STILL Make Sense
    ┌─────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────┐
    │                     Feature                     │                                     Status                                      │
    ├─────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
    │ Ship date validation against collection windows │ ✅ Still useful - validates each split order's dates                            │
    ├─────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
    │ Order notes clearing bug fix                    │ ✅ Still useful - unrelated to splitting                                        │
    ├─────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
    │ Product search fix                              │ ✅ Still useful - unrelated                                                     │
    ├─────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
    │ Collection date change workflow                 │ ⚠️ Partially useful - would affect split orders, not shipments within one order │
    ├─────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
    │ PlannedShipment table                           │ ⚠️ Could be used 1:1 (one order = one planned shipment) or removed              │
    └─────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────┘
    ---
    Summary

    If we revert to order splitting, the core inconsistency is:
    The UI now previews/manages "shipments within one order" but the system actually creates "separate orders."

    The biggest mismatches are the multi-shipment buyer UI and the item movement feature.

  ✻ Worked for 37s

  ❯ Yes but even before we had that each order could be split into multiple shipments: │ PlannedShipment table                           │ ⚠️ Could be used 1:1 (one
  ─
     order = one planned shipment) or removed

  ⏺ You're right - I was conflating two things. Let me clarify:

    ---
    Two Different "Shipment" Concepts
    ┌───────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────┬─────────────────┐
    │                  Concept                  │                                       What It Is                                       │ Existed Before? │
    ├───────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┼─────────────────┤
    │ Fulfillment Shipments (Shipments table)   │ Actual physical shipments from warehouse - tracking numbers, ship dates, partial fills │ ✅ Yes          │
    ├───────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┼─────────────────┤
    │ Planned Shipments (PlannedShipment table) │ Customer's requested delivery windows at order time                                    │ ❌ New          │
    └───────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────┴─────────────────┘
    ---
    The Real Question

    Even with order splitting (one order per collection), could a single order still need multiple planned shipments?

    Example scenarios:
    - Customer orders 100 units of Collection A, wants 50 in July and 50 in August
    - Customer wants to stagger deliveries within one collection for floor set timing

    If yes → PlannedShipment is still useful even with split orders. Each split order could have 1+ planned shipments.

    If no (one order = one ship window) → PlannedShipment becomes 1:1 with orders and is redundant with ShipStartDate/ShipEndDate on CustomerOrders.

    ---
    What Was The Original Behavior?

    Before the PlannedShipment work:
    - Did a single order support multiple ship windows?
    - Or was it strictly one ship window per order (stored on the order header)?

    If it was one ship window per order, then splitting by collection already handled the "different delivery dates" use case - each split order got its own dates.

    Would you like me to check how ship dates were handled on orders before PlannedShipment was introduced?

  ❯ yes check the original behavior (stay read only)


• I'm aiming to identify the original behavior of shipping date handling before planned shipments were introduced by searching git history around the commit that
  introduced them, focusing on order header shipping dates and searching relevant commits and files like the order form.

  Confirming single ship window per order

  The original behavior splits orders by ship window/category with each order holding one ShipStartDate/ShipEndDate, reflected in the order form UI without multi-
  shipment support. I'll verify shipping fields and schema in commit 8d9f99a to confirm this read-only.

• Ran git log --oneline --grep "PlannedShipment" -n 20
  └ git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-dQDOr3G6' (errno=Operation not permitted)
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-lQmkqW0f' (errno=Operation not permitted)

• I'm investigating a specific commit's files for the order-form because git log is failing or returning errors, possibly due to permission issues with /tmp.

• Ran git show 8d9f99a:"src/components/buyer/order-form.tsx" | sed -n '1,200p'
  └ 'use client'

    … +200 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-GYjHZ4e7' (errno=Operation not permitted)

• I'm searching for where orders are submitted, focusing on usage of createOrder and updateOrder and checking if shipStartDate/End is passed without plannedShipments.
  I'll continue scrolling to validate this.

• Ran git show 8d9f99a:"src/components/buyer/order-form.tsx" | rg -n "shipStartDate|shipEndDate|createOrder|updateOrder" -n
  └ 21:import { createOrder, updateOrder } from '@/lib/data/actions/orders'
    118:    ? existingOrder.shipStartDate
    … +25 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-uyMDqN6L' (errno=Operation not permitted)

• Ran git show 8d9f99a:"src/components/buyer/order-form.tsx" | sed -n '380,520p'
  └       setSelectedCustomerId(null)
          // Only unlock rep if not in rep context (rep context keeps rep locked)
    … +141 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-c5Qi0Os0' (errno=Operation not permitted)

• I'm reviewing the commit on the email confirmation modal to compare terminology used for order splitting versus shipments and confirm the appropriate language to
  use.

• Ran git show 8d9f99a:"src/components/buyer/email-confirmation-modal.tsx" | sed -n '1,220p'
  └ 'use client'

    … +220 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-IpburnHD' (errno=Operation not permitted)

• The original modal showed an email prompt only for the primary order after splitting, possibly skipping emails for others; I’m verifying that createOrder returned
  multiple orders but the UI only triggered the email modal once, reflecting partial email handling.

  Confirming original order splitting logic

  Commit 8d9f99a shows orders split by category and ship window with no planned shipments—each order had a single ship window and email modal handled just one order;
  the original flow lacks multi-ship-window orders and shipments summary seen now.

• Ran git show 8d9f99a:"src/lib/schemas/order.ts" | sed -n '1,140p'
  └ /**
     * Order form validation schema
    … +87 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-Ivl0Vcy1' (errno=Operation not permitted)

• The original system grouped cart items by order type and ship window/category into multiple orders with a single ship date range per order; no planned shipments
  field existed, and confirmation UI managed a single order display. Draft submission used the same grouping. Shipment records reflected actual physical shipments, not
  planned shipments. I'll reference commit 8d9f99a files to support this summary.

  Confirming original behavior with detailed file references

  Original behavior (pre PlannedShipments, commit 8d9f99a) confirmed:

  - Order form had a single shipStartDate/shipEndDate pair, defaulted from category on-route dates for pre-order and today/today+14 for ATS; implemented in src/
    components/buyer/order-form.tsx.
  - On submission, createOrder grouped items by order type plus category or ship window via getOrderGroupKey, creating multiple CustomerOrders each with its own order
    number and ship dates from item ship windows; this logic is in src/lib/data/actions/orders.ts.
  - The client displayed a toast "Order split into X orders by delivery window" and the email confirmation modal expected a single order without shipment summaries;
    see src/components/buyer/order-form.tsx and email-confirmation-modal.tsx.
  - The order schema included only shipStartDate/End and category/ship window info, without any planned shipments concept; found in src/lib/schemas/order.ts.
  - Draft submissions used the same grouping logic to create multiple orders and discard the draft; from src/app/api/drafts/[id]/submit/route.ts.
  - Shipments tables reflected physical fulfillments but did not represent planned shipments as a separate abstraction.

  I stayed read-only inspecting these files at commit 8d9f99a. If desired, I can help map which features to keep, rollback, or reset based on this baseline.

─ Worked for 1m 25s ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Here’s what I found by checking the pre‑PlannedShipment code (commit 8d9f99a, read‑only):

  Original behavior (confirmed in code)

  - Single ship window per order. The buyer form only had shipStartDate and shipEndDate fields (no per‑shipment cards). Defaults: pre‑order uses category on‑route
    dates, ATS uses today → today+14, edit mode uses existing order header dates. src/components/buyer/order-form.tsx
  - Server split into multiple orders by delivery window + order type. createOrder() grouped items by order type (ATS vs Pre‑Order) and ship window/category, then
    created one CustomerOrders header per group, each with its own order number and its own header ship dates (from the group’s window, otherwise the form dates). src/
    lib/data/actions/orders.ts
  - Order items carried category/ship‑window metadata (not planned shipments). The order input schema had categoryId/categoryName/shipWindowStart/shipWindowEnd on
    items, and no plannedShipments field. src/lib/schemas/order.ts
  - UI acknowledged splitting. After submit, the buyer flow showed a toast like “Order split into X orders by delivery window,” then opened a single‑order email modal
    (no shipment summary). src/components/buyer/order-form.tsx, src/components/buyer/email-confirmation-modal.tsx
  - Draft submit also split into multiple orders. Draft submission used the same grouping logic and created multiple orders on submit. src/app/api/drafts/[id]/submit/
    route.ts

  Net conclusion
  The original system behavior was one ship window per order and multiple orders created at submit when delivery windows differed. There was no “planned shipments”
  concept in the order data model or buyer UI—only the existing fulfillment shipments table.

  If you want, I can now bucket the current changes into (a) rollback, (b) keep, (c) reset/repurpose, with exact files per bucket.


› bucket the current changes into (a) rollback, (b) keep, (c) reset/repurpose, with exact files per bucket


• I'm organizing changed files based on existing diffs into three categories: rollback changes related to PlannedShipments and multi-shipment UI, keep unrelated fixes
  (product search, order notes clearing, ship window validation), and reset/repurpose UI components (e.g., shipment timeline, email confirmation modal) to fit the
  split orders approach instead of shipments.

  Bucketing code changes into rollback, keep, and reset/repurpose with exact files

  I've organized files changed for planned shipments and related features into three categories:

  Rollback (remove planned shipment UI/features conflicting with split orders):

  - src/components/buyer/shipment-date-card.tsx
  - src/components/ui/shipment-timeline.tsx
  - src/components/ui/index.ts
  - src/components/admin/order-detail/planned-shipments-section.tsx
  - src/components/admin/order-detail/planned-shipment-card.tsx
  - src/components/admin/order-detail/move-item-modal.tsx
  - src/lib/types/planned-shipment.ts (if present)
  - src/lib/data/actions/planned-shipments.ts (if present)
  - src/lib/utils/shipment-helpers.ts (only if solely for planned shipments)
  - src/components/buyer/email-confirmation-modal.tsx
  - src/app/api/orders/[id]/pdf/route.ts
  - src/lib/pdf/order-confirmation.ts
  - src/lib/email/templates.ts
  - src/lib/email/send-order-emails.ts
  - src/components/admin/shipment-modal.tsx
  - src/components/admin/orders-table.tsx
  - src/components/rep/rep-orders-table.tsx
  - src/app/admin/(protected)/(admin)/orders/[id]/page.tsx

  Reset/Repurpose (files containing both planned shipment logic and needed refactoring to split orders or partially keep):

  - src/lib/data/actions/orders.ts
  - src/app/api/drafts/[id]/submit/route.ts
  - src/components/buyer/order-form.tsx
  - src/app/buyer/(shop)/my-order/client.tsx
  - src/lib/contexts/order-context.tsx
  - src/lib/types/order.ts
  - src/lib/data/queries/orders.ts
  - src/app/api/drafts/[id]/route.ts
  - src/lib/validation/ship-window.ts
  - src/lib/data/actions/collections.ts
  - src/lib/data/queries/collections.ts
  - src/components/admin/collections/collection-modal.tsx
  - src/components/admin/collections/affected-orders-preview-dialog.tsx
  - src/app/admin/(protected)/(admin)/collections/[id]/affected-orders/client.tsx
  - src/lib/email/shipment-date-change.ts
  - Prisma schema and migration files related to planned shipments (kept for safety—optional)

  Keep (unrelated fixes to preserve as-is):

  - src/lib/data/queries/products.ts (product search fix)

  For order notes clearing fix, it's uncertain if it exists in current changes; if present in mixed files (e.g., order-form.tsx), it must be cherry-picked and thus
  falls under reset/repurpose. Ship window validation also fits reset/repurpose as it needs adjustment for split orders.

  This classification includes exact file paths with rationale for each bucket and notes uncertainties where applicable.

  Bucketing current changes for rollback, keep, and reset/repurpose

  Bucket (a) Rollback — dedicated planned shipment UI and helpers to remove:

  - src/components/buyer/shipment-date-card.tsx
  - src/components/ui/shipment-timeline.tsx
  - src/components/admin/order-detail/planned-shipments-section.tsx
  - src/components/admin/order-detail/planned-shipment-card.tsx
  - src/components/admin/order-detail/move-item-modal.tsx
  - src/components/admin/shipment-modal.tsx

  ———

  - src/lib/email/templates.ts
  - src/lib/email/send-order-emails.ts
  - src/lib/pdf/order-confirmation.ts
  - src/app/api/orders/[id]/pdf/route.ts
  - src/components/buyer/email-confirmation-modal.tsx (revert to single-order modal)

  ———

  - src/lib/types/planned-shipment.ts (if present)
  - src/lib/data/actions/planned-shipments.ts (if present)
  - src/lib/utils/shipment-helpers.ts (if only for planned shipments)

  ———

  Bucket (b) Keep — unrelated fixes to preserve as-is:

  - src/lib/data/queries/products.ts (product search fix)

  ———

  Bucket (c) Reset/repurpose — core flows, data models, and mixed files needing changes to restore split orders while preserving non-conflicting fixes:

  - src/lib/data/actions/orders.ts
  - src/app/api/drafts/[id]/submit/route.ts
  - src/lib/schemas/order.ts (remove planned shipments, restore split orders schema)
  - src/app/buyer/(shop)/my-order/client.tsx
  - src/components/buyer/order-form.tsx
  - src/lib/contexts/order-context.tsx

  ———

  - src/lib/data/queries/orders.ts
  - src/lib/types/order.ts
  - src/app/api/drafts/[id]/route.ts
  - src/lib/validation/ship-window.ts (keep validation but adapt away from planned shipments)
  - src/lib/data/actions/collections.ts
  - src/lib/data/queries/collections.ts

  ———

  - src/components/admin/collections/collection-modal.tsx
  - src/components/admin/collections/affected-orders-preview-dialog.tsx
  - src/app/admin/(protected)/(admin)/collections/[id]/affected-orders/client.tsx
  - src/lib/email/shipment-date-change.ts
  - Prisma schema and migration files related to planned shipments (consider repurpose or keep unused)

  ———

  - src/components/admin/orders-table.tsx
  - src/components/rep/rep-orders-table.tsx
  - src/app/admin/(protected)/(admin)/orders/[id]/page.tsx
  - src/components/admin/order-detail-client.tsx
  - src/lib/data/actions/shipments.ts

  ———

  Files in reset/repurpose contain some valuable fixes that should be re-applied carefully after reverting planned shipment logic. This classification assumes
  reverting to split orders without planned shipments; changes may shift if planned shipments are partially retained.

  Let me know if you want me to draft a revert plan or start implementing this bucketing.

• Below is a clean bucketization assuming the target is restore split‑order behavior and remove “planned shipments inside a single order”. Files listed are exact
  paths.

  (a) Rollback — remove/restore to pre‑PlannedShipment behavior (dedicated UI/components)

  - src/components/buyer/shipment-date-card.tsx
  - src/components/ui/shipment-timeline.tsx
  - src/components/admin/order-detail/planned-shipments-section.tsx
  - src/components/admin/order-detail/planned-shipment-card.tsx
  - src/components/admin/order-detail/move-item-modal.tsx
  - src/lib/data/actions/planned-shipments.ts
  - src/components/buyer/email-confirmation-modal.tsx
  - src/lib/email/templates.ts
  - src/lib/email/send-order-emails.ts
  - src/lib/pdf/order-confirmation.ts
  - src/app/api/orders/[id]/pdf/route.ts
  - src/lib/types/planned-shipment.ts
  - src/lib/utils/shipment-helpers.ts
  - src/components/admin/shipment-modal.tsx
  - src/lib/data/actions/shipments.ts
  - src/components/ui/index.ts

  (b) Keep — safe to retain as‑is

  - src/lib/data/queries/products.ts

  (c) Reset/repurpose — core flows to revert to split‑order logic, while preserving any non‑shipment fixes

  - src/lib/data/actions/orders.ts
  - src/app/api/drafts/[id]/submit/route.ts
  - src/lib/schemas/order.ts
  - src/components/buyer/order-form.tsx
  - src/app/buyer/(shop)/my-order/client.tsx
  - src/lib/contexts/order-context.tsx
  - src/lib/data/queries/orders.ts
  - src/lib/types/order.ts
  - src/components/admin/orders-table.tsx
  - src/components/rep/rep-orders-table.tsx
  - src/components/admin/order-detail-client.tsx
  - src/app/admin/(protected)/(admin)/orders/[id]/page.tsx
  - src/app/api/drafts/[id]/route.ts
  - src/lib/validation/ship-window.ts
  - src/app/buyer/(shop)/my-order/page.tsx
  - src/lib/data/actions/collections.ts
  - src/lib/data/queries/collections.ts
  - src/components/admin/collections/collection-modal.tsx
  - src/components/admin/collections/affected-orders-preview-dialog.tsx
  - src/app/admin/(protected)/(admin)/collections/[id]/affected-orders/client.tsx
  - src/lib/email/shipment-date-change.ts
  - prisma/schema.prisma
  - prisma/migrations/manual_add_planned_shipments.sql
  - pending-migration.sql
  - current-db-schema.prisma

  If you want, I can now turn this into a concrete rollback plan (ordered steps + diffs), or start implementing a minimal, surgical revert that preserves product
  search and any other non‑shipment fixes.


› Review this plan:  Recommended Approach: Phased Revert

    Phase 1: Core Behavior (Do First, Test Immediately)

    Goal: Orders split again. Everything else can be inconsistent temporarily.
    ┌─────────────────────────────────────────┬───────────────────────────────────────┬─────────────────────────────┐
    │                  File                   │                Change                 │          Why First          │
    ├─────────────────────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
    │ src/lib/data/actions/orders.ts          │ Restore createOrder() splitting logic │ This IS the behavior change │
    ├─────────────────────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
    │ src/app/api/drafts/[id]/submit/route.ts │ Restore splitting logic               │ Drafts must match           │
    ├─────────────────────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
    │ src/lib/types/order.ts                  │ Return orders[] array again           │ Type safety                 │
    ├─────────────────────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
    │ src/lib/schemas/order.ts                │ Remove/ignore plannedShipments input  │ Schema alignment            │
    └─────────────────────────────────────────┴───────────────────────────────────────┴─────────────────────────────┘
    After Phase 1: Test that submitting a cart with 2 collections creates 2 separate orders. UI will look weird but behavior is correct.

    ---
    Phase 2: UI Alignment (Do Next)

    Goal: UI matches the split-order reality.
    ┌───────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────┐
    │                       File                        │                                    Change                                     │
    ├───────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
    │ src/components/buyer/email-confirmation-modal.tsx │ Restore "split into X orders" language                                        │
    ├───────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
    │ src/components/buyer/order-form.tsx               │ Remove multi-shipment cards, back to single date picker (or "orders preview") │
    ├───────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
    │ src/app/buyer/(shop)/my-order/client.tsx          │ Remove/simplify shipment derivation                                           │
    ├───────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
    │ src/lib/contexts/order-context.tsx                │ Remove shipment assignment state                                              │
    └───────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────┘
    After Phase 2: Buyer flow looks and works like before.

    ---
    Phase 3: Cleanup (Can Defer)

    Goal: Remove dead code. Not urgent - it won't break anything.

    - Delete new components (shipment-date-card.tsx, planned-shipments-section.tsx, etc.)
    - Remove unused queries/actions (planned-shipments.ts)
    - Clean up admin order detail (planned shipments section won't show anything meaningful)
    - Update collection date change workflow (affects orders, not shipments)

    This can wait - orphaned code is ugly but harmless.

    ---
    Why This Order?

    1. Phase 1 fixes the actual problem - orders split correctly
    2. Phase 2 prevents user confusion - UI matches behavior
    3. Phase 3 is technical debt - can tackle later or incrementally     following this discussion ---> yes check the original behavior (stay read only)

  ⏺ Explore(Research original order ship date behavior)
    ⎿  Done (34 tool uses · 88.1k tokens · 1m 18s)

  ⏺ Original Behavior Findings

    Before PlannedShipments Was Added:

    One Order = One Ship Window
    - CustomerOrders table had ShipStartDate and ShipEndDate on the order header
    - A single order row could only have ONE ship window
    - There was NO way to have multiple ship windows within a single order

    Multiple Windows = Multiple Orders (via splitting)
    - The getOrderGroupKey() function grouped cart items by {type}-collection-{collectionId}
    - Each group became a SEPARATE order with its own order number
    - Example: Cart with Collection A + Collection B → Order A10001 + Order P10002
    - Return value was: { success: true, orders: [{ orderId, orderNumber }, { orderId, orderNumber }] }

    Shipments Table = Fulfillment Only
    - The Shipments table tracked ACTUAL shipments (what physically shipped)
    - Had ShipDate (when it shipped), tracking numbers, costs
    - NO "planned" date fields - purely operational/fulfillment
    - Multiple shipments per order were for partial fulfillment (backorders, splits), not planned delivery windows

    ---
    Summary
    ┌────────────────────────────────────────────────────┬────────────────────────────────────────────────────────────┐
    │                      Question                      │                           Answer                           │
    ├────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────┤
    │ Could one order have multiple ship windows before? │ No                                                         │
    ├────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────┤
    │ How did multiple delivery dates work?              │ Order splitting - separate orders per collection           │
    ├────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────┤
    │ What was Shipments table for?                      │ Fulfillment tracking only - actual shipments, not planning │
    ├────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────┤
    │ Was there any shipment planning capability?        │ No - PlannedShipment is entirely new                       │
    └────────────────────────────────────────────────────┴────────────────────────────────────────────────────────────┘
    ---
    Implication for Revert

    If you revert to order splitting:
    - PlannedShipment table becomes unnecessary for the original use case
    - Each split order would have its ship window on the order header (as before)
    - The Shipments table continues to handle fulfillment (unchanged)

    The PlannedShipment infrastructure solved a problem that didn't need solving - the original splitting approach already handled "different delivery dates per
    collection" by creating separate orders.

  ✻ Baked for 1m 50s

  ❯ so what exactly needs to be reverted (read only please, just explain)

  ⏺ What Needs to Be Reverted

    Core Logic (Must Revert)

    1. src/lib/data/actions/orders.ts - createOrder() function
    - Current: Creates ONE order, then creates multiple PlannedShipment records, links items via PlannedShipmentID
    - Revert to: Loop through getOrderGroupKey() groups, create SEPARATE orders per collection, each with its own ShipStartDate/ShipEndDate on the order header
    - Return type: Change from single { orderId, orderNumber } back to array { orders: [{ orderId, orderNumber }, ...] }

    2. src/app/api/drafts/[id]/submit/route.ts - Draft submission
    - Current: Uses planned shipments approach (single order)
    - Revert to: Order splitting approach

    3. src/lib/types/order.ts - Return types
    - Current: CreateOrderResult returns single order
    - Revert to: Returns array of created orders

    ---
    UI That Becomes Inconsistent (Should Revert or Modify)

    4. src/components/buyer/email-confirmation-modal.tsx
    - Current: "Your order will ship in X shipments"
    - Revert to: "Your cart was split into X orders by delivery window" (original language)

    5. src/app/buyer/(shop)/my-order/client.tsx - Shipment derivation
    - Current: Computes plannedShipments array for single-order multi-shipment UI
    - Revert to: Could show "preview of orders to be created" or simplify to single date picker

    6. src/components/buyer/order-form.tsx - Multi-shipment cards
    - Current: Shows shipment cards with per-collection dates when plannedShipments.length > 1
    - Revert to: Either remove, or repurpose as "orders preview"

    ---
    Features That Become Orphaned (Can Remove or Leave)
    ┌───────────────────────────────────┬──────────────────────────────────────────────────────────┬──────────────────────────────────────────────────┐
    │              Feature              │                         Location                         │                   What Happens                   │
    ├───────────────────────────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
    │ PlannedShipment creation          │ createOrder()                                            │ Skip/remove                                      │
    ├───────────────────────────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
    │ PlannedShipmentID on items        │ CustomerOrdersItems                                      │ Don't populate (leave column, just null)         │
    ├───────────────────────────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
    │ Admin planned shipments UI        │ planned-shipments-section.tsx, planned-shipment-card.tsx │ Unused (each order = 1 collection)               │
    ├───────────────────────────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
    │ Item movement between shipments   │ move-item-modal.tsx, planned-shipments.ts                │ Unused                                           │
    ├───────────────────────────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
    │ Edit mode shipment handling       │ Phase 5 work in order-context.tsx, client.tsx            │ Unused                                           │
    ├───────────────────────────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
    │ Shipment count badge              │ orders-table.tsx                                         │ Always shows 1 (or remove)                       │
    ├───────────────────────────────────┼──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
    │ Collection date → shipment impact │ affected-orders-preview-dialog.tsx                       │ Would affect orders, not shipments within orders │
    └───────────────────────────────────┴──────────────────────────────────────────────────────────┴──────────────────────────────────────────────────┘
    ---
    What Can Stay (Still Useful)
    ┌────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────┐
    │                  Feature                   │                                Why Keep                                │
    ├────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
    │ Ship date validation (validateShipDates()) │ Still validates each split order's dates against its collection window │
    ├────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
    │ Order notes clearing fix                   │ Unrelated to splitting                                                 │
    ├────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
    │ Product search fix                         │ Unrelated                                                              │
    ├────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
    │ PlannedShipment table in DB                │ Leave it - no harm, already in prod, might use later                   │
    └────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────┘
    ---
    Summary: Minimum Revert Scope

    Must change (3 files):
    1. src/lib/data/actions/orders.ts - restore splitting logic
    2. src/app/api/drafts/[id]/submit/route.ts - restore splitting logic
    3. src/lib/types/order.ts - restore array return type

    Should change (3 files):
    4. src/components/buyer/email-confirmation-modal.tsx - restore "split into X orders" language
    5. src/app/buyer/(shop)/my-order/client.tsx - simplify or remove multi-shipment derivation
    6. src/components/buyer/order-form.tsx - remove/simplify multi-shipment UI

    Can leave as-is (orphaned but harmless):
    - Admin planned shipments UI (just won't show multiple)
    - PlannedShipment table (empty but exists)
    - Item movement feature (unused)

  ✻ Brewed for 33s

  ❯ Consider this paralllel perspective: Here’s what I found by checking the pre‑PlannedShipment code (commit 8d9f99a, read‑only):

      Original behavior (confirmed in code)

      - Single ship window per order. The buyer form only had shipStartDate and shipEndDate fields (no per‑shipment cards). Defaults: pre‑order uses category
    on‑route
        dates, ATS uses today → today+14, edit mode uses existing order header dates. src/components/buyer/order-form.tsx
      - Server split into multiple orders by delivery window + order type. createOrder() grouped items by order type (ATS vs Pre‑Order) and ship window/category,
    then
        created one CustomerOrders header per group, each with its own order number and its own header ship dates (from the group’s window, otherwise the form
    dates). src/
        lib/data/actions/orders.ts
      - Order items carried category/ship‑window metadata (not planned shipments). The order input schema had categoryId/categoryName/shipWindowStart/shipWindowEnd
    on
        items, and no plannedShipments field. src/lib/schemas/order.ts
      - UI acknowledged splitting. After submit, the buyer flow showed a toast like “Order split into X orders by delivery window,” then opened a single‑order email
     modal
        (no shipment summary). src/components/buyer/order-form.tsx, src/components/buyer/email-confirmation-modal.tsx
      - Draft submit also split into multiple orders. Draft submission used the same grouping logic and created multiple orders on submit.
    src/app/api/drafts/[id]/submit/
        route.ts

      Net conclusion
      The original system behavior was one ship window per order and multiple orders created at submit when delivery windows differed. There was no “planned
    shipments”
      concept in the order data model or buyer UI—only the existing fulfillment shipments table.

      If you want, I can now bucket the current changes into (a) rollback, (b) keep, (c) reset/repurpose, with exact files per bucket. + Below is a clean
    bucketization assuming the target is restore split‑order behavior and remove “planned shipments inside a single order”. Files listed are exact
      paths.

      (a) Rollback — remove/restore to pre‑PlannedShipment behavior (dedicated UI/components)

      - src/components/buyer/shipment-date-card.tsx
      - src/components/ui/shipment-timeline.tsx
      - src/components/admin/order-detail/planned-shipments-section.tsx
      - src/components/admin/order-detail/planned-shipment-card.tsx
      - src/components/admin/order-detail/move-item-modal.tsx
      - src/lib/data/actions/planned-shipments.ts
      - src/components/buyer/email-confirmation-modal.tsx
      - src/lib/email/templates.ts
      - src/lib/email/send-order-emails.ts
      - src/lib/pdf/order-confirmation.ts
      - src/app/api/orders/[id]/pdf/route.ts
      - src/lib/types/planned-shipment.ts
      - src/lib/utils/shipment-helpers.ts
      - src/components/admin/shipment-modal.tsx
      - src/lib/data/actions/shipments.ts
      - src/components/ui/index.ts

      (b) Keep — safe to retain as‑is

      - src/lib/data/queries/products.ts

      (c) Reset/repurpose — core flows to revert to split‑order logic, while preserving any non‑shipment fixes

      - src/lib/data/actions/orders.ts
      - src/app/api/drafts/[id]/submit/route.ts
      - src/lib/schemas/order.ts
      - src/components/buyer/order-form.tsx
      - src/app/buyer/(shop)/my-order/client.tsx
      - src/lib/contexts/order-context.tsx
      - src/lib/data/queries/orders.ts
      - src/lib/types/order.ts
      - src/components/admin/orders-table.tsx
      - src/components/rep/rep-orders-table.tsx
      - src/components/admin/order-detail-client.tsx
      - src/app/admin/(protected)/(admin)/orders/[id]/page.tsx
      - src/app/api/drafts/[id]/route.ts
      - src/lib/validation/ship-window.ts
      - src/app/buyer/(shop)/my-order/page.tsx
      - src/lib/data/actions/collections.ts
      - src/lib/data/queries/collections.ts
      - src/components/admin/collections/collection-modal.tsx
      - src/components/admin/collections/affected-orders-preview-dialog.tsx
      - src/app/admin/(protected)/(admin)/collections/[id]/affected-orders/client.tsx
      - src/lib/email/shipment-date-change.ts
      - prisma/schema.prisma
      - prisma/migrations/manual_add_planned_shipments.sql
      - pending-migration.sql
      - current-db-schema.prisma
     (DO NOT EDIT)

  ⏺ This is a more comprehensive bucketing than mine. Let me synthesize both analyses:

    ---
    Comparison: My Analysis vs. Parallel Analysis
    ┌──────────────────────────────────┬────────────────────────────────────────────────┬──────────────────────────────────────────┐
    │              Aspect              │                  My Analysis                   │            Parallel Analysis             │
    ├──────────────────────────────────┼────────────────────────────────────────────────┼──────────────────────────────────────────┤
    │ Core files to revert             │ 3 files                                        │ 6 files in bucket (c) core               │
    ├──────────────────────────────────┼────────────────────────────────────────────────┼──────────────────────────────────────────┤
    │ UI components to remove/rollback │ Mentioned as "orphaned"                        │ 16 files explicitly listed in bucket (a) │
    ├──────────────────────────────────┼────────────────────────────────────────────────┼──────────────────────────────────────────┤
    │ Files to keep                    │ 3 features (validation, notes fix, search fix) │ Just products.ts                         │
    ├──────────────────────────────────┼────────────────────────────────────────────────┼──────────────────────────────────────────┤
    │ Total scope                      │ ~6 files                                       │ ~40+ files across buckets                │
    └──────────────────────────────────┴────────────────────────────────────────────────┴──────────────────────────────────────────┘
    The parallel analysis is more thorough - it identified dedicated components I missed (like shipment-timeline.tsx, shipment-helpers.ts) and the full downstream
  impact
     (emails, PDFs, collection change workflow).

    ---
    Key Insight from Bucket (a)

    These are NEW files created specifically for PlannedShipments that didn't exist before:

    src/components/buyer/shipment-date-card.tsx          ← NEW
    src/components/ui/shipment-timeline.tsx              ← NEW
    src/components/admin/order-detail/planned-shipments-section.tsx  ← NEW
    src/components/admin/order-detail/planned-shipment-card.tsx      ← NEW
    src/components/admin/order-detail/move-item-modal.tsx            ← NEW
    src/lib/data/actions/planned-shipments.ts            ← NEW
    src/lib/types/planned-shipment.ts                    ← NEW
    src/lib/utils/shipment-helpers.ts                    ← NEW

    These can potentially be deleted entirely rather than reverted.

    ---
    Key Insight from Bucket (c)

    These are existing files that were modified - they need careful surgical revert:
    ┌──────────────────────────────┬───────────────────────────────────────────────┬──────────────────────────────┐
    │             File             │                 What Changed                  │      Revert Complexity       │
    ├──────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────┤
    │ orders.ts (actions)          │ Core createOrder() logic                      │ High - restore grouping loop │
    ├──────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────┤
    │ drafts/[id]/submit/route.ts  │ Same splitting logic                          │ High                         │
    ├──────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────┤
    │ order.ts (schemas)           │ Added plannedShipments to input               │ Medium                       │
    ├──────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────┤
    │ order-form.tsx               │ Added multi-shipment UI                       │ Medium                       │
    ├──────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────┤
    │ order-context.tsx            │ Added shipment state management               │ Medium                       │
    ├──────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────┤
    │ orders.ts (queries)          │ Added plannedShipmentCount, shipment fetching │ Medium                       │
    ├──────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────┤
    │ email-confirmation-modal.tsx │ Language change                               │ Low                          │
    ├──────────────────────────────┼───────────────────────────────────────────────┼──────────────────────────────┤
    │ collection-modal.tsx         │ Added shipment impact preview                 │ Medium                       │
    └──────────────────────────────┴───────────────────────────────────────────────┴──────────────────────────────┘
    ---
    What About ship-window.ts Validation?

    The parallel analysis puts src/lib/validation/ship-window.ts in bucket (c) reset/repurpose.

    Question: Was ship date validation against collection windows NEW, or did it exist before in some form?

    If new → could remove or keep (still useful for validating each split order)
    If existed → restore original form

    ---
    Schema Consideration

    prisma/schema.prisma
    prisma/migrations/manual_add_planned_shipments.sql

    The PlannedShipment model is in prod. Options:
    1. Leave table, just don't use it - safest, no migration needed
    2. Remove from schema, add rollback migration - cleaner but riskier

    ---
    Suggested Approach

    Given the scope (~40 files), would a git-based revert to a pre-PlannedShipment commit be cleaner than surgical file-by-file changes? Then selectively re-apply:
    - Product search fix
    - Order notes fix
    - Any other unrelated improvements

    What's your preference on approach?

  ✻ Sautéed for 32s

  ❯ A git-based revert won't work because I have had messy commits since then.
    About this issue - The PlannedShipment model is in prod. Options:

      1. Leave table, just don't use it - safest, no migration needed      Leave table for now, thanks. I'm not sure what to do, what do you advise?

  ⏺ Given the constraints (messy git history, PlannedShipment table stays), here's my advice:


• A staged rollback is valid but keep ship-window validation intact to avoid breaking delivery timing. It's safest to retain the current collection-based shipStart/End
  windows if that is now the canonical source, though offering an option to revert to category-based windows can help if data quality supports it. Emphasize reviewing
  createOrder return types since downstream UI expects shipments arrays; update API response types accordingly. Note that admin/rep lists rely on plannedShipmentCount
  from queries, which should be removed or repurposed for split orders. Also, clarify preOrder logic changes tied to collection types versus SkuCategories in
  createOrder and assess if reverting is needed. For the unused table, advise leaving it in place for now to avoid orphaned references but mark it clearly deprecated.
  Provide a checklist covering these validation points, type updates, UI impact, and data source decisions to guide safe rollout and rollback.

  Reviewing and enhancing rollback plan

  The plan is solid but Phase 1 should also update order-form and email modal to handle the new orders array shape and prevent runtime errors. Ship-window validation
  must be kept per order group to meet delivery policies, or reverting it risks violating requirements temporarily. Decide whether to use category-based or collection-
  based ship windows and pre-order detection based on canonical data. Phase 2 should focus on buyer UI updates to single date fields and removing multi-shipment flows,
  while Phase 3 cleans up planned shipment UI and related admin queries. Keeping the PlannedShipment table is advised but writes should be disabled to avoid
  inconsistencies, and code relying on it (e.g., admin shipment modal) must handle empty data gracefully. This ensures a safe, staged migration without breaking
  existing user flows.

• Plan is directionally right, but Phase 1 is a little too small to be safe. Here’s the review with the minimum adjustments I’d recommend.

  Phase 1 (Core behavior) — add these to avoid runtime/type breakage

  - Add a minimal consumer fix in src/components/buyer/order-form.tsx so it can handle the reverted return shape (orders[]). Right now that file expects the “single
    order + shipments” path; if you flip the backend without a tiny front‑end change, the submit flow will break.
  - Decide and align ship‑window source before restoring grouping logic:
      - Old behavior used SkuCategories.OnRouteAvailableDate/End.
      - Current code uses Collection.shipWindowStart/End.
      - Pick one as canonical (likely Collection, since it’s now the source of truth), and ensure the split grouping uses that same source.
  - Keep ship‑window validation, but move it to per‑order group (not per‑planned‑shipment). Otherwise you’ll lose the CEO rule (“cannot be earlier than collection
    window”) during Phase 1.
  - Pre‑Order detection source: old logic used SkuCategories.IsPreOrder; current uses Collection.type. Choose one and keep it consistent across create/draft paths.

  So Phase 1 should be:

  - src/lib/data/actions/orders.ts (restore splitting, align window source, per‑group validation, pre‑order logic)
  - src/app/api/drafts/[id]/submit/route.ts (same)
  - src/lib/types/order.ts (return shape)
  - src/lib/schemas/order.ts (drop plannedShipments input)
  - src/components/buyer/order-form.tsx (minimal compatibility update)

  Phase 2 (UI alignment) — good as‑is, but call out admin/rep lists

  - Your list is correct. I’d add:
      - src/components/admin/orders-table.tsx and src/components/rep/rep-orders-table.tsx
        These still assume shipment counts / timelines; with split orders they will look wrong or redundant.

  Phase 3 (Cleanup) — good, but include collection workflow + shipment modal

  - Add:
      - src/components/admin/shipment-modal.tsx and src/lib/data/actions/shipments.ts
        These currently reference planned shipments; once planned shipments are unused, they should degrade gracefully or be cleaned up.
      - src/lib/data/actions/collections.ts, src/lib/data/queries/collections.ts, src/components/admin/collections/*, src/app/admin/(protected)/(admin)/collections/
        [id]/affected-orders/client.tsx
        The collection‑change flow is currently shipment‑based and will be misleading under split‑order behavior.

  On leaving PlannedShipment in prod

  - I agree with “leave it for now.” Best advice: stop writing to it, but don’t remove it. Treat it as dormant until you decide future use. No migration risk, no data
    loss risk. You can optionally add a small guard later to ensure it stays unused (e.g., no writes in create/draft/update).

  Bottom line

  - Your phase order is good, but Phase 1 needs a small front‑end compatibility fix plus a firm decision on ship‑window source and pre‑order source. That prevents a
    “behavior is correct but app is broken” gap.

  If you want, I can refine Phase 1 into a concrete, file‑by‑file checklist (still read‑only) with the exact function blocks to swap back to pre‑PlannedShipment
  behavior.


› Yes, refine Phase 1 into a concrete, file‑by‑file checklist (still read‑only) with the exact function blocks to swap back to pre‑PlannedShipment
    behavior


• I'm inspecting current orders.ts to identify exact function blocks like createOrder and helpers affecting planned shipments, noting places to swap legacy grouping
  from commit 8d9f99a. I'll specify function names, file paths, and how to replace current shipment handling by restoring _getOrderGroupKey usage and removing newer
  helpers accordingly.

  Preparing concise function references

  I'll limit snippets to under 25 words and focus on function names with surrounding comments, especially around createOrder and draft submit, using sed for targeted
  segments.

• Explored
  └ Search createOrder\(|updateOrder\(|getLegacyDatesFromShipments|deriveShipmentsFromItems|_getOrderGroupKey in orders.ts
    Read orders.ts

• Creating a detailed, per-file checklist specifying exact code blocks to remove or restore for the Phase1 rollback, focusing on handling group order logic without
  planned shipments and simplifying validation accordingly.

  Extending Phase1 checklist with order creation and draft submit details

  Clarifying steps to revert order creation to looping over groups, removing planned shipments and related fields, adjusting email sending per order, and returning
  orders array with primary order info. Planning to reintroduce old group key logic based on collectionId and adjust ship date validation per group. Also noting need
  to restore old grouping function in draft submit route to replace planned shipments handling.

• Explored
  └ Read route.ts, order.ts

• Phase1 requires minimal changes to handle the new createOrder result with orders array while preventing UI breakage; the plan is to adapt order-form to construct a
  shipments array from result.orders for the modal and toasts, accepting imperfect UI but ensuring correctness and no crashes.

  Verifying order-form dependencies on shipment count

  I'm checking if reverting types to return orders array and removing plannedShipmentCount breaks order-form logic, especially around ShipmentSummary usage in
  submission and modal handling.

• Explored
  └ Search EmailConfirmationModal|plannedShipments|orderCount|submittedOrder in order-form.tsx
    Read order-form.tsx

• Phase1 requires removing plannedShipments from the schema and input, so the frontend must stop sending it. This means the order-form's createOrder call and related
  variables must revert to pre-plannedShipments logic to compile and work correctly, even if the multi-shipment UI remains inconsistent.

  Detailing Phase1 revert checklist with function blocks

  I’m outlining precise function blocks to swap back to pre-PlannedShipment behavior for Phase1, referencing old grouping logic (commit 8d9f99a) and noting key
  removals like plannedShipments from createOrder input, schema, and validation. This includes disabling shipment validation gating in the order-form onSubmit to avoid
  submit blocks, keeping updateOrder unchanged, and adjusting API submit routes and types accordingly.

─ Worked for 33s ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Phase 1 checklist — exact blocks to swap back (read‑only)
  Target: restore split‑order behavior while keeping the app compiling. Use commit 8d9f99a as the reference shape for the legacy blocks.

  1) src/lib/data/actions/orders.ts — createOrder()

  - Replace the “planned shipments” pipeline
    Remove block: from // Use provided plannedShipments or derive from items through the end of the shipment validation section (the entire “Server‑side validation:
    Batch fetch collections and validate dates” loop).
    Restore block: legacy grouping loop (from 8d9f99a) that:
      - Builds itemGroups using getOrderGroupKey (you already have _getOrderGroupKey; use it).
      - Creates one order per group with its own order number.
  - Replace single‑order totals/dates
    Remove block: // Calculate order totals and legacy dates (and the legacyDates calculation).
    Restore block: per‑group orderAmount, shipStart, shipEnd using group item metadata (collection window when present, otherwise form dates).
  - Replace single‑order transaction
    Remove block: everything under // Generate SINGLE order number through // CREATE PLANNED SHIPMENTS and the PlannedShipmentID mapping.
    Restore block: “Create one order per group” loop (from 8d9f99a) that:
      - Generates orderNumber per group (A/P based on group’s pre‑order status).
      - Creates CustomerOrders and CustomerOrdersItems without PlannedShipmentID.
      - Increments OrderCount by createdOrders.length, not by 1.
  - Replace single‑order email + return payload
    Remove block: // Send email for the single order and shipmentSummaries built from planned shipments.
    Restore block: send email per created order and return { orders: [...] } (plus a primaryOrder for backward compatibility).
    Also remove: plannedShipmentCount and createdShipmentIds usage.

  2) src/app/api/drafts/[id]/submit/route.ts — draft submit

  - Replace planned‑shipment derivation
    Remove block: // Phase 9: Use planned shipments instead of splitting orders through the planned‑shipment validation loop.
    Restore block: legacy getOrderGroupKey grouping (from 8d9f99a) using the existing items array and skuPreOrderMap.
  - Replace single‑order transaction
    Remove block: // Create SINGLE order + // Create planned shipments + PlannedShipmentID assignment.
    Restore block: loop creating one order per group, creating items without PlannedShipmentID.
  - Adjust return payload
    Remove: plannedShipmentCount.
    Return: { orders: [...] } (plus orderId/orderNumber of the first order for compatibility).

  3) src/lib/schemas/order.ts — input schema

  - Remove planned‑shipment input from order creation
    Remove block: plannedShipmentSchema definition and the plannedShipments field inside createOrderInputSchema.
    Keep: orderItemSchema fields collectionId/collectionName/shipWindowStart/shipWindowEnd (needed for grouping).

  4) src/lib/types/order.ts — CreateOrderResult

  - Restore legacy return shape
    Remove: plannedShipmentCount.
    Set orders[] as primary return (array of created orders).
    Optionally keep: orderId/orderNumber for the first order (backward compatibility, as in 8d9f99a).

  5) src/components/buyer/order-form.tsx — create‑order submit branch

  - Stop sending planned shipments to createOrder()
    Remove block: finalPlannedShipments assembly + getLegacyDatesFromShipments() usage + plannedShipments: in the payload.
    Restore block: legacy call that only passes items with collectionId/shipWindowStart/shipWindowEnd.
  - Avoid client‑side shipment validation blocking
    Remove block: if (hasShipmentValidationErrors && !overrideConfirmed) { ... } because it’s based on planned shipments and will incorrectly block split orders.
    (Server‑side validation remains in createOrder() per group.)
  - Keep result handling based on result.orders
    The modal can still consume orders[] even if the text is wrong (Phase 2 will fix language).

  If you want, I can turn each of these blocks into “before/after” snippets (still read‑only) so you can drop them in exactly.


› This is a solid, detailed checklist. Let me organize it for clarity:

    ---
    Phase 1 Checklist Summary

    Decisions Required Before Starting
    ┌────────────────────┬────────────────────────────────────────┬────────────────────────────────┬────────────────────────────────┐
    │      Decision      │             Old (8d9f99a)              │            Current             │         Recommendation         │
    ├────────────────────┼────────────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
    │ Ship window source │ SkuCategories.OnRouteAvailableDate/End │ Collection.shipWindowStart/End │ Use Collection (now canonical) │
    ├────────────────────┼────────────────────────────────────────┼────────────────────────────────┼────────────────────────────────┤
    │ PreOrder detection │ SkuCategories.IsPreOrder               │ Collection.type                │ Use Collection (consistent)    │
    └────────────────────┴────────────────────────────────────────┴────────────────────────────────┴────────────────────────────────┘
    ---
    File-by-File Changes
    ┌─────┬─────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
    │  #  │                  File                   │                               Action Summary                                │
    ├─────┼─────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
    │ 1   │ src/lib/data/actions/orders.ts          │ Restore grouping loop, remove PlannedShipment creation, return orders[]     │
    ├─────┼─────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
    │ 2   │ src/app/api/drafts/[id]/submit/route.ts │ Same - restore grouping, remove PlannedShipment                             │
    ├─────┼─────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
    │ 3   │ src/lib/schemas/order.ts                │ Remove plannedShipments from input schema                                   │
    ├─────┼─────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
    │ 4   │ src/lib/types/order.ts                  │ Return orders[] array, remove plannedShipmentCount                          │
    ├─────┼─────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
    │ 5   │ src/components/buyer/order-form.tsx     │ Stop sending plannedShipments, remove client-side shipment validation block │
    └─────┴─────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘
    ---
    Key Points

    1. Ship-window validation stays - but moves to per-order-group (not per-planned-shipment)
    2. _getOrderGroupKey() already exists - just need to use it
    3. PlannedShipmentID columns stay in DB - just don't populate them
    4. Email sends per created order - not once for single order
    5. Modal will work - consumes orders[], language fix is Phase 2

    ---
    After Phase 1 Completes

    What works:
    - Cart with 2 collections → 2 separate orders created
    - Each order has correct ship dates from its collection
    - Validation enforces "not earlier than collection window"

    What looks wrong (fixed in Phase 2):
    - Modal may say wrong things about shipments
    - Multi-shipment UI cards still visible (but ignored)
    - Admin/rep tables show shipment counts that don't mean anything


• Looks good; suggest clarifying that ship-window validation uses Collection grouping with fallback keys, date sources come from Collection, and pre-order detection
  integrates with grouping logic. Note to remove client-side order-form validation to prevent blocking but keep server checks. Also, update orderAmount per group and
  increment orderCount by createdOrders.length, preserving skipEmail support per order. No edits needed to updateOrder for Phase1; ensure createOrder result type
  aligns with order-form, and keep customer upsert on draft submit.

  Clarifying collection window validation

  Phase1 keeps current validation: error if collection windows are missing, enforcing no dates before season start/end. Fallback to form dates only if collection
  windows exist. Legacy shipment date helpers can remain unused but should be removed from createOrder in Phase1.

• This looks solid and internally consistent. Two small clarifications/additions to make Phase 1 safer:

  - In both createOrder() and draft submit, increment Customer.OrderCount by the number of created orders, not by 1. (This was part of the legacy split‑order path.)
  - Keep per‑group ship‑window validation aligned to the same source you choose for grouping (Collection). If a collection window is missing, decide up front whether
    to block or allow; right now the planned‑shipment path blocks unless override.

  Otherwise I agree with your checklist as‑is, including the decision table (Collection is the canonical source for both ship windows and pre‑order detection). If you
  want, I can turn each Phase 1 item into exact “replace this block with that block” snippets from 8d9f99a (still read‑only).

• Model changed to gpt-5.2-codex xhigh


› Yes, turn each Phase 1 item into exact “replace this block with that block” snippets from 8d9f99a


• I'm gathering exact block replacements from current and legacy versions of key files like orders.ts, focusing on precise and minimal segments with anchor comments
  for clarity and adherence to read-only constraints.

  Outlining precise block replacements

  I'm planning to provide explicit start/end comment anchors for minimal but exact code segments to replace in orders.ts, matching each Phase 1 item with paired
  current and legacy blocks extracted from commit 8d9f99a.

• Ran git show 8d9f99a:src/lib/data/actions/orders.ts | sed -n '260,560p'
  └
    /**
    … +301 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-kIW4C05m' (errno=Operation not permitted)

• Ran git show 8d9f99a:src/lib/data/actions/orders.ts | sed -n '560,820p'
  └     // When skipEmail is true, emails are sent via the confirmation popup instead
        if (!data.skipEmail) {
    … +261 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-fRo6bYnL' (errno=Operation not permitted)

• I'm focusing on delivering precise "replace this block with that block" snippets from commit 8d9f99a as requested, showing legacy and new blocks with code fences and
  comment anchors. I'll note the Collection versus category difference without altering the exact legacy code, respecting the user's ask for exact replacements.

  Extracting and comparing code blocks for replacements

  I'm gathering legacy snippets from the submit route, schemas, types, and order-form around key logic blocks to show concise "replace this with that" pairs. I'll
  present current and legacy blocks side-by-side with clear comment anchors as requested.

• Ran git show 8d9f99a:"src/components/buyer/order-form.tsx" | sed -n '400,540p'
  └     setValue('shippingStateProvince', billingStateProvince || '')
        setValue('shippingZipPostal', billingZipPostal || '')
    … +141 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-zCjhwmsq' (errno=Operation not permitted)

• I'm mapping out to keep the initial prelude including blockIfAdminViewAs in createOrder, then replace the block from the comment // Derive order type... through the
  final return with the legacy block for Phase 3, breaking it down for clarity while respecting the user's request for exact blocks from commit 8d9f99a.

  Preparing exact legacy block replacements with notes

  I'm defining precise boundaries to replace createOrder’s main processing block while preserving the current blockIfAdminViewAs and validation, noting legacy code
  uses category/shipWindow but user wants exact legacy blocks from 8d9f99a. I'll also extract the full legacy grouping, transaction, and email-sending blocks from the
  draft submit file to replace planned shipment logic, while flagging leftover unused helpers and imports for later cleanup.

• Ran git show 8d9f99a:"src/app/api/drafts/[id]/submit/route.ts" | sed -n '240,520p'
  └     })
        const skuDataMap = new Map(skuRecords.map(s => [s.SkuID, s]))
    … +178 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-Nwn3pzT5' (errno=Operation not permitted)

• I'm deciding whether to reuse the legacy block from the commit 8d9f99a or the current version for types/order.ts, so I'll fetch that specific code around createOrder
  to confirm the exact structure.

• Ran git show 8d9f99a:src/lib/types/order.ts | sed -n '130,220p'
  └     shipWindowEnd: string | null
      }>
    … +37 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-j9eORA1b' (errno=Operation not permitted)

• I'm retrieving earlier lines to capture the complete CreateOrderResult definition from the specified commit for inclusion.

• Ran git show 8d9f99a:src/lib/types/order.ts | sed -n '100,170p'
  └   q?: string;
      rep?: string;
    … +67 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-YLCGD9zu' (errno=Operation not permitted)

• I'm preparing to replace the entire onSubmit function in order-form.tsx with the legacy version to remove planned shipments and shipment validation, but I'll verify
  this won't discard other needed order-form features like order notes clearing.

  Preparing Phase 1 block replacements

  I'm outlining exact block replacements from commit 8d9f99a for five key files, including targeted instructions and notes about dependencies on collection vs.
  category fields and preserving certain current logic like blockIfAdminViewAs. The replacements include createOrder internals, draft submit route, schemas/types
  adjustments, and partial order-form onSubmit edits to remove planned shipments and validation without breaking modal usage.

─ Worked for 21s ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Here are the exact “replace this block with that block” snippets from commit 8d9f99a, organized by your Phase 1 files. I’ve included precise anchor instructions so
  you can drop them in without guesswork (still read‑only).

  1) src/lib/data/actions/orders.ts — createOrder() core logic
  Replace the block inside createOrder() that starts at the comment:
  // Derive order type from SKU data (master source: Collection.type)
  and ends at the return { success: true, ... } in that function.

  Replace with this block from 8d9f99a:

  // Derive order type from SKU data (master source: SkuCategories.IsPreOrder)
  const skuVariantIds = data.items.map((item) => BigInt(item.skuVariantId))
  const skuPreOrderMap = await deriveIsPreOrderFromSkus(skuVariantIds)

  // Group items by order type AND ship window (auto-split mixed ATS/Pre-Order)
  const itemGroups = new Map<string, typeof data.items>()
  for (const item of data.items) {
    const key = getOrderGroupKey(item, skuPreOrderMap)
    if (!itemGroups.has(key)) {
      itemGroups.set(key, [])
    }
    itemGroups.get(key)!.push(item)
  }

  // Track created orders
  const createdOrders: Array<{
    orderId: string
    orderNumber: string
    categoryName: string | null
    shipWindowStart: string | null
    shipWindowEnd: string | null
    orderAmount: number
    items: typeof data.items
  }> = []

  // Create orders in a single transaction for atomicity
  await prisma.$transaction(async (tx) => {
    // Look up rep by ID - fail if not found
    const rep = await tx.reps.findUnique({
      where: { ID: parseInt(data.salesRepId) },
      select: { Name: true, Code: true },
    })
    if (!rep) {
      throw new Error('Invalid sales rep')
    }
    const salesRepName = rep.Name ?? ''
    const salesRepCode = rep.Code?.trim() || rep.Name || ''

    // Determine customerId for strong ownership
    let customerId: number | null = data.customerId ?? null
    if (!customerId) {
      const existingByName = await tx.customers.findFirst({
        where: { StoreName: data.storeName },
        select: { ID: true },
      })
      if (existingByName) {
        customerId = existingByName.ID
      }
    }

    // Create one order per ship window group (and order type)
    for (const [groupKey, groupItems] of itemGroups) {
      // Determine order type from first item's SKU (all items in group have same type)
      const firstItemVariantId = String(groupItems[0].skuVariantId)
      const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false

      // Generate order number with appropriate prefix
      const orderNumber = await getNextOrderNumber(isPreOrder)

      // Calculate group total
      const orderAmount = groupItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      )

      // Use item's ship window if available, else form dates
      const firstItem = groupItems[0]
      const shipStart = firstItem.shipWindowStart
        ? new Date(firstItem.shipWindowStart)
        : new Date(data.shipStartDate)
      const shipEnd = firstItem.shipWindowEnd
        ? new Date(firstItem.shipWindowEnd)
        : new Date(data.shipEndDate)

      // Create order header
      const newOrder = await tx.customerOrders.create({
        data: {
          OrderNumber: orderNumber,
          BuyerName: data.buyerName,
          StoreName: data.storeName,
          SalesRep: salesRepName,
          CustomerEmail: data.customerEmail,
          CustomerPhone: data.customerPhone,
          Country: data.currency, // Legacy: stores currency, not country
          OrderAmount: orderAmount,
          OrderNotes: data.orderNotes ?? '',
          CustomerPO: data.customerPO ?? '',
          ShipStartDate: shipStart,
          ShipEndDate: shipEnd,
          OrderDate: new Date(),
          Website: data.website ?? '',
          IsShipped: false,
          OrderStatus: 'Pending',
          IsTransferredToShopify: false,
          IsPreOrder: isPreOrder, // Derived from SKU category, not client input
          RepID: parseInt(data.salesRepId),
          CustomerID: customerId,
        },
      })

      // Create line items for this group
      await tx.customerOrdersItems.createMany({
        data: groupItems.map((item) => ({
          CustomerOrderID: newOrder.ID,
          OrderNumber: orderNumber,
          SKU: item.sku,
          SKUVariantID: BigInt(item.skuVariantId),
          Quantity: item.quantity,
          Price: item.price,
          PriceCurrency: data.currency,
          Notes: '',
        })),
      })

      createdOrders.push({
        orderId: newOrder.ID.toString(),
        orderNumber,
        categoryName: firstItem.categoryName ?? null,
        shipWindowStart: firstItem.shipWindowStart ?? null,
        shipWindowEnd: firstItem.shipWindowEnd ?? null,
        orderAmount,
        items: groupItems,
      })
    }

    // Find or create customer (only once, not per order)
    const existingCustomer = await tx.customers.findFirst({
      where: { StoreName: data.storeName },
      select: { ID: true, OrderCount: true },
    })

    if (existingCustomer) {
      await tx.customers.update({
        where: { ID: existingCustomer.ID },
        data: {
          CustomerName: data.buyerName,
          Email: data.customerEmail,
          Phone: data.customerPhone,
          Rep: salesRepCode,
          Street1: data.street1,
          Street2: data.street2 ?? '',
          City: data.city,
          StateProvince: data.stateProvince,
          ZipPostal: data.zipPostal,
          Country: data.country,
          ShippingStreet1: data.shippingStreet1,
          ShippingStreet2: data.shippingStreet2 ?? '',
          ShippingCity: data.shippingCity,
          ShippingStateProvince: data.shippingStateProvince,
          ShippingZipPostal: data.shippingZipPostal,
          ShippingCountry: data.shippingCountry,
          Website: data.website ?? '',
          LastOrderDate: new Date(),
          OrderCount: (existingCustomer.OrderCount ?? 0) + createdOrders.length,
        },
      })
    } else {
      // Create new customer and update all orders with CustomerID
      const newCustomer = await tx.customers.create({
        data: {
          StoreName: data.storeName,
          CustomerName: data.buyerName,
          Email: data.customerEmail,
          Phone: data.customerPhone,
          Rep: salesRepCode,
          Street1: data.street1,
          Street2: data.street2 ?? '',
          City: data.city,
          StateProvince: data.stateProvince,
          ZipPostal: data.zipPostal,
          Country: data.country,
          ShippingStreet1: data.shippingStreet1,
          ShippingStreet2: data.shippingStreet2 ?? '',
          ShippingCity: data.shippingCity,
          ShippingStateProvince: data.shippingStateProvince,
          ShippingZipPostal: data.shippingZipPostal,
          ShippingCountry: data.shippingCountry,
          Website: data.website ?? '',
          FirstOrderDate: new Date(),
          LastOrderDate: new Date(),
          OrderCount: createdOrders.length,
        },
        select: { ID: true },
      })

      // Update all created orders with new customer's ID
      for (const order of createdOrders) {
        await tx.customerOrders.update({
          where: { ID: BigInt(order.orderId) },
          data: { CustomerID: newCustomer.ID },
        })
      }
    }
  })

  // Send order confirmation emails (non-blocking) unless skipEmail is set
  // When skipEmail is true, emails are sent via the confirmation popup instead
  if (!data.skipEmail) {
    // Send email for each created order
    for (const order of createdOrders) {
      sendOrderEmails({
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        storeName: data.storeName,
        buyerName: data.buyerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        salesRep: data.storeName, // Will be looked up by email service
        orderAmount: order.orderAmount,
        currency: data.currency,
        shipStartDate: order.shipWindowStart ? new Date(order.shipWindowStart) : new Date(data.shipStartDate),
        shipEndDate: order.shipWindowEnd ? new Date(order.shipWindowEnd) : new Date(data.shipEndDate),
        orderDate: new Date(),
        orderNotes: data.orderNotes,
        customerPO: data.customerPO,
        items: order.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
          lineTotal: item.price * item.quantity,
        })),
      }).catch((err) => {
        console.error(`Order email error for ${order.orderNumber}:`, err)
      })
    }
  }

  revalidatePath('/admin/orders')

  // Return first order for backwards compatibility, plus full orders array
  const primaryOrder = createdOrders[0]
  return {
    success: true,
    orderId: primaryOrder?.orderId,
    orderNumber: primaryOrder?.orderNumber,
    orders: createdOrders.map((o) => ({
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      categoryName: o.categoryName,
      shipWindowStart: o.shipWindowStart,
      shipWindowEnd: o.shipWindowEnd,
    })),
  }

  Note: this block uses getOrderGroupKey and category* fields as in 8d9f99a. If you’re keeping Collection as canonical, swap category* → collection* and call
  _getOrderGroupKey.

  ———

  2) src/app/api/drafts/[id]/submit/route.ts — grouping + split creation
  Replace the block that starts at:
  // Phase 9: Use planned shipments instead of splitting orders
  and ends at the JSON response (current single‑order path).

  Replace with this block from 8d9f99a:

  // Group items by order type AND ship window (auto-split mixed ATS/Pre-Order)
  const itemGroups = new Map<string, typeof items>()
  for (const item of items) {
    const key = getOrderGroupKey(item, skuPreOrderMap)
    if (!itemGroups.has(key)) {
      itemGroups.set(key, [])
    }
    itemGroups.get(key)!.push(item)
  }

  const currency = formData.currency || 'CAD'

  // Track created orders
  const createdOrders: Array<{
    orderId: string
    orderNumber: string
    categoryName: string | null
    shipWindowStart: string | null
    shipWindowEnd: string | null
    orderAmount: number
    items: typeof items
  }> = []

  await prisma.$transaction(async (tx) => {
    // Delete the draft first (we'll create new orders)
    await tx.customerOrdersItems.deleteMany({
      where: { CustomerOrderID: draft.ID },
    })
    await tx.customerOrders.delete({
      where: { ID: draft.ID },
    })

    // Create one order per ship window group (and order type)
    for (const [, groupItems] of itemGroups) {
      // Derive order type from first item's SKU (all items in group have same type)
      const firstItemVariantId = String(groupItems[0].skuVariantId)
      const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false
      const groupOrderNumber = await getNextOrderNumber(isPreOrder)
      const groupAmount = groupItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

      // Use item's ship window if available, else form dates
      const firstItem = groupItems[0]
      const shipStart = firstItem.shipWindowStart
        ? new Date(firstItem.shipWindowStart)
        : new Date(formData.shipStartDate)
      const shipEnd = firstItem.shipWindowEnd
        ? new Date(firstItem.shipWindowEnd)
        : new Date(formData.shipEndDate)

      // Create order header
      const newOrder = await tx.customerOrders.create({
        data: {
          OrderNumber: groupOrderNumber,
          OrderStatus: 'Pending',
          BuyerName: formData.buyerName,
          StoreName: formData.storeName,
          SalesRep: salesRepName,
          CustomerEmail: formData.customerEmail,
          CustomerPhone: formData.customerPhone,
          Country: currency,
          OrderAmount: groupAmount,
          OrderNotes: formData.orderNotes || '',
          CustomerPO: formData.customerPO || '',
          ShipStartDate: shipStart,
          ShipEndDate: shipEnd,
          OrderDate: new Date(),
          Website: formData.website || '',
          IsShipped: false,
          IsTransferredToShopify: false,
          IsPreOrder: isPreOrder, // Derived from SKU category, not preOrderMeta
          RepID: parseInt(formData.salesRepId),
          CustomerID: customerId,
        },
      })

      // Create order items for this group
      await tx.customerOrdersItems.createMany({
        data: groupItems.map(item => ({
          CustomerOrderID: newOrder.ID,
          OrderNumber: groupOrderNumber,
          SKU: item.sku,
          SKUVariantID: item.skuVariantId,
          Quantity: item.quantity,
          Price: item.price,
          PriceCurrency: currency,
          Notes: '',
        })),
      })

      createdOrders.push({
        orderId: String(newOrder.ID),
        orderNumber: groupOrderNumber,
        categoryName: firstItem.categoryName,
        shipWindowStart: firstItem.shipWindowStart,
        shipWindowEnd: firstItem.shipWindowEnd,
        orderAmount: groupAmount,
        items: groupItems,
      })
    }
  })

  // Send confirmation emails for each created order (non-blocking)
  for (const order of createdOrders) {
    sendOrderEmails({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      storeName: formData.storeName,
      buyerName: formData.buyerName,
      salesRep: salesRepName,
      customerEmail: formData.customerEmail,
      customerPhone: formData.customerPhone,
      shipStartDate: order.shipWindowStart ? new Date(order.shipWindowStart) : new Date(formData.shipStartDate),
      shipEndDate: order.shipWindowEnd ? new Date(order.shipWindowEnd) : new Date(formData.shipEndDate),
      orderDate: new Date(),
      orderNotes: formData.orderNotes,
      customerPO: formData.customerPO,
      items: order.items.map(i => ({
        sku: i.sku,
        quantity: i.quantity,
        price: i.price,
        lineTotal: i.price * i.quantity,
      })),
      currency,
      orderAmount: order.orderAmount,
    }).catch(err => {
      console.error(`Failed to send order emails for ${order.orderNumber}:`, err)
    })
  }

  // Return first order for backwards compatibility, plus full orders array
  const primaryOrder = createdOrders[0]
  return NextResponse.json({
    success: true,
    orderId: primaryOrder?.orderId,
    orderNumber: primaryOrder?.orderNumber,
    orders: createdOrders.map(o => ({
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      categoryName: o.categoryName,
      shipWindowStart: o.shipWindowStart,
      shipWindowEnd: o.shipWindowEnd,
    })),
  })

  Also restore the getOrderGroupKey() helper in this file (it was removed). Use the exact 8d9f99a version if needed.

  ———

  3) src/lib/schemas/order.ts — remove plannedShipments
  Replace the current orderItemSchema + createOrderInputSchema (the parts that include plannedShipments) with the 8d9f99a versions below.

  /**
   * Schema for cart items passed to createOrder
   * Includes ship window metadata for order splitting by delivery date
   */
  export const orderItemSchema = z.object({
    sku: z.string().min(1),
    skuVariantId: z.union([z.bigint(), z.number()]),
    quantity: z.number().int().positive(),
    price: z.number().nonnegative(),
    // Ship window grouping fields (for splitting orders by delivery date)
    categoryId: z.number().nullable().optional(),
    categoryName: z.string().nullable().optional(),
    shipWindowStart: z.string().nullable().optional(),
    shipWindowEnd: z.string().nullable().optional(),
  })

  export type OrderItem = z.infer<typeof orderItemSchema>

  /**
   * Full order creation input schema
   */
  export const createOrderInputSchema = orderFormSchema.extend({
    currency: z.enum(['USD', 'CAD']),
    items: z.array(orderItemSchema).min(1, 'Order must have at least one item'),
    // isPreOrder is now derived from SKU data on the server.
    // Kept optional for backwards compatibility but ignored by server.
    isPreOrder: z.boolean().optional(),
    // Optional customer ID for existing customer - enables strong ownership on order
    // Nullable to handle client state sending null for new stores
    customerId: z.number().int().positive().nullable().optional(),
    // Skip automatic email sending - emails will be sent via confirmation popup
    skipEmail: z.boolean().optional(),
  })

  ———

  4) src/lib/types/order.ts — CreateOrderResult + UpdateOrderInput
  Replace the current CreateOrderResult and UpdateOrderInput blocks with the 8d9f99a definitions below.

  /**
   * Result shape from createOrder action.
   * Supports single order (backwards compat) or multiple orders (when split by ship window).
   */
  export interface CreateOrderResult {
    success: boolean
    // Single order (backwards compat - primary order when split)
    orderId?: string
    orderNumber?: string
    // Multiple orders (when split by ship window)
    orders?: Array<{
      orderId: string
      orderNumber: string
      categoryName: string | null
      shipWindowStart: string | null
      shipWindowEnd: string | null
    }>
    error?: string
  }

  /**
   * Input for updating an existing order.
   */
  export interface UpdateOrderInput {
    orderId: string
    storeName: string
    buyerName: string
    salesRepId: string
    customerEmail: string
    customerPhone: string
    currency: 'USD' | 'CAD'
    shipStartDate: string
    shipEndDate: string
    orderNotes?: string
    customerPO?: string
    website?: string
    items: Array<{
      sku: string
      skuVariantId: number
      quantity: number
      price: number
    }>
  }

  ———

  5) src/components/buyer/order-form.tsx — createOrder call + remove shipment validation block
  Two targeted swaps here:

  A) Remove the shipment validation guard
  Replace the start of onSubmit with the 8d9f99a version (removes the planned‑shipment validation gate):

  const onSubmit = async (data: OrderFormData) => {
    if (isSubmitting) return // Prevent double-click
    setIsSubmitting(true)

  B) Replace the createOrder payload block
  Replace the current createOrder call (the block that builds finalPlannedShipments, legacyDates, and passes plannedShipments) with this 8d9f99a call:

  // Create new order with customerId for strong ownership
  // Skip automatic email - show confirmation popup instead
  // Includes ship window metadata for order splitting by delivery date
  const result = await createOrder({
    ...data,
    currency,
    items: cartItems.map((item) => ({
      sku: item.sku,
      skuVariantId: item.skuVariantId,
      quantity: item.quantity,
      price: item.price,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      shipWindowStart: item.shipWindowStart,
      shipWindowEnd: item.shipWindowEnd,
    })),
    isPreOrder, // P prefix for pre-orders, A prefix for ATS
    customerId: selectedCustomerId, // Pass selected customer ID for strong ownership
    skipEmail: true, // Emails will be sent via confirmation popup
  })

  ———

  If you want these same snippets re‑expressed with Collection‑based fields instead of category*, I can generate a second set that’s still “exact replacements,” but
  aligned to your canonical‑Collection decision.


› I don't understand what this means: same snippets re‑expressed with Collection‑based fields instead of category*, I can generate a second set that’s still “exact
  replacements,” but
    aligned to your canonical‑Collection decision - di you just present something that is NOT aligned with the canonical‑Collection decision ?


• Good catch — you’re right to question that.

  What I gave you were verbatim snippets from commit 8d9f99a, which used category‑based fields (categoryId, categoryName, shipWindowStart/End sourced from
  SkuCategories). That is not aligned with your current canonical decision (Collection).

  So yes: the snippets I pasted are exact pre‑PlannedShipment code, but not aligned with the “Collection is canonical” decision. That’s why I offered to re‑express
  them.

  If you want, I’ll now provide the same blocks, but rewritten to use Collection‑based fields (still following the legacy split‑order flow), so they’re consistent with
  the decision table.


› provide the same blocks, but rewritten to use Collection‑based fields (still following the legacy split‑order flow), so they’re consistent with
    the decision table.


• I'm preparing replacement snippets showing how to switch phase 1 item blocks to use read-only Collection-based fields like collectionId and collectionName,
  preserving existing logic such as preOrder detection via Collection.type. The instructions will specify "replace this block with that block" without actual edits,
  keeping current SKU variant ID and preOrder mapping intact.

  Providing Phase 1 collection-based replacement blocks

  Below are Phase 1 blocks rewritten to use Collection-based fields with the legacy split-order flow, replacing the earlier category-based code. Each snippet shows
  where to replace blocks to align with collectionId, collectionName, and collection ship windows, keeping existing helpers like _getOrderGroupKey and
  deriveIsPreOrderFromSkus.

  ———

  1) src/lib/data/actions/orders.ts — createOrder block replacement

  Replace inside createOrder() from the line
  // Derive order type from SKU data (master source: Collection.type)
  down to the final return with this block:

  // Derive order type from SKU data (master source: Collection.type)
  const skuVariantIds = data.items.map((item) => BigInt(item.skuVariantId))
  const skuPreOrderMap = await deriveIsPreOrderFromSkus(skuVariantIds)

  // Group items by order type AND collection (auto-split mixed ATS/Pre-Order)
  const itemGroups = new Map<string, typeof data.items>()
  for (const item of data.items) {
    const key = _getOrderGroupKey(
      { collectionId: item.collectionId, skuVariantId: item.skuVariantId },
      skuPreOrderMap
    )
    if (!itemGroups.has(key)) {
      itemGroups.set(key, [])
    }
    itemGroups.get(key)!.push(item)
  }

  // Track created orders
  const createdOrders: Array<{
    orderId: number
    orderNumber: string
    collectionName: string | null
    shipWindowStart: string | null
    shipWindowEnd: string | null
    items: typeof data.items
  }> = []

  await prisma.$transaction(async (tx) => {
    // lookups: rep, customer, etc. (unchanged)
    ...

    for (const [, groupItems] of itemGroups) {
      const firstItemVariantId = String(groupItems[0].skuVariantId)
      const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false
      const orderNumber = await getNextOrderNumber(isPreOrder)
      const orderAmount = groupItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
      const firstItem = groupItems[0]
      const shipStart = firstItem.shipWindowStart
        ? new Date(firstItem.shipWindowStart)
        : new Date(data.shipStartDate)
      const shipEnd = firstItem.shipWindowEnd
        ? new Date(firstItem.shipWindowEnd)
        : new Date(data.shipEndDate)

      const newOrder = await tx.customerOrders.create({
        data: {
          // existing fields...
          shipWindowStart: shipStart,
          shipWindowEnd: shipEnd,
          isPreOrder,
          orderNumber,
          customerId: customer.id,
          repId: rep.id,
          // etc.
        },
      })

      await tx.customerOrdersItems.createMany({
        data: groupItems.map((item) => ({
          customerOrderId: newOrder.id,
          skuVariantId: BigInt(item.skuVariantId),
          quantity: item.quantity,
          // etc.
        })),
      })

      createdOrders.push({
        orderId: newOrder.id,
        orderNumber,
        collectionName: firstItem.collectionName ?? null,
        shipWindowStart: firstItem.shipWindowStart ?? null,
        shipWindowEnd: firstItem.shipWindowEnd ?? null,
        items: groupItems,
      })
    }

    // update customer order count using createdOrders.length, etc.
    ...
  })

  if (!data.skipEmail) {
    for (const order of createdOrders) {
      await sendOrderEmails(order, {
        fallbackShipStartDate: data.shipStartDate,
        fallbackShipEndDate: data.shipEndDate,
      })
    }
  }

  return {
    success: true,
    orderId: createdOrders[0]?.orderId ?? null,
    orderNumber: createdOrders[0]?.orderNumber ?? null,
    orders: createdOrders.map(({ orderId, orderNumber, collectionName, shipWindowStart, shipWindowEnd }) => ({
      orderId,
      orderNumber,
      collectionName,
      shipWindowStart,
      shipWindowEnd,
    })),
  }

  ———

  2) src/app/api/drafts/[id]/submit/route.ts — grouping and create orders block

  Replace the grouping and create order logic with:

  // Helper for grouping items by collection and order type
  function getOrderGroupKey(
    item: { collectionId?: number | null; skuVariantId: bigint },
    skuPreOrderMap: Map<string, boolean>
  ): string {
    const isPreOrder = skuPreOrderMap.get(String(item.skuVariantId)) ?? false
    const typePrefix = isPreOrder ? 'preorder' : 'ats'
    if (item.collectionId) return `${typePrefix}-collection-${item.collectionId}`
    return `${typePrefix}-default`
  }

  // Use deriveIsPreOrderFromSkus as is (imported or defined earlier)

  const skuVariantIds = items.map((item) => BigInt(item.skuVariantId))
  const skuPreOrderMap = await deriveIsPreOrderFromSkus(skuVariantIds)

  const itemGroups = new Map<string, typeof items>()
  for (const item of items) {
    const key = getOrderGroupKey(item, skuPreOrderMap)
    if (!itemGroups.has(key)) itemGroups.set(key, [])
    itemGroups.get(key)!.push(item)
  }

  // Create orders by grouped items (similar to orders.ts createOrder logic)
  for (const [, groupItems] of itemGroups) {
    const firstItemVariantId = String(groupItems[0].skuVariantId)
    const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false

    // ...create order logic using shipWindowStart/End from firstItem
    // etc.
  }

  ———

  3) src/lib/schemas/order.ts — orderItemSchema replacement

  Replace orderItemSchema with:

  export const orderItemSchema = z.object({
    // existing fields ...
    collectionId: z.number().nullable().optional(),
    collectionName: z.string().nullable().optional(),
    shipWindowStart: z.string().nullable().optional(),
    shipWindowEnd: z.string().nullable().optional(),
  })

  Remove any planned shipments fields from schemas as these are phased out.

  ———

  4) src/lib/types/order.ts — CreateOrderResult and UpdateOrderInput

  Update CreateOrderResult to:

  export interface CreateOrderResult {
    success: boolean;
    orderId: number | null;
    orderNumber: string | null;
    orders?: Array<{
      orderId: number;
      orderNumber: string;
      collectionName: string | null;
      shipWindowStart: string | null;
      shipWindowEnd: string | null;
    }>;
  }

  Remove plannedShipmentCount and similar planned shipment-related fields.
  Similarly, remove planned shipment references from UpdateOrderInput if present.

  ———

  5) src/components/buyer/order-form.tsx — createOrder call replacement

  Replace the createOrder call and result handling to use collection fields and remove planned shipments and shipment validation guard:

  const result = await createOrder({
    ...data,
    items: data.items.map(item => ({
      ...item,
      collectionId: item.collectionId,
      collectionName: item.collectionName,
      shipWindowStart: item.shipWindowStart,
      shipWindowEnd: item.shipWindowEnd,
    })),
    // exclude plannedShipments payload here
  })

  // Remove any guard based on planned shipments validation (e.g., hasShipmentValidationErrors)

  // Use result.orders array to set submittedShipments or equivalent UI state
  setSubmittedShipments(result.orders ?? [])

  // Rely on orderId/orderNumber from first result order or fallback
  const firstOrder = result.orders?.[0]
  if (firstOrder) {
    setSubmittedOrderId(firstOrder.orderId)
    setSubmittedOrderNumber(firstOrder.orderNumber)
  }

  // Show modal or toast as before

  ———

  These replacements keep the core grouping, preOrder detection, and shipWindow semantics based on Collections, faithfully adapting the previous category-based logic
  to use collection fields without adding new validation logic or changing the split-order flow.

  Providing Phase 1 blocks rewritten with Collection-based fields

  Below are the key Phase 1 block replacements adapted to use collectionId, collectionName, ship window fields, and the existing _getOrderGroupKey helper for grouping
  and preOrder detection, consistent with the decision table. These directly replace the corresponding blocks in the legacy split-order flow.

  ———

  1) src/lib/data/actions/orders.ts

  Replace inside createOrder() from the comment line
  // Derive order type from SKU data (master source: Collection.type)
  down to the final return statement with:

  // Derive order type from SKU data (master source: Collection.type)
  const skuVariantIds = data.items.map((item) => BigInt(item.skuVariantId))
  const skuPreOrderMap = await deriveIsPreOrderFromSkus(skuVariantIds)

  // Group items by order type AND collection (auto-split mixed ATS/Pre-Order)
  const itemGroups = new Map<string, typeof data.items>()
  for (const item of data.items) {
    const key = _getOrderGroupKey(
      { collectionId: item.collectionId, skuVariantId: item.skuVariantId },
      skuPreOrderMap
    )
    if (!itemGroups.has(key)) {
      itemGroups.set(key, [])
    }
    itemGroups.get(key)!.push(item)
  }

  // Track created orders for response and email
  const createdOrders: Array<{
    orderId: number
    orderNumber: string
    collectionName: string | null
    shipWindowStart: string | null
    shipWindowEnd: string | null
    items: typeof data.items
  }> = []

  await prisma.$transaction(async (tx) => {
    // existing lookups (rep, customer etc.) here
    ...

    for (const [, groupItems] of itemGroups) {
      const firstItemVariantId = String(groupItems[0].skuVariantId)
      const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false
      const orderNumber = await getNextOrderNumber(isPreOrder)

      const firstItem = groupItems[0]
      const shipStart = firstItem.shipWindowStart
        ? new Date(firstItem.shipWindowStart)
        : new Date(data.shipStartDate)
      const shipEnd = firstItem.shipWindowEnd
        ? new Date(firstItem.shipWindowEnd)
        : new Date(data.shipEndDate)

      const newOrder = await tx.customerOrders.create({
        data: {
          // other fields...
          shipWindowStart: shipStart,
          shipWindowEnd: shipEnd,
          isPreOrder,
          orderNumber,
          customerId: customer.id,
          repId: rep.id,
          // ...
        },
      })

      await tx.customerOrdersItems.createMany({
        data: groupItems.map((item) => ({
          customerOrderId: newOrder.id,
          skuVariantId: BigInt(item.skuVariantId),
          quantity: item.quantity,
          // ...
        })),
      })

      createdOrders.push({
        orderId: newOrder.id,
        orderNumber,
        collectionName: firstItem.collectionName ?? null,
        shipWindowStart: firstItem.shipWindowStart ?? null,
        shipWindowEnd: firstItem.shipWindowEnd ?? null,
        items: groupItems,
      })
    }

    // update customer order count as needed
    ...
  })

  if (!data.skipEmail) {
    for (const order of createdOrders) {
      await sendOrderEmails(order, {
        fallbackShipStartDate: data.shipStartDate,
        fallbackShipEndDate: data.shipEndDate,
      })
    }
  }

  return {
    success: true,
    orderId: createdOrders[0]?.orderId ?? null,
    orderNumber: createdOrders[0]?.orderNumber ?? null,
    orders: createdOrders.map(({ orderId, orderNumber, collectionName, shipWindowStart, shipWindowEnd }) => ({
      orderId,
      orderNumber,
      collectionName,
      shipWindowStart,
      shipWindowEnd,
    })),
  }

  ———

  2) src/app/api/drafts/[id]/submit/route.ts

  At the top or near the grouping logic, insert or restore this helper function:

  function getOrderGroupKey(
    item: { collectionId?: number | null; skuVariantId: bigint },
    skuPreOrderMap: Map<string, boolean>
  ): string {
    const isPreOrder = skuPreOrderMap.get(String(item.skuVariantId)) ?? false
    const typePrefix = isPreOrder ? 'preorder' : 'ats'
    if (item.collectionId) return `${typePrefix}-collection-${item.collectionId}`
    return `${typePrefix}-default`
  }

  Replace the items grouping and order creation logic with:

  const skuVariantIds = items.map((item) => BigInt(item.skuVariantId))
  const skuPreOrderMap = await deriveIsPreOrderFromSkus(skuVariantIds)

  const itemGroups = new Map<string, typeof items>()
  for (const item of items) {
    const key = getOrderGroupKey(item, skuPreOrderMap)
    if (!itemGroups.has(key)) itemGroups.set(key, [])
    itemGroups.get(key)!.push(item)
  }

  // Create orders from grouped items (similar structure to orders.ts)
  for (const [, groupItems] of itemGroups) {
    const firstItemVariantId = String(groupItems[0].skuVariantId)
    const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false

    const firstItem = groupItems[0]
    const shipStart = firstItem.shipWindowStart
      ? new Date(firstItem.shipWindowStart)
      : new Date(draft.shipStartDate)
    const shipEnd = firstItem.shipWindowEnd
      ? new Date(firstItem.shipWindowEnd)
      : new Date(draft.shipEndDate)

    // logic to create order and order items...
  }

  ———

  3) src/lib/schemas/order.ts

  Replace orderItemSchema with:

  export const orderItemSchema = z.object({
    // existing fields ...
    collectionId: z.number().nullable().optional(),
    collectionName: z.string().nullable().optional(),
    shipWindowStart: z.string().nullable().optional(),
    shipWindowEnd: z.string().nullable().optional(),
  })

  Remove any fields related to planned shipments in this and related schemas.

  ———

  4) src/lib/types/order.ts

  Update CreateOrderResult to:

  export interface CreateOrderResult {
    success: boolean
    orderId: number | null
    orderNumber: string | null
    orders?: Array<{
      orderId: number
      orderNumber: string
      collectionName: string | null
      shipWindowStart: string | null
      shipWindowEnd: string | null
    }>
  }

  Remove planned shipment related fields from CreateOrderResult and UpdateOrderInput.

  ———

  5) src/components/buyer/order-form.tsx

  Replace the onSubmit start and createOrder call block with:

  // Remove any pre-submit shipment validation guards here

  const result = await createOrder({
    ...data,
    items: data.items.map((item) => ({
      ...item,
      collectionId: item.collectionId,
      collectionName: item.collectionName,
      shipWindowStart: item.shipWindowStart,
      shipWindowEnd: item.shipWindowEnd,
    })),
    // omit plannedShipments here
  })

  setSubmittedOrderId(result.orderId)
  setSubmittedOrderNumber(result.orderNumber)
  setShowEmailModal(true)

  // Remove or adjust handling related to submittedShipments or planned shipments as needed elsewhere in this component

  ———

  These replacements maintain the legacy split-order flow, now standardized around Collection fields, without introducing new validation or UI paradigms. They reflect
  the "same blocks" approach but updated to use collectionId, collectionName, and ship window times for grouping and order details.

• Below are the same Phase 1 “replace this block with that block” snippets, but rewritten to use Collection-based fields (collectionId/collectionName/shipWindowStart/
  shipWindowEnd) and the existing _getOrderGroupKey helper. These follow the legacy split‑order flow.

  1) src/lib/data/actions/orders.ts — createOrder() block
  Replace everything inside createOrder() starting at:
  // Derive order type from SKU data (master source: Collection.type)
  down through the return { success: true, ... } for that function.

  Replace with:

  // Derive order type from SKU data (master source: Collection.type)
  const skuVariantIds = data.items.map((item) => BigInt(item.skuVariantId))
  const skuPreOrderMap = await deriveIsPreOrderFromSkus(skuVariantIds)

  // Group items by order type AND collection (auto-split mixed ATS/Pre-Order)
  const itemGroups = new Map<string, typeof data.items>()
  for (const item of data.items) {
    const key = _getOrderGroupKey(
      { collectionId: item.collectionId, skuVariantId: item.skuVariantId },
      skuPreOrderMap
    )
    if (!itemGroups.has(key)) {
      itemGroups.set(key, [])
    }
    itemGroups.get(key)!.push(item)
  }

  // Track created orders
  const createdOrders: Array<{
    orderId: string
    orderNumber: string
    collectionName: string | null
    shipWindowStart: string | null
    shipWindowEnd: string | null
    orderAmount: number
    items: typeof data.items
  }> = []

  // Create orders in a single transaction for atomicity
  await prisma.$transaction(async (tx) => {
    // Look up rep by ID - fail if not found
    const rep = await tx.reps.findUnique({
      where: { ID: parseInt(data.salesRepId) },
      select: { Name: true, Code: true },
    })
    if (!rep) {
      throw new Error('Invalid sales rep')
    }
    const salesRepName = rep.Name ?? ''
    const salesRepCode = rep.Code?.trim() || rep.Name || ''

    // Determine customerId for strong ownership
    let customerId: number | null = data.customerId ?? null
    if (!customerId) {
      const existingByName = await tx.customers.findFirst({
        where: { StoreName: data.storeName },
        select: { ID: true },
      })
      if (existingByName) {
        customerId = existingByName.ID
      }
    }

    // Create one order per collection group (and order type)
    for (const [, groupItems] of itemGroups) {
      // Determine order type from first item's SKU (all items in group have same type)
      const firstItemVariantId = String(groupItems[0].skuVariantId)
      const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false

      // Generate order number with appropriate prefix
      const orderNumber = await getNextOrderNumber(isPreOrder)

      // Calculate group total
      const orderAmount = groupItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      )

      // Use item's ship window if available, else form dates
      const firstItem = groupItems[0]
      const shipStart = firstItem.shipWindowStart
        ? new Date(firstItem.shipWindowStart)
        : new Date(data.shipStartDate)
      const shipEnd = firstItem.shipWindowEnd
        ? new Date(firstItem.shipWindowEnd)
        : new Date(data.shipEndDate)

      // Create order header
      const newOrder = await tx.customerOrders.create({
        data: {
          OrderNumber: orderNumber,
          BuyerName: data.buyerName,
          StoreName: data.storeName,
          SalesRep: salesRepName,
          CustomerEmail: data.customerEmail,
          CustomerPhone: data.customerPhone,
          Country: data.currency, // Legacy: stores currency, not country
          OrderAmount: orderAmount,
          OrderNotes: data.orderNotes ?? '',
          CustomerPO: data.customerPO ?? '',
          ShipStartDate: shipStart,
          ShipEndDate: shipEnd,
          OrderDate: new Date(),
          Website: data.website ?? '',
          IsShipped: false,
          OrderStatus: 'Pending',
          IsTransferredToShopify: false,
          IsPreOrder: isPreOrder, // Derived from Collection.type
          RepID: parseInt(data.salesRepId),
          CustomerID: customerId,
        },
      })

      // Create line items for this group
      await tx.customerOrdersItems.createMany({
        data: groupItems.map((item) => ({
          CustomerOrderID: newOrder.ID,
          OrderNumber: orderNumber,
          SKU: item.sku,
          SKUVariantID: BigInt(item.skuVariantId),
          Quantity: item.quantity,
          Price: item.price,
          PriceCurrency: data.currency,
          Notes: '',
        })),
      })

      createdOrders.push({
        orderId: newOrder.ID.toString(),
        orderNumber,
        collectionName: firstItem.collectionName ?? null,
        shipWindowStart: firstItem.shipWindowStart ?? null,
        shipWindowEnd: firstItem.shipWindowEnd ?? null,
        orderAmount,
        items: groupItems,
      })
    }

    // Find or create customer (only once, not per order)
    const existingCustomer = await tx.customers.findFirst({
      where: { StoreName: data.storeName },
      select: { ID: true, OrderCount: true },
    })

    if (existingCustomer) {
      await tx.customers.update({
        where: { ID: existingCustomer.ID },
        data: {
          CustomerName: data.buyerName,
          Email: data.customerEmail,
          Phone: data.customerPhone,
          Rep: salesRepCode,
          Street1: data.street1,
          Street2: data.street2 ?? '',
          City: data.city,
          StateProvince: data.stateProvince,
          ZipPostal: data.zipPostal,
          Country: data.country,
          ShippingStreet1: data.shippingStreet1,
          ShippingStreet2: data.shippingStreet2 ?? '',
          ShippingCity: data.shippingCity,
          ShippingStateProvince: data.shippingStateProvince,
          ShippingZipPostal: data.shippingZipPostal,
          ShippingCountry: data.shippingCountry,
          Website: data.website ?? '',
          LastOrderDate: new Date(),
          OrderCount: (existingCustomer.OrderCount ?? 0) + createdOrders.length,
        },
      })
    } else {
      // Create new customer and update all orders with CustomerID
      const newCustomer = await tx.customers.create({
        data: {
          StoreName: data.storeName,
          CustomerName: data.buyerName,
          Email: data.customerEmail,
          Phone: data.customerPhone,
          Rep: salesRepCode,
          Street1: data.street1,
          Street2: data.street2 ?? '',
          City: data.city,
          StateProvince: data.stateProvince,
          ZipPostal: data.zipPostal,
          Country: data.country,
          ShippingStreet1: data.shippingStreet1,
          ShippingStreet2: data.shippingStreet2 ?? '',
          ShippingCity: data.shippingCity,
          ShippingStateProvince: data.shippingStateProvince,
          ShippingZipPostal: data.shippingZipPostal,
          ShippingCountry: data.shippingCountry,
          Website: data.website ?? '',
          FirstOrderDate: new Date(),
          LastOrderDate: new Date(),
          OrderCount: createdOrders.length,
        },
        select: { ID: true },
      })

      // Update all created orders with new customer's ID
      for (const order of createdOrders) {
        await tx.customerOrders.update({
          where: { ID: BigInt(order.orderId) },
          data: { CustomerID: newCustomer.ID },
        })
      }
    }
  })

  // Send order confirmation emails (non-blocking) unless skipEmail is set
  if (!data.skipEmail) {
    for (const order of createdOrders) {
      sendOrderEmails({
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        storeName: data.storeName,
        buyerName: data.buyerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        salesRep: data.storeName, // looked up by email service
        orderAmount: order.orderAmount,
        currency: data.currency,
        shipStartDate: order.shipWindowStart ? new Date(order.shipWindowStart) : new Date(data.shipStartDate),
        shipEndDate: order.shipWindowEnd ? new Date(order.shipWindowEnd) : new Date(data.shipEndDate),
        orderDate: new Date(),
        orderNotes: data.orderNotes,
        customerPO: data.customerPO,
        items: order.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
          lineTotal: item.price * item.quantity,
        })),
      }).catch((err) => {
        console.error(`Order email error for ${order.orderNumber}:`, err)
      })
    }
  }

  revalidatePath('/admin/orders')

  // Return first order for backwards compatibility, plus full orders array
  const primaryOrder = createdOrders[0]
  return {
    success: true,
    orderId: primaryOrder?.orderId,
    orderNumber: primaryOrder?.orderNumber,
    orders: createdOrders.map((o) => ({
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      collectionName: o.collectionName,
      shipWindowStart: o.shipWindowStart,
      shipWindowEnd: o.shipWindowEnd,
      orderAmount: o.orderAmount, // keep if UI expects it
    })),
  }

  2) src/app/api/drafts/[id]/submit/route.ts — grouping + split creation
  Replace the block starting at:
  // Phase 9: Use planned shipments instead of splitting orders
  through the JSON response.

  Replace with:

  // Group items by order type AND collection (auto-split mixed ATS/Pre-Order)
  const itemGroups = new Map<string, typeof items>()
  for (const item of items) {
    const key = getOrderGroupKey(
      { collectionId: item.collectionId, skuVariantId: item.skuVariantId },
      skuPreOrderMap
    )
    if (!itemGroups.has(key)) {
      itemGroups.set(key, [])
    }
    itemGroups.get(key)!.push(item)
  }

  const currency = formData.currency || 'CAD'

  // Track created orders
  const createdOrders: Array<{
    orderId: string
    orderNumber: string
    collectionName: string | null
    shipWindowStart: string | null
    shipWindowEnd: string | null
    orderAmount: number
    items: typeof items
  }> = []

  await prisma.$transaction(async (tx) => {
    // Delete the draft first (we'll create new orders)
    await tx.customerOrdersItems.deleteMany({
      where: { CustomerOrderID: draft.ID },
    })
    await tx.customerOrders.delete({
      where: { ID: draft.ID },
    })

    // Create one order per collection group (and order type)
    for (const [, groupItems] of itemGroups) {
      const firstItemVariantId = String(groupItems[0].skuVariantId)
      const isPreOrder = skuPreOrderMap.get(firstItemVariantId) ?? false
      const groupOrderNumber = await getNextOrderNumber(isPreOrder)
      const groupAmount = groupItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

      const firstItem = groupItems[0]
      const shipStart = firstItem.shipWindowStart
        ? new Date(firstItem.shipWindowStart)
        : new Date(formData.shipStartDate)
      const shipEnd = firstItem.shipWindowEnd
        ? new Date(firstItem.shipWindowEnd)
        : new Date(formData.shipEndDate)

      const newOrder = await tx.customerOrders.create({
        data: {
          OrderNumber: groupOrderNumber,
          OrderStatus: 'Pending',
          BuyerName: formData.buyerName,
          StoreName: formData.storeName,
          SalesRep: salesRepName,
          CustomerEmail: formData.customerEmail,
          CustomerPhone: formData.customerPhone,
          Country: currency,
          OrderAmount: groupAmount,
          OrderNotes: formData.orderNotes || '',
          CustomerPO: formData.customerPO || '',
          ShipStartDate: shipStart,
          ShipEndDate: shipEnd,
          OrderDate: new Date(),
          Website: formData.website || '',
          IsShipped: false,
          IsTransferredToShopify: false,
          IsPreOrder: isPreOrder,
          RepID: parseInt(formData.salesRepId),
          CustomerID: customerId,
        },
      })

      await tx.customerOrdersItems.createMany({
        data: groupItems.map(item => ({
          CustomerOrderID: newOrder.ID,
          OrderNumber: groupOrderNumber,
          SKU: item.sku,
          SKUVariantID: item.skuVariantId,
          Quantity: item.quantity,
          Price: item.price,
          PriceCurrency: currency,
          Notes: '',
        })),
      })

      createdOrders.push({
        orderId: String(newOrder.ID),
        orderNumber: groupOrderNumber,
        collectionName: firstItem.collectionName,
        shipWindowStart: firstItem.shipWindowStart,
        shipWindowEnd: firstItem.shipWindowEnd,
        orderAmount: groupAmount,
        items: groupItems,
      })
    }
  })

  // Send confirmation emails for each created order (non-blocking)
  for (const order of createdOrders) {
    sendOrderEmails({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      storeName: formData.storeName,
      buyerName: formData.buyerName,
      salesRep: salesRepName,
      customerEmail: formData.customerEmail,
      customerPhone: formData.customerPhone,
      shipStartDate: order.shipWindowStart ? new Date(order.shipWindowStart) : new Date(formData.shipStartDate),
      shipEndDate: order.shipWindowEnd ? new Date(order.shipWindowEnd) : new Date(formData.shipEndDate),
      orderDate: new Date(),
      orderNotes: formData.orderNotes,
      customerPO: formData.customerPO,
      items: order.items.map(i => ({
        sku: i.sku,
        quantity: i.quantity,
        price: i.price,
        lineTotal: i.price * i.quantity,
      })),
      currency,
      orderAmount: order.orderAmount,
    }).catch(err => {
      console.error(`Failed to send order emails for ${order.orderNumber}:`, err)
    })
  }

  const primaryOrder = createdOrders[0]
  return NextResponse.json({
    success: true,
    orderId: primaryOrder?.orderId,
    orderNumber: primaryOrder?.orderNumber,
    orders: createdOrders.map(o => ({
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      collectionName: o.collectionName,
      shipWindowStart: o.shipWindowStart,
      shipWindowEnd: o.shipWindowEnd,
      orderAmount: o.orderAmount, // keep if UI expects it
    })),
  })

  Also ensure this helper exists in the file (collection-based):

  function getOrderGroupKey(
    item: { collectionId?: number | null; skuVariantId: bigint },
    skuPreOrderMap: Map<string, boolean>
  ): string {
    const isPreOrder = skuPreOrderMap.get(String(item.skuVariantId)) ?? false
    const typePrefix = isPreOrder ? 'preorder' : 'ats'
    if (item.collectionId) return `${typePrefix}-collection-${item.collectionId}`
    return `${typePrefix}-default`
  }

  3) src/lib/schemas/order.ts — collection-based item schema, no plannedShipments
  Replace the orderItemSchema + createOrderInputSchema blocks with:

  export const orderItemSchema = z.object({
    sku: z.string().min(1),
    skuVariantId: z.union([z.bigint(), z.number()]),
    quantity: z.number().int().positive(),
    price: z.number().nonnegative(),
    // Collection is the source for order splitting and pre-order detection
    collectionId: z.number().nullable().optional(),
    collectionName: z.string().nullable().optional(),
    // Ship window dates from Collection
    shipWindowStart: z.string().nullable().optional(),
    shipWindowEnd: z.string().nullable().optional(),
  })

  export type OrderItem = z.infer<typeof orderItemSchema)

  export const createOrderInputSchema = orderFormSchema.extend({
    currency: z.enum(['USD', 'CAD']),
    items: z.array(orderItemSchema).min(1, 'Order must have at least one item'),
    isPreOrder: z.boolean().optional(),
    customerId: z.number().int().positive().nullable().optional(),
    skipEmail: z.boolean().optional(),
  })

  4) src/lib/types/order.ts — CreateOrderResult + UpdateOrderInput
  Replace those blocks with:

  export interface CreateOrderResult {
    success: boolean
    orderId?: string
    orderNumber?: string
    orders?: Array<{
      orderId: string
      orderNumber: string
      collectionName: string | null
      shipWindowStart: string | null
      shipWindowEnd: string | null
      orderAmount?: number // keep optional if UI expects it
    }>
    error?: string
  }

  export interface UpdateOrderInput {
    orderId: string
    storeName: string
    buyerName: string
    salesRepId: string
    customerEmail: string
    customerPhone: string
    currency: 'USD' | 'CAD'
    shipStartDate: string
    shipEndDate: string
    orderNotes?: string
    customerPO?: string
    website?: string
    items: Array<{
      sku: string
      skuVariantId: number
      quantity: number
      price: number
    }>
  }

  5) src/components/buyer/order-form.tsx — remove shipment validation gate + payload
  A) Replace the top of onSubmit with:

  const onSubmit = async (data: OrderFormData) => {
    if (isSubmitting) return // Prevent double-click
    setIsSubmitting(true)

  B) Replace the createOrder call block with this (collection-based, no plannedShipments):

  const result = await createOrder({
    ...data,
    currency,
    items: cartItems.map((item) => ({
      sku: item.sku,
      skuVariantId: item.skuVariantId,
      quantity: item.quantity,
      price: item.price,
      collectionId: item.collectionId,
      collectionName: item.collectionName,
      shipWindowStart: item.shipWindowStart,
      shipWindowEnd: item.shipWindowEnd,
    })),
    isPreOrder,
    customerId: selectedCustomerId,
    skipEmail: true,
  })

  If you want, I can now generate the same set with per-group ship-window validation inserted (using Collection windows) and show exactly where it goes in
  createOrder() and the draft submit route.


› Yes, generate the same set with per-group ship-window validation inserted (using Collection windows) and show exactly where it goes in
    createOrder() and the draft submit route


• I'm clarifying that validation should run after item groups creation but before transaction to prevent partial orders. I'll validate each group's ship window against
  DB collection windows, blocking if missing since Phase 1 forbids overrides. I'll reuse existing ship-date validation logic and confirm imports in the orders file
  header before crafting insertion snippets.

  Confirming ship-window imports in order file

  I verified that current createOrder imports validateShipDates and getMultiCollectionOverlap from the ship-window validation module, supporting reuse of those
  functions after removing planned shipment specifics. Next, I'll ensure these imports remain and adapt usage accordingly.

• Explored
  └ Read orders.ts

• The per-group shipping validation will go inside createOrder after computing itemGroups and before starting the transaction, using a collection map to verify
  shipping windows for each group based on their collection IDs.

  Verifying ship date validation for split orders

  The planned shipStart/End dates for each split order come from either item or form data and must be validated against collection windows to ensure they aren't
  earlier; I'll confirm validateShipDates input formats next.

• Explored
  └ Read ship-window.ts

• The shipping window dates are ISO strings, so I'll use existing strings or normalize them to YYYY-MM-DD for validation to avoid timezone issues. I'll rely on
  collection IDs from group items to fetch authoritative collection windows from the DB for safer per-group validation instead of trusting client data.

  Providing createOrder and draft route date validation inserts

  Insert after itemGroups are built and before transaction processing in both src/lib/data/actions/orders.ts and src/app/api/drafts/[id]/submit/route.ts.

  For orders.ts, build a single collectionMap from all collectionIds, then validate each item group’s ship dates against DB values, returning {success:false,error} on
  validation failure. Ensure dates normalize to ISO YYYY-MM-DD strings.

  // Insert after itemGroups built, before transaction
  const allCollectionIds = [...new Set(data.items.map(i => i.collectionId).filter((id): id is number => id != null))];
  const collections = allCollectionIds.length
    ? await prisma.collection.findMany({ select: { id: true, name: true, shipWindowStart: true, shipWindowEnd: true } })
    : [];
  const collectionMap = new Map(collections.map(c => [c.id, c]));

  for (const [, groupItems] of itemGroups) {
    const groupCollectionIds = [...new Set(groupItems.map(i => i.collectionId).filter((id): id is number => id != null))];
    if (groupCollectionIds.length === 0) continue; // skip groups without collections (e.g. ATS)

    const groupCollections = groupCollectionIds
      .map(id => collectionMap.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c);

    const collectionsMissing = groupCollections.filter(c => !c.shipWindowStart || !c.shipWindowEnd);
    if (collectionsMissing.length > 0) {
      const names = collectionsMissing.map(c => c.name ?? '').join(', ');
      return { success: false, error: `Cannot validate ship dates: missing ship window dates for ${names}.` };
    }

    const shipStart = (groupItems[0].shipWindowStart ?? data.shipStartDate).split('T')[0];
    const shipEnd = (groupItems[0].shipWindowEnd ?? data.shipEndDate).split('T')[0];

    const result = validateShipDates(
      shipStart,
      shipEnd,
      groupCollections.map(c => ({
        id: c.id,
        name: c.name ?? '',
        shipWindowStart: c.shipWindowStart!.toISOString().split('T')[0],
        shipWindowEnd: c.shipWindowEnd!.toISOString().split('T')[0],
      }))
    );

    if (!result.valid) {
      const names = groupCollections.map(c => c.name).join(', ');
      return { success: false, error: `Invalid dates for ${names}: ${result.errors[0]?.message}` };
    }
  }

  For draft/submit/route.ts, insert similar validation but return NextResponse JSON with status 400 on error:

  // Insert after itemGroups built, before transaction
  const allCollectionIds = [...new Set(data.items.map(i => i.collectionId).filter((id): id is number => id != null))];
  const collections = allCollectionIds.length
    ? await prisma.collection.findMany({ select: { id: true, name: true, shipWindowStart: true, shipWindowEnd: true } })
    : [];
  const collectionMap = new Map(collections.map(c => [c.id, c]));

  for (const [, groupItems] of itemGroups) {
    const groupCollectionIds = [...new Set(groupItems.map(i => i.collectionId).filter((id): id is number => id != null))];
    if (groupCollectionIds.length === 0) continue;

    const groupCollections = groupCollectionIds
      .map(id => collectionMap.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c);

    const collectionsMissing = groupCollections.filter(c => !c.shipWindowStart || !c.shipWindowEnd);
    if (collectionsMissing.length > 0) {
      const names = collectionsMissing.map(c => c.name ?? '').join(', ');
      return NextResponse.json({ error: `Cannot validate ship dates: missing ship window dates for ${names}.` }, { status: 400 });
    }

    const shipStart = (groupItems[0].shipWindowStart ?? data.shipStartDate).split('T')[0];
    const shipEnd = (groupItems[0].shipWindowEnd ?? data.shipEndDate).split('T')[0];

    const result = validateShipDates(
      shipStart,
      shipEnd,
      groupCollections.map(c => ({
        id: c.id,
        name: c.name ?? '',
        shipWindowStart: c.shipWindowStart!.toISOString().split('T')[0],
        shipWindowEnd: c.shipWindowEnd!.toISOString().split('T')[0],
      }))
    );

    if (!result.valid) {
      const names = groupCollections.map(c => c.name).join(', ');
      return NextResponse.json({ error: `Invalid dates for ${names}: ${result.errors[0]?.message}` }, { status: 400 });
    }
  }

  Make sure validateShipDates remains imported in both files. This validation stops invalid ship dates early, aligning with current planned shipment rules and
  preventing trust on client data.

─ Worked for 1m 17s ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Below are the same Phase 1 blocks with per‑group ship‑window validation inserted, using Collection windows. I’m showing exact insertion points for createOrder() and
  the draft submit route.

  1) src/lib/data/actions/orders.ts — createOrder()
  Insert this after the itemGroups block (right after you build the map) and before // Track created orders.

  Insert here (anchor):

  // Group items by order type AND collection (auto-split mixed ATS/Pre-Order)
  const itemGroups = new Map<string, typeof data.items>()
  for (const item of data.items) {
    const key = _getOrderGroupKey(
      { collectionId: item.collectionId, skuVariantId: item.skuVariantId },
      skuPreOrderMap
    )
    if (!itemGroups.has(key)) {
      itemGroups.set(key, [])
    }
    itemGroups.get(key)!.push(item)
  }

  // INSERT VALIDATION BLOCK HERE

  // Track created orders
  const createdOrders: Array<{
    ...
  }> = []

  Validation block to insert (Collection windows, per group):

  // Fetch collection windows once for validation
  const allCollectionIds = [
    ...new Set(
      data.items
        .map((i) => i.collectionId)
        .filter((id): id is number => id !== null && id !== undefined)
    ),
  ]

  const collections = allCollectionIds.length > 0
    ? await prisma.collection.findMany({
        where: { id: { in: allCollectionIds } },
        select: { id: true, name: true, shipWindowStart: true, shipWindowEnd: true },
      })
    : []

  const collectionMap = new Map(collections.map((c) => [c.id, c]))

  // Validate each group against its collection window
  for (const [, groupItems] of itemGroups) {
    const groupCollectionIds = [
      ...new Set(
        groupItems
          .map((i) => i.collectionId)
          .filter((id): id is number => id !== null && id !== undefined)
      ),
    ]

    // ATS / uncategorized: no validation
    if (groupCollectionIds.length === 0) continue

    const groupCollections = groupCollectionIds
      .map((id) => collectionMap.get(id))
      .filter(
        (c): c is NonNullable<typeof c> =>
          c !== undefined
      )

    // Block if any collection lacks windows
    const missingWindows = groupCollections.filter(
      (c) => !c.shipWindowStart || !c.shipWindowEnd
    )
    if (missingWindows.length > 0) {
      const names = missingWindows.map((c) => c.name ?? 'Unknown').join(', ')
      return {
        success: false,
        error: `Cannot validate ship dates: ${names} missing ship window dates.`,
      }
    }

    // Use the same ship dates that will be written to the order header
    const firstItem = groupItems[0]
    const shipStart = (firstItem.shipWindowStart ?? data.shipStartDate).split('T')[0]
    const shipEnd = (firstItem.shipWindowEnd ?? data.shipEndDate).split('T')[0]

    const result = validateShipDates(
      shipStart,
      shipEnd,
      groupCollections.map((c) => ({
        id: c.id,
        name: c.name ?? '',
        shipWindowStart: c.shipWindowStart!.toISOString().split('T')[0],
        shipWindowEnd: c.shipWindowEnd!.toISOString().split('T')[0],
      }))
    )

    if (!result.valid) {
      const names = groupCollections.map((c) => c.name ?? 'Unknown').join(', ')
      return {
        success: false,
        error: `Invalid dates for ${names}: ${result.errors[0]?.message}`,
      }
    }
  }

  2) src/app/api/drafts/[id]/submit/route.ts — draft submit
  Insert this after the itemGroups block and before const currency = ....

  Insert here (anchor):

  // Group items by order type AND collection (auto-split mixed ATS/Pre-Order)
  const itemGroups = new Map<string, typeof items>()
  for (const item of items) {
    const key = getOrderGroupKey(
      { collectionId: item.collectionId, skuVariantId: item.skuVariantId },
      skuPreOrderMap
    )
    if (!itemGroups.has(key)) {
      itemGroups.set(key, [])
    }
    itemGroups.get(key)!.push(item)
  }

  // INSERT VALIDATION BLOCK HERE

  const currency = formData.currency || 'CAD'

  Validation block to insert (Collection windows, per group):

  // Fetch collection windows once for validation
  const allCollectionIds = [
    ...new Set(
      items
        .map((i) => i.collectionId)
        .filter((id): id is number => id !== null && id !== undefined)
    ),
  ]

  const collections = allCollectionIds.length > 0
    ? await prisma.collection.findMany({
        where: { id: { in: allCollectionIds } },
        select: { id: true, name: true, shipWindowStart: true, shipWindowEnd: true },
      })
    : []

  const collectionMap = new Map(collections.map((c) => [c.id, c]))

  // Validate each group against its collection window
  for (const [, groupItems] of itemGroups) {
    const groupCollectionIds = [
      ...new Set(
        groupItems
          .map((i) => i.collectionId)
          .filter((id): id is number => id !== null && id !== undefined)
      ),
    ]

    if (groupCollectionIds.length === 0) continue

    const groupCollections = groupCollectionIds
      .map((id) => collectionMap.get(id))
      .filter(
        (c): c is NonNullable<typeof c> =>
          c !== undefined
      )

    const missingWindows = groupCollections.filter(
      (c) => !c.shipWindowStart || !c.shipWindowEnd
    )
    if (missingWindows.length > 0) {
      const names = missingWindows.map((c) => c.name ?? 'Unknown').join(', ')
      return NextResponse.json(
        { error: `Cannot validate ship dates: ${names} missing ship window dates.` },
        { status: 400 }
      )
    }

    const firstItem = groupItems[0]
    const shipStart = (firstItem.shipWindowStart ?? formData.shipStartDate).split('T')[0]
    const shipEnd = (firstItem.shipWindowEnd ?? formData.shipEndDate).split('T')[0]

    const result = validateShipDates(
      shipStart,
      shipEnd,
      groupCollections.map((c) => ({
        id: c.id,
        name: c.name ?? '',
        shipWindowStart: c.shipWindowStart!.toISOString().split('T')[0],
        shipWindowEnd: c.shipWindowEnd!.toISOString().split('T')[0],
      }))
    )

    if (!result.valid) {
      const names = groupCollections.map((c) => c.name ?? 'Unknown').join(', ')
      return NextResponse.json(
        { error: `Invalid dates for ${names}: ${result.errors[0]?.message}` },
        { status: 400 }
      )
    }
  }

  If you want me to include the exact updated getOrderGroupKey helper for draft submit and the matching CreateOrderResult typing updates at the same time, say the word
  and I’ll append those.


› include the exact updated getOrderGroupKey helper for draft submit and the matching CreateOrderResult typing updates at the same time


• Below are the two additions you asked for.

  A) Draft submit: updated getOrderGroupKey helper (collection‑based)
  Place this near the top of src/app/api/drafts/[id]/submit/route.ts (where the old helper used to live).

  function getOrderGroupKey(
    item: { collectionId?: number | null; skuVariantId: bigint },
    skuPreOrderMap: Map<string, boolean>
  ): string {
    const isPreOrder = skuPreOrderMap.get(String(item.skuVariantId)) ?? false
    const typePrefix = isPreOrder ? 'preorder' : 'ats'
    if (item.collectionId) return `${typePrefix}-collection-${item.collectionId}`
    return `${typePrefix}-default`
  }

  B) CreateOrderResult typing updates (collection‑based, split orders)
  Replace the CreateOrderResult interface in src/lib/types/order.ts with:

  export interface CreateOrderResult {
    success: boolean
    // Single order (backwards compat - primary order when split)
    orderId?: string
    orderNumber?: string
    // Multiple orders (when split by collection)
    orders?: Array<{
      orderId: string
      orderNumber: string
      collectionName: string | null
      shipWindowStart: string | null
      shipWindowEnd: string | null
      orderAmount?: number // keep optional if UI expects it
    }>
    error?: string
  }

  If you want, I can also include the companion update to CreateOrderResult usage in src/components/buyer/order-form.tsx (still read‑only) to align with the orders[]
  array.


› Yes, lso include the companion update to CreateOrderResult usage in src/components/buyer/order-form.tsx to align with the orders[]
    array.


• I'm updating the order-form usage to process the new createOrder result that returns an orders[] array, replacing the prior handling of single order or shipments.
  This includes collecting orders from result.orders and setting the modal state accordingly while keeping the modal tied to submittedShipments, aligning with the
  current Phase1 approach using the new modal.

  Identifying replacement block for result.orders handling

  I'm reviewing the order-form's current result handling to precisely replace it with a block that processes result.orders for the shipments summary shown in the
  modal.

• Explored
  └ Read order-form.tsx

• I'm preparing an update to use the orders[] array consistently in the modal, removing fallback on result.orderId while mapping orders properly to submitted orders or
  shipments for clarity.

  Providing companion CreateOrderResult update

  I'm preparing a snippet to replace the result handling block after the createOrder call in order-form.tsx, mapping result.orders with fallback on orderId, and
  handling optional orderAmount by defaulting or computing it. This aligns usage with the new orders array while maintaining current shipment naming and modal
  behavior.

─ Worked for 43s ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Here’s the companion update for src/components/buyer/order-form.tsx to align with the orders[] array (collection‑based split orders). This is read‑only guidance.

  Replace the block that starts:
  if (result.success && result.orders?.length) {
  and ends at the final else { ... } in the createOrder branch with the snippet below.

  if (result.success && result.orders?.length) {
    // Store order summaries for the modal (orders[] is the canonical return)
    setSubmittedShipments(result.orders.map((o) => ({
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      collectionName: o.collectionName,
      shipWindowStart: o.shipWindowStart,
      shipWindowEnd: o.shipWindowEnd,
      orderAmount: o.orderAmount ?? orderTotal,
    })))

    // NOTE: Do NOT call clearDraft() here - it empties the cart and triggers redirect
    // clearDraft() is called in handleEmailConfirm/handleEmailSkip after modal interaction

    setShowEmailModal(true)
  } else if (result.success && result.orderId) {
    // Backwards compatibility: single order without orders array
    setSubmittedShipments([{
      orderId: result.orderId,
      orderNumber: result.orderNumber || '',
      collectionName: null,
      shipWindowStart: null,
      shipWindowEnd: null,
      orderAmount: orderTotal,
    }])
    setShowEmailModal(true)
  } else {
    toast.error(result.error || 'Failed to create order')
    setIsSubmitting(false)
  }

  This keeps the current modal flow working while fully shifting to the orders[] return shape (with a safe fallback for older responses). Language fixes (“orders” vs
  “shipments”) stay in Phase 2.


› I've created a comprehensive Phase 1 plan at /Users/danielplant/.claude/plans/curious-baking-melody.md - please check it carefully


• The sandbox allows read-only access to any file, so reading the target file is permitted; I'll proceed using shell commands to extract its content within the first
  200 lines.

• Explored
  └ Read curious-baking-melody.md

• The plan's replacement range preserves the existing view-as admin check in createOrder, avoiding removal of that logic. Validation uses per-group ship window dates
  properly keyed by collectionId, and fallback to form input seems acceptable. Grouping logic assumes consistent collectionId per group, which aligns with the keying,
  so no immediate conflicts there.

  Identifying missing import cleanup and updateOrder conflicts

  The plan lacks steps to remove now-unused planned shipment imports, risking lint or TS errors. Also, since types remove plannedShipments but updateOrder still
  references it, failing compilation is likely without reverting or adjusting updateOrder—this gap needs addressing.

• Explored
  └ Read curious-baking-melody.md

• The plan correctly relies on _getOrderGroupKey and validateShipDates as imported in relevant files, matching existing usage. However, the plan omits removing the
  helper getLegacyDatesFromShipments tied to planned shipments, which may cause leftover unused code if planned shipments logic is removed. Also, the use of salesRep
  as data.storeName in sendOrderEmails reflects older behavior—deciding whether to keep this or preserve improved rep naming should be highlighted.

  Highlighting critical fixes and import cleanup

  The plan is solid overall but misses reverting or adjusting updateOrder to avoid TypeScript errors from removed planned shipments—this is critical. It also needs
  pruning unused imports and helper functions tied to planned shipments to prevent lint and compile issues. Additionally, CreateOrderResult should include optional
  orderAmount to match usage, and the use of salesRep: data.storeName in email sending may need revisiting to avoid regressing improved behavior.

─ Worked for 1m 10s ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• I read the plan carefully. It’s solid and aligns with the canonical‑Collection decision, but there are two critical gaps and a couple of minor fixes you should add
  to Phase 1 to avoid compile/runtime issues.

  Critical gaps to add to Phase 1

  - Update updateOrder() in src/lib/data/actions/orders.ts.
    You’re removing plannedShipments from UpdateOrderInput, but updateOrder() still references input.plannedShipments and planned‑shipment sync logic. That will fail
    TypeScript (and is dead logic once planned shipments are removed).
    Fix: Revert updateOrder() to the pre‑Phase‑5 block (the simple “update header + delete/insert items” version), or keep plannedShipments in the type for now. This
    needs to be in Phase 1.
  - Remove planned‑shipment imports in orders.ts.
    After swapping createOrder(), these imports become unused and may cause lint/type issues:
    PlannedShipmentData, findShipmentIdForSku, deriveShipmentsFromItems, getMultiCollectionOverlap, logShipmentDatesOverride.
    Fix: Remove those imports (and any now‑unused helper functions like getLegacyDatesFromShipments if you don’t want dead code).

  Minor fixes / clarifications

  - Email “salesRep” field in createOrder.
    The legacy snippet uses salesRep: data.storeName (from 8d9f99a). Current code uses actual rep data. Consider keeping the current behavior to avoid regression, even
    though it’s not required for Phase 1 correctness.
  - Validation logic vs. “later allowed.”
    Your per‑group validation is correct, but because ship dates are taken from firstItem.shipWindowStart/End when present, user‑entered later dates won’t be used. If
    you want “later allowed” to actually take effect in Phase 1, ship dates should come from the form (and just be validated against collection windows).
    If you want legacy behavior, keep your current approach—just be aware this means “later allowed” won’t happen until Phase 2.

  Suggested plan tweak (minimal)

  - Add File 1b: src/lib/data/actions/orders.ts — revert updateOrder() to pre‑planned‑shipment logic.
  - Add cleanup line in File 1: remove unused planned‑shipment imports/functions.

  Everything else in your plan is coherent and implementable. If you want, I can append an exact pre‑Phase‑5 updateOrder() block for the plan (still read‑only).


› append an exact pre‑Phase‑5 updateOrder() block for the plan


• Ran git show 8d9f99a:src/lib/data/actions/orders.ts | sed -n '600,760p'
  └         orderId: o.orderId,
            orderNumber: o.orderNumber,
    … +161 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-bhZl13Wx' (errno=Operation not permitted)

• Ran git show 8d9f99a:src/lib/data/actions/orders.ts | sed -n '760,900p'
  └       success: true,
          orderNumber: existingOrder.OrderNumber,
    … +141 lines
    git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
    git: error: couldn't create cache file '/tmp/xcrun_db-CqTKD7EC' (errno=Operation not permitted)

─ Worked for 11s ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Here is the exact pre‑Phase‑5 updateOrder() block from 8d9f99a to append to your plan. It fully removes planned‑shipment syncing and restores the classic “update
  header + replace items” behavior.

  Where to use it:
  Replace the current updateOrder() implementation in src/lib/data/actions/orders.ts with the block below.

  // ============================================================================
  // Order Update (Edit Items)
  // ============================================================================

  /**
   * Update an existing order.
   * Matches .NET MyOrder.aspx.cs behavior for edit mode:
   * - Updates CustomerOrders header
   * - Deletes old items, inserts new items
   * - Recalculates order amount
   *
   * @param input - Order update data
   * @returns Success status with order number
   */
  export async function updateOrder(
    input: UpdateOrderInput
  ): Promise<UpdateOrderResult> {
    try {
      const { orderId, items, ...headerData } = input

      // Verify order exists and is editable
      const existingOrder = await prisma.customerOrders.findUnique({
        where: { ID: BigInt(orderId) },
        select: {
          ID: true,
          OrderNumber: true,
          OrderStatus: true,
          IsTransferredToShopify: true,
        },
      })

      if (!existingOrder) {
        return { success: false, error: 'Order not found' }
      }

      // Check edit conditions: Pending AND NOT in Shopify
      if (existingOrder.OrderStatus !== 'Pending') {
        return { success: false, error: 'Only Pending orders can be edited' }
      }

      if (existingOrder.IsTransferredToShopify) {
        return {
          success: false,
          error: 'Orders transferred to Shopify cannot be edited',
        }
      }

      // Calculate new total
      const orderAmount = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      )

      // Update order in transaction
      await prisma.$transaction(async (tx) => {
        // Look up rep by ID
        const rep = await tx.reps.findUnique({
          where: { ID: parseInt(headerData.salesRepId) },
          select: { Name: true },
        })
        if (!rep) {
          throw new Error('Invalid sales rep')
        }
        const salesRepName = rep.Name ?? ''

        // Update order header
        await tx.customerOrders.update({
          where: { ID: BigInt(orderId) },
          data: {
            StoreName: headerData.storeName,
            BuyerName: headerData.buyerName,
            SalesRep: salesRepName,
            CustomerEmail: headerData.customerEmail,
            CustomerPhone: headerData.customerPhone,
            Country: headerData.currency, // Legacy: stores currency
            OrderAmount: orderAmount,
            OrderNotes: headerData.orderNotes ?? '',
            CustomerPO: headerData.customerPO ?? '',
            ShipStartDate: new Date(headerData.shipStartDate),
            ShipEndDate: new Date(headerData.shipEndDate),
            Website: headerData.website ?? '',
          },
        })

        // Delete old items
        await tx.customerOrdersItems.deleteMany({
          where: { CustomerOrderID: BigInt(orderId) },
        })

        // Insert new items
        await tx.customerOrdersItems.createMany({
          data: items.map((item) => ({
            CustomerOrderID: BigInt(orderId),
            OrderNumber: existingOrder.OrderNumber,
            SKU: item.sku,
            SKUVariantID: BigInt(item.skuVariantId),
            Quantity: item.quantity,
            Price: item.price,
            PriceCurrency: headerData.currency,
            Notes: '',
          })),
        })
      })

      revalidatePath('/admin/orders')
      revalidatePath('/rep/orders')

      // Look up the rep name for email
      const repForEmail = await prisma.reps.findUnique({
        where: { ID: parseInt(headerData.salesRepId) },
        select: { Name: true },
      })
      const salesRepName = repForEmail?.Name ?? ''

      // Send update notification emails (async, non-blocking)
      // Email settings control whether update notifications are actually sent
      const currency = headerData.currency.toUpperCase().includes('CAD') ? 'CAD' : 'USD' as 'CAD' | 'USD'
      sendOrderEmails(
        {
          orderId: orderId,
          orderNumber: existingOrder.OrderNumber,
          storeName: headerData.storeName,
          buyerName: headerData.buyerName,
          customerEmail: headerData.customerEmail,
          customerPhone: headerData.customerPhone,
          salesRep: salesRepName,
          orderAmount: orderAmount,
          currency: currency,
          shipStartDate: new Date(headerData.shipStartDate),
          shipEndDate: new Date(headerData.shipEndDate),
          orderDate: new Date(), // Use current date for updates
          orderNotes: headerData.orderNotes ?? '',
          customerPO: headerData.customerPO ?? '',
          items: items.map((item) => ({
            sku: item.sku,
            quantity: item.quantity,
            price: item.price,
            lineTotal: item.price * item.quantity,
          })),
        },
        true // isUpdate = true
      ).catch((err) => {
        console.error('Failed to send order update emails:', err)
      })

      return {
        success: true,
        orderNumber: existingOrder.OrderNumber,
      }
    } catch (e) {
      console.error('updateOrder error:', e)
      const message = e instanceof Error ? e.message : 'Failed to update order'
      return { success: false, error: message }
    }
  }

  If you want me to integrate this block into your plan doc with a new Phase‑1 item (File 1b), I can outline the exact insertion point too.


› Please review again,  I've updated the plan to include:

    1. File 1b: updateOrder() revert - Full pre-Phase-5 block that removes planned-shipment sync logic
    2. File 1c: Import cleanup - List of imports/functions to remove to avoid lint/type errors
    3. Additional test case - Edit existing order verification

    The plan now addresses both critical gaps identified by Codex:
    - updateOrder() no longer references input.plannedShipments
    - Unused planned-shipment imports are explicitly called out for removal


• I'm preparing to read the specified file to verify the updated plan before proceeding.

• Explored
  └ Read curious-baking-melody.md

• The import cleanup plan rightly removes obsolete items including PlannedShipmentData, adjusting the orders.ts imports accordingly. The email send uses an outdated
  salesRep field—consider updating to the actual rep later but not urgent now. The current ship window presence check may miss collections absent from the map, risking
  missed missing-window detection; this needs tightening to fully validate all required groups.

  Highlighting validation gaps and import cleanup details

  The plan properly removes planned-shipment imports and types, with needed tweaks to orders.ts imports. It needs a guard to error if groupCollectionIds are missing
  from the map to avoid skipped validation. The current approach always using collection windows for ship dates may block allowing later user dates, which contradicts
  stated requirements—consider adjusting to use form dates validated against collection windows. Leftover unused state in order-form might trigger lint warnings but
  isn't urgent. Also, keeping salesRep as storeName risks degrading email precision but can be deferred. Overall the plan looks solid with these minor adjustments
  recommended.

─ Worked for 52s ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Plan looks solid now — the two critical gaps are covered. I only see a few remaining nits worth adding as small clarifications so Phase 1 doesn’t surprise you:

  Remaining tweaks to consider adding

  - Import cleanup detail: after removing planned‑shipment types, also remove PlannedShipmentData from the createOrderInputSchema import in src/lib/data/actions/
    orders.ts. Otherwise TS will fail once the type is deleted.
  - Validation edge case: in both createOrder() and draft submit, the validation block filters out undefined collections. If a collection ID is missing in the DB, the
    group gets treated as “ATS/no validation.” Consider guarding for groupCollectionIds.length > 0 && groupCollections.length === 0 → error, so missing collections
    don’t silently skip validation.
  - “Later dates allowed” behavior: the current plan writes ship dates from collection windows when present (same as old behavior). If you want to honor the “later
    allowed” rule, you should use form dates for the order header and only validate they are not earlier than the collection window. That’s a business decision; Phase
    1 can keep legacy behavior, but call it out explicitly.

  Everything else reads clean and implementable. If you want, I can draft a short addendum section for the plan that includes the two guard clauses + the optional
  “later allowed” alternative.


› draft a short addendum section for the plan that includes the two guard clauses + the optional
    “later allowed” alternative.


• Addendum: Edge‑Case Guards + Optional “Later Allowed” Behavior

  A) Guard: Missing collections should not silently skip validation
  In both createOrder() and draft submit validation blocks, add a safeguard:

  if (groupCollectionIds.length > 0 && groupCollections.length === 0) {
    return {
      success: false,
      error: 'Cannot validate ship dates: collection records missing for one or more items.',
    }
  }

  (For draft submit, return NextResponse.json({ error: ... }, { status: 400 }).)

  B) Guard: Missing window dates should be explicit
  Already included, but call out explicitly that the error is blocking (no override in Phase 1):

  if (missingWindows.length > 0) {
    const names = missingWindows.map((c) => c.name ?? 'Unknown').join(', ')
    return {
      success: false,
      error: `Cannot validate ship dates: ${names} missing ship window dates.`,
    }
  }

  C) Optional “Later Allowed” Alternative (Business Rule‑Aligned)
  If you want to allow reps/customers to set later ship dates, use the form dates for the order header and keep validation as “not earlier than collection window.”
  Replace:

  const shipStart = firstItem.shipWindowStart
    ? new Date(firstItem.shipWindowStart)
    : new Date(data.shipStartDate)
  const shipEnd = firstItem.shipWindowEnd
    ? new Date(firstItem.shipWindowEnd)
    : new Date(data.shipEndDate)

  with:

  const shipStart = new Date(data.shipStartDate)
  const shipEnd = new Date(data.shipEndDate)

  (and keep the validation block intact). This preserves the “later allowed” requirement without planned shipments.


› Now check the version here: ~/.claude/plans/snazzy-wobbling-feather.md


• Explored
  └ Read snazzy-wobbling-feather.md

─ Worked for 48s ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• I reviewed ~/.claude/plans/snazzy-wobbling-feather.md. It’s in very good shape and incorporates the guard clauses + updateOrder() revert cleanly. Only a few small
  corrections/clarifications to tighten it:

  Required fixes

  - File 1c (import cleanup): add PlannedShipmentData removal from the createOrderInputSchema import in src/lib/data/actions/orders.ts.
    The plan mentions it in the list, but it’s easy to miss because it’s a type import — call it out explicitly in the cleanup section.
  - File 3 typo: export type OrderItem = z.infer<typeof orderItemSchema> (missing > in plan snippet).

  Optional clarity

  - salesRep in sendOrderEmails: you’re using salesRep: data.storeName in the block. That’s legacy, but current code uses the actual rep. If you want to avoid
    regression, note an optional tweak: use rep’s name/email instead (doesn’t affect Phase 1 behavior but improves accuracy).
  - “Later allowed” alternative: the addendum isn’t in this plan; if you want it here, add a short optional note: use formData for ship dates instead of collection
    windows if you want later dates to flow through.