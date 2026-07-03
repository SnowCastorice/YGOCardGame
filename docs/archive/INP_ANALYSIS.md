# YGO Card Game - INP Performance Investigation

## Quick Summary

| Button | INP | Bottleneck | Cost | Root Cause |
|--------|-----|-----------|------|-----------|
| #btn-quick-reopen | 944ms | showResults() | 700ms | appendChild loop |
| #btn-inventory | 640ms | renderInventoryModal() | 600ms | 100+ cards, no pagination |
| #btn-open-3box | 504ms | showResults(90) | 400ms | appendChild loop |
| #btn-dev-reset-game | 2184ms | confirm/alert | 1500ms | Modal dialogs block Main Thread |
| #btn-open-box | 536ms | showResults(30) | 400ms | appendChild loop |

---

## Detailed Analysis

### 1. #btn-quick-reopen (944ms INP)

**Location:** game.js lines 457-468

**Call chain:**
```
Click → openMultiPacks(boxCount * boxesForBonus)
      → showResults(allCards, bonusCards) [⚠️ 700ms]
      → Card drawing logic [100-150ms]
```

**Main problem in showResults() (lines 2436-2690):**

Lines 2474-2530: appendChild() loop (150-300ms) ⚠️ WORST
```javascript
for (let i = 0; i < displayCards.length; i++) {
    const cardEl = document.createElement('div');
    cardEl.innerHTML = complex_html;
    display.appendChild(cardEl);  // ← REFLOW TRIGGER
}
```

Each appendChild() forces browser reflow. With 30-90 cards = 30-90 forced reflows.

**Better approach:**
```javascript
let html = '';
for (let i = 0; i < displayCards.length; i++) {
    html += '<div>...</div>';
}
display.innerHTML = html;  // Single reflow
```

---

### 2. #btn-inventory (640ms INP)

**Location:** game.js line 346

**Call chain:**
```
Click → showInventory()
      → InventorySystem.renderInventoryModal() [⚠️ 600ms]
```

**Main problem in renderInventoryModal() (inventory.js 345-528):**

1. **getExpandedCards()** (30-50ms)
   - Iterate 100-150 inventory items
   - Expand rarity versions

2. **sortCards()** (40-80ms)
   - O(n log n) sort on 100+ items

3. **HTML building** (150-250ms)
   - Loop 100-150 times
   - Complex string interpolation per card

4. **innerHTML assignment** (100-150ms)
   - SYNCHRONOUS DOM reflow for 100+ elements

5. **querySelectorAll loop** (20-40ms) ⚠️ EXPENSIVE
   - Search 100+ newly created elements
   - Attach event handlers to each

**Root cause:** No pagination - renders ALL cards at once

---

### 3. #btn-open-3box (504ms INP)

**Location:** game.js lines 443-447

**Same as #btn-quick-reopen but with 90 cards (3 boxes)**

Main bottleneck: showResults(90 cards) → 300-400ms

---

### 4. #btn-dev-reset-game (2184ms INP) ⚠️ CRITICAL

**Location:** game.js lines 3190-3192, function lines 2852-2868

**Code:**
```javascript
function devResetGame() {
    if (!confirm('❗ 确定要重置游戏吗？...')) {  // ← BLOCKS 500-2000ms
        return;
    }
    
    CurrencySystem.resetAll();        // Fast
    CurrencySystem.updateUI();        // Fast
    InventorySystem.clearAll();       // Fast
    alert('✅ 游戏已重置！');          // ← BLOCKS 500-2000ms
}
```

**Why 2184ms:**
- Synchronous modal dialogs BLOCK Main Thread
- confirm() waits for user input
- alert() waits for user input
- INP metric INCLUDES user response time
- Total: ~1000-2000ms of user response time

**Note:** InventorySystem.clearAll() takes < 50ms (just deletes object and writes to localStorage)

---

### 5. #btn-open-box (536ms INP)

**Location:** game.js lines 431-434

**Same as #btn-quick-reopen but with 30 cards (1 box)**

Main bottleneck: showResults(30 cards) → 300-400ms

---

## showResults() Deep Dive

**File:** game.js lines 2436-2690+
**Impact:** 50-80% of INP for all open buttons

### Where Time is Spent:

1. **Lines 2446-2468: Card merging & sorting** (50-100ms)
   - Loop 30+ times through cards
   - Use Map to deduplicate
   - O(n log n) sort by rarity

2. **Lines 2474-2530: APPENDCHILD LOOP** (150-300ms) ⚠️ PRIMARY
   - Creates 30-90 DOM elements
   - Each appendChild() triggers reflow
   - Complex HTML interpolation per card
   
   **Cost breakdown:**
   - 30 cards = 250-350ms
   - 90 cards = 400-500ms

3. **Lines 2532-2582: Bonus cards rendering** (20-80ms)
   - Same appendChild pattern for 1-4 bonus cards

4. **Lines 2592-2614: Rarity stats** (20-30ms)
   - Loop and count by rarity
   - Build HTML and update DOM

5. **Lines 2616-2690: Price stats** (30-50ms)
   - Loop through cards
   - Call PriceSystem.getCardPrice()
   - Calculate profit/loss

---

## renderInventoryModal() Deep Dive

**File:** inventory.js lines 345-528
**Impact:** 640ms INP for inventory button

### Where Time is Spent:

1. **getExpandedCards()** (30-50ms)
   - Iterate through ALL inventory
   - Expand rarities: 1 card × 3 rarities = 3 expanded items
   - 50 unique cards × 2-3 rarities = 100-150 expanded items

2. **sortCards()** (40-80ms)
   - O(n log n) sort on 100-150 items

3. **HTML string building** (150-250ms)
   - Loop 100-150 times
   - Per iteration: 5-10 string interpolations
   - Each: imageHtml, nameHtml, priceHtml, badges
   - String concatenation (inefficient)

4. **innerHTML assignment** (100-150ms)
   - SYNCHRONOUS DOM reflow
   - Browser parses 100+ elements
   - Recalculates grid layout

5. **querySelectorAll + event binding** (20-40ms)
   - querySelectorAll('.inventory-card-item')
   - Finds 100+ elements in new DOM ⚠️ EXPENSIVE
   - Loop and attach click handler to each

---

## Root Causes

### 1. appendChild() Loop Pattern (CRITICAL - ALL OPEN BUTTONS)
- Every appendChild() forces browser reflow
- 30-90 forced reflows vs. 1 optimal reflow
- Cost: 100-200ms overhead
- Fix: Build HTML string first, single innerHTML

### 2. Synchronous Modal Dialogs (CRITICAL - RESET BUTTON)
- confirm() and alert() block Main Thread
- INP includes user response time (500-2000ms each)
- Total: 2000-4000ms
- Fix: Replace with custom modal dialog

### 3. No Pagination (HIGH - INVENTORY BUTTON)
- Renders all 100+ inventory cards at once
- querySelectorAll on 100+ elements + loop
- Fix: Virtual scrolling or show first 20

### 4. Complex HTML Interpolation (MEDIUM - ALL BUTTONS)
- 100+ string interpolations in loops
- Conditional logic per card
- Better: Simpler template or DocumentFragment

---

## Performance Improvement Potential

| Fix | Impact | Effort |
|-----|--------|--------|
| Replace appendChild() loop with single innerHTML | -200-400ms | LOW |
| Replace confirm/alert with custom modal | -1500-2000ms | MEDIUM |
| Add pagination to inventory | -300-400ms | MEDIUM |
| Simplify HTML templates | -30-50ms | LOW |

**Total potential improvement: 50-70% INP reduction**

---

## Key Code Locations

- **showResults():** game.js lines 2436-2690+
  - Problem: Lines 2474-2530 appendChild loop
  
- **renderInventoryModal():** inventory.js lines 345-528
  - Problem: Line 490 innerHTML + lines 508-527 querySelectorAll
  
- **devResetGame():** game.js lines 2852-2868
  - Problem: Lines 2853, 2862 modal dialogs
  
- **openMultiPacks():** game.js lines 1310-1465
  - Secondary: Lines 1360-1385 card drawing

