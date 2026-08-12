# Phase 11 — Dashboard UI

## Scope

This phase creates the first production-oriented dashboard shell for the private Frezen Control System. It is a UI/navigation foundation only; feature-specific data and actions remain in their numbered roadmap phases.

## Included

- Dark theme.
- Responsive mobile-first layout.
- Desktop sidebar navigation.
- Mobile drawer navigation and overlay.
- Header and page title.
- Private admin-area visual state.
- Navigation surfaces for Overview, Licenses, Keys, Products, Scripts, Users, HWID, SafeLinkU, Discord, Analytics, Audit Logs, Invites, Security and Settings.
- Overview cards use placeholders instead of fabricated live metrics.
- System status panel.

## Security boundary

The dashboard must not treat UI state as authentication or authorization. The Worker remains the source of truth for session and permission enforcement. Feature-specific API calls will be connected in their corresponding phases.

## Out of scope

- Phase 12 analytics/overview data.
- Product CRUD (Phase 13).
- License UI/data (Phase 15).
- HWID operations (Phase 16).
- Lua management (Phase 17).
- SafeLinkU integration (Phase 21).
- Discord integration (Phase 24+).

## Verification

Run from `dashboard/`:

```bash
npm install
npm test
npm run build
```

The test contract checks navigation coverage, mobile behavior, responsive/dark styling, and absence of fabricated dashboard metrics.
