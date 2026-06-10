import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

// Pivot cohort served by the Python script (retention_pivot.py at the
// project root), not the in-process TypeScript implementation. Same
// math, same filters (cancelled + RTO orders excluded), phones
// normalized to 10 digits, but the computation runs in Python.
//
// IMPORTANT: this endpoint only works on environments where Python and
// the script's dependencies are installed locally (psycopg2-binary,
// pandas, python-dotenv). Locally that's the dev machine; on Vercel
// the Node.js serverless runtime doesn't include Python, so this
// endpoint will return an error there. The TS version at
// /api/retention/pivot is the production-safe one.

export const runtime = "nodejs";
// Cohort over a wide window can take 30+s; opt out of the default 10s
// hobby-plan timeout if Vercel ever supports Python in this runtime.
export const maxDuration = 60;

function isValidYmd(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  const pivot = req.nextUrl.searchParams.get("pivot");

  if (!isValidYmd(start) || !isValidYmd(end) || !isValidYmd(pivot)) {
    return NextResponse.json(
      { error: "start, end, and pivot must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const script = path.join(process.cwd(), "retention_pivot.py");
  const args = [
    script,
    "--start", start,
    "--end", end,
    "--pivot", pivot,
    "--format", "json",
    "--out", "-",
  ];

  // Spawn the Python interpreter. On Windows the binary is `python` (via
  // PATH); on most Linux/macOS Python 3 environments it's `python3`.
  const pythonBin = process.platform === "win32" ? "python" : "python3";

  return await new Promise<NextResponse>((resolve) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn(pythonBin, args, {
      cwd: process.cwd(),
      env: process.env,
    });
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });

    proc.on("error", (err) => {
      resolve(
        NextResponse.json(
          {
            error: "Could not start Python. Is Python installed and on PATH?",
            detail: String(err),
          },
          { status: 500 },
        ),
      );
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(
          NextResponse.json(
            { error: "Python script failed", exitCode: code, stderr },
            { status: 500 },
          ),
        );
        return;
      }
      try {
        const json = JSON.parse(stdout);
        resolve(NextResponse.json(json));
      } catch (e) {
        resolve(
          NextResponse.json(
            { error: "Python returned invalid JSON", detail: String(e), stderr },
            { status: 500 },
          ),
        );
      }
    });
  });
}
