import React from "react";
import logo from "../../assets/ihub-logo-02.png";

const PARTICLES = [
  { x: "9%", y: "18%", delay: "0s", duration: "14s" },
  { x: "18%", y: "68%", delay: "1.1s", duration: "17s" },
  { x: "24%", y: "38%", delay: "2.4s", duration: "13s" },
  { x: "33%", y: "78%", delay: "0.8s", duration: "16s" },
  { x: "42%", y: "21%", delay: "1.8s", duration: "15s" },
  { x: "49%", y: "58%", delay: "2.1s", duration: "18s" },
  { x: "58%", y: "31%", delay: "0.5s", duration: "19s" },
  { x: "66%", y: "71%", delay: "1.6s", duration: "16s" },
  { x: "76%", y: "22%", delay: "2.7s", duration: "15s" },
  { x: "86%", y: "61%", delay: "1.2s", duration: "18s" }
];

const LINES = [
  { left: "11%", top: "28%", width: "23%", rotate: "16deg", delay: "0s" },
  { left: "22%", top: "62%", width: "18%", rotate: "-14deg", delay: "1.2s" },
  { left: "38%", top: "26%", width: "26%", rotate: "10deg", delay: "0.6s" },
  { left: "57%", top: "52%", width: "20%", rotate: "-18deg", delay: "1.8s" },
  { left: "69%", top: "30%", width: "15%", rotate: "20deg", delay: "0.9s" }
];

const CODE_LINES = [
  'const mission = "Enriching minds, changing lives";',
  'const cohort = "Web Development 2026";',
  'const builders = students.map(grow);',
  'deploy(innovation, impact);'
];

const INDICATOR_COLORS = [
  { name: "Black", value: "#101828" },
  { name: "Red", value: "#F04D4D" },
  { name: "Sun Yellow", value: "#FCC829" },
  { name: "Turquoise", value: "#28B7CA" },
  { name: "Light Grey", value: "#D0D5DD" }
];

export default function WelcomeIntroScreen() {
  return (
    <section className="tvWelcomeHero">
      <div className="tvWelcomeBackdrop" aria-hidden="true">
        <div className="tvWelcomeGradient" />
        <div className="tvWelcomeWash" />
        <div className="tvWelcomeNetwork" />
        {LINES.map((line, index) => (
          <span
            key={`line-${index}`}
            className="tvWelcomeLine"
            style={{
              "--left": line.left,
              "--top": line.top,
              "--width": line.width,
              "--rotate": line.rotate,
              "--delay": line.delay
            }}
          />
        ))}
        {PARTICLES.map((particle, index) => (
          <span
            key={`particle-${index}`}
            className="tvWelcomeParticle"
            style={{
              "--x": particle.x,
              "--y": particle.y,
              "--delay": particle.delay,
              "--duration": particle.duration
            }}
          />
        ))}
      </div>

      <div className="tvWelcomeSafe">
        <div className="tvWelcomeBrandRow">
          <img className="tvWelcomeBrandLogo" src={logo} alt="iHub Africa" />
        </div>

        <div className="tvWelcomeCenter">
          <div className="tvWelcomeLayout">
            <div className="tvWelcomeCopy">
              <h1 className="tvWelcomeHeadline">
                <span>Welcome to iHub</span>
                <span>Web Development</span>
                <span>Cohort 2026</span>
              </h1>
              <p className="tvWelcomeSlogan">Enriching minds, changing lives.</p>

              <div className="tvWelcomePalette" aria-hidden="true">
                {INDICATOR_COLORS.map((color) => (
                  <span key={color.name} className="tvWelcomePaletteSwatch" style={{ "--swatch": color.value }} />
                ))}
              </div>
            </div>

            <div className="tvWelcomeVisual" aria-hidden="true">
              <div className="tvWelcomeCodeCard">
                <div className="tvWelcomeCodeDots">
                  <span className="dot dotGold" />
                  <span className="dot dotCyan" />
                  <span className="dot dotIndigo" />
                </div>
                <div className="tvWelcomeCodeWindow">
                  {CODE_LINES.map((line) => (
                    <div key={line} className="tvWelcomeCodeLine">{line}</div>
                  ))}
                </div>
              </div>

              <div className="tvWelcomeLaptop">
                <div className="tvWelcomeLaptopScreen">
                  <div className="tvWelcomeLaptopGlow" />
                  <div className="tvWelcomeLaptopHeader">
                    <span className="miniDot dotGold" />
                    <span className="miniDot dotCyan" />
                    <span className="miniDot dotGreen" />
                  </div>
                  <div className="tvWelcomeLaptopLines">
                    <span className="lineShort indigo" />
                    <span className="lineLong cyan" />
                    <span className="lineMedium gold" />
                    <span className="lineLong green" />
                    <span className="lineShort indigo" />
                  </div>
                </div>
                <div className="tvWelcomeLaptopBase" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


