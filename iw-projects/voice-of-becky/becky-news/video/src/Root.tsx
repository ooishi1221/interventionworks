import { Composition } from "remotion";
import { BeckyScene } from "./BeckyScene";
import { MouthTest } from "./MouthTest";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="BeckyScene" component={BeckyScene} durationInFrames={900} fps={30} width={1080} height={1920} />
      <Composition id="MouthA" component={MouthTest} durationInFrames={300} fps={30} width={1080} height={1080} defaultProps={{ method: "A" as const }} />
      <Composition id="MouthB" component={MouthTest} durationInFrames={300} fps={30} width={1080} height={1080} defaultProps={{ method: "B" as const }} />
      <Composition id="MouthC" component={MouthTest} durationInFrames={300} fps={30} width={1080} height={1080} defaultProps={{ method: "C" as const }} />
    </>
  );
};
