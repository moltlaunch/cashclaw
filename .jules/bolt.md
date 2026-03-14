## 2025-02-14 - Dashboard API Polling
**Learning:** The React dashboard component made 7 concurrent API calls via Promise.all every 3 seconds to update its state, leading to unnecessary network overhead, extra connections, and potential render thrashing.
**Action:** Aggregate related dashboard data into a single backend API endpoint (`/api/dashboard`) to improve polling efficiency and reduce client-side connection bloat.
