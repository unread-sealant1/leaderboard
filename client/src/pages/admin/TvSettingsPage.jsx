import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../auth/api";
import PageShell from "../../components/admin/PageShell";
import TeamDialsGrid from "../../components/tv/TeamDialsGrid";
import { StudentMarksBars } from "../../components/tv/StudentMarksBars";
import CoachingTrends from "../../components/tv/CoachingTrends";
import AlertsScreen from "../../components/tv/AlertsScreen";
import MetaSkillAreas1Screen from "../../components/tv/MetaSkillAreas1Screen";
import MetaSkillAreas2Screen from "../../components/tv/MetaSkillAreas2Screen";
import CommentsScreen from "../../components/tv/CommentsScreen";
import NotificationsScreen from "../../components/tv/NotificationsScreen";
import WelcomeIntroScreen from "../../components/tv/WelcomeIntroScreen";
import "../../styles/admin.css";
import "../../styles/tv.css";

const TV_SCREENS = [
  { key: "welcome_screen", label: "Welcome Screen" },
  { key: "topic_team_dials", label: "Web Development Team Dials" },
  { key: "meta_team_dials", label: "Meta Skills Team Dials" },
  { key: "topic_student_bars", label: "Individual Marks (By Stream)" },
  { key: "coaching_team_trends", label: "Coaching Trends" },
  { key: "alerts_summary", label: "Alerts Summary" },
  { key: "comments_screen", label: "Comments" },
  { key: "notifications_screen", label: "Notifications" },
  { key: "meta_skills_1", label: "Meta Skills: Areas (Set 1)" },
  { key: "meta_skills_2", label: "Meta Skills: Areas (Set 2)" }
];
const TV_SCREEN_KEYS = TV_SCREENS.map((s) => s.key);
const TV_SCREEN_KEY_SET = new Set(TV_SCREEN_KEYS);
const DEFAULT_ENABLED_SCREENS = TV_SCREEN_KEYS.filter((key) => key !== "welcome_screen");

const STREAMS = [
  { key: "meta", label: "Meta Skills" },
  { key: "digital", label: "Web Development" },
  { key: "coaching", label: "Coaching" },
  { key: "alerts", label: "Alerts" }
];

function displayTermLabel(value) {
  return String(value || "").replace(/\bPhases\b/g, "Terms").replace(/\bPhase\b/g, "Term");
}

function parseScreens(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      return fallback;
    }
  }
  return fallback;
}

function sanitizeTvConfig(enabledRaw, orderRaw) {
  const enabled = parseScreens(enabledRaw, DEFAULT_ENABLED_SCREENS).filter((k) => TV_SCREEN_KEY_SET.has(k));
  const orderBase = parseScreens(orderRaw, TV_SCREEN_KEYS).filter((k) => TV_SCREEN_KEY_SET.has(k));
  const order = [...new Set([...orderBase, ...TV_SCREEN_KEYS])];
  const safeEnabled = [...new Set(enabled.length ? enabled : [...DEFAULT_ENABLED_SCREENS])];
  return { enabled: safeEnabled, order };
}

function Pill({ active, children, onClick }) {
  return (
    <button
      className={active ? "pill pillActive" : "pill"}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function PreviewRouter({ payload }) {
  if (!payload) return <div className="tvEmpty">Loading preview...</div>;
  const screen = payload?.settings?.current_screen;

  if (screen === "welcome_screen") {
    return <WelcomeIntroScreen />;
  }
  if (screen === "topic_team_dials") {
    return (
      <TeamDialsGrid
        teamScores={payload?.teamScores || []}
        heading={payload?.webdevSprintLabel || payload?.webdevSprintHeading || "Current Sprint"}
      />
    );
  }
  if (screen === "meta_team_dials") {
    return (
      <TeamDialsGrid
        teamScores={payload?.metaTeamScores || []}
        heading={payload?.metaSprintHeading || payload?.metaTopicLabel || payload?.currentTermLabel || "Current Sprint"}
        subheading={
          payload?.metaSprintHeading && payload?.metaSprintLabel && payload.metaSprintHeading !== payload.metaSprintLabel
            ? payload.metaSprintLabel
            : ""
        }
      />
    );
  }
  if (screen === "topic_student_bars") {
    return <StudentMarksBars students={payload?.studentMarks || []} height={300} />;
  }
  if (screen === "coaching_team_trends") {
    return <CoachingTrends coaching={payload?.coaching} height={300} />;
  }
  if (screen === "alerts_summary") {
    return <AlertsScreen alertsSummary={payload?.alertsSummary} messages={payload?.messages || []} />;
  }
  if (screen === "comments_screen") {
    return <CommentsScreen comments={payload?.comments || []} />;
  }
  if (screen === "notifications_screen") {
    return <NotificationsScreen notifications={payload?.notifications || payload?.messages || []} />;
  }
  if (screen === "meta_skills_1") {
    return <MetaSkillAreas1Screen data={payload?.metaSkills1} phaseId={payload?.settings?.current_phase_id} />;
  }
  if (screen === "meta_skills_2") {
    return <MetaSkillAreas2Screen data={payload?.metaSkills2} phaseId={payload?.settings?.current_phase_id} />;
  }
  return <div className="tvEmpty">Unknown screen</div>;
}

export default function TvSettingsPage() {
  const [phases, setPhases] = useState([]);
  const [topics, setTopics] = useState([]);
  const [preview, setPreview] = useState(null);

  // editable state
  const [loopSeconds, setLoopSeconds] = useState(12);
  const [termId, setTermId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [stream, setStream] = useState("digital");
  const [topicId, setTopicId] = useState("");

  const [screenMode, setScreenMode] = useState("playlist");
  const [enabledScreens, setEnabledScreens] = useState(DEFAULT_ENABLED_SCREENS);
  const [screenOrder, setScreenOrder] = useState(TV_SCREENS.map(s => s.key));
  const [currentScreen, setCurrentScreen] = useState(DEFAULT_ENABLED_SCREENS[0] || TV_SCREEN_KEYS[0]);
  const [feedback, setFeedback] = useState("");

  async function load() {
    const [s, phs] = await Promise.all([
      api("/api/tv/settings"),
      api("/api/phases")
    ]);
    const previewData = await api("/api/tv/public");
    setPreview(previewData);
    setPhases(phs);

    const pid = s?.current_phase_id || phs[0]?.id || "";
    setPhaseId(pid);
    setTermId(s?.current_term_id || "");

    const st = s?.current_stream || "digital";
    setStream(st);
    setLoopSeconds(Number(s?.loop_seconds || s?.slide_seconds || 12));

    setScreenMode(s?.screen_mode || "playlist");
    const sanitized = sanitizeTvConfig(s?.enabled_screens, s?.screen_order);
    setEnabledScreens(sanitized.enabled);
    setScreenOrder(sanitized.order);
    const nextCurrent = TV_SCREEN_KEY_SET.has(s?.current_screen) && sanitized.enabled.includes(s.current_screen)
      ? s.current_screen
      : (sanitized.enabled[0] || DEFAULT_ENABLED_SCREENS[0] || "topic_team_dials");
    setCurrentScreen(nextCurrent);

    const tps = pid ? await api(`/api/topics?phaseId=${pid}&stream=${st}`) : [];
    setTopics(tps);
    const tid = s?.current_topic_id || tps[0]?.id || "";
    setTopicId(tid);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    (async () => {
      if (!phaseId) {
        setTopics([]);
        return;
      }
      const tps = await api(`/api/topics?phaseId=${phaseId}&stream=${stream}`);
      setTopics(tps);
      if (!tps.find(t => t.id === topicId)) setTopicId(tps[0]?.id || "");
    })();
  }, [phaseId, stream]);

  const selectedStreamLabel = useMemo(() => {
    return STREAMS.find(s => s.key === stream)?.label || "Web Development";
  }, [stream]);

  function toggleScreen(k) {
    setEnabledScreens(prev => {
      if (prev.includes(k)) return prev.filter(x => x !== k);
      return [...prev, k];
    });
  }

  function enableAllScreens() {
    setEnabledScreens([...TV_SCREEN_KEYS]);
  }

  function disableAllScreens() {
    setEnabledScreens([]);
  }

  function moveOrder(k, dir) {
    setScreenOrder(prev => {
      const idx = prev.indexOf(k);
      if (idx === -1) return prev;
      const next = [...prev];
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[swapIdx];
      next[swapIdx] = tmp;
      return next;
    });
  }

  async function save() {
    setFeedback("");
    const sanitized = sanitizeTvConfig(enabledScreens, screenOrder);
    const safeCurrentScreen = TV_SCREEN_KEY_SET.has(currentScreen) && sanitized.enabled.includes(currentScreen)
      ? currentScreen
      : (sanitized.enabled[0] || DEFAULT_ENABLED_SCREENS[0] || "topic_team_dials");

    await api("/api/tv/settings", {
      method: "PUT",
      body: JSON.stringify({
        currentTermId: termId || null,
        currentPhaseId: phaseId || null,
        currentStream: stream,
        currentTopicId: stream === "alerts" ? null : (topicId || null),
        loopSeconds: Number(loopSeconds) || 12,
        screenMode,
        enabledScreens: sanitized.enabled,
        screenOrder: sanitized.order,
        currentScreen: safeCurrentScreen
      })
    });
    await load();
    setFeedback("TV slideshow settings saved.");
  }

  async function forceAdvance() {
    await api("/api/tv/advance", { method: "POST", body: "{}" });
    await load();
  }

  const playlistPreview = screenOrder.map(k => {
    const label = TV_SCREENS.find(x => x.key === k)?.label || k;
    return { key: k, label, disabled: !enabledScreens.includes(k) };
  });

  return (
    <PageShell
      title="TV Settings"
      subtitle="Control rotation, timing, and what the TV displays."
      actions={(
        <>
          <a className="softBtn" href="/tv" target="_blank" rel="noreferrer">Open TV</a>
          <button className="softBtn" onClick={forceAdvance}>Next Screen</button>
          <button className="primaryBtn" onClick={save}>Save</button>
        </>
      )}
    >
      <div className="grid2">
        <div className="panel premiumPanel">
          <div className="panelTitle">Playback & Playlist</div>
          <div className="panelSub">Define the TV rotation sequence.</div>

          <div className="settingsCard">
            <div className="settingsRow">
              <div className="settingsLabel">Loop Interval</div>
              <div className="settingsControl settingsInline">
                <input
                  className="bigInput"
                  value={loopSeconds}
                  onChange={(e) => setLoopSeconds(e.target.value)}
                  placeholder="12"
                />
                <select
                  className="bigSelect"
                  value={String(loopSeconds)}
                  onChange={(e) => setLoopSeconds(Number(e.target.value))}
                >
                  {[10, 12, 15, 20, 30, 45, 60].map((s) => (
                    <option key={s} value={s}>{s}s</option>
                  ))}
                </select>
                <div className="unit">seconds</div>
              </div>
            </div>

            <div className="settingsRow">
              <div className="settingsLabel">Enabled Screens</div>
              <div className="settingsControl">
                <div className="settingsInline" style={{ marginBottom: 8 }}>
                  <button className="softBtn" type="button" onClick={enableAllScreens}>Enable all</button>
                  <button className="softBtn" type="button" onClick={disableAllScreens}>Disable all</button>
                </div>
                <div className="pillRow">
                  {TV_SCREENS.map(s => (
                    <Pill key={s.key} active={enabledScreens.includes(s.key)} onClick={() => toggleScreen(s.key)}>
                      {s.label}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>

            <div className="settingsRow">
              <div className="settingsLabel">Screen Order</div>
              <div className="settingsControl">
                <div className="orderList">
                  {screenOrder.map(k => {
                    const label = TV_SCREENS.find(x => x.key === k)?.label || k;
                    const disabled = !enabledScreens.includes(k);
                    return (
                      <div className={disabled ? "orderItem orderDisabled" : "orderItem"} key={k}>
                        <div className="orderName">{label}</div>
                        <div className="orderBtns">
                          <button className="softBtn" onClick={() => moveOrder(k, "up")}>Up</button>
                          <button className="softBtn" onClick={() => moveOrder(k, "down")}>Down</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="smallMeta">Disabled screens remain in the list but will be skipped.</div>
              </div>
            </div>

            <div className="settingsRow">
              <div className="settingsLabel">Current Screen</div>
              <div className="settingsControl">
                <select className="bigSelect" value={currentScreen} onChange={(e) => setCurrentScreen(e.target.value)}>
                  {TV_SCREENS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="settingsRow">
              <div className="settingsLabel">Playlist Preview</div>
              <div className="settingsControl">
                <div className="playlistPreview">
                  {playlistPreview.map(p => (
                    <div key={p.key} className={p.disabled ? "playlistItem disabled" : "playlistItem"}>
                      {p.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {feedback ? <div className="smallMeta">{feedback}</div> : null}
          </div>
        </div>

        <div className="panel premiumPanel">
          <div className="panelTitle">Content Selection</div>
          <div className="panelSub">Pick the current term/stream. Individual topic names are hidden in admin UI.</div>

          <div className="settingsCard">
            <div className="settingsRow">
              <div className="settingsLabel">Active Term</div>
              <div className="settingsControl">
                <select className="bigSelect" value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
                  {phases.map(p => <option key={p.id} value={p.id}>{displayTermLabel(p.name)}</option>)}
                </select>
              </div>
            </div>

            <div className="settingsRow">
              <div className="settingsLabel">Current Stream</div>
              <div className="settingsControl">
                <select className="bigSelect" value={stream} onChange={(e) => setStream(e.target.value)}>
                  {STREAMS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="previewCard">
              <div className="previewTitle">Live Preview</div>
              <div className="previewMeta">
                Term: <b>{displayTermLabel(phases.find(p => p.id === phaseId)?.name || "-")}</b> - Screen:{" "}
                <b>{TV_SCREENS.find(s => s.key === currentScreen)?.label || "Welcome Screen"}</b>
              </div>
              <div className="previewTopic">
                {currentScreen.startsWith("topic_")
                  ? selectedStreamLabel
                  : (TV_SCREENS.find(s => s.key === currentScreen)?.label || "Dashboard")}
              </div>
              <div className="previewHint">This is what the TV will rotate through.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel premiumPanel" style={{ marginTop: 16 }}>
        <div className="panelTitle">Live TV Preview</div>
        <div className="panelSub">Renders the current screen from the TV playlist.</div>
        <div className="tvPreviewFrame">
          <PreviewRouter payload={preview} />
        </div>
      </div>
    </PageShell>
  );
}
