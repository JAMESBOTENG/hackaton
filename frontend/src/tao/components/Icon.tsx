interface Props { name: "play" | "pause" | "skip" | "restart" | "shield" | "question" | "mic" | "chevron" | "close" | "profile" | "bedside" | "laboratory" | "imaging" | "monitoring"; size?: number; }

const paths: Record<Props["name"], React.ReactNode> = {
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: <><path d="M7 5h4v14H7z" /><path d="M15 5h4v14h-4z" /></>,
  skip: <><path d="m5 6 8 6-8 6V6Z" /><path d="M16 6v12" /></>,
  restart: <><path d="M4 8V4m0 0h4M4 4l3 3a8 8 0 1 1-2 9" /></>,
  shield: <path d="M12 3 5 6v5c0 4.5 2.7 8 7 10 4.3-2 7-5.5 7-10V6l-7-3Zm0 5v5m0 3h.01" />,
  question: <><path d="M9.5 9a2.7 2.7 0 1 1 4.2 2.25c-1 .66-1.7 1.1-1.7 2.25" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  profile: <><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" /></>,
  bedside: <><path d="M4 19V8m0 7h16v4M8 11h5a3 3 0 0 1 3 3v1M8 11V8h4v3" /></>,
  laboratory: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8" /></>,
  imaging: <><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="12" cy="12" r="5" /><path d="m9 13 2-2 4 4" /></>,
  monitoring: <><path d="M3 12h4l2-5 4 10 2-5h6" /></>,
};

export default function Icon({ name, size = 18 }: Props) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill={name === "play" || name === "pause" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
