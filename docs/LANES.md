# Lanes
The event log is the interface. Nobody blocks anybody.

## Pipeline — you
Owns contracts, pipeline/, engines/, agents/dispatch and slotMatch, projections/,
server/, and the Corti call modules. Only person touching Corti logic.
Hour 1: run V1-V3, write results in VALIDATION.md.
14:00: one cached conversation through the real pipeline moving one room's Patient State,
quote visible on the real UI.
22:00: both signals, task memory, dispatch with reassignment, voice confirm, off the log.

## Transport and world — API teammate
corti/auth, stream, cache. OAuth client credentials, refresh at 240s, tenant header,
websocket, retry, disk cache of every response for offline replay.
world/feeds, roster, inventory and agents/mcp: vitals and labs on a timeline, one CT with
three slots left today, nurse roster with skills, availability and interruptibility,
offer channel behind MCP.
Scarcity is the point. Infinite slots makes scoring pointless on stage.
Deliverable by 10:00: stable function signatures so the pipeline never touches plumbing.

## Surfaces — UI teammate
Three room cards, two colour bars each, top Patient State, bottom Coordination State,
one explanation line. Tap flips to evidence: quote, speaker, time, code.
Plus ranked request queue and the dispatch view where a task travels between nurses.
Builds against hand-written JSON from minute one. Real events are a file swap.
The two-bar card carries the whole idea without narration. Make it the best thing on screen.
Playback scrub is MUST, before any polish. 3D earns its place only if a room opens into evidence.

## Clinical — doctor
Owns docs/CLINICAL.md alone. Delivery order matters, each blocks something:
field-free state rules, then scripts, then task table, then weights, then interruptibility,
then answer key.

## Fixtures and stage — data scientist
TTS audio from the scripts with distinct voices, generated first because V1 depends on it.
Simulated feed timeline, slot and roster fixtures, the committed demo event log.
Drives playback in every rehearsal and on stage. Owns eval/ in Python.

## Ownership
contracts/ you, frozen after 30m · corti auth/stream/cache, world/, agents/mcp API
pipeline/, engines/, agents/dispatch, projections/, server/ you
engines/rules/ doctor's values, you wire once · web/ UI · fixtures/ and eval/ data scientist.
