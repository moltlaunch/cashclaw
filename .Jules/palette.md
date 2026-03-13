## 2024-03-14 - Custom Toggle Button Accessibility
**Learning:** Custom interactive elements (like div/button based toggles) often lack built-in accessibility semantics, causing them to be read as generic buttons without state context by screen readers.
**Action:** Always add `role="switch"`, `aria-checked={state}`, and `aria-label={label}` to custom toggle components. Additionally, implement keyboard focus indicators using `focus-visible:ring-2` to support keyboard navigation without disrupting mouse users.
