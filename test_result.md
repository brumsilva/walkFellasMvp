## backend:
  - task: \"Revolut Business Merchant API integration (Terminal push payments, sandbox-pending graceful fallback)\"
    implemented: true
    working: true
    file: \"backend/revolut_service.py, backend/server.py, backend/.env\"
    stuck_count: 0
    priority: \"high\"
    needs_retesting: false
    status_history:
        -working: true
        -agent: \"main\"
        -comment: \"Previously tested and working\"
  - task: \"MongoDB adapter + Event Inventory API (compute_event_inventory balance rule)\"
    implemented: true
    working: true
    file: \"backend/mongo_db.py, backend/server.py\"
    stuck_count: 0
    priority: \"high\"
    needs_retesting: true
    status_history:
        -working: true
        -agent: \"main\"
        -comment: \"Replaced Supabase adapter (supabase_db.py) with MongoDB adapter (mongo_db.py) since SUPABASE_URL/KEY were missing. Same interface. Backend now connects to local MongoDB. Event inventory endpoints verified: GET /events/{id}/inventory returns initial_quantity, warehouse_out, warehouse_in, available per product. Balance formula: available = initial_quantity - warehouse_out + warehouse_in. Tested full flow: seed -> assign bag -> inventory shows correct out/available values. POST /events/{id}/inventory sets initial stock. PUT /events/{id}/inventory/{pid} adjusts single product.\"

## frontend:
  - task: \"Redesign all remaining screens to modern rounded style (matching index.tsx login / (walker)/pos.tsx / (admin)/dashboard.tsx reference)\"
    implemented: true
    working: true
    file: \"app/(walker)/waste.tsx, app/(walker)/restock.tsx, app/(walker)/close-shift.tsx, app/(walker)/profile.tsx, app/(supervisor)/queue.tsx, app/(supervisor)/walkers.tsx, app/(supervisor)/waste-validate.tsx, app/(supervisor)/profile.tsx, app/(admin)/catalog.tsx, app/(admin)/events.tsx, app/(admin)/team.tsx\"
    stuck_count: 0
    priority: \"high\"
    needs_retesting: false
    status_history:
        -working: true
        -agent: \"main\"
        -comment: \"Previously working - unchanged\"
  - task: \"Admin Dashboard - General Inventory balance section\"
    implemented: true
    working: true
    file: \"app/(admin)/dashboard.tsx\"
    stuck_count: 0
    priority: \"high\"
    needs_retesting: true
    status_history:
        -working: true
        -agent: \"main\"
        -comment: \"Added collapsible 'General Inventory' section to admin dashboard. Shows: event selector chips (for multi-event), summary row (Initial/Out/Returns/Available totals), full product table with per-product breakdown (Initial, Out, In, Final columns), progress bars per product showing stock % with color coding (green=OK, yellow=mid, red=low), and balance verification footer. Fetches data from GET /events/{id}/inventory. Verified via screenshot: correct values after bag assignment (BEER-500: 500->475, WATER-500: 1000->950). Balance: 2650 = 2575 + 75.\"
  - task: \"Supervisor Walkers - Warehouse stock in Assign Bag modal\"
    implemented: true
    working: true
    file: \"app/(supervisor)/walkers.tsx\"
    stuck_count: 0
    priority: \"high\"
    needs_retesting: true
    status_history:
        -working: true
        -agent: \"main\"
        -comment: \"Updated assign bag modal to fetch warehouse inventory (GET /events/{id}/inventory) when opened. Shows available stock badge per product (green=avail, red=low, grey=no stock). Stepper buttons limited to available warehouse stock. Info banner: 'Available warehouse stock shown per product'. Prevents over-assigning beyond warehouse capacity.\"
  - task: \"Admin Events - Inventory Management modal\"
    implemented: true
    working: true
    file: \"app/(admin)/events.tsx\"
    stuck_count: 0
    priority: \"high\"
    needs_retesting: true
    status_history:
        -working: true
        -agent: \"main\"
        -comment: \"Added 'Stock' button on each event card that opens inventory management modal. Shows: info banner about initial stock, current balance section (showing products with movements: out/in/available), quantity editor per product with -10/-/input/+/+10 steppers, SKU+price info, and 'Save inventory' button. Calls POST /events/{id}/inventory to save. Verified via screenshot.\"
  - task: \"Walker POS: Revolut Terminal charge flow\"
    implemented: true
    working: \"NA\"
    file: \"app/(walker)/pos.tsx\"
    stuck_count: 0
    priority: \"high\"
    needs_retesting: true
    status_history:
        -working: \"NA\"
        -agent: \"main\"
        -comment: \"Previously implemented - unchanged\"
  - task: \"Admin Team screen: assign/edit walker's Revolut Terminal code\"
    implemented: true
    working: \"NA\"
    file: \"app/(admin)/team.tsx\"
    stuck_count: 0
    priority: \"medium\"
    needs_retesting: true
    status_history:
        -working: \"NA\"
        -agent: \"main\"
        -comment: \"Previously implemented - unchanged\"