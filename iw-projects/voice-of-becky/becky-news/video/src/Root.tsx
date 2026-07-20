import { Composition } from "remotion";
import { BeckyScene } from "./BeckyScene";
import { MouthTest } from "./MouthTest";
import { Pilot007 } from "./Pilot007";
import { P008_DELAY_S, Pilot008 } from "./Pilot008";
import { CAST027_DURATION, RadioCast } from "./RadioCast";
import { CASTW_DURATION, RadioCastWide } from "./RadioCastWide";
import { ZATSUDAN000_DURATION, Zatsudan000 } from "./Zatsudan000";
import { CRAFT_WIPE_DURATION, CraftWipe } from "./CraftWipe";
import { ZATSUDAN001_DURATION, Zatsudan001 } from "./Zatsudan001";
import { CASTSHORTS_DURATION, CastShorts } from "./CastShorts";
import boundaries007 from "../public/boundaries-007.json";
import boundaries008 from "../public/boundaries-008.json";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="BeckyScene" component={BeckyScene} durationInFrames={900} fps={30} width={1080} height={1920} />
      <Composition id="MouthA" component={MouthTest} durationInFrames={300} fps={30} width={1080} height={1080} defaultProps={{ method: "A" as const }} />
      <Composition id="MouthB" component={MouthTest} durationInFrames={300} fps={30} width={1080} height={1080} defaultProps={{ method: "B" as const }} />
      <Composition id="MouthC" component={MouthTest} durationInFrames={300} fps={30} width={1080} height={1080} defaultProps={{ method: "C" as const }} />
      <Composition id="Pilot007" component={Pilot007} durationInFrames={Math.ceil(boundaries007.duration * 30)} fps={30} width={1080} height={1920} />
      <Composition id="Pilot008" component={Pilot008} durationInFrames={Math.ceil((boundaries008.duration + P008_DELAY_S) * 30)} fps={30} width={1080} height={1920} />
      <Composition id="RadioCast" component={RadioCast} durationInFrames={Math.ceil(CAST027_DURATION * 30) + 30} fps={30} width={1080} height={1920} />
      <Composition id="RadioCastWide" component={RadioCastWide} durationInFrames={Math.ceil(CASTW_DURATION * 30) + 30} fps={30} width={1920} height={1080} />
      <Composition id="RadioCastWarm" component={RadioCastWide} durationInFrames={Math.ceil(CASTW_DURATION * 30) + 30} fps={30} width={1920} height={1080} defaultProps={{ booth: "warm" as const }} />
      <Composition id="Zatsudan000" component={Zatsudan000} durationInFrames={Math.ceil((ZATSUDAN000_DURATION + 1) * 30)} fps={30} width={1920} height={1080} />
      <Composition id="Zatsudan001" component={Zatsudan001} durationInFrames={Math.ceil((ZATSUDAN001_DURATION + 1) * 30)} fps={30} width={1920} height={1080} />
      <Composition id="CraftWipe" component={CraftWipe} durationInFrames={Math.ceil(CRAFT_WIPE_DURATION * 25)} fps={25} width={480} height={520} />
      <Composition id="CastShorts" component={CastShorts} durationInFrames={Math.ceil(CASTSHORTS_DURATION * 30)} fps={30} width={1080} height={1920} />
    </>
  );
};
