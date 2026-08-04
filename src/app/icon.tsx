import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon generated from the mark: seal ring, leaves, gold taproot. */
export default function Icon() {
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
        <svg width="30" height="30" viewBox="0 0 240 268" fill="none">
          <g transform="translate(10,8)">
            <path
              d="M 94.35 190.49 A 82.0 82.0 0 1 1 125.65 190.49"
              stroke="#1C3A2D"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M 47 118 H 99 M 121 118 H 173"
              stroke="#1C3A2D"
              strokeWidth="11"
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
              d="M 103 118 C 104.8 158, 107 198, 110 240 C 113 198, 115.2 158, 117 118 Z"
              fill="#D99A2B"
            />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
