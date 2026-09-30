// Extracts the SCENARIOS data straight out of index.html (single source of truth) and computes
// the exact narration strings that Play All speaks, so the offline TTS generation step can never
// drift out of sync with what the UI actually shows. Run with: node narration/build-manifest.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(here, "..", "index.html");
const html = readFileSync(indexPath, "utf8");

const startMarker = "const SCENARIOS = [";
const endMarker = "/* ---------- Element refs ---------- */";
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker);
if (start === -1 || end === -1) throw new Error("Could not locate SCENARIOS block in index.html");

// Trim to a clean array literal ("const SCENARIOS = [ ... ];") and eval it — this is plain JS
// data (no DOM calls), so it's safe to evaluate in Node.
let block = html.slice(start, end);
block = block.slice(0, block.lastIndexOf("];") + 2); // drop trailing whitespace/comments after the array
// eslint-disable-next-line no-eval
const SCENARIOS = new Function(`${block}\nreturn SCENARIOS;`)();

// Mirrors index.html's spokenLangForScenario(): which language the simulated "user" is heard
// speaking. Play All always forces the manual-language scenario to Chinese via ghostDemoLanguage("zh").
function spokenLangForScenario(scenario) {
  if (scenario.id === "manual-language") return "zh-CN";
  if (scenario.id === "mixed-language") return "zh-CN";
  return "en-US";
}
// Mirrors index.html's scenarioChipCallouts() + benefitsNarration().
function scenarioChipCallouts(scenario) {
  const source = scenario.id === "manual-language" ? scenario.languages.zh : scenario;
  return (source.chips || []).filter(c => c.type === "chip").map(c => c.text);
}
function modeIntroNarration(scenario) {
  return `Now demonstrating: ${scenario.label}.`;
}
function benefitsNarration(scenario) {
  const callouts = scenarioChipCallouts(scenario);
  let text = `Here's why this matters: ${scenario.tagline}`;
  if (callouts.length) text += ` Notice: ${callouts.join(". ")}.`;
  return text;
}
// Mirrors index.html's runDictation(): the live-typed text a viewer sees/hears during Play All.
function userSpeechText(scenario) {
  if (scenario.id === "manual-language") return scenario.languages.zh.transcript;
  return scenario.before || scenario.transcript;
}

const VOICES = {
  "en-US": "en-US-AndrewNeural", // warm, confident narrator voice for the English beats
  "zh-CN": "zh-CN-XiaoxiaoNeural" // natural Mandarin voice for the simulated user speech
};

const manifest = SCENARIOS.map(scenario => {
  const userLang = spokenLangForScenario(scenario);
  return {
    id: scenario.id,
    clips: [
      { kind: "intro", text: modeIntroNarration(scenario), lang: "en-US", voice: VOICES["en-US"] },
      { kind: "user", text: userSpeechText(scenario), lang: userLang, voice: VOICES[userLang] },
      { kind: "benefits", text: benefitsNarration(scenario), lang: "en-US", voice: VOICES["en-US"] }
    ]
  };
});

writeFileSync(path.join(here, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote manifest.json with ${manifest.length} scenarios / ${manifest.reduce((n, s) => n + s.clips.length, 0)} clips.`);
