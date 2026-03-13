import React, { useState } from "react";
import { api } from "../../auth/api";
import { setToken } from "../../auth/auth";
import { useNavigate } from "react-router-dom";
import "../../styles/admin.css";
import logo from "../../assets/ihub-logo.png";

function FieldIcon({ kind }) {
  if (kind === "password") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M17 10h-1V8a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2-8 4v2h16v-2c0-2-3.58-4-8-4Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function AdminLogin() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: identifier, password }),
      });
      setToken(data.token);
      nav("/admin/dashboard");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="adminLoginPage">
      <div className="adminLoginWrap">
        <div className="adminLoginGlow" />

        <div className="adminLoginCard">
          <div className="adminLoginSplit">
            <div className="adminLoginFormPanel">
              <div className="adminLoginHeading">
                <div className="adminLoginTitle">Login</div>
                <div className="adminLoginSub">Sign in to access iHub Admin.</div>
              </div>

              <form onSubmit={onSubmit} className="adminForm">
                <label>Username or Email</label>
                <div className="adminInputWrap">
                  <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="info@ihub.africa"
                    autoComplete="username"
                  />
                  <span className="adminInputIcon"><FieldIcon kind="user" /></span>
                </div>

                <label>Password</label>
                <div className="adminInputWrap">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <span className="adminInputIcon"><FieldIcon kind="password" /></span>
                </div>

                {err ? <div className="adminError">{err}</div> : null}

                <button className="adminBtn" disabled={loading}>
                  {loading ? "Signing in..." : "Log in"}
                </button>

                <div className="adminLoginHint">Forgot password? Contact the system administrator.</div>
              </form>
            </div>

            <div className="adminLoginBrandPanel">
              <div className="adminLoginBrandLayer" />
              <div className="adminLoginBrandOverlay" />
              <div className="adminLoginBrandContent">
                <div className="adminLoginLogoBadge">
                  <img className="adminLoginLogo" src={logo} alt="iHub logo" />
                </div>
                <div className="adminLoginBrandTitle">iHub Admin</div>
                <div className="adminLoginBrandText">
                  Academic performance, coaching, and alerts in one place.
                </div>
              </div>
            </div>
          </div>

          <div className="adminLoginBottomLine" />
        </div>
      </div>
    </div>
  );
}

export { AdminLogin };
export default AdminLogin;
