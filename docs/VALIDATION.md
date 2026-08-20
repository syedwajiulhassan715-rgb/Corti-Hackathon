# Hour-one validations
Nothing downstream is written before these are answered. Paste raw output, not summaries.

V1  speakerId on multi-voice TTS mono, diarize true
    Does it populate, are slots stable across the file?
    Result:
    If no: pipeline/roles.ts becomes MUST, half a day.

V2  medical coding scope
    Which code systems return, does coding run on segments or on facts?
    Result:
    Decides whether matching happens pre- or post-coding.

V3  agentic framework and MCP
    Can the agent reach an external MCP endpoint, at what setup cost?
    Result:
    If expensive: dispatch degrades to a logged intent, still fully demoable.
