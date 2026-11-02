import { ImageResponse } from "next/og";

export const alt = "Echo: type a messy problem and watch it become a map";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0f172a 0%, #312e81 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#a5b4fc" }}>Echo</div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.1, marginTop: 24 }}>
          Think through hard decisions out loud
        </div>
        <div style={{ display: "flex", fontSize: 34, marginTop: 32, color: "#cbd5e1" }}>
          Type a messy problem. Watch it become a map.
        </div>
      </div>
    ),
    { ...size }
  );
}
