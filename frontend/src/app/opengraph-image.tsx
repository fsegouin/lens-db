import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "The Lens DB - Camera Lens Database";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const geistBold = await readFile(
    join(
      process.cwd(),
      "node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf"
    )
  );
  const geistRegular = await readFile(
    join(
      process.cwd(),
      "node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf"
    )
  );

  return new ImageResponse(
    (
      <div
        style={{
          background: "#000",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Geist Sans",
          gap: 60,
        }}
      >
        {/* Shutter icon */}
        <svg viewBox="0 0 1614.1 1614.1" width="280" height="280">
          <circle cx="807.05" cy="807.05" r="807.05" fill="#222" />
          <g
            fill="#fff"
            transform="translate(807.05 807.05) scale(0.82) translate(-807.05 -807.05)"
          >
            <path d="M1111.5,1167.7c12.7-133.3,10.6-258.6,8.2-320.4l-143.8,249.1l0.2,0.3c-0.05,0.03-0.27,0.18-0.64,0.43l-0.49,0.85h-0.79c-17.7,11.7-154.6,101.3-316.7,175.4c-101.9,46.6-193.9,78.1-273.2,93.7c-51.3,10.1-97.5,13.4-138.3,10.2C390.3,1519.4,588.4,1607.1,807.1,1607.1c60,0,118.5-6.6,174.8-19.2c29.6-34.9,54.8-82.6,75.3-142.5C1082.8,1370.7,1101.1,1277.3,1111.5,1167.7z" />
            <path d="M639.1,516.2h0.8c17.7-11.7,154.6-101.3,316.7-175.4c101.9-46.6,193.9-78.1,273.2-93.7c51.3-10.1,97.5-13.4,138.3-10.2C1223.8,94.7,1025.7,7.1,807.1,7.1c-60,0-118.5,6.6-174.8,19.2c-29.6,34.9-54.8,82.6-75.3,142.5c-25.6,74.6-43.8,168.1-54.3,277.6c-12.7,133.3-10.6,258.6-8.2,320.4l143.8-249.1l-0.2-0.3c0.05-0.03,0.27-0.18,0.64-0.43L639.1,516.2z" />
            <path d="M1234.8,271.3c-77.4,15.2-167.5,46.1-267.6,91.8c-121.8,55.7-229.2,120.2-281.6,153.1h287.6l0.2-0.3c0.05,0.03,0.29,0.14,0.69,0.34h0.99l0.4,0.69c19,9.5,165,83.2,310.3,186.6c91.3,65,164.6,128.8,217.8,189.8c34.4,39.5,60.5,77.9,78.1,115c16.6-64.3,25.5-131.7,25.5-201.1c0-209-80.2-399.3-211.5-541.9C1350.6,257.1,1296.8,259.1,1234.8,271.3z" />
            <path d="M1484.9,909.6c-51.9-59.5-123.6-122-213.3-185.8c-109.1-77.7-218.7-138.5-273.4-167.3l143.8,249.1l0.38-0.03c0,0.06,0.02,0.32,0.05,0.77l0.49,0.85l-0.4,0.69c1.3,21.2,10.4,184.5-6.4,362c-10.6,111.6-29.3,206.9-55.5,283.5c-17,49.6-37.2,91.3-60.5,125.1c261.8-72.2,469.9-274.1,550.6-532.2C1555.2,1003,1526.6,957.3,1484.9,909.6z" />
            <path d="M379.4,1342.8c77.4-15.2,167.5-46.1,267.6-91.8c121.8-55.7,229.2-120.2,281.6-153.1H640.9l-0.17,0.34c-0.05-0.03-0.29-0.14-0.69-0.34h-0.99l-0.4-0.69c-19-9.5-165-83.2-310.3-186.6c-91.3-65-164.6-128.8-217.7-189.8c-34.4-39.5-60.5-77.9-78.1-115C15.9,670.2,7.1,737.6,7.1,807.1c0,209,80.2,399.3,211.5,541.9C263.5,1357,317.3,1355,379.4,1342.8z" />
            <path d="M129.2,704.5c51.9,59.5,123.6,122,213.3,185.8c109.1,77.7,218.7,138.5,273.4,167.3L472.1,808.6l-0.38,0.03c0-0.06-0.02-0.32-0.05-0.77l-0.49-0.85l0.4-0.69c-1.3-21.2-10.4-184.5,6.4-362c10.6-111.6,29.3-206.9,55.5-283.5c17-49.6,37.2-91.3,60.5-125.1C332.2,107.9,124.1,309.8,43.4,568C58.9,611.1,87.5,656.8,129.2,704.5z" />
          </g>
        </svg>

        {/* Text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.025em",
            }}
          >
            THE LENS DB
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 400,
              color: "#a1a1aa",
            }}
          >
            Camera Lens Database
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 400,
              color: "#71717a",
              marginTop: 8,
            }}
          >
            7,800+ lenses · 1,700+ cameras · 220+ camera systems
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Geist Sans",
          data: geistBold,
          weight: 700,
          style: "normal",
        },
        {
          name: "Geist Sans",
          data: geistRegular,
          weight: 400,
          style: "normal",
        },
      ],
    }
  );
}
