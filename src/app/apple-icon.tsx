import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
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
          background: "#FAF7F0",
        }}
      >
        <svg width="150" height="150" viewBox="0 0 240 268" fill="none">
          <g transform="translate(10,8)">
            <path
              d="M 94.35 190.49 A 82.0 82.0 0 1 1 125.65 190.49"
              stroke="#1C3A2D"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M 47 118 H 99 M 121 118 H 173"
              stroke="#1C3A2D"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M 110 118 V 88"
              stroke="#1C3A2D"
              strokeWidth="6.5"
              strokeLinecap="round"
            />
            <path
              d="M 110 96 C 95 92, 81 80, 78 61 C 97 64, 108 79, 110 96 Z"
              fill="#1C3A2D"
            />
            <path
              d="M 110 96 C 125 92, 139 80, 142 61 C 123 64, 112 79, 110 96 Z"
              fill="#1C3A2D"
            />
            <path
              d="M 104.6 118 C 105.8 158, 107.6 198, 110 240 C 112.4 198, 114.2 158, 115.4 118 Z"
              fill="#D99A2B"
            />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
