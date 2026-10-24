interface Props { name: "play" | "pause" | "skip" | "restart" | "shield" | "question" | "mic" | "chevron" | "close"; size?: number; }

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
};

export default function Icon({ name, size = 18 }: Props) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill={name === "play" || name === "pause" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
