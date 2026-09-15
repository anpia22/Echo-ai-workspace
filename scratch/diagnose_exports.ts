import * as allExports from "../src/app/lib/collaboration/meeting/index";

console.log("Export count:", Object.keys(allExports).length);
console.log("Has MEDIA_STATE_EVENT:", "MEDIA_STATE_EVENT" in allExports);
console.log("Sample keys:", Object.keys(allExports).slice(0, 15));
