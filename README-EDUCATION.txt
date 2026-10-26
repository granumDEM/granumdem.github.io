GRANUM EDUCATION EDITION - QUICK START

Granum is a discrete element program for soil: sand, soft clay and cement-admixed clay as
particles, with laboratory tests, staged models, pore pressure and consolidation, and a
built-in MCP server for AI agents.

START THE APP
  macOS    Open Granum.app. The app is not notarised yet: the first time, right-click it and
           choose Open, or run  xattr -dr com.apple.quarantine Granum.app  in Terminal.
  Windows  Run granum.exe. If SmartScreen warns, choose "More info" and "Run anyway".

ENGINES
  The fastest available engine is chosen automatically:
  CUDA on an NVIDIA GPU (Windows; needs the NVIDIA driver and NVRTC from the CUDA toolkit, or
  set TELLUSDEM_NVRTC to the NVRTC DLL), then wgpu (Metal on a Mac, DirectX 12 on Windows),
  then the CPU.

CHAT ASSISTANT
  Press "Chat assistant" (top right), then Settings: the agent program tigrim is found beside
  Granum; enter an API URL, a model and an API key (tested with https://openrouter.ai/api/v1
  and deepseek/deepseek-v4.1-flash). Keep tigrim beside granum.

CONNECT AN AI AGENT (MCP, no adaptor needed)
  Claude Code:     claude mcp add granum -- /path/to/granum --mcp
  Claude Desktop, Cursor and others:
                   {"mcpServers": {"granum": {"command": "/path/to/granum", "args": ["--mcp"]}}}
  On macOS the program inside the app is Granum.app/Contents/MacOS/granum.

USER MANUAL
  https://granumdem.github.io/manual.html

EDUCATION LIMITS
  - up to 50,000 particles per model (all laboratory tests fit well within this)
  - calculations on this computer only (no remote GPU server)
  - reports, pictures and animations carry an Education watermark
  For teaching and non-commercial academic research only: see LICENSE-EDUCATION.txt.
  Academic Research and Professional licences: tellusfem@gmail.com
