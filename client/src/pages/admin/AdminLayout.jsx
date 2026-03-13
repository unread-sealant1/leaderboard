import React, { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import "../../styles/admin.css";
import logo from "../../assets/ihub-logo.png";
import { clearToken } from "../../auth/auth";
import { api } from "../../auth/api";
import OverviewRightRail from "../../components/admin/OverviewRightRail";
import { runAdminFullSync, summarizeAdminFullSync } from "../../lib/adminSync";

const NAV_GROUPS = [
  {
    key: "main",
    label: "Main",
    items: [
      { to: "/admin/dashboard", label: "Overview" },
      { to: "/admin/gradebook", label: "Grades Overview" },
      { to: "/admin/grades", label: "Gradebook" },
      { to: "/admin/weekly-gradebook", label: "Weekly Gradebook" },
      { to: "/admin/students", label: "Students" },
      { to: "/admin/teams", label: "Teams" }
    ]
  },
  {
    key: "academics",
    label: "Academics",
    items: [
      { to: "/admin/phases", label: "Periods & Terms" },
      { to: "/admin/meta-skills", label: "Comments and Notifications" },
      { to: "/admin/coaching", label: "Coaching" }
    ]
  },
  {
    key: "ops",
    label: "Operations",
    items: [
      { to: "/admin/alerts", label: "Alerts & Messages" },
      { to: "/admin/tv-settings", label: "TV Settings" }
    ]
  }
];

const PAGE_TITLES = [
  { path: "/admin/dashboard", label: "Admin Dashboard" },
  { path: "/admin/gradebook", label: "Grades Overview" },
  { path: "/admin/grades", label: "Gradebook" },
  { path: "/admin/weekly-gradebook", label: "Weekly Gradebook" },
  { path: "/admin/students", label: "Students" },
  { path: "/admin/teams", label: "Teams" },
  { path: "/admin/phases", label: "Periods & Terms" },
  { path: "/admin/meta-skills", label: "Comments and Notifications" },
  { path: "/admin/coaching", label: "Coaching" },
  { path: "/admin/alerts", label: "Alerts & Messages" },
  { path: "/admin/tv-settings", label: "TV Settings" }
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");

  const pageTitle = useMemo(() => {
    const match = PAGE_TITLES.find((item) => location.pathname.startsWith(item.path));
    return match?.label || "Admin";
  }, [location.pathname]);

  const showRightRail = location.pathname === "/admin/dashboard";

  async function handleSync() {
    setSyncing(true);
    setSyncNotice("Syncing DreamClass data...");
    try {
      const result = await runAdminFullSync(api);
      await api("/api/admin/dashboard");
      setSyncNotice(summarizeAdminFullSync(result));
    } catch (syncError) {
      setSyncNotice(syncError?.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    const value = search.trim();
    if (!value) return;
    navigate(`/admin/students?q=${encodeURIComponent(value)}`);
  }

  function handleLogout() {
    clearToken();
    navigate("/admin/login");
  }

  return (
    <div className={`adminShell ${showRightRail ? "" : "noRail"}`}>
      <aside className="adminSide">
        <div className="adminBrand">
          <img className="adminBrandLogo" src={logo} alt="iHub logo" />
          <div>
            <div className="adminBrandTitle">iHub Admin</div>
            <div className="adminBrandSub">Student Performance v2</div>
          </div>
        </div>

        <nav className="adminNav">
          {NAV_GROUPS.map((group) => (
            <details className="adminNavGroup" key={group.key} open>
              <summary className="adminNavGroupSummary">
                <span className="adminNavGroupLabel">{group.label}</span>
              </summary>
              <div className="adminNavGroupItems">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) => `adminNavItem ${isActive ? "active" : ""}`}
                    to={item.to}
                  >
                    <span className="adminNavIcon" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </details>
          ))}
        </nav>

        <div className="adminSideCard">
          <div className="adminSideCardTitle">Status</div>
          <div className="adminSideCardRow"><span className="dot ok" />Database connected</div>
          <div className="adminSideCardRow"><span className="dot warn" />DreamClass sync source</div>
        </div>
      </aside>

      <section className="adminMain">
        <header className="adminGlobalHeader">
          <div className="adminHeaderTitle">{pageTitle}</div>

          <form className="adminHeaderSearchWrap" onSubmit={handleSearchSubmit}>
            <input
              className="adminHeaderSearch"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, team, or ID..."
            />
          </form>

          <div className="adminHeaderActions">
            <button className="chipBtn" onClick={() => window.location.reload()} type="button">
              Refresh
            </button>
            <button className="primaryBtn" onClick={handleSync} disabled={syncing} type="button">
              {syncing ? "Syncing..." : "Sync"}
            </button>
            <button className="iconBtn" type="button" aria-label="Notifications">
              <span className="iconBell" />
              <span className="iconDot" />
            </button>
            <details className="profileMenu">
              <summary className="profileSummary">
                <span className="profileInitials">IH</span>
              </summary>
              <div className="profilePanel">
                <button
                  type="button"
                  onClick={() => window.open("/tv", "_blank", "noopener,noreferrer")}
                >
                  Open TV
                </button>
                <button type="button" onClick={handleLogout}>Sign Out</button>
              </div>
            </details>
          </div>
        </header>
        {syncNotice ? <div className="adminHeaderSyncNote">{syncNotice}</div> : null}

        <div className="adminContent">
          <Outlet />
        </div>
      </section>

      {showRightRail ? (
        <aside className="adminRightRail">
          <div className="adminRightRailInner">
            <OverviewRightRail />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

