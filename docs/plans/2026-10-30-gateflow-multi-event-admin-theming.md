# GateFlow Multi-Event Management, Admin & Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or autonomous execution to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform GateFlow into a universal, multi-event gate operations platform with a dedicated "Event" management tab, custom logo upload, dynamic theme color engines, admin/staff role-based privileges, direct CSV ingestion, database purging, and an internationally styled attendee directory.

**Architecture:** 
- Frontend state architecture in React 19 + TypeScript with localized reactive stores.
- Centralized Theme Engine (`src/lib/theme.ts`) injecting CSS custom variables into `:root` and persisting to `localStorage`.
- Role-based navigation in `AppShell` allowing Admin users access to Event settings, DB wipe, and CSV import while restricting Gate Staff to continuous scan, lookup, and assigned gate.
- Event management screen (`src/screens/EventScreen.tsx`) managing event metadata, live logo upload/replacement, and badge/PDF templates.
- Bulk CSV parsing and batch ingestion pipeline into Firestore / demo store.

**Tech Stack:** React 19, Vite 8, TypeScript 5.9, Firebase 12, Lucide Icons, Vitest.

---

### Task 1: Core Types & Role-Based Session Models
**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Extend `AppView` with `"event"`**
- [ ] **Step 2: Add `logoUrl` to `EventRecord`**
- [ ] **Step 3: Add `role: "admin" | "staff"` to `StaffSession`**
- [ ] **Step 4: Define `ThemeName` and theme tokens**
- [ ] **Step 5: Add international event copy dictionary entries in Arabic & English**

---

### Task 2: Centralized Theme Color Engine (`src/lib/theme.ts`)
**Files:**
- Create: `src/lib/theme.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Implement preset color themes (Teal / Indigo / Sapphire / Slate / Crimson / Emerald)**
- [ ] **Step 2: Implement `applyTheme()` injecting CSS custom variables (`--brand`, `--brand-deep`, `--gold`, etc.)**
- [ ] **Step 3: Persist active theme in `localStorage` and initialize on app boot**

---

### Task 3: Admin & Staff Role Authentication
**Files:**
- Modify: `src/components/LoginScreen.tsx`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add Admin vs Staff login mode with dedicated PIN (Admin: `888888` / `999999`)**
- [ ] **Step 2: Assign `session.role = "admin"` or `"staff"` upon validation**
- [ ] **Step 3: Update `AppShell.tsx` to conditionally display `event` and privileged controls for Admin only**

---

### Task 4: Dynamic Event Management Screen (`src/screens/EventScreen.tsx`)
**Files:**
- Create: `src/screens/EventScreen.tsx`
- Modify: `src/components/BrandLogo.tsx`
- Modify: `src/screens/WelcomeBoardScreen.tsx`

- [ ] **Step 1: Build Event details form (Title, Topic, Subtitle, Date, Time, Venue, Status)**
- [ ] **Step 2: Build Logo Uploader / Logo URL changer with immediate preview**
- [ ] **Step 3: Integrate Badge / PDF Invitation configuration moved from the old attendees tab**
- [ ] **Step 4: Add New Event creation and event switching**

---

### Task 5: Database Purge & Direct CSV Bulk Ingestion
**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/screens/PeopleScreen.tsx`
- Modify: `src/screens/EventScreen.tsx`

- [ ] **Step 1: Implement `purgeDatabase(eventId)` in `EventClient` and Firestore client**
- [ ] **Step 2: Implement CSV file reader and parser in `src/lib/csvImport.ts`**
- [ ] **Step 3: Add "Import CSV" modal in `PeopleScreen.tsx` with preview and direct database save**

---

### Task 6: Rebuild `المدعوون` (Attendees Tab) with International Terms
**Files:**
- Modify: `src/screens/PeopleScreen.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Replace local terminology with international terms (Delegates, VIP, Speakers, Press)**
- [ ] **Step 2: Compact attendee card layout with role badges and status pills**
- [ ] **Step 3: Clean up search and category filtering**

---

### Task 7: Theme Customization in Settings
**Files:**
- Modify: `src/screens/SettingsScreen.tsx`

- [ ] **Step 1: Add theme selector grid with visual color swatches**
- [ ] **Step 2: Add database purge button (with confirmation modal) for Admin**

---

### Task 8: Verification & Deployment
- [ ] **Step 1: Run `npm run test:web` to verify domain invariants**
- [ ] **Step 2: Run `npm run build` to verify bundle compilation**
- [ ] **Step 3: Deploy to Firebase Hosting and test across viewports**
- [ ] **Step 4: Commit and push all changes to GitHub**
