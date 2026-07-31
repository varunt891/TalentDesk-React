// Phase 6 — session flag used to deep-link the notification bell (and any
// future entry point) to a specific Settings tab. The app's routing is a
// simple `currentPage` state with no query-param support, so callers set
// this flag before navigating to 'org_settings' and SettingsCenter reads +
// clears it on mount instead of adding routing/query-param support.
export const SETTINGS_TAB_FLAG = 'td_settings_open_tab'
