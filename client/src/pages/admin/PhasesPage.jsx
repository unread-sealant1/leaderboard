import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import PageShell from "../../components/admin/PageShell";
import "../../styles/admin.css";

function displayTermName(value) {
  return String(value || "").replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

function displayPeriodName(value) {
  return String(value || "").trim() || "Untitled Period";
}

function formatDate(value) {
  if (!value) return "-";
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let year;
  let month;
  let day;
  if (isoMatch) {
    [, year, month, day] = isoMatch;
  } else {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
    year = String(parsed.getFullYear());
    month = String(parsed.getMonth() + 1).padStart(2, "0");
    day = String(parsed.getDate()).padStart(2, "0");
  }
  const monthName = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ][Number(month) - 1];
  if (!monthName) return raw;
  return `${Number(day)} ${monthName} ${year}`;
}

function PhasesPage() {
  const [periods, setPeriods] = useState([]);
  const [terms, setTerms] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [syncingTerms, setSyncingTerms] = useState(false);
  const [syncSummary, setSyncSummary] = useState("");
  const [savingSprint, setSavingSprint] = useState(false);
  const [sprintNotice, setSprintNotice] = useState("");
  const [sprintForm, setSprintForm] = useState({
    id: "",
    stream: "meta",
    term: 1,
    sprint_start: 1,
    sprint_end: 1,
    topic: ""
  });

  async function load() {
    const [periodRows, termRows, sprintRows] = await Promise.all([
      api("/api/periods"),
      api("/api/phases"),
      api("/api/sprint-definitions")
    ]);
    setPeriods(Array.isArray(periodRows) ? periodRows : []);
    setTerms(Array.isArray(termRows) ? termRows : []);
    setSprints(Array.isArray(sprintRows?.sprints) ? sprintRows.sprints : []);
  }

  useEffect(() => {
    load().catch(() => {
      setPeriods([]);
      setTerms([]);
    });
  }, []);

  useEffect(() => {
    setSelectedPeriodId((prev) =>
      prev && periods.some((period) => String(period.id) === String(prev))
        ? prev
        : (periods[0]?.id || "")
    );
  }, [periods]);

  async function syncPeriodsAndTerms() {
    setSyncingTerms(true);
    setSyncSummary("");
    try {
      const result = await api("/api/integrations/dreamclass/sync/terms-phases", {
        method: "POST",
        body: JSON.stringify({ replaceLocalAcademic: true })
      });
      await load();
      window.dispatchEvent(new Event("admin:academic-structure-updated"));
      setSyncSummary(
        result?.configured === false
          ? "DreamClass not configured."
          : `Synced periods and terms: ${Number(result?.termsCreated || 0)} periods created, ${Number(result?.termsUpdated || 0)} periods updated, ${Number(result?.phasesCreated || 0)} terms created, ${Number(result?.phasesUpdated || 0)} terms updated.`
      );
    } catch (error) {
      setSyncSummary(error?.message || "Periods and terms sync failed.");
    } finally {
      setSyncingTerms(false);
    }
  }

  function resetSprintForm() {
    setSprintForm({
      id: "",
      stream: "meta",
      term: 1,
      sprint_start: 1,
      sprint_end: 1,
      topic: ""
    });
  }

  async function saveSprintDefinition(event) {
    event.preventDefault();
    setSavingSprint(true);
    setSprintNotice("");
    try {
      const payload = {
        stream: sprintForm.stream,
        term: Number(sprintForm.term),
        sprint_start: Number(sprintForm.sprint_start),
        sprint_end: Number(sprintForm.sprint_end),
        topic: sprintForm.stream === "meta" ? (sprintForm.topic || null) : null
      };

      if (!["meta", "webdev"].includes(payload.stream)) {
        throw new Error("Stream must be meta or webdev.");
      }
      if (!(payload.term >= 1 && payload.term <= 5)) {
        throw new Error("Term must be between 1 and 5.");
      }
      if (payload.sprint_start < 1 || payload.sprint_end < payload.sprint_start) {
        throw new Error("Sprint range is invalid.");
      }

      if (sprintForm.id) {
        await api(`/api/sprint-definitions/${encodeURIComponent(sprintForm.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setSprintNotice("Sprint definition updated.");
      } else {
        await api("/api/sprint-definitions", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setSprintNotice("Sprint definition created.");
      }
      resetSprintForm();
      await load();
    } catch (error) {
      setSprintNotice(error?.message || "Failed to save sprint definition.");
    } finally {
      setSavingSprint(false);
    }
  }

  async function deleteSprintDefinition(id) {
    setSavingSprint(true);
    setSprintNotice("");
    try {
      await api(`/api/sprint-definitions/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (String(sprintForm.id) === String(id)) resetSprintForm();
      await load();
      setSprintNotice("Sprint definition deleted.");
    } catch (error) {
      setSprintNotice(error?.message || "Failed to delete sprint definition.");
    } finally {
      setSavingSprint(false);
    }
  }

  const termsByPeriod = useMemo(() => {
    const grouped = new Map();
    for (const term of terms) {
      const key = String(term.term_id || "");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(term);
    }
    for (const [key, rows] of grouped.entries()) {
      grouped.set(
        key,
        [...rows].sort((a, b) => {
          const ao = Number(a.phase_order || 0);
          const bo = Number(b.phase_order || 0);
          if (ao !== bo) return ao - bo;
          return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
        })
      );
    }
    return grouped;
  }, [terms]);

  const selectedPeriod = periods.find((period) => String(period.id) === String(selectedPeriodId)) || null;
  const selectedTerms = selectedPeriod ? termsByPeriod.get(String(selectedPeriod.id)) || [] : [];

  return (
    <PageShell
      title="Periods & Terms"
      subtitle={`Periods and terms are separate sections.${syncSummary ? ` ${syncSummary}` : ""}`}
      actions={
        <button className="chipBtn" onClick={syncPeriodsAndTerms} disabled={syncingTerms} type="button">
          {syncingTerms ? "Syncing Periods & Terms..." : "Sync Periods & Terms"}
        </button>
      }
    >
      <div className="panel">
        <div className="panelTitle">Periods</div>
        <div className="panelSub">Period cards show period metadata only.</div>
        {!periods.length ? (
          <div className="emptyState">No periods synced yet. Click "Sync Periods & Terms".</div>
        ) : (
          <div className="periodGrid">
            {periods.map((period) => (
              <button
                key={period.id}
                type="button"
                className={`periodCard ${String(period.id) === String(selectedPeriodId) ? "active" : ""}`}
                onClick={() => setSelectedPeriodId(period.id)}
              >
                <div className="periodCardTitle">{displayPeriodName(period.name)}</div>
                <div className="periodCardMeta">
                  {formatDate(period.start_date)} - {formatDate(period.end_date)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panelTitle">Terms</div>
        <div className="panelSub">
          {selectedPeriod ? `Terms for ${displayPeriodName(selectedPeriod.name)}` : "Select a period to view terms."}
        </div>
        {!selectedPeriod ? (
          <div className="emptyState">No period selected.</div>
        ) : !selectedTerms.length ? (
          <div className="emptyState">No terms synced for this period.</div>
        ) : (
          <div className="termStrip">
            {selectedTerms.map((term) => (
              <div className="termCard" key={term.id}>
                <div className="termCardTitle">{displayTermName(term.name)}</div>
                <div className="termCardMeta">
                  {formatDate(term.start_date)} - {formatDate(term.end_date)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panelTitle">Sprint Definitions</div>
        <div className="panelSub">Configure sprint ranges by stream and term (Meta + WebDev).</div>
        {sprintNotice ? <div className="panelSub">{sprintNotice}</div> : null}

        {!sprints.length ? (
          <div className="emptyState">No sprint definitions yet.</div>
        ) : (
          <div className="table">
            <div className="tr head" style={{ gridTemplateColumns: "0.8fr 0.8fr 1fr 1fr 1.5fr 0.9fr" }}>
              <div>Stream</div>
              <div>Term</div>
              <div>Sprint Start</div>
              <div>Sprint End</div>
              <div>Topic</div>
              <div>Actions</div>
            </div>
            {sprints
              .slice()
              .sort((a, b) => {
                const streamSort = String(a.stream || "").localeCompare(String(b.stream || ""), undefined, { sensitivity: "base" });
                if (streamSort !== 0) return streamSort;
                return Number(a.term || 0) - Number(b.term || 0);
              })
              .map((row) => (
                <div className="tr" style={{ gridTemplateColumns: "0.8fr 0.8fr 1fr 1fr 1.5fr 0.9fr" }} key={row.id}>
                  <div>{row.stream}</div>
                  <div>{row.term}</div>
                  <div>{row.sprint_start}</div>
                  <div>{row.sprint_end}</div>
                  <div>{row.topic || "-"}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="softBtn"
                      onClick={() =>
                        setSprintForm({
                          id: row.id,
                          stream: row.stream || "meta",
                          term: Number(row.term || 1),
                          sprint_start: Number(row.sprint_start || 1),
                          sprint_end: Number(row.sprint_end || 1),
                          topic: row.topic || ""
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="chipBtn"
                      onClick={() => deleteSprintDefinition(row.id)}
                      disabled={savingSprint}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        <form style={{ marginTop: 16, display: "grid", gap: 10 }} onSubmit={saveSprintDefinition}>
          <div className="table">
            <div className="tr head" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 2fr" }}>
              <div>Stream</div>
              <div>Term</div>
              <div>Sprint Start</div>
              <div>Sprint End</div>
              <div>Topic (Meta only)</div>
            </div>
            <div className="tr" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 2fr" }}>
              <div>
                <select
                  className="adminSelect"
                  value={sprintForm.stream}
                  onChange={(event) => setSprintForm((prev) => ({ ...prev, stream: event.target.value }))}
                >
                  <option value="meta">meta</option>
                  <option value="webdev">webdev</option>
                </select>
              </div>
              <div>
                <select
                  className="adminSelect"
                  value={sprintForm.term}
                  onChange={(event) => setSprintForm((prev) => ({ ...prev, term: Number(event.target.value) }))}
                >
                  {[1, 2, 3, 4, 5].map((term) => (
                    <option key={term} value={term}>{term}</option>
                  ))}
                </select>
              </div>
              <div>
                <input
                  className="adminInput"
                  type="number"
                  min={1}
                  value={sprintForm.sprint_start}
                  onChange={(event) => setSprintForm((prev) => ({ ...prev, sprint_start: Number(event.target.value || 1) }))}
                />
              </div>
              <div>
                <input
                  className="adminInput"
                  type="number"
                  min={1}
                  value={sprintForm.sprint_end}
                  onChange={(event) => setSprintForm((prev) => ({ ...prev, sprint_end: Number(event.target.value || 1) }))}
                />
              </div>
              <div>
                <input
                  className="adminInput"
                  type="text"
                  value={sprintForm.topic}
                  onChange={(event) => setSprintForm((prev) => ({ ...prev, topic: event.target.value }))}
                  placeholder="Example: Personal Accountability"
                  disabled={sprintForm.stream !== "meta"}
                />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="primaryBtn" type="submit" disabled={savingSprint}>
              {savingSprint ? "Saving..." : (sprintForm.id ? "Update Sprint" : "Add Sprint")}
            </button>
            {sprintForm.id ? (
              <button className="chipBtn" type="button" onClick={resetSprintForm}>
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </PageShell>
  );
}

export { PhasesPage };
export default PhasesPage;
