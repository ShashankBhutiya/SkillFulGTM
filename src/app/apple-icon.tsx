import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "40px",
          background: "linear-gradient(145deg, #9d85ff, #5b3ce0 60%, #3a24a8)",
          boxShadow: "inset 0 2px 4px rgba(255,255,255,0.4)",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="1.6" strokeOpacity="0.6" fill="none" />
          <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none" />
          <circle cx="12" cy="12" r="1.5" fill="white" />
          <path
            d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeOpacity="0.8"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
