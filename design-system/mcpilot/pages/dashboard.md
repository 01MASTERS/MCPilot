# Dashboard Page Overrides (MCPilot)

> **PROJECT:** MCPilot  
> **Source of Truth:** `design-system/mcpilot/MASTER.md`  
> **Skill:** `ui-ux-pro-max` (Minimalism & Swiss Style, Data-Dense Developer Portal)  

---

## Page-Specific Rules & Tokens

### Layout & Sizing
- **Layout Architecture:** Fixed 260px left sidebar + 100% fluid main content workbench.
- **Max Width:** Full-width responsive with 1440px content focus.
- **Grid Layout:** 12-column responsive CSS grid with `--space-lg` (24px) gutters.
- **Density:** 8/10 (high data density, space-efficient, maximum data visibility).

### Typography
- **Headings & Monospace:** `JetBrains Mono`, `monospace` (weights 500, 600).
- **Body & Controls:** `IBM Plex Sans`, `sans-serif` (weights 400, 500).

### Color Tokens (Vercel Geist Aesthetic)
- Canvas: `#000000` (Pure Pitch Black)
- Card Surfaces: `#0A0A0A` (Charcoal)
- Borders: `#222222` (1px Hairline Crisp Border)
- Text: `#EDEDED` (7:1+ contrast)
- Muted Text: `#888888`
- Endpoint Green (Connected): `#00DF8F` (Vercel Neon Emerald)
- Alert Red (Unreachable / Error): `#EE0000` (Vercel Neon Red)
- Primary CTA: `#FFFFFF` background with `#000000` text
- Focus Ring: `#0070F3` (2px visible outline)

### Core Components
1. **Upstream Server Card:**
   - Background `#0A0A0A`, border `1px solid #222222`, border-radius `8px`.
   - Response latency indicator with `#00DF8F` neon green dot.
   - Accessible toggle switch.
2. **Slide-Over Trace Inspector Drawer:**
   - Width: `480px`, fixed right-side overlay with backdrop blur.
   - Dual-tab interface: *Payload* (formatted JSON) & *Metrics* (duration, timestamps, stack trace).
   - Dismissible via Escape key or backdrop click.
3. **Chat Tool Execution Card:**
   - Nested card within chat stream showing tool name, latency badge, and collapsible input/output accordion.

### Strict Anti-Patterns
- ❌ No emojis as structural icons (strictly Phosphor `@phosphor-icons/react` / Lucide vector icons).
- ❌ No layout-shifting transforms on hover.
- ❌ No low-contrast muted text (minimum 4.5:1 for body, 7:1 for headers).
