// S7 Task memory. A fold over the log, not a store. Task.delayed is derived at read time from now.
//
// Pure function of the event log. No network, no stored state.
// Takes `now` as an explicit argument (D8). Never calls Date.now().
// Live passes Date.now(); replay passes the timestamp of the last event read.
