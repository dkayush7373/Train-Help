"use client";

import React, { useState, useEffect } from "react";
import {
  Check,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { BrandLogo } from "@/components/BrandLogo";
import styles from "./auth-screen.module.css";



export type AuthTab = "sign-in" | "sign-up";

interface AuthScreenProps {
  initialTab?: AuthTab;
}

// Station flip states for mechanical flap board
const FLAP_STATUSES = [
  "NDLS → SBC · Delayed 3h 15m",
  "NDLS → SBC · Alternate Found (12650)",
  "NDLS → SBC · Confirmed Berth B4-23",
];

export function AuthScreen({ initialTab = "sign-in" }: AuthScreenProps) {
  const {
    signIn,
    signUp,
    signInDemo,
    signInGoogle,
    savedCredentials,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab);

  // Sign In Form States
  const [signInEmail, setSignInEmail] = useState(savedCredentials?.email || "");
  const [signInPassword, setSignInPassword] = useState(savedCredentials?.password || "");
  const [signInRemember, setSignInRemember] = useState(true);
  const [showSignInPass, setShowSignInPass] = useState(false);

  // Sign Up Form States
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [signUpAgree, setSignUpAgree] = useState(true);
  const [signUpRemember, setSignUpRemember] = useState(true);
  const [showSignUpPass, setShowSignUpPass] = useState(false);

  // Shared Interaction States
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stationFlapIndex, setStationFlapIndex] = useState(0);
  const [signalGreen, setSignalGreen] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);

  // Check for optional video background
  useEffect(() => {
    fetch("/media/train-loop.mp4", { method: "HEAD" })
      .then((res) => {
        if (res.ok) setHasVideo(true);
      })
      .catch(() => setHasVideo(false));
  }, []);

  // Station flap rotation and signal light cycle
  useEffect(() => {
    const flapInterval = setInterval(() => {
      setStationFlapIndex((prev) => (prev + 1) % FLAP_STATUSES.length);
    }, 6000);

    const signalInterval = setInterval(() => {
      setSignalGreen((prev) => !prev);
    }, 10000);

    const handleVisibility = () => {
      setIsPageVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(flapInterval);
      clearInterval(signalInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Handle Sign In submission
  const handleSignInSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!signInEmail.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!signInPassword.trim()) {
      setError("Please enter your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await signIn(signInEmail, signInPassword, signInRemember);
      if (success) {
        setSuccessMsg("Welcome aboard! Loading your journey dashboard...");
      } else {
        setError("Invalid email or password. Please verify your credentials.");
      }
    } catch {
      setError("Network interruption: could not connect to railway auth server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Sign Up submission
  const handleSignUpSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!signUpName.trim()) {
      setError("Please enter your full name as on your ticket.");
      return;
    }
    if (!signUpEmail.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signUpEmail.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!signUpPassword) {
      setError("Please create a password.");
      return;
    }
    if (signUpPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (signUpPassword !== signUpConfirmPassword) {
      setError("Passwords do not match. Please re-enter carefully.");
      return;
    }
    if (!signUpAgree) {
      setError("Please accept the Passenger Charter and refund protocol.");
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await signUp(signUpName, signUpEmail, signUpPassword, signUpRemember);
      if (success) {
        setSuccessMsg("Account created! Directing to passenger recovery...");
      } else {
        setError("Account creation could not be completed. Please try again.");
      }
    } catch {
      setError("Network interruption: could not connect to railway auth server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1-Click Demo Shortcut
  const handleDemoLogin = async () => {
    setError(null);
    setSuccessMsg("Launching Instant Portfolio Demo (Vikram Patel)...");
    setIsSubmitting(true);
    try {
      await signInDemo();
    } catch {
      setError("Unable to launch demo session. Please try again.");
      setIsSubmitting(false);
    }
  };

  // Google Sign In Shortcut
  const handleGoogleLogin = async () => {
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);
    try {
      await signInGoogle();
    } catch {
      setError("Google authentication could not be completed.");
      setIsSubmitting(false);
    }
  };

  return (
    <main
      className={styles.root}
      style={{
        ["--font-heading" as string]: "var(--font-display, 'Newsreader', 'Fraunces', Georgia, serif)",
        ["--font-body" as string]: "var(--font-sans, 'Inter', system-ui, sans-serif)",
        ["--font-mono" as string]: "var(--font-mono, 'JetBrains Mono', monospace)",
      }}
    >
      <div className={styles.container}>
        
        {/* Mobile Top Animated Train Strip (<=1023px) */}
        <div className={styles.mobileStrip} aria-hidden="true">
          <svg className={styles.skyElements} viewBox="0 0 600 130" preserveAspectRatio="none">
            <defs>
              <linearGradient id="mobileSky" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#2A1A33" />
                <stop offset="60%" stopColor="#E8783A" />
                <stop offset="100%" stopColor="#F2A33A" />
              </linearGradient>
            </defs>
            <rect width="600" height="130" fill="url(#mobileSky)" />
            {/* Setting sun */}
            <circle cx="80" cy="95" r="32" fill="#FFE3A0" opacity="0.8" />
            {/* Hills */}
            <path d="M0 130 L0 100 Q 150 75 300 105 T 600 95 L 600 130 Z" fill="#251624" />
          </svg>
          <div className={styles.trackGround}>
            <div className={styles.sleepersTrack} />
          </div>
          {isPageVisible && (
            <div className={styles.trainTrackLane}>
              <div className={styles.trainWrapper}>
                <TrainSvg />
              </div>
            </div>
          )}
        </div>

        {/* ─── LEFT SCENE: 55% DESKTOP ─── */}
        <section className={styles.leftScene} aria-hidden="true">
          {/* Optional Video Fallback if train-loop.mp4 exists */}
          {hasVideo ? (
            <>
              <video
                src="/media/train-loop.mp4"
                muted
                autoPlay
                loop
                playsInline
                preload="metadata"
                className={styles.videoBackground}
              />
              <div className={styles.videoOverlay} />
            </>
          ) : (
            /* Procedural Night Train Scene (Pure SVG & CSS) */
            <div className={styles.sceneLayers}>
              {/* Sky Backdrop */}
              <div className={styles.skyElements}>
                <div className={styles.sun} />
                
                {/* Stars twinkling in plum dusk */}
                <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="22%" cy="14%" r="1.5" fill="#FFEAC2" opacity="0.75" />
                  <circle cx="45%" cy="18%" r="1.2" fill="#FFFFFF" opacity="0.85" />
                  <circle cx="78%" cy="12%" r="1.6" fill="#FFEAC2" opacity="0.65" />
                  <circle cx="62%" cy="26%" r="1.2" fill="#FFFFFF" opacity="0.9" />
                  <circle cx="88%" cy="22%" r="1.4" fill="#FFEAC2" opacity="0.7" />
                  <circle cx="15%" cy="32%" r="1.1" fill="#FFFFFF" opacity="0.6" />
                </svg>

                {/* Drifting Birds */}
                <svg className={styles.birds} viewBox="0 0 100 30" fill="none">
                  <path d="M5 15 Q 12 8 20 15 Q 28 8 35 15" stroke="#1c1119" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M45 10 Q 51 4 58 10 Q 64 4 70 10" stroke="#1c1119" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M72 18 Q 78 13 84 18 Q 90 13 96 18" stroke="#1c1119" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>

              {/* Far Mountain Ridge (Slow Parallax) */}
              <div className={styles.farHills}>
                <svg viewBox="0 0 1000 140" className="w-1/2 h-full shrink-0" preserveAspectRatio="none">
                  <path d="M0 140 L0 80 Q 200 35 450 75 T 800 50 Q 900 65 1000 80 L 1000 140 Z" fill="#2c1a2c" opacity="0.75" />
                </svg>
                <svg viewBox="0 0 1000 140" className="w-1/2 h-full shrink-0" preserveAspectRatio="none">
                  <path d="M0 140 L0 80 Q 200 35 450 75 T 800 50 Q 900 65 1000 80 L 1000 140 Z" fill="#2c1a2c" opacity="0.75" />
                </svg>
              </div>

              {/* Mid Rolling Hills (Medium Parallax) */}
              <div className={styles.midHills}>
                <svg viewBox="0 0 1000 120" className="w-1/2 h-full shrink-0" preserveAspectRatio="none">
                  <path d="M0 120 L0 60 Q 180 25 360 55 T 720 40 Q 880 30 1000 60 L 1000 120 Z" fill="#201321" />
                </svg>
                <svg viewBox="0 0 1000 120" className="w-1/2 h-full shrink-0" preserveAspectRatio="none">
                  <path d="M0 120 L0 60 Q 180 25 360 55 T 720 40 Q 880 30 1000 60 L 1000 120 Z" fill="#201321" />
                </svg>
              </div>

              {/* Silhouette Trees and Electric Catenary Masts */}
              <div className={styles.treesPoles}>
                <svg viewBox="0 0 1000 90" className="w-1/2 h-full shrink-0" preserveAspectRatio="none">
                  {/* Trees */}
                  <circle cx="120" cy="60" r="18" fill="#140b15" />
                  <circle cx="134" cy="55" r="14" fill="#140b15" />
                  <rect x="125" y="65" width="4" height="25" fill="#140b15" />
                  <circle cx="480" cy="55" r="22" fill="#140b15" />
                  <rect x="478" y="70" width="5" height="20" fill="#140b15" />
                  <circle cx="820" cy="58" r="19" fill="#140b15" />
                  <rect x="818" y="70" width="4" height="20" fill="#140b15" />
                  {/* Overhead Electric Poles */}
                  <line x1="260" y1="15" x2="260" y2="90" stroke="#1c1119" strokeWidth="3" />
                  <line x1="245" y1="25" x2="275" y2="25" stroke="#1c1119" strokeWidth="2.5" />
                  <line x1="680" y1="15" x2="680" y2="90" stroke="#1c1119" strokeWidth="3" />
                  <line x1="665" y1="25" x2="695" y2="25" stroke="#1c1119" strokeWidth="2.5" />
                </svg>
                <svg viewBox="0 0 1000 90" className="w-1/2 h-full shrink-0" preserveAspectRatio="none">
                  <circle cx="120" cy="60" r="18" fill="#140b15" />
                  <circle cx="134" cy="55" r="14" fill="#140b15" />
                  <rect x="125" y="65" width="4" height="25" fill="#140b15" />
                  <circle cx="480" cy="55" r="22" fill="#140b15" />
                  <rect x="478" y="70" width="5" height="20" fill="#140b15" />
                  <circle cx="820" cy="58" r="19" fill="#140b15" />
                  <rect x="818" y="70" width="4" height="20" fill="#140b15" />
                  <line x1="260" y1="15" x2="260" y2="90" stroke="#1c1119" strokeWidth="3" />
                  <line x1="245" y1="25" x2="275" y2="25" stroke="#1c1119" strokeWidth="2.5" />
                  <line x1="680" y1="15" x2="680" y2="90" stroke="#1c1119" strokeWidth="3" />
                  <line x1="665" y1="25" x2="695" y2="25" stroke="#1c1119" strokeWidth="2.5" />
                </svg>
              </div>

              {/* Dual Rails & Wooden Sleepers */}
              <div className={styles.trackGround}>
                <div className={styles.sleepersTrack} />
              </div>

              {/* Railway Signal Mast */}
              <div className={styles.signalPost}>
                <svg viewBox="0 0 24 110" className="w-full h-full">
                  <line x1="12" y1="20" x2="12" y2="110" stroke="#251a22" strokeWidth="3.5" />
                  <rect x="4" y="10" width="16" height="32" rx="4" fill="#0f090d" stroke="#2c2128" strokeWidth="1.5" />
                  {/* Signal Light (Red vs Green) */}
                  <circle cx="12" cy="19" r="4.5" fill={signalGreen ? "#3b1a1c" : "#D9453B"} />
                  <circle cx="12" cy="33" r="4.5" fill={signalGreen ? "#22c55e" : "#143320"} />
                  {!signalGreen && <circle cx="12" cy="19" r="7" fill="none" stroke="#D9453B" strokeWidth="1" opacity="0.6" />}
                  {signalGreen && <circle cx="12" cy="33" r="7" fill="none" stroke="#22c55e" strokeWidth="1" opacity="0.6" />}
                </svg>
              </div>

              {/* Indian Railway Train: Electric Loco + 5 Coaches */}
              {isPageVisible && (
                <div className={styles.trainTrackLane}>
                  <div className={styles.trainWrapper}>
                    <TrainSvg />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Calm Sky Content Overlay */}
          <div className={styles.sceneOverlay}>
            <div className={styles.sceneHeader}>
              <div className={styles.brandBadge}>
                <BrandLogo
                  textClassName={styles.brandTitle}
                  subtitle={
                    <div className={styles.brandSub}>Railway Recovery Operations</div>
                  }
                />
              </div>
              <div className={styles.corridorPill}>
                <span>NDLS</span>
                <span className="text-[#F2A33A]">→</span>
                <span>SBC</span>
              </div>
            </div>

            <div className={styles.headlineBlock}>
              <h2 className={styles.sceneHeadline}>
                Train cancelled? We&apos;ve <span className={styles.italicWord}>got</span> you.
              </h2>
              <div className={styles.trustList}>
                <div className={styles.trustItem}>
                  <div className={styles.trustCheck}>
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                  <span>Deterministic berth scoring: Confirmed &gt; RAC &gt; Waitlist</span>
                </div>
                <div className={styles.trustItem}>
                  <div className={styles.trustCheck}>
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                  <span>Automatic 100% refund tracker with zero clerkage deduction</span>
                </div>
                <div className={styles.trustItem}>
                  <div className={styles.trustCheck}>
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                  <span>Indian Railways Passenger Charter &amp; IRCTC compliant</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mechanical Flap Station Board */}
          <div className={styles.stationBoard}>
            <span className={styles.stationLed} />
            <span>{FLAP_STATUSES[stationFlapIndex]}</span>
          </div>
        </section>

        {/* ─── RIGHT FORM PANEL: 45% CREAM RAILWAY TICKET ─── */}
        <section className={styles.rightPanel}>
          <div className={styles.paperGrain} />

          <div className={styles.ticketCard}>
            {/* Perforation line & Ticket Notches */}
            <div className={styles.ticketPerforation} />

            {/* BOLD DESIGN RISK: Tactile Indian Railways Punch Hole & Date Emboss */}
            <div className={styles.ticketPunchHole}>
              <span>SEC 12627</span>
              <div className={styles.punchCircle} title="Inspected & Punched" />
            </div>

            {/* Rubber Stamp: EXISTING PASSENGER */}
            <div className={styles.rubberStamp}>
              {activeTab === "sign-in" ? "PASSENGER CHECK-IN" : "NEW RESERVATION"}
            </div>

            {/* Ticket Header */}
            <div className={styles.ticketTop}>
              <h1 className={styles.ticketTitle}>
                {activeTab === "sign-in"
                  ? "Welcome back, traveller."
                  : "Your next journey starts here."}
              </h1>
              <p className={styles.ticketSubtitle}>
                {activeTab === "sign-in"
                  ? "Let's get you on the next train with verified berth allotments."
                  : "Create your passenger profile for real-time disruption recovery."}
              </p>
            </div>

            {/* Sliding Saffron Tab Pill */}
            <div className={styles.tabContainer}>
              <div
                className={`${styles.tabPill} ${activeTab === "sign-up" ? styles.tabPillRight : ""}`}
              />
              <button
                type="button"
                id="tab-sign-in"
                onClick={() => {
                  setError(null);
                  setActiveTab("sign-in");
                }}
                className={styles.tabBtn}
              >
                <span>Sign In</span>
                {activeTab === "sign-in" && <span className={styles.activeUnderline} />}
              </button>
              <button
                type="button"
                id="tab-sign-up"
                onClick={() => {
                  setError(null);
                  setActiveTab("sign-up");
                }}
                className={styles.tabBtn}
              >
                <span>Create Account</span>
                {activeTab === "sign-up" && <span className={styles.activeUnderline} />}
              </button>
            </div>

            {/* Inline Error State */}
            {error && (
              <div className={styles.errorAlert} role="alert" aria-live="polite">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#D9453B]" />
                <span>{error}</span>
              </div>
            )}

            {/* Inline Success State */}
            {successMsg && (
              <div className={styles.successAlert} role="status" aria-live="polite">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2F6F6A]" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* 1-Click Demo Recovery Card (Sign-In view) */}
            {activeTab === "sign-in" && (
              <div className={styles.demoCard}>
                <div className={styles.demoText}>
                  <span className={styles.demoLabel}>Try the recovery demo</span>
                  <span className={styles.demoSub}>
                    Vikram Patel · Train 12627 Karnataka Exp
                  </span>
                </div>
                <button
                  type="button"
                  id="btn-demo-login"
                  disabled={isSubmitting}
                  onClick={handleDemoLogin}
                  className={styles.demoBtn}
                >
                  <span>1-Click Demo</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {activeTab === "sign-in" && (
              <div className={styles.orDivider}>
                <span className={styles.orText}>or sign in with credentials</span>
              </div>
            )}

            {/* Sign In Form */}
            {activeTab === "sign-in" ? (
              <form onSubmit={handleSignInSubmit}>
                <div className={styles.formGroup}>
                  <label htmlFor="signin-email" className={styles.formLabel}>
                    Email Address
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      required
                      disabled={isSubmitting}
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="vikram.patel@railmail.in"
                      className={styles.inputField}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <div className={styles.fieldHeader}>
                    <label htmlFor="signin-password" className={styles.formLabel}>
                      Password
                    </label>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setSignInEmail("vikram.patel@railmail.in");
                        setSignInPassword("demo1234");
                      }}
                      className={styles.demoCredsLink}
                    >
                      Fill demo credentials
                    </button>
                  </div>
                  <div className={styles.inputWrap}>
                    <input
                      id="signin-password"
                      type={showSignInPass ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      disabled={isSubmitting}
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="••••••••"
                      className={styles.inputField}
                    />
                    <button
                      type="button"
                      aria-label={showSignInPass ? "Hide password" : "Show password"}
                      onClick={() => setShowSignInPass(!showSignInPass)}
                      className={styles.showPassBtn}
                    >
                      {showSignInPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={signInRemember}
                    onChange={(e) => setSignInRemember(e.target.checked)}
                    className={styles.checkboxInput}
                  />
                  <span>Remember me on this station browser</span>
                </label>

                <button
                  type="submit"
                  id="btn-submit-signin"
                  disabled={isSubmitting}
                  className={styles.primaryBtn}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Verifying PNR Ticket...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Recovery Board</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Create Account Form */
              <form onSubmit={handleSignUpSubmit}>
                <div className={styles.formGroup}>
                  <label htmlFor="signup-name" className={styles.formLabel}>
                    Full Name (as per ID/Ticket)
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id="signup-name"
                      type="text"
                      autoComplete="name"
                      required
                      disabled={isSubmitting}
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                      placeholder="e.g. Vikram Patel"
                      className={styles.inputField}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="signup-email" className={styles.formLabel}>
                    Email Address
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      disabled={isSubmitting}
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      placeholder="vikram.patel@railmail.in"
                      className={styles.inputField}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="signup-password" className={styles.formLabel}>
                    Create Password
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id="signup-password"
                      type={showSignUpPass ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      disabled={isSubmitting}
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className={styles.inputField}
                    />
                    <button
                      type="button"
                      aria-label={showSignUpPass ? "Hide password" : "Show password"}
                      onClick={() => setShowSignUpPass(!showSignUpPass)}
                      className={styles.showPassBtn}
                    >
                      {showSignUpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="signup-confirm-password" className={styles.formLabel}>
                    Confirm Password
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id="signup-confirm-password"
                      type={showSignUpPass ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      disabled={isSubmitting}
                      value={signUpConfirmPassword}
                      onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className={styles.inputField}
                    />
                  </div>
                </div>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={signUpRemember}
                    onChange={(e) => setSignUpRemember(e.target.checked)}
                    className={styles.checkboxInput}
                  />
                  <span>Remember me on this station browser</span>
                </label>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={signUpAgree}
                    onChange={(e) => setSignUpAgree(e.target.checked)}
                    className={styles.checkboxInput}
                  />
                  <span className="text-[11px] leading-tight">
                    I agree to the Indian Railway Passenger Charter and automated refund claims protocol.
                  </span>
                </label>

                <button
                  type="submit"
                  id="btn-submit-signup"
                  disabled={isSubmitting}
                  className={styles.primaryBtn}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Register Passenger Profile</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Google Authentication */}
            <div className={styles.orDivider}>
              <span className={styles.orText}>or continue with</span>
            </div>

            <button
              type="button"
              id="btn-google-login"
              disabled={isSubmitting}
              onClick={handleGoogleLogin}
              className={styles.googleBtn}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Bottom Switcher Note */}
            <div className={styles.bottomSwitcher}>
              {activeTab === "sign-in" ? (
                <p>
                  New passenger?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setActiveTab("sign-up");
                    }}
                    className={styles.switchLink}
                  >
                    Create an account here
                  </button>
                </p>
              ) : (
                <p>
                  Already hold a reservation?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setActiveTab("sign-in");
                    }}
                    className={styles.switchLink}
                  >
                    Sign in here
                  </button>
                </p>
              )}
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}

// ─── Indian Railway Train SVG (Loco + 5 Coaches) ───────────────────
function TrainSvg() {
  return (
    <svg width="1080" height="75" viewBox="0 0 1080 75" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Coach Symbol reused 5 times */}
        <g id="railCoach">
          {/* Main Body */}
          <rect x="0" y="16" width="160" height="38" rx="6" fill="#1b1219" stroke="#382534" strokeWidth="1.5" />
          {/* Saffron & Cream Livery Stripe */}
          <rect x="0" y="32" width="160" height="4.5" fill="#F2A33A" />
          <rect x="0" y="36.5" width="160" height="2" fill="#F4EBDD" />
          {/* Windows: Warm illuminated yellow glow */}
          <rect x="14" y="20" width="18" height="10" rx="2" fill="#FFEAA7" opacity="0.9" />
          <rect x="38" y="20" width="18" height="10" rx="2" fill="#FFEAA7" opacity="0.95" />
          <rect x="62" y="20" width="18" height="10" rx="2" fill="#FFEAA7" opacity="0.85" />
          <rect x="86" y="20" width="18" height="10" rx="2" fill="#FFEAA7" opacity="0.9" />
          <rect x="110" y="20" width="18" height="10" rx="2" fill="#FFEAA7" opacity="0.95" />
          <rect x="134" y="20" width="14" height="10" rx="2" fill="#FFEAA7" opacity="0.8" />
          {/* Doors */}
          <rect x="2" y="18" width="8" height="34" rx="1" fill="#140d13" />
          <rect x="150" y="18" width="8" height="34" rx="1" fill="#140d13" />
          {/* Under-chassis equipment & Bogies */}
          <rect x="24" y="54" width="36" height="6" rx="2" fill="#0d080c" />
          <rect x="100" y="54" width="36" height="6" rx="2" fill="#0d080c" />
          {/* Wheels */}
          <circle cx="28" cy="62" r="7.5" fill="#0d080c" stroke="#4a3b45" strokeWidth="2" />
          <circle cx="52" cy="62" r="7.5" fill="#0d080c" stroke="#4a3b45" strokeWidth="2" />
          <circle cx="104" cy="62" r="7.5" fill="#0d080c" stroke="#4a3b45" strokeWidth="2" />
          <circle cx="128" cy="62" r="7.5" fill="#0d080c" stroke="#4a3b45" strokeWidth="2" />
        </g>
      </defs>

      {/* Coach 5 (Rear) */}
      <g transform="translate(0, 0)" className={styles.coachRattle}>
        <use href="#railCoach" />
      </g>
      {/* Coupler */}
      <rect x="160" y="44" width="14" height="4" fill="#0a0508" />

      {/* Coach 4 */}
      <g transform="translate(174, 0)" className={styles.coachRattle}>
        <use href="#railCoach" />
      </g>
      {/* Coupler */}
      <rect x="334" y="44" width="14" height="4" fill="#0a0508" />

      {/* Coach 3 */}
      <g transform="translate(348, 0)" className={styles.coachRattle}>
        <use href="#railCoach" />
      </g>
      {/* Coupler */}
      <rect x="508" y="44" width="14" height="4" fill="#0a0508" />

      {/* Coach 2 */}
      <g transform="translate(522, 0)" className={styles.coachRattle}>
        <use href="#railCoach" />
      </g>
      {/* Coupler */}
      <rect x="682" y="44" width="14" height="4" fill="#0a0508" />

      {/* Coach 1 */}
      <g transform="translate(696, 0)" className={styles.coachRattle}>
        <use href="#railCoach" />
      </g>
      {/* Coupler */}
      <rect x="856" y="44" width="14" height="4" fill="#0a0508" />

      {/* Electric Locomotive WAP-7 (Front) */}
      <g transform="translate(870, 0)">
        {/* Pantograph */}
        <path d="M 40 14 L 55 2 L 70 14" stroke="#c25e24" strokeWidth="2" fill="none" />
        <line x1="45" y1="2" x2="65" y2="2" stroke="#c25e24" strokeWidth="2.5" />
        <line x1="55" y1="2" x2="55" y2="14" stroke="#c25e24" strokeWidth="1.5" />

        {/* Loco Body */}
        <path d="M 0 14 L 160 14 Q 185 14 195 28 L 200 48 Q 200 54 190 54 L 0 54 Z" fill="#b93b28" stroke="#4a1811" strokeWidth="1.5" />
        {/* White / Saffron Racing Stripe */}
        <path d="M 0 34 L 175 34 L 195 40 L 0 40 Z" fill="#F2A33A" />
        <path d="M 0 40 L 185 40 L 190 44 L 0 44 Z" fill="#F4EBDD" />
        {/* Cab Windshield */}
        <path d="M 160 20 L 180 20 Q 188 22 190 30 L 160 30 Z" fill="#FFEAA7" opacity="0.9" />
        {/* WAP-7 Number Plate */}
        <rect x="80" y="24" width="45" height="10" rx="2" fill="#140a08" />
        <text x="86" y="32" fill="#F2A33A" fontSize="7" fontFamily="monospace" fontWeight="bold">WAP-7</text>
        {/* Loco Bogies & Wheels */}
        <circle cx="35" cy="62" r="8" fill="#0d080c" stroke="#4a3b45" strokeWidth="2" />
        <circle cx="65" cy="62" r="8" fill="#0d080c" stroke="#4a3b45" strokeWidth="2" />
        <circle cx="135" cy="62" r="8" fill="#0d080c" stroke="#4a3b45" strokeWidth="2" />
        <circle cx="165" cy="62" r="8" fill="#0d080c" stroke="#4a3b45" strokeWidth="2" />

        {/* Headlight Beam Cone */}
        <path d="M 198 42 L 320 20 L 320 68 Z" fill="url(#headlightCone)" opacity="0.45" />
        <circle cx="198" cy="42" r="4" fill="#FFFFFF" />
      </g>

      <defs>
        <linearGradient id="headlightCone" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#FFF2A3" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFF2A3" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
