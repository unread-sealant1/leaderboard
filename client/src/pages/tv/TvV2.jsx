import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getToken } from "../../auth/auth";
import TeamDialsGrid from "../../components/tv/TeamDialsGrid";
import { StudentMarksBars } from "../../components/tv/StudentMarksBars";
import CoachingTrends from "../../components/tv/CoachingTrends";
import AlertsSummaryTV from "../../components/tv/AlertsSummaryTV";
import MetaSkillAreas1Screen from "../../components/tv/MetaSkillAreas1Screen";
import MetaSkillAreas2Screen from "../../components/tv/MetaSkillAreas2Screen";
import WelcomeIntroScreen from "../../components/tv/WelcomeIntroScreen";
import logo from "../../assets/ihub-logo.png";
import "../../styles/tv.css";

const BASE = import.meta.env.VITE_API_URL || "";
const DEFAULT_TV_SCREENS = [
  "welcome_screen",
  "topic_team_dials",
  "meta_team_dials",
  "topic_student_bars",
  "coaching_team_trends",
  "alerts_summary",
  "meta_skills_1",
  "meta_skills_2"
];
const DEFAULT_ENABLED_TV_SCREENS = DEFAULT_TV_SCREENS.filter((screen) => screen !== "welcome_screen");
const VALID_TV_SCREENS = new Set(DEFAULT_TV_SCREENS);

function parseArray(value, fallback = []) {
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

function getPlaylist(settings) {
  const enabled = parseArray(settings?.enabled_screens, DEFAULT_ENABLED_TV_SCREENS).filter((s) => VALID_TV_SCREENS.has(s));
  const order = parseArray(settings?.screen_order, DEFAULT_TV_SCREENS).filter((s) => VALID_TV_SCREENS.has(s));
  const filtered = order.filter((screen) => enabled.includes(screen));
  return filtered.length ? filtered : DEFAULT_ENABLED_TV_SCREENS;
}

function TvScreenRouter({ payload, forceScreen, activeScreen }) {
  if (!payload) return <div className="tvEmpty">Loading...</div>;
  const screen = forceScreen || activeScreen || payload?.settings?.current_screen || DEFAULT_TV_SCREENS[0];

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
    return <StudentMarksBars students={payload?.studentMarks || []} />;
  }
  if (screen === "coaching_team_trends") {
    return <CoachingTrends coaching={payload?.coaching} />;
  }
  if (screen === "alerts_summary") {
    return <AlertsSummaryTV phaseId={payload?.settings?.current_phase_id} />;
  }
  if (screen === "meta_skills_1") {
    return <MetaSkillAreas1Screen data={payload?.metaSkills1} phaseId={payload?.settings?.current_phase_id} />;
  }
  if (screen === "meta_skills_2") {
    return <MetaSkillAreas2Screen data={payload?.metaSkills2} phaseId={payload?.settings?.current_phase_id} />;
  }
  return <div className="tvEmpty">Unknown screen</div>;
}

function TvV2() {
  const [params] = useSearchParams();
  const forcedScreen = params.get("screen");

  const [term, setTerm] = useState("Term 1");
  const [payload, setPayload] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(DEFAULT_ENABLED_TV_SCREENS[0] || DEFAULT_TV_SCREENS[0]);
  const [loopSeconds, setLoopSeconds] = useState(12);
  const [animKey, setAnimKey] = useState(0);
  const [localScreenIndex, setLocalScreenIndex] = useState(0);
  const [serverAdvanceFailed, setServerAdvanceFailed] = useState(false);
  const loopRef = useRef(null);
  const prevScreenRef = useRef(null);
  const lastSettingsKeyRef = useRef("");
  const playlistRef = useRef(DEFAULT_TV_SCREENS);

  async function load() {
    const res = await fetch(`${BASE}/api/tv/public`);
    const data = await res.json();
    setPayload(data);

    const nextPlaylist = getPlaylist(data?.settings);
    const nextSettingsKey = JSON.stringify({
      updatedAt: data?.settings?.updated_at || "",
      currentScreen: data?.settings?.current_screen || "",
      enabledScreens: parseArray(data?.settings?.enabled_screens, DEFAULT_ENABLED_TV_SCREENS),
      screenOrder: parseArray(data?.settings?.screen_order, DEFAULT_TV_SCREENS)
    });

    if (lastSettingsKeyRef.current !== nextSettingsKey) {
      const nextIndex = nextPlaylist.indexOf(data?.settings?.current_screen);
      setLocalScreenIndex(nextIndex >= 0 ? nextIndex : 0);
      lastSettingsKeyRef.current = nextSettingsKey;
    }

    setTerm(data.currentTermLabel || "Term 1");
    setCurrentScreen(data.settings?.current_screen || DEFAULT_ENABLED_TV_SCREENS[0] || DEFAULT_TV_SCREENS[0]);
    setLoopSeconds(data.settings?.loop_seconds || data.settings?.slide_seconds || 12);
  }

  async function advance() {
    const token = getToken();
    if (!token) throw new Error("TV not authenticated for server-driven advance");
    const res = await fetch(`${BASE}/api/tv/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}"
    });
    if (!res.ok) {
      throw new Error(`TV advance failed (${res.status})`);
    }
    await load();
  }

  useEffect(() => {
    load();
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
  }, []);

  const playlist = useMemo(
    () => getPlaylist(payload?.settings),
    [payload?.settings?.enabled_screens, payload?.settings?.screen_order]
  );
  const playlistKey = playlist.join("|");
  const hasToken = Boolean(getToken());
  const canUseServerRotation = Boolean(payload?.settings) && hasToken && !serverAdvanceFailed && !forcedScreen;
  const localScreen = playlist[localScreenIndex] || DEFAULT_ENABLED_TV_SCREENS[0] || DEFAULT_TV_SCREENS[0];
  const activeScreen = forcedScreen || (canUseServerRotation
    ? (playlist.includes(currentScreen) ? currentScreen : localScreen)
    : localScreen);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlistKey]);

  useEffect(() => {
    setLocalScreenIndex((prev) => (prev < playlist.length ? prev : 0));
  }, [playlistKey, playlist.length]);

  useEffect(() => {
    const secs = Number(loopSeconds) || 12;
    if (loopRef.current) clearInterval(loopRef.current);
    if (forcedScreen) return () => {};

    loopRef.current = setInterval(() => {
      if (canUseServerRotation) {
        advance().catch(() => {
          setServerAdvanceFailed(true);
          setLocalScreenIndex((prev) => {
            const activePlaylist = playlistRef.current;
            const currentIdx = activePlaylist.indexOf(currentScreen);
            if (currentIdx >= 0) return (currentIdx + 1) % activePlaylist.length;
            return (prev + 1) % Math.max(activePlaylist.length, 1);
          });
        });
        return;
      }
      setLocalScreenIndex((prev) => {
        const activePlaylist = playlistRef.current;
        return (prev + 1) % Math.max(activePlaylist.length, 1);
      });
    }, secs * 1000);
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, [loopSeconds, currentScreen, forcedScreen, canUseServerRotation, playlistKey]);

  useEffect(() => {
    if (payload?.settings && hasToken) {
      setServerAdvanceFailed(false);
    }
  }, [payload?.settings, hasToken]);

  useEffect(() => {
    if (activeScreen && activeScreen !== prevScreenRef.current) {
      setAnimKey(k => k + 1);
      prevScreenRef.current = activeScreen;
    }
  }, [activeScreen]);

  const screenLabel = {
    welcome_screen: "Welcome Screen",
    topic_team_dials: "Web Development Team Dials",
    meta_team_dials: "Meta Skills Team Dials",
    topic_student_bars: "Individual Marks",
    coaching_team_trends: "Coaching Trends",
    alerts_summary: "Alerts Summary",
    meta_skills_1: "Meta Skill Areas",
    meta_skills_2: "Meta Skill Areas"
  }[activeScreen] || "Dashboard";

  const isMetaScreen = String(activeScreen || "").startsWith("meta_");
  const isWelcomeScreen = activeScreen === "welcome_screen";
  const titleLabel = activeScreen === "topic_team_dials"
    ? "Web Development"
    : (isMetaScreen ? "Meta Skills" : (isWelcomeScreen ? "Welcome" : screenLabel));
  const chipLabel = isWelcomeScreen ? "Welcome Screen" : screenLabel;

  if (isWelcomeScreen) {
    return (
      <div className="tvRoot tvRootWelcomeMode">
        <div className="tvScreen tvScreenWelcome" key={animKey}>
          <TvScreenRouter payload={payload} forceScreen={forcedScreen} activeScreen={activeScreen} />
        </div>
      </div>
    );
  }

  return (
    <div className="tvRoot">
      <header className="tvHeader">
        <div className="tvBrand">
          <img className="tvLogo" src={logo} alt="iHub logo" />
          <div>
            <div className="tvBrandTitle">iHub Student Performance Dashboard</div>
            <div className="tvBrandSub">Live cohort overview</div>
          </div>
        </div>

        <div className="tvHeaderRight">
          <div className="tvChip">{term}</div>
          <div className="tvChip">{chipLabel}</div>
          <div className="tvTime">{new Date().toLocaleString()}</div>
        </div>
      </header>

      <main className="tvMain">
        <div className="tvTitle">{titleLabel}</div>

        <div className="tvScreen" key={animKey}>
          <TvScreenRouter payload={payload} forceScreen={forcedScreen} activeScreen={activeScreen} />
        </div>
      </main>
    </div>
  );
}

export default TvV2;




