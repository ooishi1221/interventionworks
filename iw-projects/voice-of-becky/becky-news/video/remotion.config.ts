// CraftWipe の透過出力（VP8 + yuva420p + PNG フレーム）用（2026-07-07）。
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
